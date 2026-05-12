(ns trexsql.agent.tools.validate-circe
  "validate_circe tool — round-trips a draft Circe JSON cohort expression
   through WebAPI's /cohortdefinition/sql endpoint to confirm it parses
   and compiles to SQL. Used by Pythia BEFORE proposing a non-trivial
   cohort so it can catch malformed expressions and self-correct.

   Returns:
     {:ok true  :sql \"<rendered SQL>\" :warnings []}
     {:ok false :errors [\"...\"]}

   When WebAPI is unreachable, falls back to the in-process
   trexsql.circe renderer (which goes through libtrexsql_engine, NOT
   libduckdb — TrexEngine.java preloads libtrexsql)."
  (:require [clj-http.client :as http]
            [clojure.data.json :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(def ^:private http-timeout-ms 15000)

(defn- forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- coerce-expression
  "Args may pass `:expression` as either a JSON string or already-parsed
   Clojure data. Both shapes are accepted; we always send JSON to WebAPI."
  [expr]
  (cond
    (nil? expr) nil
    (string? expr) expr
    (map? expr) (json/write-str expr)
    :else (json/write-str expr)))

(defn- valid-circe-shape?
  "Cheap structural pre-check: does the parsed body look like a Circe
   CohortExpression (has PrimaryCriteria with a CriteriaList)?"
  [body]
  (boolean
    (and (map? body)
         (let [pc (or (get body "PrimaryCriteria") (get body :PrimaryCriteria))
               cl (or (and (map? pc) (or (get pc "CriteriaList") (get pc :CriteriaList))))]
           (sequential? cl)))))

(defn- pre-parse [^String expr-json]
  (try
    (let [body (json/read-str expr-json)]
      (cond
        (not (valid-circe-shape? body))
        {:ok false
         :errors ["expression has no PrimaryCriteria.CriteriaList — does not look like a Circe CohortExpression"]}

        :else
        {:ok true :body body}))
    (catch Exception e
      {:ok false :errors [(str "expression is not valid JSON: " (.getMessage e))]})))

(defn- post-sql [expr-json auth]
  (let [url (str webapi-base "/cohortdefinition/sql")
        headers (cond-> {"Accept" "application/json"
                         "Content-Type" "application/json"}
                  auth (assoc "Authorization" auth))
        body-json (json/write-str
                    {:expression expr-json
                     :options {:cdmSchema "@cdm_database_schema"
                               :resultSchema "@results_database_schema"
                               :targetTable "@target_cohort_table"
                               :targetCohortId 0}})]
    (http/post url
               {:headers headers
                :body body-json
                :throw-exceptions false
                :socket-timeout http-timeout-ms
                :connection-timeout 5000
                :as :json})))

(defn- render-locally
  "Fallback: render via the in-process trexsql.circe renderer when
   WebAPI is unavailable. Goes through libtrexsql_engine via
   trexsql.db / trexsql.native — does NOT touch libduckdb. Best-effort:
   returns nil if the renderer can't be resolved (e.g. test env)."
  [expr-json]
  (try
    (let [render (requiring-resolve 'trexsql.circe/render-circe-to-sql)
          ext-fns (requiring-resolve 'trexsql.extensions/get-default-db)
          db (when ext-fns (try (ext-fns) (catch Exception _ nil)))]
      (when (and render db)
        (render db expr-json {})))
    (catch Exception e
      (log/debug e "local circe render failed")
      nil)))

(defn run
  "Tool entrypoint. `args` is {:expression <json|object>}."
  [args req]
  (let [raw (or (:expression args) (:circeJson args))
        expr-json (coerce-expression raw)
        auth (forward-auth (:request req))]
    (cond
      (str/blank? expr-json)
      {:ok false :errors ["expression is required"]}

      :else
      (let [pre (pre-parse expr-json)]
        (if-not (:ok pre)
          pre
          (try
            (let [resp (post-sql expr-json auth)
                  status (:status resp)]
              (cond
                (= 200 status)
                (let [body (:body resp)
                      sql (or (:templateSql body)
                              (:parameterizedSql body)
                              (when (string? body) body))]
                  {:ok true
                   :sql (when (string? sql) (subs sql 0 (min 4000 (count sql))))
                   :sql-truncated? (and (string? sql) (> (count sql) 4000))
                   :warnings []})

                (and status (>= status 400))
                (let [body (:body resp)
                      msg (cond
                            (string? body) body
                            (map? body) (or (:message body) (:error body) (str body))
                            :else (str body))]
                  {:ok false
                   :errors [msg]
                   :http-status status})

                :else
                (let [local-sql (render-locally expr-json)]
                  (if local-sql
                    {:ok true
                     :sql (subs local-sql 0 (min 4000 (count local-sql)))
                     :sql-truncated? (> (count local-sql) 4000)
                     :warnings ["WebAPI unavailable; validated via in-process trexsql.circe (libtrexsql_engine, not libduckdb)."]}
                    {:ok false
                     :errors ["WebAPI /cohortdefinition/sql returned no usable response and the in-process trexsql.circe fallback is unavailable"]
                     :http-status status}))))
            (catch Exception e
              (log/warn e "validate_circe failed")
              (let [local-sql (render-locally expr-json)]
                (if local-sql
                  {:ok true
                   :sql (subs local-sql 0 (min 4000 (count local-sql)))
                   :warnings ["WebAPI threw; validated via in-process trexsql.circe (libtrexsql_engine, not libduckdb)."]}
                  {:ok false :errors [(str "WebAPI request failed: " (.getMessage e))]})))))))))
