(ns trexsql.jdbc-driver-test
  "jdbc:trexsql driver against a private in-process engine (jdbc:trexsql::memory:)."
  (:require [clojure.test :refer [deftest is testing]])
  (:import [java.sql BatchUpdateException Connection DriverManager SQLException
            SQLFeatureNotSupportedException Timestamp Types]
           [java.time LocalDate]
           [java.util Properties]
           [org.trex.jdbc TrexsqlDriver]))

(TrexsqlDriver/register)

(defn- connect ^Connection []
  (DriverManager/getConnection "jdbc:trexsql::memory:"))

(defn- rows [^java.sql.ResultSet rs]
  (let [n (.getColumnCount (.getMetaData rs))]
    (loop [out []]
      (if (.next rs)
        (recur (conj out (mapv #(.getObject rs (int %)) (range 1 (inc n)))))
        out))))

(deftest url-handling-test
  (let [d (TrexsqlDriver.)]
    (is (.acceptsURL d "jdbc:trexsql://trex:9494"))
    (is (.acceptsURL d "jdbc:trexsql::memory:"))
    (is (not (.acceptsURL d "jdbc:postgresql://h/db")))
    (is (nil? (.connect d "jdbc:postgresql://h/db" (Properties.))))
    (is (thrown? SQLException (.connect d "jdbc:trexsql:trex:9494" (Properties.))))))

(deftest connect-sql-test
  (let [target (fn [url props]
                 (let [m (.getDeclaredMethod (Class/forName "org.trex.jdbc.TrexsqlDriver$Target")
                                             "parse" (into-array Class [String Properties]))]
                   (.setAccessible m true)
                   (.invoke m nil (object-array [url props]))))
        connect-sql (fn [t]
                      (let [m (.getDeclaredMethod (class t) "connectSql" (make-array Class 0))]
                        (.setAccessible m true)
                        (.invoke m t (object-array 0))))
        props (doto (Properties.) (.setProperty "password" "s3cr'et"))]
    (testing "token from the password property, quoted"
      (is (= "CONNECT 'quack:trex:9494' (TOKEN 's3cr''et')"
             (connect-sql (target "jdbc:trexsql://trex:9494" props)))))
    (testing "token and disable_ssl from the URL"
      (is (= "CONNECT 'quack:localhost' (TOKEN 'abc', DISABLE_SSL true)"
             (connect-sql (target "jdbc:trexsql://localhost?token=abc&disable_ssl=true" (Properties.))))))))

(deftest query-and-types-test
  (with-open [c (connect)
              s (.createStatement c)]
    (let [rs (.executeQuery s (str "SELECT 1::INTEGER i, 2::BIGINT l, 1.5::DOUBLE d, "
                                   "1.25::DECIMAL(10,2) n, 'x' s, true b, DATE '2024-02-29' dt, "
                                   "TIMESTAMP '2024-02-29 12:34:56.123456' ts, NULL::VARCHAR z"))
          md (.getMetaData rs)]
      (is (= [Types/INTEGER Types/BIGINT Types/DOUBLE Types/DECIMAL Types/VARCHAR
              Types/BOOLEAN Types/DATE Types/TIMESTAMP Types/VARCHAR]
             (mapv #(.getColumnType md (int %)) (range 1 10))))
      (is (.next rs))
      (is (= 1 (.getInt rs "i")))
      (is (= 2 (.getLong rs "L")) "labels are case-insensitive")
      (is (= 1.5 (.getDouble rs "d")))
      (is (= 1.25M (.getBigDecimal rs "n")))
      (is (= "x" (.getString rs "s")))
      (is (true? (.getBoolean rs "b")))
      (is (= (LocalDate/of 2024 2 29) (.toLocalDate (.getDate rs "dt"))))
      (is (= (Timestamp/valueOf "2024-02-29 12:34:56.123456") (.getTimestamp rs "ts")))
      (is (nil? (.getString rs "z")))
      (is (.wasNull rs))
      (is (= 0 (.getInt rs "z")))
      (is (not (.next rs))))))

(deftest update-counts-and-ddl-test
  (with-open [c (connect)
              s (.createStatement c)]
    (is (= 0 (.executeUpdate s "CREATE TABLE t (id INTEGER, name VARCHAR)")))
    (is (= 3 (.executeUpdate s "INSERT INTO t VALUES (1,'a'),(2,'b'),(3,'c')")))
    (is (= 2 (.executeUpdate s "UPDATE t SET name = 'z' WHERE id > 1")))
    (is (false? (.execute s "DELETE FROM t WHERE id = 3")))
    (is (= 1 (.getUpdateCount s)))
    (is (true? (.execute s "SELECT count(*) FROM t")))
    (is (= [[2]] (rows (.getResultSet s))))
    (testing "several statements in one execute"
      (is (false? (.execute s "CREATE TEMP TABLE a (x INT); INSERT INTO a VALUES (7);")))
      (is (= [[7]] (rows (.executeQuery s "SELECT x FROM a")))))
    (testing "errors surface as SQLException with the engine message"
      (is (thrown-with-msg? SQLException #"(?i)does not exist"
                            (.executeQuery s "SELECT * FROM missing_table"))))))

(deftest prepared-statement-test
  (with-open [c (connect)]
    (with-open [s (.createStatement c)]
      (.execute s "CREATE TABLE p (id BIGINT, name VARCHAR, d DATE, ts TIMESTAMP, ok BOOLEAN)"))
    (with-open [ps (.prepareStatement c "INSERT INTO p VALUES (?, ?, ?, ?, ?)")]
      (doto ps
        (.setLong 1 1)
        (.setString 2 "it's ?")
        (.setDate 3 (java.sql.Date/valueOf "2024-01-31"))
        (.setTimestamp 4 (Timestamp/valueOf "2024-01-31 08:00:00"))
        (.setBoolean 5 true))
      (is (= 1 (.executeUpdate ps)))
      (.clearParameters ps)
      (doto ps
        (.setLong 1 2)
        (.setNull 2 Types/VARCHAR)
        (.setObject 3 nil)
        (.setObject 4 nil)
        (.setObject 5 false))
      (.addBatch ps)
      (doto ps
        (.setLong 1 3) (.setString 2 "c") (.setObject 3 nil) (.setObject 4 nil) (.setObject 5 nil))
      (.addBatch ps)
      (is (= [1 1] (vec (.executeBatch ps)))))
    (with-open [ps (.prepareStatement c "SELECT name, d, ok FROM p WHERE id = ? AND '?' = '?'")]
      (.setLong ps 1 1)
      (is (= [["it's ?" (java.sql.Date/valueOf "2024-01-31") true]] (rows (.executeQuery ps)))))
    (with-open [ps (.prepareStatement c "SELECT count(*) FROM p WHERE name IS NULL")]
      (is (= [[1]] (rows (.executeQuery ps)))))
    (testing "parameter count must match the placeholders"
      (with-open [ps (.prepareStatement c "SELECT ?, ?")]
        (.setInt ps 1 1)
        (is (thrown? SQLException (.executeQuery ps)))))))

(deftest batch-failure-test
  (with-open [c (connect)
              s (.createStatement c)]
    (.addBatch s "CREATE TABLE b (x INT)")
    (.addBatch s "INSERT INTO b VALUES (1)")
    (.addBatch s "INSERT INTO nope VALUES (1)")
    (let [e (try (.executeBatch s) nil (catch BatchUpdateException e e))]
      (is (some? e))
      (is (= [0 1] (vec (.getUpdateCounts e)))))))

(deftest transactions-test
  (with-open [c (connect)
              s (.createStatement c)]
    (.execute s "CREATE TABLE tx (x INT)")
    (.setAutoCommit c false)
    (.executeUpdate s "INSERT INTO tx VALUES (1)")
    (.rollback c)
    (.executeUpdate s "INSERT INTO tx VALUES (2)")
    (.commit c)
    (.setAutoCommit c true)
    (is (= [[2]] (rows (.executeQuery s "SELECT x FROM tx"))))
    (is (thrown? SQLException (.commit c)) "commit in auto-commit mode")))

(deftest metadata-and-lifecycle-test
  (let [c (connect)
        md (.getMetaData c)]
    (is (= "TrexSQL" (.getDatabaseProductName md)))
    (is (.supportsBatchUpdates md))
    (is (.isValid c 1))
    (with-open [s (.createStatement c)]
      (.setMaxRows s 2)
      (is (= 2 (count (rows (.executeQuery s "SELECT * FROM range(10)"))))))
    (is (thrown? SQLFeatureNotSupportedException (.prepareCall c "CALL x()")))
    (testing "getTables"
      (with-open [s (.createStatement c)]
        (.execute s "CREATE SCHEMA s; CREATE TABLE s.t1(x INT); CREATE TABLE s.a_b(x INT); CREATE TABLE s.a1b(x INT); CREATE TEMP TABLE tmp1(x INT)"))
      (let [tables (fn [schema pattern types]
                     (mapv #(subvec % 1 4)
                           (rows (.getTables md nil schema pattern (some-> types into-array)))))]
        (is (= ["TABLE_CAT" "TABLE_SCHEM" "TABLE_NAME" "TABLE_TYPE" "REMARKS" "TYPE_CAT" "TYPE_SCHEM"
                "TYPE_NAME" "SELF_REFERENCING_COL_NAME" "REF_GENERATION"]
               (let [m (.getMetaData (.getTables md nil nil nil nil))]
                 (mapv #(.getColumnLabel m (int %)) (range 1 (inc (.getColumnCount m)))))))
        (is (= [["s" "t1" "TABLE"]] (tables "s" "t%" ["TABLE"])))
        (is (= [["main" "tmp1" "LOCAL TEMPORARY"]] (tables nil "tmp%" ["LOCAL TEMPORARY"])))
        (is (= [] (tables "s" "t%" ["LOCAL TEMPORARY"])))
        (is (= [["main" "tmp1" "LOCAL TEMPORARY"] ["s" "t1" "TABLE"]]
               (filterv #(#{"t1" "tmp1"} (second %)) (tables nil nil nil)))
            "nil types means all types, ordered by TABLE_TYPE then name")
        (is (= [["s" "a1b" "TABLE"] ["s" "a_b" "TABLE"]] (tables "s" "a_b" nil)) "_ is a single-character wildcard")
        (is (= [["s" "a_b" "TABLE"]] (tables "s" "a\\_b" nil)) "the search string escape makes _ literal")
        (is (= [] (tables "s'" nil nil)) "patterns are bound as quoted literals")))
    (.close c)
    (is (.isClosed c))
    (is (not (.isValid c 1)))
    (is (thrown? SQLException (.createStatement c)))))

;; Against a live Quack server, e.g. a 2.0 CLI running
;;   CALL quack_serve('quack:localhost:9494', token = 'secret');
;; Run with TREX_IT_QUACK_URL=jdbc:trexsql://localhost:9494 TREX_IT_QUACK_TOKEN=secret.
(deftest ^:integration remote-session-test
  (when-let [url (System/getenv "TREX_IT_QUACK_URL")]
    (let [props (doto (Properties.) (.setProperty "password" (System/getenv "TREX_IT_QUACK_TOKEN")))]
      (with-open [c (DriverManager/getConnection url props)
                  s (.createStatement c)]
        (testing "statements run on the server, in one session"
          (.execute s "CREATE SCHEMA IF NOT EXISTS jdbc_it")
          (.execute s "CREATE OR REPLACE TABLE jdbc_it.src AS SELECT range AS id FROM range(5)")
          (.execute s "CREATE TEMP TABLE picked AS SELECT id FROM jdbc_it.src WHERE id < 3")
          (.execute s "CREATE OR REPLACE TABLE jdbc_it.cohort (cid INT, id BIGINT)")
          (is (= 3 (.executeUpdate s "INSERT INTO jdbc_it.cohort SELECT 1, id FROM picked")))
          (is (= [[1 3]] (rows (.executeQuery s "SELECT cid, count(*) FROM jdbc_it.cohort GROUP BY cid")))))
        (testing "prepared statements and transactions"
          (.setAutoCommit c false)
          (with-open [ps (.prepareStatement c "INSERT INTO jdbc_it.cohort VALUES (?, ?)")]
            (.setInt ps 1 2)
            (.setLong ps 2 99)
            (is (= 1 (.executeUpdate ps))))
          (.rollback c)
          (.setAutoCommit c true)
          (is (= [[0]] (rows (.executeQuery s "SELECT count(*) FROM jdbc_it.cohort WHERE cid = 2")))))
        (.execute s "DROP SCHEMA jdbc_it CASCADE")))))

(deftest ^:integration remote-get-tables-test
  (when-let [url (System/getenv "TREX_IT_QUACK_URL")]
    (let [props (doto (Properties.) (.setProperty "password" (System/getenv "TREX_IT_QUACK_TOKEN")))]
      (with-open [c (DriverManager/getConnection url props)
                  s (.createStatement c)]
        (.execute s "CREATE SCHEMA IF NOT EXISTS jdbc_it")
        (try
          (.execute s "CREATE OR REPLACE TABLE jdbc_it.tmp_abc (x INT)")
          (is (= [["jdbc_it" "tmp_abc" "TABLE"]]
                 (mapv #(subvec % 1 4)
                       (rows (.getTables (.getMetaData c) nil "jdbc_it" "tmp%"
                                         (into-array ["TABLE" "GLOBAL TEMPORARY" "LOCAL TEMPORARY"]))))))
          (finally (.execute s "DROP SCHEMA jdbc_it CASCADE")))))))

(deftest ^:integration remote-connect-is-fast
  (when-let [url (System/getenv "TREX_IT_QUACK_URL")]
    (let [props (doto (Properties.) (.setProperty "password" (System/getenv "TREX_IT_QUACK_TOKEN")))
          start (System/nanoTime)
          c (DriverManager/getConnection url props)
          ms (/ (- (System/nanoTime) start) 1e6)]
      (.close c)
      (is (< ms 2000) (str "getConnection took " (long ms) " ms")))))

(deftest ^:integration remote-bad-token-test
  (when-let [url (System/getenv "TREX_IT_QUACK_URL")]
    (is (thrown? SQLException
                 (DriverManager/getConnection url (doto (Properties.) (.setProperty "password" "wrong-token")))))))
