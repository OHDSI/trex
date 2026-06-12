(ns trexsql.source-dsn
  "Translate a WebAPI JDBC URL into a DuckDB ATTACH DSN (postgres/mysql keyword
   string, or BigQuery project id). Values are single-quoted so spaces or '='
   can't break the DSN; SQL-literal escaping for ATTACH '...' is the caller's job
   (trexsql.db). Credentials-in-URL (user:pass@host) and IPv6 hosts are not
   supported — pass credentials via :user/:password. Pure, no I/O."
  (:require [clojure.string :as str]
            [trexsql.errors :as errors]))

(defn- libpq-quote
  "Single-quote a DSN value (doubling internal quotes) so spaces/'=' are safe."
  [v]
  (str "'" (str/replace (str v) "'" "''") "'"))

(defn- parse-host-port-db
  "Parse jdbc:<proto>://host[:port]/db[?query] → {:host :port :db}; throws
   config-error if the sub-protocol isn't in `expected-protos`."
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
  "libpq keyword DSN for DuckDB's postgres scanner."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"postgresql" "postgres"} 5432 "postgres")]
    (format "host=%s port=%s dbname=%s user=%s password=%s"
            (libpq-quote host) (libpq-quote port) (libpq-quote db)
            (libpq-quote user) (libpq-quote password))))

(defn mysql-dsn
  "Key/value DSN for DuckDB's mysql scanner."
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
