(ns trexsql.webapi
  "WebAPI integration handlers with Reitit routing."
  (:require [trexsql.datamart :as datamart]
            [trexsql.jobs :as jobs]
            [trexsql.vocab :as vocab]
            [trexsql.circe :as circe]
            [trexsql.db :as db]
            [trexsql.proxy :as proxy]
            [trexsql.config :as config]
            [clojure.string :as str]
            [clojure.data.json :as json]
            [clojure.tools.logging :as log]
            [reitit.ring :as ring]
            [trexsql.agent.routes :as agent-routes])
  (:import [java.util HashMap ArrayList Map]
           [java.io File]
           [java.sql DriverManager Connection PreparedStatement ResultSet]))

(defonce ^:private source-repository (atom nil))
(defonce ^:private global-config (atom {:cache-path "./data/cache"}))

(defn set-source-repository! [repo]
  (reset! source-repository repo))

(defn set-config! [config]
  (when config
    (swap! global-config merge config)))

(defn get-cache-path-from-config []
  (:cache-path @global-config))

(defn get-source-repository []
  @source-repository)

(defn- find-source-by-key [source-key]
  (when-let [repo @source-repository]
    (try
      (.findBySourceKey repo source-key)
      (catch Exception e
        nil))))

(defn- get-daimon-type
  "Get DaimonType enum value by name at runtime."
  [type-name]
  (let [daimon-class (Class/forName "org.ohdsi.webapi.source.SourceDaimon$DaimonType")]
    (Enum/valueOf daimon-class type-name)))

(defn- get-cdm-schema
  "Get CDM schema from source daimons."
  [source]
  (when source
    (.getTableQualifier source (get-daimon-type "CDM"))))

(defn- get-results-schema
  "Get Results schema from source daimons, falls back to CDM schema."
  [source]
  (when source
    (or (.getTableQualifierOrNull source (get-daimon-type "Results"))
        (get-cdm-schema source))))

