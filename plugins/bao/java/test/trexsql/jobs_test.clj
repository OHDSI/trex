(ns trexsql.jobs-test
  "Unit tests for jobs.clj - Job tracking functions."
  (:require [clojure.test :refer :all]
            [trexsql.jobs :as jobs]
            [trexsql.core :as core]))

;; Helper Functions

(defn with-test-db [f]
  "Create a temporary database for testing."
  (let [db (core/init {:cache-path "./target/test-cache"})]
    (try
      (f db)
      (finally
        (core/shutdown! db)))))

;; terminal-status? Tests

(deftest test-terminal-status
  (testing "Terminal statuses are correctly identified"
    (is (true? (jobs/terminal-status? "COMPLETED")))
    (is (true? (jobs/terminal-status? "FAILED")))
    (is (true? (jobs/terminal-status? "STOPPED")))
    (is (true? (jobs/terminal-status? "ABANDONED")))
    (is (false? (jobs/terminal-status? "STARTED")))
    (is (false? (jobs/terminal-status? "RUNNING")))
    (is (false? (jobs/terminal-status? "PENDING")))))

;; Local Jobs DB Tests

(deftest test-get-jobs-db
  (testing "Jobs DB is created/attached"
    (with-test-db
      (fn [db]
        (let [jobs-db-alias (jobs/get-jobs-db db)]
          (is (string? jobs-db-alias))
          (is (= "_cache_jobs" jobs-db-alias)))))))

(deftest test-create-and-get-local-job
  (testing "Create and retrieve local job"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-job-" (System/currentTimeMillis))
              _ (jobs/create-local-job! db test-id
                  {:source-key test-id
                   :status "RUNNING"
                   :total-tables 10
                   :config {:schema-name "cdm"}})
              job-status (jobs/get-job-status db test-id)]
          (is (some? job-status))
          (is (= test-id (:database-code job-status)))
          (is (= "RUNNING" (:status job-status)))
          (is (= 10 (:total-tables job-status))))))))

(deftest test-update-local-progress
  (testing "Update job progress"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-progress-" (System/currentTimeMillis))]
          ;; Create job
          (jobs/create-local-job! db test-id
            {:source-key test-id :status "RUNNING" :total-tables 5})

          ;; Update progress
          (jobs/update-local-progress! db test-id
            {:completed-tables 2
             :current-table "observation"
             :processed-rows 50000})

          ;; Verify progress
          (let [status (jobs/get-job-status db test-id)]
            (is (= 2 (:completed-tables status)))
            (is (= "observation" (:current-table status)))
            (is (= 50000 (:processed-rows status)))))))))

(deftest test-update-local-status
  (testing "Update job status"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-status-" (System/currentTimeMillis))]
          ;; Create job
          (jobs/create-local-job! db test-id
            {:source-key test-id :status "RUNNING" :total-tables 5})

          ;; Update to COMPLETE
          (jobs/update-local-status! db test-id "COMPLETE")

          ;; Verify status
          (let [status (jobs/get-job-status db test-id)]
            (is (= "COMPLETE" (:status status)))
            (is (some? (:end-time status)))))))))

(deftest test-update-local-status-with-error
  (testing "Update job status with error message"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-error-" (System/currentTimeMillis))]
          ;; Create job
          (jobs/create-local-job! db test-id
            {:source-key test-id :status "RUNNING" :total-tables 5})

          ;; Update to ERROR with message
          (jobs/update-local-status! db test-id "ERROR" "Connection timeout")

          ;; Verify status
          (let [status (jobs/get-job-status db test-id)]
            (is (= "ERROR" (:status status)))
            (is (= "Connection timeout" (:error-message status)))))))))

