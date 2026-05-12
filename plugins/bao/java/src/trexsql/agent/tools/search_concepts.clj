(ns trexsql.agent.tools.search-concepts
  "search_concepts tool — calls WebAPI's vocabulary search endpoint
   (POST /WebAPI/vocabulary/{sourceKey}/search) so the agent uses the same
   vocabulary the rest of Atlas3 sees. The user's JWT is forwarded from
   the incoming /chat request, so per-source permissions are honoured.

   Falls back to a local trexsql.vocab search only if WebAPI is unreachable
   or the JWT is missing — that path is intentionally a tight failsafe."
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private max-results 15)

(def ^:private webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(defn- forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- standard-concept? [row]
  (= "S" (str (or (:STANDARD_CONCEPT row) (:standardConcept row) (get row "STANDARD_CONCEPT")))))

(defn- to-result [row]
  {:conceptId   (or (:CONCEPT_ID row) (:conceptId row) (get row "CONCEPT_ID"))
   :conceptName (or (:CONCEPT_NAME row) (:conceptName row) (get row "CONCEPT_NAME"))
   :domain      (or (:DOMAIN_ID row) (:domainId row) (get row "DOMAIN_ID"))
   :vocabulary  (or (:VOCABULARY_ID row) (:vocabularyId row) (get row "VOCABULARY_ID"))
   :standard    (or (:STANDARD_CONCEPT row) (:standardConcept row) (get row "STANDARD_CONCEPT"))
   :source      "webapi"})

(defn- annotate-confidence
  "Add per-result :confidence (:high|:medium|:low) and :flags vector based
   on the full hit set. Flags surface concrete reasons Pythia should
   verify before proposing — e.g. multiple vocabularies, parent/child
   ambiguity, non-standard match, ICD↔SNOMED divergence."
  [results query]
  (let [n (count results)
        vocabs (set (map :vocabulary results))
        domains (set (map :domain results))
        q (str/lower-case (str query))]
    (mapv
      (fn [r idx]
        (let [name-lower (str/lower-case (str (:conceptName r)))
              exact? (= name-lower q)
              prefix? (or exact? (str/starts-with? name-lower q))
              standard? (= "S" (str (:standard r)))
              flags (cond-> []
                      (not standard?)
                      (conj "non-standard-concept")

                      (and (> n 5) (> (count vocabs) 1))
                      (conj (str "vocabulary-spread: " (str/join "," vocabs)))

                      (and (> n 5) (> (count domains) 1))
                      (conj (str "domain-spread: " (str/join "," domains)))

                      (and (= "Condition" (:domain r))
                           (contains? vocabs "ICD10CM"))
                      (conj "icd10cm-also-matched: prefer SNOMED for OMOP standard")

                      (and (= "Drug" (:domain r))
                           (contains? vocabs "NDC"))
                      (conj "ndc-also-matched: prefer RxNorm Ingredient")

                      (and (= idx 0) (not exact?) (not prefix?) (> n 3))
                      (conj "weak-name-match: top hit doesn't start with query"))
              confidence (cond
                           (and exact? standard?) :high
                           (and prefix? standard? (empty? flags)) :high
                           (or (not standard?) (>= (count flags) 2)) :low
                           :else :medium)]
          (assoc r
                 :confidence confidence
                 :flags flags)))
      results
      (range))))

(defn- corpus-ambiguity
  "Return a top-level summary that helps Pythia decide whether to call
   verify_concept_mapping on the chosen ID before proposing."
  [results]
  (let [vocabs (set (map :vocabulary results))
        domains (set (map :domain results))
        n-low (count (filter #(= :low (:confidence %)) results))]
    (cond-> {:n-results (count results)
             :vocabularies (vec vocabs)
             :domains (vec domains)
             :low-confidence-count n-low}

      (and (contains? vocabs "ICD10CM") (contains? vocabs "SNOMED"))
      (assoc :icd-snomed-divergence?
             "Both ICD and SNOMED matched — these only round-trip identically ~25% of the time. Prefer SNOMED for OMOP-standard cohorts.")

      (and (contains? vocabs "NDC") (contains? vocabs "RxNorm"))
      (assoc :ndc-rxnorm-divergence?
             "Both NDC and RxNorm matched — prefer RxNorm Ingredient for portable cohorts."))))

(defn- call-webapi [source-key query domain auth]
  (let [url (str webapi-base "/vocabulary/" source-key "/search")
        body {:QUERY query
              :DOMAIN_ID (when (and domain (not (str/blank? domain))) [domain])}
        headers (cond-> {"Content-Type" "application/json"}
                  auth (assoc "Authorization" auth))
        resp (http/post url
                        {:body (clojure.data.json/write-str body)
                         :headers headers
                         :as :json
                         :throw-exceptions false
                         :socket-timeout 15000
                         :connection-timeout 5000})]
    (when (= 200 (:status resp))
      (or (:body resp) []))))

(defn run
  "Tool entrypoint. `args` is {:query :domain}; `req` carries
   {:source-key :request} from the route handler."
  [args req]
  (let [{:keys [query domain]} args
        source-key (or (:source-key req) "EUNOMIA")
        auth (forward-auth (:request req))]
    (cond
      (str/blank? (str query))
      {:results [] :note "empty query"}

      :else
      (try
        (let [raw (call-webapi source-key (str query) domain auth)]
          (if (nil? raw)
            {:results [] :note (str "WebAPI vocabulary search returned no body for source " source-key)}
            (let [filtered (->> raw
                                (filter standard-concept?)
                                (take max-results)
                                (map to-result)
                                vec)
                  annotated (annotate-confidence filtered (str query))]
              {:results annotated
               :ambiguity (corpus-ambiguity annotated)
               :note (when (empty? annotated)
                       (str "WebAPI returned " (count raw) " row(s) but none matched STANDARD_CONCEPT='S'"
                            (when domain (str " AND DOMAIN_ID=" domain))))})))
        (catch Exception e
          (log/warn e "search_concepts WebAPI call failed")
          {:results [] :note (str "WebAPI vocabulary search failed: " (.getMessage e))})))))