(defn- extract-url-credential
  "Extract a single query-string credential (e.g. user, password) from a
   JDBC URL when it isn't supplied as an explicit field on the Source.
   Returns nil if the param isn't in the URL."
  [jdbc-url param]
  (when (and jdbc-url (str/includes? jdbc-url "?"))
    (try
      (let [[_ qs] (str/split jdbc-url #"\?" 2)
            params (into {}
                     (for [pair (str/split qs #"&")]
                       (let [[k v] (str/split pair #"=" 2)]
                         [k v])))]
        (get params param))
      (catch Exception _ nil))))

(defn- source->credentials
  "Translate a WebAPI Source bean into the SourceCredentials shape consumed
   by datamart/create-cache. Every dialect now uses the same JDBC-url-based
   shape — there is no special-case path."
  [source]
  (when source
    (let [dialect (.getSourceDialect source)
          conn-str (.getSourceConnection source)
          explicit-user (.getUsername source)
          explicit-pass (.getPassword source)]
      ;; Some Sources don't carry username/password as explicit fields and
      ;; embed them in the JDBC URL query string instead — fall back to
      ;; that when needed.
      {:dialect dialect
       :connection-string conn-str
       :jdbc-url conn-str
       :user (or explicit-user (extract-url-credential conn-str "user"))
       :password (or explicit-pass (extract-url-credential conn-str "password"))})))

(defn response
  ([status body]
   {:status status :body body})
  ([status body headers]
   {:status status :body body :headers headers}))

(defn ok [body]
  (response 200 body))

(defn created [body]
  (response 201 body))

(defn no-content []
  (response 204 nil))

(defn bad-request [message]
  (response 400 {:error "BAD_REQUEST" :message message}))

(defn not-found [message]
  (response 404 {:error "NOT_FOUND" :message message}))

(defn conflict [message]
  (response 409 {:error "CONFLICT" :message message}))

(defn internal-error [message]
  (response 500 {:error "INTERNAL_ERROR" :message message}))

(defn unprocessable
  "422 — the request was understood but the cohort expression circe was
   asked to render is incomplete or invalid (e.g. missing StartWindow on
   a correlated criterion, codeset id pointing at an empty placeholder
   set). The cohort builder uses this to surface a banner instead of
   silently displaying 0 counts."
  [message]
  (response 422 {:error "INVALID_EXPRESSION" :message message}))

(defn service-unavailable [message]
  (response 503 {:error "SERVICE_UNAVAILABLE" :message message}))

(defn- parse-json [s]
  (when (and s (not (str/blank? s)))
    (try
      (json/read-str s :key-fn keyword)
      (catch Exception e
        nil))))

(defn- java-map->clj [m]
  (cond
    (instance? Map m)
    (into {} (for [[k v] m]
               [(keyword k) (java-map->clj v)]))

    (instance? java.util.List m)
    (vec (map java-map->clj m))

    :else m))

(defn- sanitize-database-code
  "Convert a source key (e.g., UUID) to a valid SQL identifier.
   Replaces hyphens with underscores and ensures it starts with a letter/underscore."
  [source-key]
  (when source-key
    (let [sanitized (str/replace source-key "-" "_")]
      ;; If it starts with a digit, prefix with underscore
      (if (re-matches #"^\d.*" sanitized)
        (str "_" sanitized)
        sanitized))))

(defn- validate-database-code
  "Validate database-code for safe use. Returns nil if valid, error message if invalid."
  [database-code]
  (cond
    (nil? database-code)
    "database-code is required"

    (not (string? database-code))
    "database-code must be a string"

    (str/blank? database-code)
    "database-code cannot be empty"

    (not (re-matches #"^[a-zA-Z_][a-zA-Z0-9_]*$" database-code))
    (str "Invalid database-code: " database-code
         ". Must start with letter/underscore and contain only alphanumeric/underscore characters.")

    (> (count database-code) 128)
    "database-code is too long (max 128 characters)"

    :else nil))

(defn- build-credentials-map [credentials]
  (let [m (doto (HashMap.)
            (.put "dialect" (:dialect credentials))
            (.put "connection-string" (:connection-string credentials))
            (.put "user" (:user credentials))
            (.put "password" (:password credentials)))]
    (when (:host credentials) (.put m "host" (:host credentials)))
    (when (:port credentials) (.put m "port" (:port credentials)))
    (when (:database-name credentials) (.put m "database-name" (:database-name credentials)))
    (when (:jdbc-url credentials) (.put m "jdbc-url" (:jdbc-url credentials)))
    m))

(defn- build-datamart-config [database-code schema-name cache-path credentials request]
  (let [config (doto (HashMap.)
                 (.put "database-code" database-code)
                 (.put "schema-name" schema-name)
                 (.put "cache-path" cache-path)
                 (.put "source-credentials" (build-credentials-map credentials))
                 (.put "fts-tables" (ArrayList. (or (:ftsTables request) ["concept"]))))]
    (when-let [v (:targetSchemaName request)] (.put config "target-schema-name" v))
    (when-let [v (:tables request)] (.put config "tables" (ArrayList. v)))
    (when-let [v (:patientFilter request)] (.put config "patient-filter" (ArrayList. v)))
    (when-let [v (:timestampFilter request)] (.put config "timestamp-filter" v))
    config))

(defn- build-circe-options [cdm-schema result-schema cohort-id target-table generate-stats]
  (doto (HashMap.)
    (.put "cdm-schema" cdm-schema)
    (.put "result-schema" result-schema)
    (.put "cohort-id" cohort-id)
    (.put "target-table" (or target-table "cohort"))
    (.put "generate-stats" (boolean generate-stats))))

(defn- get-schema-from-cache [db database-code]
  "Get the schema name from the cache by querying for the concept table."
  (try
    (let [query "SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_catalog = ? AND table_name = 'concept' LIMIT 1"
          results (db/query-with-params db query [database-code])]
      (when (seq results)
        (.get ^HashMap (first results) "table_schema")))
    (catch Exception e
      (log/warn (format "Failed to get schema from cache for %s: %s" database-code (.getMessage e)))
      nil)))

(defn- build-vocab-options [db database-code max-rows]
  (let [schema-name (or (get-schema-from-cache db database-code) database-code)]
    (doto (HashMap.)
      (.put "database-code" database-code)
      (.put "schema-name" schema-name)
      (.put "max-rows" max-rows))))

(defn- get-cache-path [cache-base-path database-code]
  (str cache-base-path "/" database-code ".db"))

(defn- handle-create-cache [db source-key body params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [request (parse-json body)]
        (if-not request
          (bad-request "Invalid JSON body")
          (if (str/blank? (:schemaName request))
            (bad-request "schemaName is required")
            (let [database-code (or (:databaseCode request) (sanitize-database-code source-key))]
              (if-let [validation-error (validate-database-code database-code)]
                (bad-request validation-error)
                (try
                  (let [cache-path (or (:cachePath params) (get-cache-path-from-config))
                        credentials (source->credentials source)
                        config-map (build-datamart-config database-code (:schemaName request)
                                                          cache-path credentials request)
                        validated-config (datamart/java-map->datamart-config config-map)]
                    (when-let [error (datamart/validate-config validated-config)]
                      (throw (IllegalArgumentException. error)))
                    (let [result (datamart/create-cache db validated-config nil)
                          java-result (datamart/result->java-map result)]
                      (ok (java-map->clj java-result))))
                  (catch IllegalArgumentException e
                    (bad-request (.getMessage e)))
                  (catch Exception e
                    (internal-error (.getMessage e))))))))))))

;; Status values written into _cache_jobs.cache_generation_info that mean the
;; job is no longer running. The status endpoint surfaces these as `lastJob`
;; so the UI doesn't keep showing "building" after a build has completed.
(def ^:private local-terminal-statuses #{"COMPLETE" "ERROR" "CANCELED" "FAILED"})

(defn- job-status->summary [job-status]
  {:jobId (:job-execution-id job-status)
   :status (:status job-status)
   :startTime (str (:start-time job-status))
   :endTime (when (:end-time job-status) (str (:end-time job-status)))
   :progress {:totalTables (:total-tables job-status)
              :completedTables (:completed-tables job-status)
              :currentTable (:current-table job-status)
              :processedRows (:processed-rows job-status)}
   :error (:error-message job-status)})

(defn- handle-get-cache-status [db source-key params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [database-code (or (:databaseCode params) (sanitize-database-code source-key))]
        (if-let [validation-error (validate-database-code database-code)]
          (bad-request validation-error)
          (let [cache-path (or (:cachePath params) (get-cache-path-from-config))
                cache-file (File. (get-cache-path cache-path database-code))
                exists? (.exists cache-file)
                ;; Auto-attach if the cache file exists but isn't currently
                ;; attached to the main trex handle. After a restart the
                ;; cache is detached until first use; without auto-attach
                ;; here the frontend sees `cacheAttached:false`, maps to
                ;; status='error', and refuses to fire any count/inclusion
                ;; calls.
                _ (when (and exists?
                             (not (try (datamart/is-attached? db database-code)
                                       (catch Exception _ false))))
                    (try (db/attach-cache-file! db database-code cache-path)
                         (catch Exception e
                           (log/warn (format "auto-attach %s failed: %s"
                                             database-code (.getMessage e))))))
                attached? (try (datamart/is-attached? db database-code) (catch Exception _ false))
                job-status (try (jobs/get-job-status db database-code) (catch Exception _ nil))
                terminal? (and job-status
                               (contains? local-terminal-statuses (:status job-status)))
                summary (when job-status (job-status->summary job-status))]
            (ok {:sourceKey source-key
                 :cacheExists exists?
                 :cacheAttached attached?
                 :cacheFilePath (when exists? (.getAbsolutePath cache-file))
                 :cacheSizeBytes (when exists? (.length cache-file))
                 :lastModified (when exists? (.lastModified cache-file))
                 ;; activeJob = currently running. lastJob = most recent
                 ;; finished run (kept for history / error reporting).
                 :activeJob (when (and summary (not terminal?)) summary)
                 :lastJob   (when (and summary terminal?) summary)})))))))

(defn- handle-list-cache-jobs [db params]
  (try
    (let [status (:status params)
          jobs (if status
                 (jobs/list-jobs db :status status)
                 (jobs/list-jobs db))]
      (ok {:jobs (mapv (fn [job]
                         {:databaseCode (:database-code job)
                          :sourceKey (:source-key job)
                          :status (:status job)
                          :startTime (str (:start-time job))
                          :endTime (when (:end-time job) (str (:end-time job)))
                          :totalTables (:total-tables job)
                          :completedTables (:completed-tables job)
                          :error (:error-message job)})
                       jobs)
           :count (count jobs)}))
    (catch Exception e
      (internal-error (.getMessage e)))))

(defn- handle-cancel-cache-job [db source-key params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [database-code (or (:databaseCode params) (sanitize-database-code source-key))
            job-status (try (jobs/get-job-status db database-code) (catch Exception _ nil))]
        (cond
          (nil? job-status)
          (not-found (str "No cache job found for: " database-code))

          (not= "RUNNING" (:status job-status))
          (conflict (str "Job is not running. Current status: " (:status job-status)))

          :else
          (do
            (jobs/update-local-status! db database-code "CANCELED")
            (ok {:databaseCode database-code
                 :status "CANCELED"
                 :message "Job cancellation requested"})))))))

(defn- handle-delete-cache [db source-key params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [database-code (or (:databaseCode params) (sanitize-database-code source-key))
            cache-path (or (:cachePath params) (get-cache-path-from-config))
            cache-file (File. (get-cache-path cache-path database-code))]
        (if-not (.exists cache-file)
          (not-found (str "Cache not found for source: " source-key))
          (do
            (when (try (datamart/is-attached? db database-code) (catch Exception _ false))
              (try (datamart/detach-database! db database-code) (catch Exception _)))
            (if (.delete cache-file)
              (no-content)
              (internal-error "Failed to delete cache file"))))))))

(defn- handle-execute-circe [db source-key body params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [request (parse-json body)]
        (if-not request
          (bad-request "Invalid JSON body")
          (let [{:keys [circeJson cdmSchema resultSchema cohortId targetTable generateStats]} request]
            (cond
              (str/blank? circeJson) (bad-request "circeJson is required")
              (str/blank? cdmSchema) (bad-request "cdmSchema is required")
              (str/blank? resultSchema) (bad-request "resultSchema is required")
              (nil? cohortId) (bad-request "cohortId is required")
              :else
              (try
                (let [options-map (build-circe-options cdmSchema resultSchema cohortId targetTable generateStats)
                      clj-options (circe/java-map->circe-options options-map)
                      result (circe/execute-circe db circeJson clj-options)
                      java-result (circe/circe-result->java-map result)]
                  (ok (java-map->clj java-result)))
                (catch Exception e
                  (internal-error (.getMessage e)))))))))))

