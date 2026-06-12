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
