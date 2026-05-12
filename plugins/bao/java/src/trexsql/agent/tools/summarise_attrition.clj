(ns trexsql.agent.tools.summarise-attrition
  "summarise_attrition tool — pulls per-inclusion-rule person counts for a
   generated cohort so Pythia can interpret where the cohort lost subjects
   and call out suspicious drops (PhenotypeR-style heuristic).

   WebAPI endpoint: GET /cohortdefinition/{id}/report/{sourceKey}"
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

(defn- normalize-rule [rule]
  {:rule-id (or (:ruleId rule) (:id rule))
   :name (or (:name rule) (:ruleName rule))
   :persons (or (:personCount rule) (:persons rule) (:countPersons rule))
   :percent-satisfying (or (:percentSatisfying rule) (:percentExcluded rule))})

(defn- diagnose
  "Identify rules with very large drops vs the previous step."
  [rules]
  (let [counts (mapv :persons rules)]
    (->> rules
         (map-indexed
           (fn [i r]
             (let [prev (get counts (dec i))
                   cur (:persons r)
                   drop-pct (when (and (number? prev) (number? cur) (pos? prev))
                              (* 100.0 (/ (- prev cur) (double prev))))]
               (cond-> r
                 drop-pct
                 (assoc :drop-from-prev-pct (Double/parseDouble (format "%.1f" drop-pct)))

                 (and drop-pct (>= drop-pct 90))
                 (assoc :flag "very large drop (>=90%) — verify the rule is intended to be this restrictive")

                 (and (number? cur) (zero? cur))
                 (assoc :flag "zero subjects after this rule — rule is impossible to satisfy with current vocabulary or data")))))
         vec)))

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
        (let [report (http-get (str webapi-base "/cohortdefinition/" cohort-id
                                    "/report/" source-key) auth)
              raw-rules (or (:inclusionRuleStats report)
                            (:inclusionRules report)
                            [])
              rules (->> raw-rules (map normalize-rule) (remove (comp nil? :persons)) vec)
              annotated (diagnose rules)]
          (cond
            (nil? report)
            {:error (str "WebAPI returned no report for cohort " cohort-id
                         " on source " source-key " — has it been generated?")}

            (empty? rules)
            {:cohortId cohort-id :sourceKey source-key
             :note "report present but no per-rule counts found"}

            :else
            {:cohortId cohort-id
             :sourceKey source-key
             :rules annotated
             :flagged (filterv :flag annotated)
             :interpretation
             (cond
               (some #(zero? (or (:persons %) -1)) annotated)
               "One or more inclusion rules eliminate ALL subjects. Review the offending rule and its concept set; very likely a vocabulary/code-set issue."
               (some :flag annotated)
               "Some rules drop >=90% of subjects in one step. Verify each is intentional; consider relaxing or splitting into smaller rules to expose the source of attrition."
               :else
               "Attrition looks reasonable — gradual drop across rules.")}))
        (catch Exception e
          (log/warn e "summarise_attrition failed")
          {:error (str "WebAPI request failed: " (.getMessage e))})))))
