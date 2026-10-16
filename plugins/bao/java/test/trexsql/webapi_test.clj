(ns trexsql.webapi-test
  "Unit tests for webapi.clj - HTTP API handlers."
  (:require [clojure.test :refer :all]
            [trexsql.webapi :as webapi]
            [trexsql.core :as core]
            [reitit.core :as r]
            [cheshire.core :as json]))

;; Helper Functions

(defn with-test-db [f]
  "Create a temporary database for testing."
  (let [db (core/init {:cache-path "./target/test-webapi-cache"})]
    (try
      (f db)
      (finally
        (core/shutdown! db)))))

;; Response Helper Tests

(deftest test-ok-response
  (testing "ok creates 200 response with body"
    (let [resp (webapi/ok {:data "test"})]
      (is (= 200 (:status resp)))
      (is (= {:data "test"} (:body resp))))))

(deftest test-bad-request-response
  (testing "bad-request creates 400 response"
    (let [resp (webapi/bad-request "error message")]
      (is (= 400 (:status resp)))
      (is (= "BAD_REQUEST" (get-in resp [:body :error])))
      (is (= "error message" (get-in resp [:body :message]))))))

(deftest test-not-found-response
  (testing "not-found creates 404 response"
    (let [resp (webapi/not-found "missing resource")]
      (is (= 404 (:status resp)))
      (is (= "NOT_FOUND" (get-in resp [:body :error])))
      (is (= "missing resource" (get-in resp [:body :message]))))))

(deftest test-internal-error-response
  (testing "internal-error creates 500 response"
    (let [resp (webapi/internal-error "something broke")]
      (is (= 500 (:status resp)))
      (is (= "INTERNAL_ERROR" (get-in resp [:body :error])))
      (is (= "something broke" (get-in resp [:body :message]))))))

;; Validation Tests

