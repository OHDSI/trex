(ns trexsql.source-dsn-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.source-dsn :as dsn]))

(deftest postgres-dsn-test
  (testing "standard jdbc:postgresql url → libpq keyword string"
    (is (= "host=db.example.com port=5432 dbname=cdm user=alice password=secret"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://db.example.com:5432/cdm"
                              :user "alice" :password "secret"}))))
  (testing "missing port defaults to 5432"
    (is (= "host=localhost port=5432 dbname=cdm user=alice password=secret"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://localhost/cdm"
                              :user "alice" :password "secret"}))))
  (testing "query string after dbname is dropped"
    (is (= "host=h port=5432 dbname=cdm user=u password=p"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://h:5432/cdm?sslmode=require"
                              :user "u" :password "p"}))))
  (testing "single quotes in a credential are doubled for SQL safety"
    (is (= "host=h port=5432 dbname=cdm user=u password=p''q"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://h:5432/cdm"
                              :user "u" :password "p'q"})))))

(deftest mysql-dsn-test
  (testing "jdbc:mysql url → key/value string with database= and port 3306"
    (is (= "host=db port=3306 database=cdm user=alice password=secret"
           (dsn/mysql-dsn {:jdbc-url "jdbc:mysql://db:3306/cdm"
                           :user "alice" :password "secret"}))))
  (testing "mariadb sub-protocol is accepted"
    (is (= "host=db port=3306 database=cdm user=u password=p"
           (dsn/mysql-dsn {:jdbc-url "jdbc:mariadb://db/cdm" :user "u" :password "p"})))))

(deftest bigquery-project-test
  (testing "ProjectId is extracted case-insensitively from the Simba url"
    (is (= "my-proj"
           (dsn/bigquery-project {:jdbc-url "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=my-proj;OAuthType=3;DefaultDataset=ds"}))))
  (testing "missing ProjectId throws a clear error"
    (is (thrown-with-msg? Exception #"(?i)projectid"
          (dsn/bigquery-project {:jdbc-url "jdbc:bigquery://host:443;OAuthType=3"})))))

(deftest unparseable-url-test
  (testing "a non-postgres url to postgres-dsn throws"
    (is (thrown-with-msg? Exception #"(?i)postgres"
          (dsn/postgres-dsn {:jdbc-url "jdbc:oracle:thin:@h:1521:orcl" :user "u" :password "p"})))))
