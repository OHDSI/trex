(ns trexsql.datamart
  "Datamart creation functionality for caching source database schemas in TrexSQL.
   Every supported source dialect goes through the same JDBC batch transfer
   path (HikariCP + SqlRender). FTS indexing and progress reporting run on
   the cache file after the copy completes."
  (:require [trexsql.db :as db]
            [trexsql.util :as util]
            [trexsql.batch :as batch]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honey.sql :as sql])
  (:import [java.util Map ArrayList HashMap]))

(defrecord SourceCredentials
  [dialect host port database-name user password])

(defrecord DatamartConfig
  [database-code schema-name target-schema-name source-credentials table-filter patient-filter timestamp-filter fts-tables cache-path parallel-copy])

(defrecord TableResult
  [table-name rows-copied indexes-created])

(defrecord TableError
  [table-name error phase])

(defrecord CacheResult
  [success? database-code schema-name tables-copied tables-failed fts-indexes-created duration-ms error])

;; Mirrors WebAPI's DBMSType enum (org.ohdsi.webapi.arachne.commons.types.DBMSType)
;; so any source the WebAPI accepts can also be cached. The corresponding JDBC
;; drivers are bundled with WebAPI and therefore reachable from bao via
;; java.sql.DriverManager when running in-process. Every dialect goes through
;; the same JDBC + HikariCP + SqlRender path; there is no longer a native
;; DuckDB scanner code path.
;;
;; "postgres" is kept alongside "postgresql" as a forgiving alias because
;; older Source rows may still carry the short form.
;; "mysql" / "mariadb" are extras — not in WebAPI's enum, but harmless to
;; accept since the drivers may be present in custom deployments.
(def valid-dialects
  #{"postgres" "postgresql"
    "sql server" "pdw" "synapse"
    "redshift"
    "oracle"
    "impala"
    "netezza"
    "hive" "spark"
    "snowflake"
    "bigquery"
    "mysql" "mariadb"})

;; Retained as an alias for callers that still ask "is this a JDBC dialect?".
;; Now that every supported dialect goes through JDBC, this is identical to
;; valid-dialects.
(def jdbc-dialects valid-dialects)