(deftest test-validate-database-code-valid
  (testing "Valid database codes pass validation"
    (is (nil? (#'webapi/validate-database-code "mydb")))
    (is (nil? (#'webapi/validate-database-code "my_db")))
    (is (nil? (#'webapi/validate-database-code "MyDB123")))
    (is (nil? (#'webapi/validate-database-code "a")))))

(deftest test-validate-database-code-invalid
  (testing "Invalid database codes fail validation"
    (is (some? (#'webapi/validate-database-code nil)))
    (is (some? (#'webapi/validate-database-code "")))
    (is (some? (#'webapi/validate-database-code "   ")))
    (is (some? (#'webapi/validate-database-code "my db")))
    (is (some? (#'webapi/validate-database-code "my-db")))
    (is (some? (#'webapi/validate-database-code "my.db")))
    (is (some? (#'webapi/validate-database-code "my/db")))
    (is (some? (#'webapi/validate-database-code "my'db")))
    (is (some? (#'webapi/validate-database-code "my;db")))))

(deftest test-validate-database-code-too-long
  (testing "Database code longer than 128 chars fails"
    (let [long-code (apply str (repeat 129 "a"))]
      (is (some? (#'webapi/validate-database-code long-code))))))

;; Request Routing Tests

(deftest test-handle-request-blank-source
  (testing "Blank source-key returns bad-request"
    (with-test-db
      (fn [db]
        (let [resp (webapi/handle-request db "GET" "" nil nil nil)]
          (is (= 400 (:status resp))))))))

(deftest test-handle-request-unknown-resource
  (testing "Unknown resource returns not-found"
    (with-test-db
      (fn [db]
        (let [resp (webapi/handle-request db "GET" "mysource/unknown" nil nil nil)]
          (is (= 404 (:status resp))))))))

(deftest test-handle-request-unknown-source
  (testing "Unknown source returns not-found for cache status"
    (with-test-db
      (fn [db]
        ;; Note: This depends on source-repository being empty
        (let [resp (webapi/handle-request db "GET" "unknown-source/cache" nil nil nil)]
          (is (= 404 (:status resp))))))))

;; Router Tests

;; The servlet dispatches through the Reitit router, not handle-request, so a
;; handler wired only into handle-request answers 404 in production. These
;; assert the route table itself resolves.

(deftest test-router-resolves-cache-files
  (testing "GET /cache/files resolves to the list handler"
    (let [router (r/router webapi/routes {:conflicts nil})
          match (r/match-by-path router "/cache/files")]
      (is (some? match))
      (is (some? (get-in match [:data :get :handler]))))))

(deftest test-router-resolves-cache-file-delete
  (testing "DELETE /cache/files/:database-code resolves and binds the path param"
    (let [router (r/router webapi/routes {:conflicts nil})
          match (r/match-by-path router "/cache/files/EUNOMIA")]
      (is (some? match))
      (is (some? (get-in match [:data :delete :handler])))
      (is (= "EUNOMIA" (get-in match [:path-params :database-code]))))))

(deftest test-router-cache-files-not-shadowed-by-source-key
  (testing "/cache/files is not swallowed by the /:source-key subtree"
    (let [router (r/router webapi/routes {:conflicts nil})
          match (r/match-by-path router "/cache/files")]
      (is (nil? (get-in match [:path-params :source-key]))))))

;; JSON Parsing Tests

(deftest test-parse-json-valid
  (testing "Valid JSON is parsed correctly"
    (let [result (#'webapi/parse-json "{\"key\": \"value\"}")]
      (is (= "value" (:key result))))))

(deftest test-parse-json-invalid
  (testing "Invalid JSON returns nil"
    (is (nil? (#'webapi/parse-json "not json")))
    (is (nil? (#'webapi/parse-json "{broken")))
    (is (nil? (#'webapi/parse-json nil)))))

;; java-map->clj Conversion Tests

(deftest test-java-map-conversion
  (testing "Java HashMap is converted to Clojure map"
    (let [java-map (java.util.HashMap. {"key" "value" "num" 42})
          result (#'webapi/java-map->clj java-map)]
      (is (map? result))
      (is (= "value" (:key result)))
      (is (= 42 (:num result))))))

(deftest test-java-list-conversion
  (testing "Java ArrayList is converted to Clojure vector"
    (let [java-list (java.util.ArrayList. ["a" "b" "c"])
          result (#'webapi/java-map->clj java-list)]
      (is (vector? result))
      (is (= ["a" "b" "c"] result)))))

(deftest test-nested-conversion
  (testing "Nested Java collections are converted"
    (let [inner-map (java.util.HashMap. {"inner" "value"})
          java-map (java.util.HashMap. {"outer" inner-map})
          result (#'webapi/java-map->clj java-map)]
      (is (= "value" (get-in result [:outer :inner]))))))

;; Cache Path Generation Tests

(deftest test-get-cache-path
  (testing "Cache path is correctly generated"
    (is (= "./data/cache/mydb.db" (#'webapi/get-cache-path "./data/cache" "mydb")))
    (is (= "/tmp/mydb.db" (#'webapi/get-cache-path "/tmp" "mydb")))))

;; Agent upstream resolution (agent reverse-proxy)

(deftest test-resolve-agent-upstream-prefers-ohdsi-mount
  ;; 401 = mounted but unauthenticated — the probe sends no credentials, so
  ;; any non-404 answer identifies the mount.
  (let [probe (fn [url] (if (.contains ^String url "/plugins/ohdsi/pythia") 401 404))]
    (is (= "http://localhost:8001/plugins/ohdsi/pythia"
           (webapi/resolve-agent-upstream probe)))))

(deftest test-resolve-agent-upstream-falls-back-to-trex-mount
  ;; Dev checkouts still mount the @trex-scoped package.
  (let [probe (fn [url] (if (.contains ^String url "/plugins/trex/pythia") 401 404))]
    (is (= "http://localhost:8001/plugins/trex/pythia"
           (webapi/resolve-agent-upstream probe)))))

(deftest test-resolve-agent-upstream-defaults-to-trex-when-unreachable
  ;; Node not answering at probe time (nil = connect error): keep the
  ;; pre-@ohdsi default rather than failing outright.
  (let [probe (fn [_url] nil)]
    (is (= "http://localhost:8001/plugins/trex/pythia"
           (webapi/resolve-agent-upstream probe)))))

(deftest test-resolve-agent-upstream-probes-in-declared-order
  ;; Both mounts answer: the published @ohdsi form wins.
  (let [seen (atom [])
        probe (fn [url] (swap! seen conj url) 200)]
    (is (= "http://localhost:8001/plugins/ohdsi/pythia"
           (webapi/resolve-agent-upstream probe)))
    (is (= ["http://localhost:8001/plugins/ohdsi/pythia/eve/v1/info"] @seen))))

;; Agent proxy body normalization (agent-proxy-handler)

(deftest test-normalize-proxy-body-nil
  (testing "nil body stays nil"
    (is (nil? (#'webapi/normalize-proxy-body nil)))))

(deftest test-normalize-proxy-body-string
  (testing "blank string collapses to nil; non-blank string passes through"
    (is (nil? (#'webapi/normalize-proxy-body "")))
    (is (= "raw" (#'webapi/normalize-proxy-body "raw")))))

(deftest test-normalize-proxy-body-collections
  (testing "parser-produced collections (including empty) are re-encoded to JSON"
    (is (= "{}" (#'webapi/normalize-proxy-body {})))
    (is (= "[]" (#'webapi/normalize-proxy-body [])))
    (let [encoded (#'webapi/normalize-proxy-body {:a 1})]
      (is (= {"a" 1} (json/parse-string encoded))))))

(deftest test-normalize-proxy-body-empty-input-stream
  (testing "an empty ServletInputStream (bodyless GET, e.g. /eve/v1/health) becomes nil"
    (let [stream (java.io.ByteArrayInputStream. (.getBytes ""))]
      (is (nil? (#'webapi/normalize-proxy-body stream))))))

(deftest test-normalize-proxy-body-raw-json-input-stream
  (testing "a non-parsed InputStream carrying JSON is forwarded verbatim, not re-encoded"
    (let [stream (java.io.ByteArrayInputStream. (.getBytes "{\"x\":1}"))]
      (is (= "{\"x\":1}" (#'webapi/normalize-proxy-body stream))))))

;; Live-preview queue (cache/count, cache/inclusion): overlapping previews
;; wait for a slot instead of failing with `session <n> busy`.

(defn- preview-request
  ([caller] (preview-request caller "src"))
  ([caller source]
   {:db :shared
    :headers {"authorization" (str "Bearer " caller)}
    :path-params {:source-key source}
    :uri (str "/" source "/cache/count")}))

(defn- run-concurrently
  "Call (f i) from n threads at once; return the results."
  [n f]
  (->> (range n) (mapv (fn [i] (future (f i)))) (mapv deref)))

(defn- tracking-handler
  "Handler recording peak concurrency and the :db it was called with."
  [active peak seen-dbs]
  (fn [request]
    (swap! peak max (swap! active inc))
    (swap! seen-dbs conj (:db request))
    (Thread/sleep 30)
    (swap! active dec)
    {:status 200}))

(defmacro ^:private with-gate [[slots capacity] & body]
  `(let [gate# (#'webapi/make-preview-gate ~slots ~capacity)]
     (try
       (with-redefs [webapi/preview-gate (delay gate#)]
         ~@body)
       (finally (.shutdownNow ^java.util.concurrent.ExecutorService (:executor gate#))))))

(defn- await-true [pred]
  (loop [n 0] (when (and (not (pred)) (< n 200)) (Thread/sleep 10) (recur (inc n)))))

(deftest queued-preview-single-slot-test
  (with-gate [1 64]
    (let [active (atom 0) peak (atom 0) seen (atom [])
          preview (#'webapi/queued-preview (tracking-handler active peak seen))]
      (testing "by default previews run one at a time, and all succeed"
        (is (every? #(= 200 (:status %)) (run-concurrently 6 #(preview (preview-request (str "u" %))))))
        (is (= 1 @peak)))
      (testing "on the shared handle, without opening sessions"
        (is (every? #{:shared} @seen)))
      (testing "no caller entries are left behind"
        (is (empty? @@#'webapi/preview-latest))))))

(deftest queued-preview-isolated-test
  (with-gate [3 64]
    (let [active (atom 0) peak (atom 0) seen (atom [])
          preview (#'webapi/queued-preview (tracking-handler active peak seen))]
      (with-redefs [trexsql.db/with-request-session (fn [_db f] (f :own-session))]
        (testing "with more slots, at most that many run at once"
          (is (every? #(= 200 (:status %)) (run-concurrently 9 #(preview (preview-request (str "u" %))))))
          (is (<= 2 @peak 3)))
        (testing "each on a session of its own"
          (is (every? #{:own-session} @seen)))))))

(deftest queued-preview-supersede-test
  (with-gate [1 64]
    (let [release (promise)
          ran (atom [])
          preview (#'webapi/queued-preview
                    (fn [req]
                      (swap! ran conj (get-in req [:headers "authorization"]))
                      (when (= "Bearer blocker" (get-in req [:headers "authorization"])) @release)
                      {:status 200}))
          blocker (future (preview (preview-request "blocker")))
          _ (await-true #(= ["Bearer blocker"] @ran))
          older (future (preview (preview-request "u1")))
          _ (Thread/sleep 50)
          other-source (future (preview (preview-request "u1" "other")))
          newer (future (preview (preview-request "u1")))]
      (testing "a waiting preview is released at once when the same caller sends a newer one"
        (is (= 409 (:status (deref older 2000 :still-waiting)))))
      (deliver release true)
      (testing "the newer one, the blocker and the other source still run"
        (is (= 200 (:status @newer)))
        (is (= 200 (:status @blocker)))
        (is (= 200 (:status @other-source)))
        (is (= 3 (count @ran))))
      (testing "no caller entries are left behind"
        (is (empty? @@#'webapi/preview-latest))))))

(deftest queued-preview-bounds-test
  (testing "a full queue is rejected at once"
    (with-gate [1 1]
      (let [release (promise)
            started (promise)
            preview (#'webapi/queued-preview (fn [_] (deliver started true) @release {:status 200}))
            running (future (preview (preview-request "a")))
            _ @started
            queued (future (preview (preview-request "b")))
            _ (Thread/sleep 50)]
        (is (= 500 (:status (preview (preview-request "c")))))
        (deliver release true)
        (is (= 200 (:status @running)))
        (is (= 200 (:status @queued))))))
  (testing "no slot within the timeout -> 500, handler not run"
    (with-gate [1 64]
      (let [release (promise)
            started (promise)
            called (atom [])
            preview (#'webapi/queued-preview
                      (fn [req]
                        (swap! called conj (:uri req))
                        (deliver started true) @release {:status 200}))]
        (with-redefs [webapi/preview-queue-timeout-ms 50]
          (let [running (future (preview (preview-request "a")))]
            @started
            (is (= 500 (:status (preview (assoc (preview-request "b") :uri "/late")))))
            (is (not-any? #{"/late"} @called))
            (deliver release true)
            (is (= 200 (:status @running))))))))
  (testing "a throwing handler still frees its slot"
    (with-gate [1 64]
      (let [boom (#'webapi/queued-preview (fn [_] (throw (ex-info "boom" {}))))
            ok (#'webapi/queued-preview (fn [_] {:status 200}))]
        (is (= 500 (:status (boom (preview-request "a")))))
        (is (= 200 (:status (deref (future (ok (preview-request "b"))) 2000 :stuck))))))))
