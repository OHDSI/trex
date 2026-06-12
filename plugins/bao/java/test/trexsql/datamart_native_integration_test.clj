(ns trexsql.datamart-native-integration-test
  "End-to-end: native DuckDB postgres-scanner copy + FTS. Requires a live
   Postgres; set BAO_IT_PG_URL/USER/PASS/SCHEMA. Run with:
     lein test :only trexsql.datamart-native-integration-test"
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.db :as db]
            [trexsql.datamart :as datamart]))

(defn- env [k] (System/getenv k))

(deftest ^:integration native-postgres-copy-test
  (when (env "BAO_IT_PG_URL")
    (let [conn (db/create-connection {:allow-unsigned-extensions true})
          handle (db/make-database conn {})
          tmp (str (System/getProperty "java.io.tmpdir") "/bao-it-cache")
          ;; target-schema-name is deliberately different from schema-name:
          ;; the native path must IGNORE it (mirror the source schema, like the
          ;; JDBC path) so the copy + FTS both resolve at schema-name. If the
          ;; native path honored target-schema-name, FTS would look at the wrong
          ;; schema and silently build no indexes.
          config {:database-code "it_pg"
                  :schema-name (env "BAO_IT_PG_SCHEMA")
                  :target-schema-name "it_pg_other_target"
                  :cache-path tmp
                  :fts-tables ["concept"]
                  :source-credentials {:dialect "postgres"
                                       :jdbc-url (env "BAO_IT_PG_URL")
                                       :user (env "BAO_IT_PG_USER")
                                       :password (env "BAO_IT_PG_PASS")}}
          result (datamart/create-cache handle config nil)]
      (testing "copy succeeded with at least one table"
        (is (:success? result))
        (is (pos? (count (:tables-copied result)))))
      (testing "result reports the source schema (target-schema-name ignored)"
        (is (= (env "BAO_IT_PG_SCHEMA") (:schema-name result))))
      (testing "FTS index built on concept (if present in the source)"
        (when (some #(= "concept" (:table-name %)) (:tables-copied result))
          (is (some #{"concept"} (:fts-indexes-created result)))))
      (db/close! handle))))