(deftest test-list-jobs
  (testing "List all jobs"
    (with-test-db
      (fn [db]
        (let [test-id-1 (str "test-list-1-" (System/currentTimeMillis))
              test-id-2 (str "test-list-2-" (System/currentTimeMillis))]
          ;; Create jobs
          (jobs/create-local-job! db test-id-1
            {:source-key test-id-1 :status "RUNNING" :total-tables 5})
          (jobs/create-local-job! db test-id-2
            {:source-key test-id-2 :status "COMPLETE" :total-tables 3})

          ;; List all
          (let [all-jobs (jobs/list-jobs db)]
            (is (>= (count all-jobs) 2)))

          ;; List by status
          (let [running-jobs (jobs/list-jobs db :status "RUNNING")]
            (is (some #(= test-id-1 (:database-code %)) running-jobs))))))))

;; Retry Status Tests

(deftest test-update-retry-status
  (testing "Update retry count and last error"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-retry-" (System/currentTimeMillis))]
          ;; Create job
          (jobs/create-local-job! db test-id
            {:source-key test-id :status "RUNNING" :total-tables 5})

          ;; Update retry status
          (jobs/update-retry-status! db test-id 2 "Connection reset")

          ;; Verify
          (let [status (jobs/get-job-status db test-id)]
            (is (= 2 (:retry-count status)))
            (is (= "Connection reset" (:last-error status)))))))))

;; Resume Config Tests

(deftest test-store-and-get-resume-config
  (testing "Store and retrieve config for resume"
    (with-test-db
      (fn [db]
        (let [test-id (str "test-resume-" (System/currentTimeMillis))
              config {:schema-name "cdm"
                      :batch-size 5000
                      :tables ["person" "observation"]}]
          ;; Create job with config
          (jobs/create-local-job! db test-id
            {:source-key test-id :status "ERROR" :total-tables 2 :config config})

          ;; Retrieve config
          (let [resume-config (jobs/get-resume-config db test-id)]
            (is (some? resume-config))
            (is (= "cdm" (:schema-name resume-config)))
            (is (= 5000 (:batch-size resume-config)))))))))

;; WebAPI Datasource Tests

(deftest test-get-webapi-datasource-nil
  (testing "WebAPI datasource returns nil when not configured"
    (with-test-db
      (fn [db]
        (is (nil? (jobs/get-webapi-datasource db)))))))

;; Spring Batch Write Tests

;; These cover the four ways the batch write silently produced no job row.

(deftest test-batch-table-prefix-default
  (testing "falls back to the WebAPI schema prefix when unconfigured"
    (is (= "webapi.BATCH_" (#'jobs/batch-table-prefix {:config {}})))))

(deftest test-batch-table-prefix-configured
  (testing "uses the prefix WebAPI's JobRepository was configured with"
    (is (= "other.BATCH_"
           (#'jobs/batch-table-prefix {:config {:batch-table-prefix "other.BATCH_"}})))))

(deftest test-batch-table-qualifies-names
  (testing "table names are schema-qualified"
    (is (= "webapi.BATCH_JOB_INSTANCE" (#'jobs/batch-table "webapi.BATCH_" "JOB_INSTANCE")))
    (is (= "webapi.BATCH_JOB_SEQ" (#'jobs/batch-table "webapi.BATCH_" "JOB_SEQ")))))

(deftest test-job-key-unique-per-execution
  (testing "the same params on a second build produce a different JOB_KEY"
    (let [params {:database-code "EUNOMIA" :schema-name "cdm"}]
      (is (not= (#'jobs/job-key-for params 1)
                (#'jobs/job-key-for params 2))))))

(deftest test-job-key-fits-column
  (testing "JOB_KEY stays within VARCHAR(32)"
    (let [k (#'jobs/job-key-for {:database-code (apply str (repeat 200 "x"))} 123456789)]
      (is (<= (count k) 32)))))

(deftest test-batch-statuses-are-spring-batch-names
  (testing "the local registry's vocabulary is not accepted as a BatchStatus"
    ;; BatchStatus/valueOf runs inside WebAPI's ResultSetExtractor, so a bad
    ;; value breaks /job/execution for every job, not just this row.
    (doseq [bad ["COMPLETE" "ERROR" "CANCELED" "RUNNING"]]
      (is (not (contains? @#'jobs/batch-statuses bad))))
    (doseq [good ["COMPLETED" "FAILED" "STOPPED" "STARTED"]]
      (is (contains? @#'jobs/batch-statuses good)))))

(deftest test-update-status-rejects-non-batch-status
  (testing "a non-BatchStatus value is refused rather than written"
    (let [calls (atom 0)]
      (with-redefs [jobs/get-webapi-datasource (fn [_] :fake-ds)]
        (with-redefs-fn {#'jobs/terminal-status? (fn [_] (swap! calls inc) true)}
          (fn [] (jobs/update-spring-batch-status! {:config {}} 1 "COMPLETE"))))
      ;; refused before it ever looks at terminality or touches the datasource
      (is (zero? @calls)))))

;; Transaction Tests

;; WebAPI's DataSource hands out connections with autocommit off, so a write
;; that only closes the connection is silently discarded. This is the shape of
;; the bug where JOB_INSTANCE never landed and JOB_EXECUTION then tripped
;; job_inst_exec_fk.

(defn- recording-connection [calls auto-commit]
  (let [state (atom auto-commit)]
    (java.lang.reflect.Proxy/newProxyInstance
      (.getClassLoader java.sql.Connection)
      (into-array Class [java.sql.Connection])
      (reify java.lang.reflect.InvocationHandler
        (invoke [_ _ method args]
          (let [n (.getName method)]
            (swap! calls conj n)
            (case n
              "setAutoCommit" (do (reset! state (first args)) nil)
              "getAutoCommit" @state
              "isWrapperFor" false
              "close" nil
              nil)))))))

(defn- recording-datasource [conn]
  (java.lang.reflect.Proxy/newProxyInstance
    (.getClassLoader javax.sql.DataSource)
    (into-array Class [javax.sql.DataSource])
    (reify java.lang.reflect.InvocationHandler
      (invoke [_ _ method _]
        (if (= "getConnection" (.getName method)) conn nil)))))

(deftest test-with-tx-commits-when-autocommit-off
  (testing "the write is committed rather than dropped on close"
    (let [calls (atom [])
          conn (recording-connection calls false)
          ds (recording-datasource conn)]
      (is (= :done (#'jobs/with-tx ds (fn [_] :done))))
      (is (some #{"commit"} @calls))
      (is (not (some #{"rollback"} @calls)))
      ;; autocommit is turned off for the transaction and restored after
      (is (= 2 (count (filter #{"setAutoCommit"} @calls)))))))

(deftest test-with-tx-rolls-back-on-failure
  (testing "a failed write is rolled back and the error propagates"
    (let [calls (atom [])
          conn (recording-connection calls false)
          ds (recording-datasource conn)]
      (is (thrown? RuntimeException
                   (#'jobs/with-tx ds (fn [_] (throw (RuntimeException. "boom"))))))
      (is (some #{"rollback"} @calls))
      (is (not (some #{"commit"} @calls))))))

(deftest test-with-tx-closes-the-connection
  (testing "the connection is returned to the pool"
    (let [calls (atom [])
          conn (recording-connection calls false)
          ds (recording-datasource conn)]
      (#'jobs/with-tx ds (fn [_] nil))
      (is (some #{"close"} @calls)))))
