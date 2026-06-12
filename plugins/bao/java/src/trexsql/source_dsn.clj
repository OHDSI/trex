(ns trexsql.source-dsn
  "Pure translation of a WebAPI JDBC URL into a DuckDB ATTACH DSN.

   WebAPI Sources hand us a JDBC URL (e.g. jdbc:postgresql://host:5432/db).
   DuckDB's native scanners want their own connection strings:
     - postgres: libpq keyword string  host=.. port=.. dbname=.. user=.. password=..
     - mysql:    key/value string      host=.. port=.. database=.. user=.. password=..
     - bigquery: project=<id>          (dataset is the source schema, supplied separately)
   These functions do no I/O and are fully unit-testable."
  (:require [clojure.string :as str]
            [trexsql.errors :as errors]))

(defn- sql-quote-safe
  "Double single quotes so a value is safe inside a single-quoted ATTACH string."
  [v]
  (str/replace (str v) "'" "''"))

(defn- parse-host-port-db
  "Parse jdbc:<proto>://host[:port]/db[?query] → {:host :port :db}.
   `expected-protos` is a set of acceptable sub-protocols (e.g. #{\"postgresql\"}).
   `default-port` is used when the URL omits the port.
   Throws config-error if the URL does not match `expected-protos`."
  [jdbc-url expected-protos default-port label]
  (let [m (re-matches #"(?i)jdbc:([a-z]+)://([^:/?]+)(?::(\d+))?/([^?]+).*" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "Cannot parse " label " JDBC URL: " jdbc-url) :jdbc-url)))
    (let [[_ proto host port db] m]
      (when-not (contains? expected-protos (str/lower-case proto))
        (throw (errors/config-error
                (str label " DSN requires a " label " JDBC URL, got: " jdbc-url) :jdbc-url)))
      {:host host :port (or port (str default-port)) :db db})))

(defn postgres-dsn
  "Build a libpq keyword DSN for DuckDB's postgres scanner from credentials."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"postgresql" "postgres"} 5432 "postgres")]
    (format "host=%s port=%s dbname=%s user=%s password=%s"
            (sql-quote-safe host) (sql-quote-safe port) (sql-quote-safe db)
            (sql-quote-safe user) (sql-quote-safe password))))

(defn mysql-dsn
  "Build a key/value DSN for DuckDB's mysql scanner from credentials."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"mysql" "mariadb"} 3306 "mysql")]
    (format "host=%s port=%s database=%s user=%s password=%s"
            (sql-quote-safe host) (sql-quote-safe port) (sql-quote-safe db)
            (sql-quote-safe user) (sql-quote-safe password))))

(defn bigquery-project
  "Extract the BigQuery ProjectId (case-insensitive) from a Simba JDBC URL."
  [{:keys [jdbc-url]}]
  (let [m (re-find #"(?i)ProjectId=([^;]+)" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "BigQuery JDBC URL missing ProjectId=: " jdbc-url) :jdbc-url)))
    (second m)))