(defn- handle-render-circe [db source-key body params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [request (parse-json body)]
        (if-not request
          (bad-request "Invalid JSON body")
          (let [{:keys [circeJson cdmSchema resultSchema cohortId targetTable generateStats]} request]
            (cond
              (str/blank? circeJson) (bad-request "circeJson is required")
              (str/blank? cdmSchema) (bad-request "cdmSchema is required")
              (str/blank? resultSchema) (bad-request "resultSchema is required")
              (nil? cohortId) (bad-request "cohortId is required")
              :else
              (try
                (let [options-map (build-circe-options cdmSchema resultSchema cohortId targetTable generateStats)
                      clj-options (circe/java-map->circe-options options-map)
                      sql (circe/render-circe-to-sql db circeJson clj-options)]
                  (ok {:success true :sql sql}))
                (catch Exception e
                  (internal-error (.getMessage e)))))))))))

(defn- handle-search-vocab [db source-key params]
  (let [source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [query (:query params)
            max-rows (try (Integer/parseInt (or (:maxRows params) "1000")) (catch Exception _ 1000))
            database-code (or (:databaseCode params) (sanitize-database-code source-key))]
        (if (str/blank? query)
          (bad-request "query parameter is required")
          (try
            (let [options-map (build-vocab-options db database-code max-rows)
                  clj-options (vocab/java-map->search-options options-map)
                  results (vocab/search-vocab db query clj-options)
                  clj-results (mapv java-map->clj results)]
              (ok {:results clj-results :count (count clj-results)}))
            (catch Exception e
              (internal-error (.getMessage e)))))))))