(defn- valid-database-code?
  "Check if database-code is valid for filesystem naming."
  [code]
  (and (string? code)
       (seq code)
       (re-matches #"^[a-zA-Z0-9_-]+$" code)))

(defn validate-credentials
  "Validate SourceCredentials. Returns nil if valid, error message if invalid.
   Every dialect uses the same JDBC shape: jdbc-url + user + password."
  [creds]
  (cond
    (nil? creds)
    "Missing required config: source-credentials"

    (not (contains? valid-dialects (:dialect creds)))
    (str "Unsupported dialect: " (:dialect creds) ". Must be one of: "
         (str/join ", " (sort valid-dialects)))

    (str/blank? (:jdbc-url creds))
    (str "Missing required JDBC config: jdbc-url for dialect " (:dialect creds))

    (str/blank? (:user creds))
    (str "Missing required JDBC config: user for dialect " (:dialect creds))

    (str/blank? (:password creds))
    (str "Missing required JDBC config: password for dialect " (:dialect creds))

    :else nil))

(defn validate-config
  "Validate DatamartConfig. Returns nil if valid, error message if invalid."
  [config]
  (cond
    (nil? config)
    "Config is nil"

    (not (valid-database-code? (:database-code config)))
    (str "Invalid database-code: " (:database-code config)
         ". Must be non-empty and contain only alphanumeric, underscore, or hyphen characters.")

    (str/blank? (:schema-name config))
    "Missing required config: schema-name"

    :else
    (validate-credentials (:source-credentials config))))

(defn java-map->source-credentials
  "Convert Java Map to SourceCredentials record."
  [^Map m]
  (let [clj-map (util/java-map->clj-map m)]
    (map->SourceCredentials clj-map)))

(defn java-map->datamart-config
  "Convert Java Map to DatamartConfig record.
   Applies defaults for optional fields."
  [^Map m]
  (let [clj-map (util/java-map->clj-map m)
        source-creds (when-let [creds (:source-credentials clj-map)]
                       (if (map? creds)
                         (map->SourceCredentials creds)
                         creds))]
    (map->DatamartConfig
     {:database-code (:database-code clj-map)
      :schema-name (:schema-name clj-map)
      :target-schema-name (or (:target-schema-name clj-map)
                              (:schema-name clj-map))
      :source-credentials source-creds
      :table-filter (:table-filter clj-map)
      :patient-filter (when-let [pf (:patient-filter clj-map)]
                        (vec pf))
      :timestamp-filter (:timestamp-filter clj-map)
      :fts-tables (or (:fts-tables clj-map) ["concept"])
      :cache-path (or (:cache-path clj-map) "./data/cache")
      :parallel-copy (boolean (:parallel-copy clj-map))})))

(defn table-result->java-map
  "Convert TableResult record to Java HashMap."
  [^TableResult tr]
  (doto (HashMap.)
    (.put "table-name" (:table-name tr))
    (.put "rows-copied" (:rows-copied tr))
    (.put "indexes-created" (:indexes-created tr))))

(defn table-error->java-map
  "Convert TableError record to Java HashMap."
  [^TableError te]
  (doto (HashMap.)
    (.put "table-name" (:table-name te))
    (.put "error" (:error te))
    (.put "phase" (:phase te))))

(defn tables-to-arraylist
  "Convert list of TableResult or TableError records to ArrayList<HashMap>."
  [records converter-fn]
  (let [al (ArrayList.)]
    (doseq [r records]
      (.add al (converter-fn r)))
    al))

(defn result->java-map
  "Convert CacheResult record to Java HashMap for Spring Batch compatibility."
  [^CacheResult result]
  (doto (HashMap.)
    (.put "success" (boolean (:success? result)))
    (.put "database-code" (:database-code result))
    (.put "schema-name" (:schema-name result))
    (.put "tables-copied" (tables-to-arraylist (:tables-copied result) table-result->java-map))
    (.put "tables-failed" (tables-to-arraylist (:tables-failed result) table-error->java-map))
    (.put "fts-indexes-created" (ArrayList. ^java.util.Collection (or (:fts-indexes-created result) [])))
    (.put "duration-ms" (:duration-ms result))
    (.put "error" (:error result))))
(defn get-document-identifier
  "Get document identifier column name for a table.
   Prioritizes columns matching {table}_id pattern, then columns ending with _id, then integer columns."
  [db cache-alias schema-name table-name]
  (try
    (let [primary-id (str table-name "_id")
          [query-sql & params] (sql/format
                                 {:select [:column_name]
                                  :from [:information_schema.columns]
                                  :where [:and
                                          [:= :table_catalog cache-alias]
                                          [:= :table_schema schema-name]
                                          [:= :table_name table-name]
                                          [:or
                                           [:like :column_name "%_id"]
                                           [:in :data_type ["INTEGER" "BIGINT"]]]]
                                  :order-by [[[:raw (format "CASE WHEN column_name = '%s' THEN 0 WHEN column_name LIKE '%%_id' THEN 1 ELSE 2 END" primary-id)]]
                                             :column_name]
                                  :limit 1})
          results (db/query-with-params db query-sql (vec params))]
      (when (seq results)
        (.get ^HashMap (first results) "column_name")))
    (catch Exception e
      (log/warn (format "Failed to get document identifier for %s: %s" table-name (.getMessage e)))
      nil)))

(defn get-text-columns
  "Get text/varchar columns from a table for FTS indexing."
  [db cache-alias schema-name table-name]
  (try
    (let [[query-sql & params] (sql/format
                                 {:select [:column_name]
                                  :from [:information_schema.columns]
                                  :where [:and
                                          [:= :table_catalog cache-alias]
                                          [:= :table_schema schema-name]
                                          [:= :table_name table-name]
                                          [:in :data_type ["VARCHAR" "TEXT"]]]})
          results (db/query-with-params db query-sql (vec params))]
      (mapv #(.get ^HashMap % "column_name") results))
    (catch Exception e
      (log/warn (format "Failed to get text columns for %s: %s" table-name (.getMessage e)))
      [])))

(defn create-fts-index
  "Create FTS index on a table. Returns table name on success, nil on failure.
   Dynamically discovers document ID and text columns from information_schema."
  [db cache-alias schema-name table-name]
  (try
    (db/validate-identifier! cache-alias "cache-alias")
    (db/validate-identifier! schema-name "schema-name")
    (db/validate-identifier! table-name "table-name")

    (log/info (format "Creating FTS index on %s" table-name))
    (let [qualified-table (format "\"%s\".\"%s\".\"%s\"" cache-alias schema-name table-name)
          id-column (get-document-identifier db cache-alias schema-name table-name)
          text-columns (get-text-columns db cache-alias schema-name table-name)]

      (cond
        (not id-column)
        (do
          (log/warn (format "No document identifier found for %s, skipping FTS index" table-name))
          nil)

        (empty? text-columns)
        (do
          (log/warn (format "No text columns found for %s, skipping FTS index" table-name))
          nil)

        :else
        (do
          (doseq [col (cons id-column text-columns)]
            (db/validate-identifier! col "column-name"))
          (let [fts-sql (format "PRAGMA create_fts_index(%s, %s, %s, stemmer='english', stopwords='english', strip_accents=1, lower=1, overwrite=1)"
                                qualified-table
                                id-column
                                (str/join ", " text-columns))]
            (log/debug (format "FTS SQL: %s" fts-sql))
            (db/execute! db fts-sql)
            (log/info (format "FTS index created successfully on %s" table-name))
            table-name))))
    (catch Exception e
      (log/warn (format "Failed to create FTS index on %s: %s" table-name (.getMessage e)))
      nil)))

(defn create-fts-indexes
  "Create FTS indexes on configured tables.
   Returns vector of table names with successful FTS index creation."
  [db cache-alias schema-name fts-tables copied-tables]
  (when (util/load-fts-extension! db)
    (let [copied-table-names (set (map :table-name copied-tables))
          tables-to-index (filter copied-table-names fts-tables)]
      (filterv some? (map #(create-fts-index db cache-alias schema-name %) tables-to-index)))))

(defn jdbc-dialect?
  "True for any dialect that goes through the generic JDBC batch transfer
   path. Now true for every supported dialect — kept as a function so
   callers reading older shape don't have to be touched."
  [dialect]
  (contains? jdbc-dialects (str/lower-case (or dialect ""))))

(defn- convert-config-for-jdbc
  "Convert DatamartConfig to JDBC batch config format."
  [config]
  (let [{:keys [database-code schema-name source-credentials table-filter
                patient-filter timestamp-filter cache-path]} config
        {:keys [dialect jdbc-url user password]} source-credentials]
    {:database-code database-code
     :schema-name schema-name
     :source-credentials {:jdbc-url jdbc-url
                          :user user
                          :password password
                          :dialect dialect}
     :table-filter (when table-filter (keys table-filter))
     :column-filter table-filter
     :patient-filter patient-filter
     :timestamp-filter timestamp-filter
     :cache-path (or cache-path "./data/cache")
     :batch-size (or (:batch-size config) 10000)}))

(defn create-cache
  "Unified cache creation. Every supported dialect goes through the JDBC
   batch transfer path (HikariCP + SqlRender). After the table copy
   completes successfully, FTS indexes are built on the configured tables
   (default: `concept`) inside the cache file. Returns a CacheResult.
   `progress-fn` is invoked with per-phase progress events during transfer."
  ([db config]
   (create-cache db config nil))
  ([db config progress-fn]
   (let [jdbc-config (convert-config-for-jdbc config)
         result (batch/create-cache-jdbc db jdbc-config progress-fn)
         tables-copied (:tables-copied result)
         ;; Only attempt FTS when the copy itself succeeded — pointless to
         ;; build indexes on a half-populated cache.
         ;; The JDBC batch path creates tables at
         ;; `<cache-alias>.<source-schema>.<table>` — the schema mirrors the
         ;; source's CDM schema so the cache count + circe SQL handlers can
         ;; query `<cache-alias>.<cdm-schema>.<table>` directly. The FTS
         ;; indexer needs the same coordinates.
         fts-created (when (and (:success? result) (seq tables-copied))
                       (try
                         (create-fts-indexes db
                                             (:database-code result)
                                             (:schema-name result)
                                             (or (:fts-tables config) ["concept"])
                                             (mapv (fn [t] {:table-name (:table-name t)})
                                                   tables-copied))
                         (catch Exception e
                           (log/warn (format "FTS index creation failed for %s: %s"
                                             (:database-code result) (.getMessage e)))
                           [])))]
     (->CacheResult
      (:success? result)
      (:database-code result)
      (:schema-name result)
      (mapv (fn [t] (->TableResult (:table-name t) (:rows-copied t) 0)) tables-copied)
      (mapv (fn [t] (->TableError (:table-name t) (:error t) (or (:phase t) "copy"))) (:tables-failed result))
      (or fts-created [])
      (:duration-ms result)
      (:error result)))))

(defn is-attached?
  "Check if a database is attached. Delegates to db/is-attached?"
  [db database-code]
  (db/is-attached? db database-code))

(defn detach-database!
  "Detach a database. Delegates to db/detach-database!"
  [db database-code]
  (db/detach-database! db database-code))
