(ns trexsql.source-dsn
  "Pure translation of a WebAPI JDBC URL into a DuckDB ATTACH DSN.

   WebAPI Sources hand us a JDBC URL (e.g. jdbc:postgresql://host:5432/db).
   DuckDB's native scanners want their own connection strings:
     - postgres: libpq keyword string  host=.. port=.. dbname=.. user=.. password=..
     - mysql:    key/value string      host=.. port=.. database=.. user=.. password=..
     - bigquery: project=<id>          (dataset is the source schema, supplied separately)
   Each value is single-quoted with internal single quotes doubled, per libpq /
   DuckDB connection-string rules, so values containing spaces or '=' cannot
   break the DSN or inject extra keys. SQL-literal escaping for embedding the
   DSN inside ATTACH '...' is the caller's job (see trexsql.db). Limitations:
   credentials embedded in the URL (user:pass@host) and IPv6 literal hosts are
   not supported — supply credentials via :user/:password. These functions do
   no I/O and are fully unit-testable."
  (:require [clojure.string :as str]
            [trexsql.errors :as errors]))

(defn- libpq-quote
  "Single-quote a connection-string value, doubling internal single quotes, so
   it is safe inside a libpq/DuckDB key=value DSN even with spaces or '='."
  [v]
  (str "'" (str/replace (str v) "'" "''") "'"))

(defn- parse-host-port-db
  "Parse jdbc:<proto>://host[:port]/db[?query] → {:host :port :db}.
   `expected-protos` is a set of acceptable sub-protocols (e.g. #{\"postgresql\"}).
   `default-port` is used when the URL omits the port.
   Throws config-error if the URL does not match `expected-protos`.
   Does not support `user:pass@host` credential-in-URL or IPv6 literal hosts."
  [jdbc-url expected-protos default-port label]
  (let [m (re-matches #"(?i)jdbc:([a-z]+)://([^:/?]+)(?::(\d+))?/([^/?]+).*" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "Cannot parse " label " JDBC URL: " jdbc-url) :jdbc-url)))
    (let [[_ proto host port db] m]
      (when-not (contains? expected-protos (str/lower-case proto))
        (throw (errors/config-error
                (str label " DSN requires a " label " JDBC URL, got: " jdbc-url) :jdbc-url)))
      {:host host :port (or port (str default-port)) :db db})))

(defn postgres-dsn
  "Build a libpq keyword DSN for DuckDB's postgres scanner from credentials.
   Values are single-quoted; embed the result in ATTACH via a SQL string literal."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"postgresql" "postgres"} 5432 "postgres")]
    (format "host=%s port=%s dbname=%s user=%s password=%s"
            (libpq-quote host) (libpq-quote port) (libpq-quote db)
            (libpq-quote user) (libpq-quote password))))

(defn mysql-dsn
  "Build a key/value DSN for DuckDB's mysql scanner from credentials.
   Values are single-quoted; embed the result in ATTACH via a SQL string literal."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"mysql" "mariadb"} 3306 "mysql")]
    (format "host=%s port=%s database=%s user=%s password=%s"
            (libpq-quote host) (libpq-quote port) (libpq-quote db)
            (libpq-quote user) (libpq-quote password))))

(defn bigquery-project
  "Extract the BigQuery ProjectId (case-insensitive) from a Simba JDBC URL."
  [{:keys [jdbc-url]}]
  (let [m (re-find #"(?i)ProjectId=([^;]+)" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "BigQuery JDBC URL missing ProjectId=: " jdbc-url) :jdbc-url)))
    (second m)))