(defn handle-request [db method path body headers params]
  (let [segments (vec (remove str/blank? (str/split (or path "") #"/")))
        source-key (first segments)
        resource (second segments)
        action (nth segments 2 nil)]
    (cond
      (str/blank? source-key)
      (bad-request "Source key is required in path")

      (and (= source-key "cache") (= resource "jobs"))
      (case method
        "GET" (handle-list-cache-jobs db params)
        (not-found (str "Unknown cache jobs endpoint: " method " /cache/jobs")))

      (= resource "cache")
      (case [method action]
        ["POST" nil] (handle-create-cache db source-key body params)
        ["GET" "status"] (handle-get-cache-status db source-key params)
        ["DELETE" nil] (handle-delete-cache db source-key params)
        ["DELETE" "job"] (handle-cancel-cache-job db source-key params)
        (not-found (str "Unknown cache endpoint: " method " /" (str/join "/" segments))))

      (= resource "circe")
      (case [method action]
        ["POST" "execute"] (handle-execute-circe db source-key body params)
        ["POST" "render"] (handle-render-circe db source-key body params)
        (not-found (str "Unknown circe endpoint: " method " /" (str/join "/" segments))))

      (= resource "vocab")
      (case [method action]
        ["GET" "search"] (handle-search-vocab db source-key params)
        (not-found (str "Unknown vocab endpoint: " method " /" (str/join "/" segments))))

      :else
      (not-found (str "Unknown resource: " resource)))))

(defn- clj->java [x]
  (cond
    (map? x)
    (let [m (HashMap.)]
      (doseq [[k v] x]
        (.put m (if (keyword? k) (name k) (str k)) (clj->java v)))
      m)

    (sequential? x)
    (let [l (ArrayList.)]
      (doseq [item x]
        (.add l (clj->java item)))
      l)

    (keyword? x)
    (name x)

    :else x))

(defn response->java-map [resp]
  (clj->java resp))

;; HTTP handlers

(defn- list-cache-jobs-handler
  [{:keys [db query-params]}]
  (handle-list-cache-jobs db query-params))

(defn- create-cache-handler
  [{:keys [db path-params body-params query-params]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (if (str/blank? (:schemaName body-params))
        (bad-request "schemaName is required")
        (let [database-code (or (:databaseCode body-params) (sanitize-database-code source-key))]
          (if-let [validation-error (validate-database-code database-code)]
            (bad-request validation-error)
            (try
              (let [cache-path (or (:cachePath query-params) (get-cache-path-from-config))
                    credentials (source->credentials source)
                    config-map (build-datamart-config database-code (:schemaName body-params)
                                                      cache-path credentials body-params)
                    validated-config (datamart/java-map->datamart-config config-map)]
                (when-let [error (datamart/validate-config validated-config)]
                  (throw (IllegalArgumentException. error)))
                (let [result (datamart/create-cache db validated-config nil)
                      java-result (datamart/result->java-map result)]
                  (ok (java-map->clj java-result))))
              (catch IllegalArgumentException e
                (bad-request (.getMessage e)))
              (catch Exception e
                (internal-error (.getMessage e))))))))))

(defn- get-cache-status-handler
  [{:keys [db path-params query-params]}]
  (let [source-key (:source-key path-params)]
    (handle-get-cache-status db source-key query-params)))

(defn- delete-cache-handler
  [{:keys [db path-params query-params]}]
  (let [source-key (:source-key path-params)]
    (handle-delete-cache db source-key query-params)))

(defn- cancel-cache-job-handler
  [{:keys [db path-params query-params]}]
  (let [source-key (:source-key path-params)]
    (handle-cancel-cache-job db source-key query-params)))

(defn- execute-circe-handler
  [{:keys [db path-params body-params trex-config]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [{:keys [circeJson cdmSchema resultSchema cohortId targetTable generateStats]} body-params
            cache-path (or (:cache-path trex-config) (get-cache-path-from-config))]
        (cond
          (str/blank? circeJson) (bad-request "circeJson is required")
          (str/blank? cdmSchema) (bad-request "cdmSchema is required")
          (str/blank? resultSchema) (bad-request "resultSchema is required")
          (nil? cohortId) (bad-request "cohortId is required")
          :else
          (try
            (when-not (db/is-attached? db source-key)
              (log/info (format "Attaching cache for %s from %s" source-key cache-path))
              (db/attach-cache-file! db source-key cache-path))
            ;; Qualify schema names with source-key database alias
            (let [qualified-cdm (str source-key "." cdmSchema)
                  qualified-results (str source-key "." resultSchema)
                  qualified-target (str qualified-results "." (or targetTable "cohort"))
                  options-map (build-circe-options qualified-cdm qualified-results cohortId qualified-target generateStats)
                  clj-options (circe/java-map->circe-options options-map)
                  result (circe/execute-circe db circeJson clj-options)
                  java-result (circe/circe-result->java-map result)]
              (ok (java-map->clj java-result)))
            (catch Exception e
              (internal-error (.getMessage e)))))))))

(defn- render-circe-handler
  [{:keys [db path-params body-params]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [{:keys [circeJson cdmSchema resultSchema cohortId targetTable generateStats]} body-params]
        (cond
          (str/blank? circeJson) (bad-request "circeJson is required")
          (str/blank? cdmSchema) (bad-request "cdmSchema is required")
          (str/blank? resultSchema) (bad-request "resultSchema is required")
          (nil? cohortId) (bad-request "cohortId is required")
          :else
          (try
            (let [options-map (build-circe-options cdmSchema resultSchema cohortId targetTable generateStats)
                  clj-options (circe/java-map->circe-options options-map)
                  sql (circe/render-circe-to-sql db circeJson clj-options)]
              (ok {:success true :sql sql}))
            (catch Exception e
              (internal-error (.getMessage e)))))))))

(defn- search-vocab-handler
  [{:keys [db path-params query-params]}]
  (let [source-key (:source-key path-params)]
    (handle-search-vocab db source-key query-params)))

(defn- count-patients-handler
  [{:keys [db path-params body-params trex-config]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [{:keys [expression]} body-params
            expression-str (if (string? expression)
                             expression
                             (json/write-str expression))
            cdm-schema (get-cdm-schema source)
            cache-path (or (:cache-path trex-config) (get-cache-path-from-config))
            start-time (System/currentTimeMillis)]
        (cond
          (or (nil? expression) (and (string? expression) (str/blank? expression)))
          (bad-request "expression is required")

          (str/blank? cdm-schema)
          (bad-request "CDM schema not configured for this source")

          :else
          (try
            (when-not (db/is-attached? db source-key)
              (log/info (format "Attaching cache for %s from %s" source-key cache-path))
              (db/attach-cache-file! db source-key cache-path))
            (let [qualified-cdm (str source-key "." cdm-schema)
                  ;; Circe's cohort-write templates emit the cohort target
                  ;; table as a bare identifier (no `@resultSchema.` prefix).
                  ;; Older versions of OHDSI Circe did prefix it, but the
                  ;; build bundled here writes plain `INSERT INTO
                  ;; @target_cohort_table` / `DELETE FROM @target_cohort_table`.
                  ;; To make the bare reference resolve, both bao's CREATE
                  ;; and the COUNT must use the same unqualified TEMP table
                  ;; (DuckDB's `temp.main` is on the implicit search path).
                  ;; Passing an empty result-schema gives circe nothing to
                  ;; prefix with for any straggling `@resultSchema.` usages
                  ;; that may exist in older templates.
                  temp-table "temp_cohort_count"
                  cohort-id 999999
                  options-map (build-circe-options qualified-cdm qualified-cdm cohort-id temp-table false)
                  clj-options (circe/java-map->circe-options options-map)]
              (try
                (db/execute! db (format "DROP TABLE IF EXISTS %s" temp-table))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, subject_id BIGINT, cohort_start_date DATE, cohort_end_date DATE)" temp-table))
                (let [circe-result (circe/execute-circe db expression-str clj-options)]
                  (if (:success circe-result)
                    (let [cohort-sql (format "SELECT COUNT(DISTINCT subject_id) as cnt FROM %s WHERE cohort_definition_id = %d"
                                             temp-table cohort-id)
                          total-sql (format "SELECT COUNT(DISTINCT person_id) as cnt FROM %s.person" qualified-cdm)
                          cohort-result (db/query db cohort-sql)
                          total-result (db/query db total-sql)
                          cohort-count (or (some-> cohort-result first (.get "cnt")) 0)
                          total-count (or (some-> total-result first (.get "cnt")) 0)
                          exec-time (- (System/currentTimeMillis) start-time)]
                      (ok {:cohortPatientCount cohort-count
                           :totalPatientCount total-count
                           :executionTimeMs exec-time}))
                    (do
                      (log/warn (format "circe execute returned failure for %s: %s"
                                        source-key (:error circe-result)))
                      (unprocessable
                        (or (:error circe-result)
                            "The cohort expression is incomplete or invalid.")))))
                (finally
                  (try
                    (db/execute! db (format "DROP TABLE IF EXISTS %s" temp-table))
                    (catch Exception _)))))
            (catch Exception e
              (log/error e "Failed to count patients")
              (internal-error (.getMessage e)))))))))

