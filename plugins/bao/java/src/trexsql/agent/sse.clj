(ns trexsql.agent.sse
  "Server-Sent Events helpers for the agent /chat endpoint, encoded in the
   Vercel UIMessageStream wire format.

   Format: each chunk is `data: <single-line JSON>\\n\\n`. The stream ends
   with `data: [DONE]\\n\\n`. The chunk JSON must include a `type` field;
   see https://ai-sdk.dev/docs for the full type catalog. Required response
   header: `x-vercel-ai-ui-message-stream: v1`."
  (:require [clojure.data.json :as json]
            [clojure.tools.logging :as log])
  (:import [java.io PipedInputStream PipedOutputStream OutputStream IOException]
           [java.nio.charset StandardCharsets]
           [java.util.concurrent Executors ExecutorService]))

(def ^:private ^ExecutorService stream-pool
  (Executors/newCachedThreadPool))

(defn write-event!
  "Write a single UIMessageStream chunk to `out`. `data` must be a Clojure
   map containing a `:type` key. Returns true on success, false if the
   client closed the connection."
  [^OutputStream out data]
  (try
    (let [body (json/write-str data)
          line (str "data: " body "\n\n")]
      (.write out (.getBytes line StandardCharsets/UTF_8))
      (.flush out)
      true)
    (catch IOException _ false)
    (catch Exception e
      (log/warn e "SSE write failed")
      false)))

(defn write-done!
  "Write the terminal `data: [DONE]\\n\\n` chunk that closes a UIMessageStream."
  [^OutputStream out]
  (try
    (.write out (.getBytes "data: [DONE]\n\n" StandardCharsets/UTF_8))
    (.flush out)
    true
    (catch IOException _ false)
    (catch Exception e
      (log/warn e "SSE write [DONE] failed")
      false)))

(defn streaming-response
  "Build a Ring response that streams UIMessageStream chunks. The supplied
   `producer` fn receives an emit fn `(emit data) -> bool` (false means
   client disconnected) and is run on a background thread. The producer
   should emit a `{:type \"finish\" ...}` chunk before returning; this fn
   then writes `[DONE]` and closes the stream."
  [producer]
  (let [in (PipedInputStream. (* 64 1024))
        out (PipedOutputStream. in)
        emit (fn [data] (write-event! out data))]
    (.submit stream-pool
             ^Runnable
             (fn []
               (try
                 (producer emit)
                 (catch Throwable t
                   (log/error t "Agent stream producer failed")
                   (try
                     (write-event! out {:type "error" :errorText (.getMessage t)})
                     (catch Throwable _ nil)))
                 (finally
                   (try (write-done! out) (catch Throwable _ nil))
                   (try (.close out) (catch Throwable _ nil))))))
    {:status 200
     :headers {"Content-Type" "text/event-stream; charset=utf-8"
               "Cache-Control" "no-cache, no-transform"
               "X-Accel-Buffering" "no"
               "Connection" "keep-alive"
               "x-vercel-ai-ui-message-stream" "v1"}
     :body in}))
