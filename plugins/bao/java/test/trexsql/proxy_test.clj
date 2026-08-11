(ns trexsql.proxy-test
  "The proxy's streaming contract: a long-lived upstream response has to reach
   the client while it is still open."
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.proxy]
            [ring.core.protocols :as ring-protocols])
  (:import [java.io ByteArrayOutputStream InputStream IOException]))

;; flushing-stream-body is private; reach it the way the test suite already
;; reaches other internals.
(def flushing-stream-body #'trexsql.proxy/flushing-stream-body)

(defn- slow-stream
  "An upstream that emits `chunks` one read at a time, like an SSE feed."
  [chunks]
  (let [remaining (atom (map #(.getBytes ^String %) chunks))]
    (proxy [InputStream] []
      (read
        ([] -1)
        ([buf] (let [[c & more] @remaining]
                 (if (nil? c)
                   -1
                   (do (reset! remaining more)
                       (System/arraycopy c 0 buf 0 (count c))
                       (count c)))))
        ([buf off _len]
         (let [[c & more] @remaining]
           (if (nil? c)
             -1
             (do (reset! remaining more)
                 (System/arraycopy c 0 buf off (count c))
                 (count c)))))))))

;; Records when bytes actually reached the client, which is the whole point:
;; ring's default copy leaves them in the servlet buffer until the response
;; ends, and an agent session stream does not end while the turn runs.
(defn- recording-stream []
  (let [flushes (atom [])
        out (proxy [ByteArrayOutputStream] []
              (flush [] (swap! flushes conj (.size ^ByteArrayOutputStream this))))]
    [out flushes]))

(deftest streams-each-chunk-to-the-client-as-it-arrives
  (let [[out flushes] (recording-stream)
        body (flushing-stream-body (slow-stream ["event: a\n" "event: b\n" "event: c\n"]))]
    (ring-protocols/write-body-to-stream body {} out)
    (testing "every chunk is flushed, not just the last"
      (is (= 3 (count @flushes))))
    (testing "flushes happen progressively, not all at the end"
      (is (= [9 18 27] @flushes)))
    (is (= "event: a\nevent: b\nevent: c\n" (str out)))))

(deftest a-client-that-walks-away-mid-stream-is-not-an-error
  (let [body (flushing-stream-body (slow-stream ["event: a\n" "event: b\n"]))
        out (proxy [ByteArrayOutputStream] []
              (write
                ([_] (throw (IOException. "Broken pipe")))
                ([_ _ _] (throw (IOException. "Broken pipe")))))]
    ;; Closing the tab mid-turn is routine; it must not surface as a servlet error.
    (is (nil? (ring-protocols/write-body-to-stream body {} out)))))