(defn- count-inclusion-handler
  [{:keys [db path-params body-params trex-config]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [{:keys [expression]} body-params
            expression-str (if (string? expression) expression (json/write-str expression))
            cdm-schema (get-cdm-schema source)
            cache-path (or (:cache-path trex-config) (get-cache-path-from-config))
            start-time (System/currentTimeMillis)]
        (cond
          (or (nil? expression) (and (string? expression) (str/blank? expression)))
          (bad-request "expression is required")

          (str/blank? cdm-schema)
          (bad-request "CDM schema not configured for this source")

          :else
          (try
            (when-not (db/is-attached? db source-key)
              (log/info (format "Attaching cache for %s from %s" source-key cache-path))
              (db/attach-cache-file! db source-key cache-path))
            (let [qualified-cdm (str source-key "." cdm-schema)
                  cohort-id 999999
                  ;; Circe with generate-stats=true emits two distinct
                  ;; reference styles in the same SQL bundle:
                  ;;   - cohort target table: bare (substituted directly
                  ;;     from `@target_cohort_table`) → must live on the
                  ;;     implicit search path
                  ;;   - 4 stats tables (`cohort_inclusion_result`,
                  ;;     `cohort_inclusion_stats`, `cohort_summary_stats`,
                  ;;     `cohort_censor_stats`): qualified with
                  ;;     `@results_database_schema.<name>`
                  ;; Routing result-schema to `temp.main` lets circe emit
                  ;; `temp.main.cohort_inclusion_result`, which DuckDB
                  ;; resolves to the same temp catalog where the bare
                  ;; cohort target table also lives.
                  result-schema "temp.main"
                  cohort-tbl "temp_inc_cohort"
                  inc-result-tbl "cohort_inclusion_result"
                  inc-stats-tbl "cohort_inclusion_stats"
                  summary-tbl "cohort_summary_stats"
                  censor-tbl "cohort_censor_stats"
                  options-map (build-circe-options qualified-cdm result-schema cohort-id cohort-tbl true)
                  clj-options (circe/java-map->circe-options options-map)
                  temp-tables [cohort-tbl inc-result-tbl inc-stats-tbl summary-tbl censor-tbl]]
              (try
                (doseq [t temp-tables]
                  (db/execute! db (format "DROP TABLE IF EXISTS %s" t)))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, subject_id BIGINT, cohort_start_date DATE, cohort_end_date DATE)" cohort-tbl))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, inclusion_rule_mask BIGINT, person_count BIGINT, mode_id INT)" inc-result-tbl))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, rule_sequence INT, person_count BIGINT, gain_count BIGINT, person_total BIGINT, mode_id INT)" inc-stats-tbl))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, base_count BIGINT, final_count BIGINT, mode_id INT)" summary-tbl))
                (db/execute! db (format "CREATE TEMP TABLE %s (cohort_definition_id INT, lost_count BIGINT, mode_id INT)" censor-tbl))

                (let [inc-result (circe/execute-circe db expression-str clj-options)]
                  (if (:success inc-result)
                    nil
                    (do
                      (log/warn (format "circe execute returned failure for %s (inclusion): %s"
                                        source-key (:error inc-result)))
                      (throw (ex-info (or (:error inc-result)
                                          "The cohort expression is incomplete or invalid.")
                                      {:type :invalid-expression})))))

                (let [;; Rule names come from the cohort definition JSON
                      ;; (the WebAPI cohort_inclusion table that ATLAS
                      ;; normally reads from is not populated in cache mode
                      ;; — circe only writes the four stats tables).
                      expr-json (try (json/read-str expression-str :key-fn keyword)
                                     (catch Exception _ nil))
                      rule-defs (vec (or (:InclusionRules expr-json)
                                         (:inclusionRules expr-json) []))
                      mask-rows (db/query db (format "SELECT inclusion_rule_mask AS mask, person_count AS n FROM %s WHERE cohort_definition_id = %d AND mode_id = 1"
                                                     inc-result-tbl cohort-id))
                      summary-rows (db/query db (format "SELECT base_count, final_count FROM %s WHERE cohort_definition_id = %d AND mode_id = 1"
                                                        summary-tbl cohort-id))
                      total-rows (db/query db (format "SELECT COUNT(DISTINCT person_id) AS cnt FROM %s.person" qualified-cdm))
                      total-count (or (some-> total-rows first (.get "cnt")) 0)
                      base-count (or (some-> summary-rows first (.get "base_count")) 0)
                      final-count (or (some-> summary-rows first (.get "final_count")) 0)
                      rule-count (count rule-defs)
                      ->long (fn [v]
                               (cond (nil? v) 0
                                     (number? v) (long v)
                                     :else (Long/parseLong (str v))))
                      cumulative
                      (mapv
                        (fn [i]
                          (reduce
                            (fn [acc row]
                              (let [mask (->long (.get ^java.util.Map row "mask"))
                                    n (->long (.get ^java.util.Map row "n"))
                                    bits-required (dec (bit-shift-left 1 (inc i)))]
                                (if (= bits-required (bit-and mask bits-required))
                                  (+ acc n)
                                  acc)))
                            0
                            mask-rows))
                        (range rule-count))
                      rule-counts (vec (map-indexed
                                         (fn [i rule-def]
                                           {:ruleIndex i
                                            :ruleName (or (:name rule-def)
                                                          (str "Inclusion Rule " (inc i)))
                                            :cumulativeCount (nth cumulative i 0)})
                                         rule-defs))
                      exec-time (- (System/currentTimeMillis) start-time)]
                  (ok {:entryEventCount base-count
                       :totalPatientCount total-count
                       :finalCount final-count
                       :ruleCounts rule-counts
                       :executionTimeMs exec-time}))
                (finally
                  (doseq [t temp-tables]
                    (try (db/execute! db (format "DROP TABLE IF EXISTS %s" t))
                         (catch Exception _))))))
            (catch clojure.lang.ExceptionInfo e
              (if (= :invalid-expression (:type (ex-data e)))
                (unprocessable (.getMessage e))
                (do (log/error e "Failed to compute inclusion stats")
                    (internal-error (.getMessage e)))))
            (catch Exception e
              (log/error e "Failed to compute inclusion stats")
              (internal-error (.getMessage e)))))))))

