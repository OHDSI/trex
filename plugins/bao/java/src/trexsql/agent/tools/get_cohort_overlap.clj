(ns trexsql.agent.tools.get-cohort-overlap
  "get_cohort_overlap tool — pulls per-pair overlap counts between two or
   more generated cohorts so Pythia can interpret comparator design
   (target vs. comparator population) and flag near-zero overlap or
   unexpected near-total overlap.

   WebAPI endpoint: GET /cohortdefinition/{id}/report/{sourceKey}
   (overlap data ships in cohort report bodies on most WebAPI versions)"
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

(defn- pop-count [report]
  (or (:totalRecords report)
      (:personCount report)
      (some-> report :summary :persons)))

(defn run
  "Tool entrypoint. Args: {:cohortIds [n n] :sourceKey string?}.
   Compares the populations pairwise."
  [args req]
  (let [raw-ids (or (:cohortIds args) [])
        ids (->> raw-ids
                 (map (fn [v]
                        (cond (number? v) (long v)
                              (string? v) (try (Long/parseLong (str/trim v)) (catch Exception _ nil))
                              :else nil)))
                 (remove nil?)
                 distinct
                 vec)
        source-key (or (some-> (:sourceKey args) str) (:source-key req) "EUNOMIA")
        auth (forward-auth (:request req))]
    (cond
      (< (count ids) 2)
      {:error "cohortIds must contain at least 2 distinct ids"}

      :else
      (try
        (let [reports (into {}
                            (for [id ids]
                              [id (http-get (str webapi-base "/cohortdefinition/" id
                                                 "/report/" source-key) auth)]))
              missing (->> reports (filter (comp nil? val)) (mapv key))]
          (if (seq missing)
            {:error (str "no report found for cohort id(s) " (str/join "," missing)
                         " on source " source-key " — generate first")}
            (let [counts (into {} (for [[id r] reports] [id (pop-count r)]))
                  pairs (for [a ids b ids :when (< a b)] [a b])
                  pair-data
                  (mapv
                    (fn [[a b]]
                      (let [na (counts a) nb (counts b)
                            ;; WebAPI overlap shape varies — check common fields
                            overlap (some (fn [[k v]]
                                            (when (and (= a (:targetCohortId v))
                                                       (= b (:comparatorCohortId v)))
                                              (:overlap v)))
                                          (or (get-in reports [a :overlap]) {}))]
                        {:cohortA a :cohortAPersons na
                         :cohortB b :cohortBPersons nb
                         :overlap overlap
                         :note (cond
                                 (nil? overlap) "WebAPI version doesn't expose overlap in this report shape; query Atlas overlap UI for exact intersection."
                                 (and na overlap (zero? na)) "cohort A is empty"
                                 (and na overlap (>= overlap (* 0.95 na)))
                                 "near-total overlap — these cohorts may be redundant"
                                 (and na overlap (<= overlap (* 0.01 na)))
                                 "near-zero overlap — comparator may be too disjoint"
                                 :else nil)}))
                    pairs)]
              {:sourceKey source-key
               :counts counts
               :pairs pair-data})))
        (catch Exception e
          (log/warn e "get_cohort_overlap failed")
          {:error (str "WebAPI request failed: " (.getMessage e))})))))
