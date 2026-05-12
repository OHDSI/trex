(ns trexsql.datamart-test
  "Unit tests for datamart configuration and validation."
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.datamart :as datamart]))

;; SourceCredentials Validation Tests

(deftest validate-credentials-nil-test
  (testing "nil credentials returns error"
    (is (= "Missing required config: source-credentials"
           (datamart/validate-credentials nil)))))

(deftest validate-credentials-invalid-dialect-test
  (testing "invalid dialect returns error"
    (is (some? (datamart/validate-credentials
                {:dialect "invalid-dialect"})))))

(deftest validate-credentials-postgres-complete-test
  (testing "complete postgres credentials (jdbc-url shape) passes validation"
    (is (nil? (datamart/validate-credentials
               {:dialect "postgres"
                :jdbc-url "jdbc:postgresql://localhost:5432/test"
                :user "admin"
                :password "secret"})))))

(deftest validate-credentials-postgres-missing-jdbc-url-test
  (testing "postgres with missing jdbc-url fails"
    (is (some? (datamart/validate-credentials
                {:dialect "postgres"
                 :user "admin"
                 :password "secret"})))))

(deftest validate-credentials-postgres-missing-user-test
  (testing "postgres with missing user fails"
    (is (some? (datamart/validate-credentials
                {:dialect "postgres"
                 :jdbc-url "jdbc:postgresql://localhost:5432/test"
                 :password "secret"})))))

(deftest validate-credentials-postgres-missing-password-test
  (testing "postgres with missing password fails"
    (is (some? (datamart/validate-credentials
                {:dialect "postgres"
                 :jdbc-url "jdbc:postgresql://localhost:5432/test"
                 :user "admin"})))))

(deftest validate-credentials-sql-server-complete-test
  (testing "complete sql server credentials pass validation (same JDBC shape)"
    (is (nil? (datamart/validate-credentials
               {:dialect "sql server"
                :jdbc-url "jdbc:sqlserver://localhost:1433;databaseName=test"
                :user "admin"
                :password "secret"})))))

(deftest validate-credentials-all-webapi-dialects-test
  (testing "every dialect in WebAPI's DBMSType enum is accepted via JDBC"
    (doseq [dialect ["postgresql" "sql server" "pdw" "synapse"
                     "redshift" "oracle" "impala" "netezza"
                     "hive" "spark" "snowflake" "bigquery"]]
      (is (nil? (datamart/validate-credentials
                 {:dialect dialect
                  :jdbc-url (str "jdbc:" dialect "://localhost/test")
                  :user "admin"
                  :password "secret"}))
          (str dialect " should be a valid JDBC dialect")))))

(deftest validate-credentials-bigquery-jdbc-shape-test
  (testing "bigquery now uses the same JDBC shape as every other dialect"
    (is (nil? (datamart/validate-credentials
               {:dialect "bigquery"
                :jdbc-url "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=my-project"
                :user "svc"
                :password "secret"})))))

(deftest validate-credentials-bigquery-missing-jdbc-url-test
  (testing "bigquery without jdbc-url fails like any other JDBC dialect"
    (is (some? (datamart/validate-credentials
                {:dialect "bigquery"
                 :user "svc"
                 :password "secret"})))))

;; DatamartConfig Validation Tests

(deftest validate-config-nil-test
  (testing "nil config returns error"
    (is (= "Config is nil"
           (datamart/validate-config nil)))))

(deftest validate-config-missing-database-code-test
  (testing "missing database-code returns error"
    (is (some? (datamart/validate-config
                {:schema-name "cdm"
                 :source-credentials {:dialect "postgres"
                                      :jdbc-url "jdbc:postgresql://localhost:5432/test"
                                      :user "admin"
                                      :password "secret"}})))))

(deftest validate-config-invalid-database-code-test
  (testing "database-code with special chars returns error"
    (is (some? (datamart/validate-config
                {:database-code "my/database"
                 :schema-name "cdm"
                 :source-credentials {:dialect "postgres"
                                      :jdbc-url "jdbc:postgresql://localhost:5432/test"
                                      :user "admin"
                                      :password "secret"}})))))

