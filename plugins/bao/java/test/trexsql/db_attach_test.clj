(ns trexsql.db-attach-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.db :as db]))

(deftest postgres-attach-sql-test
  (testing "READ_ONLY postgres ATTACH targeting the per-run alias (DSN values
            single-quoted by source-dsn, then SQL-literal-escaped here)"
    (is (= "ATTACH IF NOT EXISTS 'host=''h'' port=''5432'' dbname=''cdm'' user=''u'' password=''p''' AS \"mysrc__srcdb\" (TYPE postgres, READ_ONLY)"
           (db/postgres-attach-sql "mysrc"
                                   {:jdbc-url "jdbc:postgresql://h:5432/cdm" :user "u" :password "p"})))))

(deftest mysql-attach-sql-test
  (testing "READ_ONLY mysql ATTACH"
    (is (= "ATTACH IF NOT EXISTS 'host=''h'' port=''3306'' database=''cdm'' user=''u'' password=''p''' AS \"mysrc__srcdb\" (TYPE mysql, READ_ONLY)"
           (db/mysql-attach-sql "mysrc"
                                {:jdbc-url "jdbc:mysql://h:3306/cdm" :user "u" :password "p"})))))

(deftest bigquery-attach-sql-test
  (testing "bigquery ATTACH (inherently read-only, no READ_ONLY flag)"
    (is (= "ATTACH IF NOT EXISTS 'project=my-proj' AS \"mysrc__srcdb\" (TYPE bigquery)"
           (db/bigquery-attach-sql "mysrc"
                                   {:jdbc-url "jdbc:bigquery://h:443;ProjectId=my-proj"})))))

(deftest attach-sql-rejects-bad-alias-test
  (testing "invalid database-code is rejected before building SQL"
    (is (thrown? Exception
          (db/postgres-attach-sql "bad alias!" {:jdbc-url "jdbc:postgresql://h/d" :user "u" :password "p"})))))

(deftest redact-credentials-test
  (testing "literal user/password values are redacted regardless of quoting"
    (let [creds {:user "alice" :password "secret"}]
      (testing "bare libpq form"
        (is (= "host=h user=*** password=***"
               (#'db/redact-credentials "host=h user=alice password=secret" creds))))
      (testing "SQL-doubled-quote form (the form that actually appears in ATTACH errors)"
        (is (= "host=''h'' user=''***'' password=''***''"
               (#'db/redact-credentials "host=''h'' user=''alice'' password=''secret''" creds)))))
    (testing "a password containing a space is still fully redacted"
      (is (= "password=''***''"
             (#'db/redact-credentials "password=''p w''" {:user "u" :password "p w"}))))
    (testing "blank/nil credentials are not used as replacement patterns"
      (is (= "host=h" (#'db/redact-credentials "host=h" {:user "" :password nil}))))))

;; `session <n> busy` is the pool's transient "another thread holds this
;; session's connection" error, not a real attach failure — see
;; retry-while-busy in trexsql.db.
(deftest retry-while-busy-test
  (let [retry-while-busy #'db/retry-while-busy]

    (testing "a busy failure is retried and the eventual value returned"
      (let [attempts (atom 0)]
        (is (= :attached
               (retry-while-busy
                 (fn []
                   (when (< (swap! attempts inc) 3)
                     (throw (ex-info "ATTACH ...: session 20 busy" {})))
                   :attached))))
        (is (= 3 @attempts))))

    (testing "a non-busy failure propagates on the first attempt, unmasked"
      (let [attempts (atom 0)]
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo #"locked by another process"
              (retry-while-busy
                (fn []
                  (swap! attempts inc)
                  (throw (ex-info "Cache file is locked by another process" {}))))))
        (is (= 1 @attempts))))

    (testing "a session held past the budget surfaces the original error"
      (let [attempts (atom 0)]
        (is (thrown-with-msg?
              clojure.lang.ExceptionInfo #"session 20 busy"
              (retry-while-busy
                (fn []
                  (swap! attempts inc)
                  (throw (ex-info "ATTACH ...: session 20 busy" {}))))))
        (is (= 5 @attempts))))))

;; Live preview (cache/count, cache/inclusion) runs circe's multi-statement SQL
;; over fixed-name temp tables, so each request needs a session of its own
;; rather than the WebAPI handle's shared one — see with-request-session.
(defn- with-pool-property [value f]
  (let [prev (System/getProperty "trexsql.use.pool")]
    (if value
      (System/setProperty "trexsql.use.pool" value)
      (System/clearProperty "trexsql.use.pool"))
    (try (f)
         (finally
           (if prev
             (System/setProperty "trexsql.use.pool" prev)
             (System/clearProperty "trexsql.use.pool"))))))

(deftest with-request-session-pool-test
  (let [base (db/make-database :base-handle {:k :v})
        next-id (atom 0)
        opened (atom [])
        closed (atom [])]
    (swap! (:extensions-loaded base) conj "circe")
    (with-redefs [trexsql.native/open-pool-session
                  (fn [] (let [h (keyword (str "session-" (swap! next-id inc)))]
                           (swap! opened conj h)
                           h))
                  trexsql.native/close! (fn [h] (swap! closed conj h))]
      (with-pool-property "true"
        (fn []
          (testing "each call runs on a fresh session handle, not the shared one"
            (let [handles (->> (range 8)
                               (mapv (fn [_] (future (db/with-request-session base :handle))))
                               (mapv deref))]
              (is (= 8 (count (distinct handles))))
              (is (not-any? #{:base-handle} handles))))

          (testing "every session is closed afterwards and the shared one never is"
            (is (= (set @opened) (set @closed)))
            (is (not-any? #{:base-handle} @closed))
            (is (false? (db/closed? base))))

          (testing "the session inherits config and the loaded-extension set"
            (let [s (db/with-request-session base identity)]
              (is (= {:k :v} (:config s)))
              (is (db/extension-loaded? s "circe"))))

          (testing "the session is closed when f throws, and the error propagates"
            (reset! closed [])
            (is (thrown-with-msg?
                  clojure.lang.ExceptionInfo #"boom"
                  (db/with-request-session base (fn [_] (throw (ex-info "boom" {}))))))
            (is (= 1 (count @closed)))))))))

(deftest with-request-session-standalone-test
  (with-pool-property nil
    (fn []
      (let [base (db/make-database :base-handle {})
            active (atom 0)
            peak (atom 0)]
        (testing "without the pool, calls reuse the shared db one at a time"
          (->> (range 8)
               (mapv (fn [_]
                       (future
                         (db/with-request-session base
                           (fn [d]
                             (is (identical? base d))
                             (swap! peak max (swap! active inc))
                             (Thread/sleep 20)
                             (swap! active dec))))))
               (run! deref))
          (is (= 1 @peak)))))))