(defn- pg-query
  "Execute a SQL query against PostgreSQL and return results as a vector of maps.
   Each map has string keys matching column names."
  [^Connection conn ^String sql]
  (with-open [stmt (.createStatement conn)
              rs (.executeQuery stmt sql)]
    (let [meta (.getMetaData rs)
          col-count (.getColumnCount meta)
          col-names (mapv #(.getColumnLabel meta (inc %)) (range col-count))]
      (loop [rows []]
        (if (.next rs)
          (recur (conj rows
                   (into {}
                     (map (fn [i]
                            [(get col-names i) (.getObject rs (inc i))])
                       (range col-count)))))
          rows)))))

(defn- compute-pct
  "Compute percentage rounded to 1 decimal place."
  [n total]
  (if (zero? total)
    0.0
    (/ (Math/round (* 1000.0 (/ (double n) (double total)))) 10.0)))

(defn- table1-handler
  "Compute Table 1 (baseline characteristics) for a generated cohort.
   Queries PostgreSQL directly since the cohort table is written there by WebAPI."
  [{:keys [path-params body-params]}]
  (let [source-key (:source-key path-params)
        source (find-source-by-key source-key)]
    (if-not source
      (not-found (str "Source not found: " source-key))
      (let [{:keys [cohortDefinitionId conceptIds topN]} body-params
            top-n (or topN 10)
            cdm-schema (get-cdm-schema source)
            results-schema (get-results-schema source)
            credentials (source->credentials source)]
        (cond
          (nil? cohortDefinitionId)
          (bad-request "cohortDefinitionId is required")

          (not (integer? cohortDefinitionId))
          (bad-request "cohortDefinitionId must be an integer")

          (str/blank? cdm-schema)
          (bad-request "CDM schema not configured for this source")

          (str/blank? results-schema)
          (bad-request "Results schema not configured for this source")

          (not (or (= "postgres" (:dialect credentials))
                   (= "postgresql" (:dialect credentials))))
          (bad-request "Table 1 is only supported for PostgreSQL sources")

          :else
          (try
            (let [jdbc-url (:connection-string credentials)
                  user (:user credentials)
                  password (:password credentials)
                  start-time (System/currentTimeMillis)]
              (with-open [conn (DriverManager/getConnection jdbc-url user password)]
                (.setReadOnly conn true)
                (.setAutoCommit conn false)
                (let [cohort-id (int cohortDefinitionId)
                      ;; Cohort size
                      cohort-size-sql (format "SELECT COUNT(DISTINCT subject_id) as cnt FROM %s.cohort WHERE cohort_definition_id = %d"
                                              results-schema cohort-id)
                      cohort-size (or (some-> (pg-query conn cohort-size-sql) first (get "cnt") long) 0)

                      ;; Total population size
                      total-size-sql (format "SELECT COUNT(DISTINCT person_id) as cnt FROM %s.person" cdm-schema)
                      total-size (or (some-> (pg-query conn total-size-sql) first (get "cnt") long) 0)

                      ;; Gender distribution
                      gender-sql (format
                        "SELECT c.concept_name as characteristic, COUNT(DISTINCT p.person_id) as n
                         FROM %s.cohort co
                         JOIN %s.person p ON p.person_id = co.subject_id
                         JOIN %s.concept c ON c.concept_id = p.gender_concept_id
                         WHERE co.cohort_definition_id = %d
                         GROUP BY c.concept_name
                         ORDER BY n DESC"
                        results-schema cdm-schema cdm-schema cohort-id)
                      gender-rows (mapv (fn [r]
                                          {:characteristic (get r "characteristic")
                                           :n (long (get r "n"))
                                           :pct (compute-pct (get r "n") cohort-size)})
                                    (pg-query conn gender-sql))

                      ;; Age groups
                      age-sql (format
                        "SELECT CASE
                           WHEN EXTRACT(YEAR FROM co.cohort_start_date) - p.year_of_birth < 18 THEN '<18'
                           WHEN EXTRACT(YEAR FROM co.cohort_start_date) - p.year_of_birth BETWEEN 18 AND 34 THEN '18-34'
                           WHEN EXTRACT(YEAR FROM co.cohort_start_date) - p.year_of_birth BETWEEN 35 AND 49 THEN '35-49'
                           WHEN EXTRACT(YEAR FROM co.cohort_start_date) - p.year_of_birth BETWEEN 50 AND 64 THEN '50-64'
                           ELSE '65+'
                         END as characteristic,
                         COUNT(DISTINCT p.person_id) as n
                         FROM %s.cohort co
                         JOIN %s.person p ON p.person_id = co.subject_id
                         WHERE co.cohort_definition_id = %d
                         GROUP BY characteristic
                         ORDER BY MIN(EXTRACT(YEAR FROM co.cohort_start_date) - p.year_of_birth)"
                        results-schema cdm-schema cohort-id)
                      age-rows (mapv (fn [r]
                                       {:characteristic (get r "characteristic")
                                        :n (long (get r "n"))
                                        :pct (compute-pct (get r "n") cohort-size)})
                                 (pg-query conn age-sql))

                      ;; Top conditions
                      conditions-sql (if (and conceptIds (seq conceptIds))
                                       (format
                                         "SELECT c.concept_name as characteristic, co2.condition_concept_id as concept_id,
                                                 COUNT(DISTINCT co2.person_id) as n
                                          FROM %s.cohort co
                                          JOIN %s.condition_occurrence co2 ON co2.person_id = co.subject_id
                                          JOIN %s.concept c ON c.concept_id = co2.condition_concept_id
                                          WHERE co.cohort_definition_id = %d
                                            AND co2.condition_concept_id IN (%s)
                                          GROUP BY c.concept_name, co2.condition_concept_id
                                          ORDER BY n DESC"
                                         results-schema cdm-schema cdm-schema cohort-id
                                         (str/join "," (map str conceptIds)))
                                       (format
                                         "SELECT c.concept_name as characteristic, co2.condition_concept_id as concept_id,
                                                 COUNT(DISTINCT co2.person_id) as n
                                          FROM %s.cohort co
                                          JOIN %s.condition_occurrence co2 ON co2.person_id = co.subject_id
                                          JOIN %s.concept c ON c.concept_id = co2.condition_concept_id
                                          WHERE co.cohort_definition_id = %d
                                          GROUP BY c.concept_name, co2.condition_concept_id
                                          ORDER BY n DESC
                                          LIMIT %d"
                                         results-schema cdm-schema cdm-schema cohort-id top-n))
                      condition-rows (mapv (fn [r]
                                             {:characteristic (get r "characteristic")
                                              :conceptId (long (get r "concept_id"))
                                              :n (long (get r "n"))
                                              :pct (compute-pct (get r "n") cohort-size)})
                                       (pg-query conn conditions-sql))

                      ;; Top drugs
                      drugs-sql (if (and conceptIds (seq conceptIds))
                                  (format
                                    "SELECT c.concept_name as characteristic, de.drug_concept_id as concept_id,
                                            COUNT(DISTINCT de.person_id) as n
                                     FROM %s.cohort co
                                     JOIN %s.drug_exposure de ON de.person_id = co.subject_id
                                     JOIN %s.concept c ON c.concept_id = de.drug_concept_id
                                     WHERE co.cohort_definition_id = %d
                                       AND de.drug_concept_id IN (%s)
                                     GROUP BY c.concept_name, de.drug_concept_id
                                     ORDER BY n DESC"
                                    results-schema cdm-schema cdm-schema cohort-id
                                    (str/join "," (map str conceptIds)))
                                  (format
                                    "SELECT c.concept_name as characteristic, de.drug_concept_id as concept_id,
                                            COUNT(DISTINCT de.person_id) as n
                                     FROM %s.cohort co
                                     JOIN %s.drug_exposure de ON de.person_id = co.subject_id
                                     JOIN %s.concept c ON c.concept_id = de.drug_concept_id
                                     WHERE co.cohort_definition_id = %d
                                     GROUP BY c.concept_name, de.drug_concept_id
                                     ORDER BY n DESC
                                     LIMIT %d"
                                    results-schema cdm-schema cdm-schema cohort-id top-n))
                      drug-rows (mapv (fn [r]
                                        {:characteristic (get r "characteristic")
                                         :conceptId (long (get r "concept_id"))
                                         :n (long (get r "n"))
                                         :pct (compute-pct (get r "n") cohort-size)})
                                  (pg-query conn drugs-sql))

                      exec-time (- (System/currentTimeMillis) start-time)]
                  (ok {:cohortSize cohort-size
                       :totalSize total-size
                       :executionTimeMs exec-time
                       :sections [{:name "Gender" :type "demographics" :rows gender-rows}
                                  {:name "Age Group" :type "demographics" :rows age-rows}
                                  {:name "Conditions" :type "condition" :rows condition-rows}
                                  {:name "Drugs" :type "drug" :rows drug-rows}]}))))
            (catch Exception e
              (log/error e "Failed to compute Table 1")
              (internal-error (.getMessage e)))))))))

;; Router

(def routes
  "WebAPI routes."
  (vec
    (concat
      [["/cache/jobs" {:get {:handler list-cache-jobs-handler}}]
       ["/:source-key"
        ["/cache" {:post {:handler create-cache-handler}
                   :delete {:handler delete-cache-handler}}]
        ["/cache/status" {:get {:handler get-cache-status-handler}}]
        ["/cache/count" {:post {:handler count-patients-handler}}]
        ["/cache/inclusion" {:post {:handler count-inclusion-handler}}]
        ["/cache/table1" {:post {:handler table1-handler}}]
        ["/cache/job" {:delete {:handler cancel-cache-job-handler}}]
        ["/circe/execute" {:post {:handler execute-circe-handler}}]
        ["/circe/render" {:post {:handler render-circe-handler}}]
        ["/vocab/search" {:get {:handler search-vocab-handler}}]]]
      agent-routes/routes)))

(defn- create-proxy-handler [target-url]
  (fn [request]
    (proxy/proxy-request request target-url)))

(defn- build-proxy-routes [routes-map]
  (vec
    (mapcat
      (fn [[path-prefix target-url]]
        (let [handler {:handler (create-proxy-handler target-url)
                       :no-doc true}]
          [[(str "/" path-prefix) handler]
           [(str "/" path-prefix "/*path") handler]]))
      routes-map)))

(defn create-router
  "Create Reitit Ring router for WebAPI endpoints."
  []
  (let [proxy-routes (build-proxy-routes (config/get-proxy-routes))
        all-routes (vec (concat proxy-routes routes))]
    (ring/ring-handler
      (ring/router all-routes {:conflicts nil})
      (ring/create-default-handler
        {:not-found (constantly (not-found "Endpoint not found"))
         :method-not-allowed (constantly (response 405 {:error "METHOD_NOT_ALLOWED"
                                                         :message "Method not allowed"}))}))))
