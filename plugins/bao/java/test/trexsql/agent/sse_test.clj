(ns trexsql.agent.sse-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [clojure.data.json :as json]
            [trexsql.agent.sse :as sse])
  (:import [java.io ByteArrayOutputStream]))

;; ---------------------------------------------------------------------------
;; Vercel UIMessageStream wire format — a single chunk is `data: <json>\n\n`,
;; the stream ends with `data: [DONE]\n\n`, and the response carries the
;; `x-vercel-ai-ui-message-stream: v1` header.
;; ---------------------------------------------------------------------------

(deftest write-event-frames-data-line
  (testing "write-event! writes one `data: <json>\\n\\n` chunk"
    (let [baos (ByteArrayOutputStream.)]
      (sse/write-event! baos {:type "text-delta" :id "t-0" :delta "hi"})
      (let [out (.toString baos "UTF-8")]
        (is (str/starts-with? out "data: "))
        (is (str/ends-with? out "\n\n"))
        ;; No legacy `event:` line on the wire.
        (is (not (str/includes? out "event: ")))
        ;; Body is valid JSON with the expected fields.
        (let [json-line (-> out (subs 6) (str/replace #"\n+$" ""))
              parsed (json/read-str json-line :key-fn keyword)]
          (is (= "text-delta" (:type parsed)))
          (is (= "t-0" (:id parsed)))
          (is (= "hi" (:delta parsed))))))))

(deftest write-done-terminator
  (testing "write-done! emits the literal `data: [DONE]\\n\\n` terminator"
    (let [baos (ByteArrayOutputStream.)]
      (sse/write-done! baos)
      (is (= "data: [DONE]\n\n" (.toString baos "UTF-8"))))))

(deftest streaming-response-headers
  (testing "the Ring response carries the Vercel marker header"
    (let [resp (sse/streaming-response (fn [emit] (emit {:type "finish" :finishReason "stop"})))]
      (is (= 200 (:status resp)))
      (is (= "text/event-stream; charset=utf-8" (get-in resp [:headers "Content-Type"])))
      (is (= "v1" (get-in resp [:headers "x-vercel-ai-ui-message-stream"])))
      (is (instance? java.io.InputStream (:body resp))))))

(deftest streaming-response-body-shape
  (testing "producer chunks + automatic [DONE] terminator land on the wire"
    (let [resp (sse/streaming-response
                 (fn [emit]
                   (emit {:type "start" :messageId "m1"})
                   (emit {:type "text-delta" :id "t-0" :delta "hi"})
                   (emit {:type "finish" :finishReason "stop"})))
          baos (ByteArrayOutputStream.)]
      (with-open [in (:body resp)]
        (loop [b (.read in)]
          (when-not (neg? b)
            (.write baos b)
            (recur (.read in)))))
      (let [out (.toString baos "UTF-8")
            ;; Each chunk is `data: <json>\n\n` or `data: [DONE]\n\n`. Split
            ;; on the framing and drop empty trailers.
            chunks (->> (str/split out #"\n\n")
                        (remove str/blank?)
                        vec)]
        (is (= 4 (count chunks)) "start + text-delta + finish + [DONE]")
        (is (every? #(str/starts-with? % "data: ") chunks))

        (let [bodies (mapv #(subs % 6) chunks)]
          (is (= "[DONE]" (last bodies)))
          (let [first-three (mapv #(json/read-str % :key-fn keyword) (butlast bodies))]
            (is (= ["start" "text-delta" "finish"] (mapv :type first-three)))
            (is (= "m1" (-> first-three first :messageId)))
            (is (= "stop" (-> first-three last :finishReason)))))))))

(deftest streaming-response-error-emits-error-chunk
  (testing "an exception in the producer surfaces as `{type: error}` then [DONE]"
    (let [resp (sse/streaming-response
                 (fn [_emit] (throw (ex-info "boom" {}))))
          baos (ByteArrayOutputStream.)]
      (with-open [in (:body resp)]
        (loop [b (.read in)]
          (when-not (neg? b)
            (.write baos b)
            (recur (.read in)))))
      (let [out (.toString baos "UTF-8")]
        (is (str/includes? out "\"type\":\"error\""))
        (is (str/includes? out "\"errorText\":\"boom\""))
        (is (str/ends-with? out "data: [DONE]\n\n"))))))