(deftest validate-config-missing-schema-name-test
  (testing "missing schema-name returns error"
    (is (some? (datamart/validate-config
                {:database-code "mydb"
                 :source-credentials {:dialect "postgres"
                                      :jdbc-url "jdbc:postgresql://localhost:5432/test"
                                      :user "admin"
                                      :password "secret"}})))))

(deftest validate-config-complete-test
  (testing "complete config passes validation"
    (is (nil? (datamart/validate-config
               {:database-code "mydb"
                :schema-name "cdm"
                :source-credentials {:dialect "postgres"
                                     :jdbc-url "jdbc:postgresql://localhost:5432/test"
                                     :user "admin"
                                     :password "secret"}})))))

;; Java Map Conversion Tests

(deftest java-map-to-datamart-config-test
  (testing "java map conversion with defaults"
    (let [java-map (java.util.HashMap.
                    {"database-code" "testdb"
                     "schema-name" "public"
                     "source-credentials" (java.util.HashMap.
                                           {"dialect" "postgres"
                                            "jdbc-url" "jdbc:postgresql://localhost:5432/mydb"
                                            "user" "admin"
                                            "password" "secret"})})
          config (datamart/java-map->datamart-config java-map)]
      (is (= "testdb" (:database-code config)))
      (is (= "public" (:schema-name config)))
      (is (= "public" (:target-schema-name config)))  ; defaults to schema-name
      (is (= ["concept"] (:fts-tables config)))       ; default FTS tables
      (is (= "./data/cache" (:cache-path config)))    ; default cache path
      (is (= "postgres" (:dialect (:source-credentials config))))
      (is (= "jdbc:postgresql://localhost:5432/mydb"
             (:jdbc-url (:source-credentials config)))))))

(deftest java-map-to-datamart-config-with-overrides-test
  (testing "java map conversion with custom values"
    (let [java-map (java.util.HashMap.
                    {"database-code" "testdb"
                     "schema-name" "cdm"
                     "target-schema-name" "cdm_cache"
                     "fts-tables" (java.util.ArrayList. ["concept" "drug"])
                     "cache-path" "/custom/cache"
                     "source-credentials" (java.util.HashMap.
                                           {"dialect" "bigquery"
                                            "jdbc-url" "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=my-project"
                                            "user" "svc"
                                            "password" "secret"})})
          config (datamart/java-map->datamart-config java-map)]
      (is (= "cdm_cache" (:target-schema-name config)))
      (is (= ["concept" "drug"] (:fts-tables config)))
      (is (= "/custom/cache" (:cache-path config)))
      (is (= "bigquery" (:dialect (:source-credentials config)))))))

;; Result Conversion Tests

(deftest result-to-java-map-test
  (testing "CacheResult converts to Java HashMap"
    (let [result (datamart/->CacheResult
                  true
                  "testdb"
                  "cdm"
                  [(datamart/->TableResult "person" 1000 0)
                   (datamart/->TableResult "observation" 5000 0)]
                  []
                  ["concept"]
                  12345
                  nil)
          java-map (datamart/result->java-map result)]
      (is (= true (.get java-map "success")))
      (is (= "testdb" (.get java-map "database-code")))
      (is (= "cdm" (.get java-map "schema-name")))
      (is (= 2 (.size (.get java-map "tables-copied"))))
      (is (= 0 (.size (.get java-map "tables-failed"))))
      (is (= 12345 (.get java-map "duration-ms")))
      (is (nil? (.get java-map "error"))))))

(deftest result-with-errors-to-java-map-test
  (testing "CacheResult with errors converts properly"
    (let [result (datamart/->CacheResult
                  false
                  "testdb"
                  "cdm"
                  [(datamart/->TableResult "person" 1000 0)]
                  [(datamart/->TableError "observation" "Connection lost" "copy")]
                  []
                  5000
                  nil)
          java-map (datamart/result->java-map result)]
      (is (= false (.get java-map "success")))
      (is (= 1 (.size (.get java-map "tables-copied"))))
      (is (= 1 (.size (.get java-map "tables-failed"))))
      (let [failed-table (first (.get java-map "tables-failed"))]
        (is (= "observation" (.get failed-table "table-name")))
        (is (= "Connection lost" (.get failed-table "error")))
        (is (= "copy" (.get failed-table "phase")))))))

;; Filter and SELECT/WHERE construction now live in trexsql.batch
;; (see batch.clj's build-select-query) and are exercised through batch-test.
