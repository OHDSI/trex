(ns trexsql.agent.tools.get-cohort-generation-summary
  "get_cohort_generation_summary tool — pulls a saved cohort's
   generation status and headline counts from WebAPI so Pythia can
   ground diagnostic conversations (\"is this T2DM cohort sensible?\")
   in real numbers instead of guesses.

   WebAPI endpoints used:
     GET /WebAPI/cohortdefinition/{id}/info
     GET /WebAPI/cohortdefinition/{id}/report/{sourceKey}  (best-effort)"
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(defn- forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- http-get [url auth]
  (let [headers (cond-> {"Accept" "application/json"}
                  auth (assoc "Authorization" auth))
        resp (http/get url
                       {:headers headers
                        :as :json
                        :throw-exceptions false
                        :socket-timeout 12000
                        :connection-timeout 5000})]
    (when (and (= 200 (:status resp)) (:body resp))
      (:body resp))))

(defn- summarize-info [info source-key]
  (let [arr (when (sequential? info) info)
        match (or (some #(when (= source-key (or (:sourceKey %) (get-in % [:source :sourceKey]))) %)
                        arr)
                  (first arr))]
    (when match
      {:source-key (or (:sourceKey match) (get-in match [:source :sourceKey]))
       :status (or (:status match) (:executionStatus match))
       :start-time (or (:startTime match) (:startDate match))
       :end-time (or (:endTime match) (:endDate match))
       :person-count (or (:personCount match) (:persons match))
       :record-count (or (:recordCount match) (:records match))
       :failure-message (or (:failMessage match) (:failureMessage match))})))

(defn run
  "Tool entrypoint. Args: {:cohortId number :sourceKey string?}."
  [args req]
  (let [raw (:cohortId args)
        cohort-id (cond (number? raw) (long raw)
                        (string? raw) (try (Long/parseLong (str/trim raw)) (catch Exception _ nil))
                        :else nil)
        source-key (or (some-> (:sourceKey args) str)
                       (:source-key req)
                       "EUNOMIA")
        auth (forward-auth (:request req))]
    (cond
      (nil? cohort-id)
      {:error "cohortId is required (numeric)"}

      :else
      (try
        (let [info (http-get (str webapi-base "/cohortdefinition/" cohort-id "/info") auth)
              summary (summarize-info info source-key)]
          (cond
            (nil? info)
            {:error (str "WebAPI returned no /cohortdefinition/" cohort-id "/info")}

            (nil? summary)
            {:cohortId cohort-id :note (str "no generation found for source " source-key)
             :sources (mapv (some-fn :sourceKey #(get-in % [:source :sourceKey])) info)}

            :else
            {:cohortId cohort-id
             :sourceKey source-key
             :summary summary
             :interpretation
             (cond
               (= "FAILED" (str (:status summary)))
               "Generation FAILED — surface failure-message and propose fixing the cohort."
               (and (number? (:person-count summary)) (zero? (:person-count summary)))
               "Generation succeeded but person-count is 0 — likely a vocabulary/concept-id mismatch. Inspect concept sets via get_artifact and verify_concept_mapping."
               (and (number? (:person-count summary)) (< (:person-count summary) 10))
               "Generation succeeded but person-count is very low (< 10). Check inclusion rule attrition with summarise_attrition and review entry-event narrowness."
               :else
               "Generation completed. Compare person-count to expected prevalence; call summarise_attrition to inspect inclusion-rule drop-offs.")}))
        (catch Exception e
          (log/warn e "get_cohort_generation_summary failed")
          {:error (str "WebAPI request failed: " (.getMessage e))})))))
