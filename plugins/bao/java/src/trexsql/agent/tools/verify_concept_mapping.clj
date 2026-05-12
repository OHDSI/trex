(ns trexsql.agent.tools.verify-concept-mapping
  "verify_concept_mapping tool — fetches a single OMOP concept by id and
   checks it against expected domain / vocabulary / standard-flag.

   Used as the second guard in the two-stage decomposition pattern: when
   search_concepts returns a hit with :confidence :low or any :flags,
   Pythia calls this to confirm the chosen ID actually does what it
   claims before committing it to a proposal."
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

(defn- fetch-concept [source-key concept-id auth]
  (let [url (str webapi-base "/vocabulary/" source-key "/concept/" concept-id)
        headers (cond-> {"Accept" "application/json"}
                  auth (assoc "Authorization" auth))
        resp (http/get url
                       {:headers headers
                        :as :json
                        :throw-exceptions false
                        :socket-timeout 12000
                        :connection-timeout 5000})]
    (when (= 200 (:status resp))
      (:body resp))))

(defn- normalize-concept [body]
  (let [g #(or (get body %1) (get body %2) (get body %3))]
    {:conceptId   (g :CONCEPT_ID :conceptId "CONCEPT_ID")
     :conceptName (g :CONCEPT_NAME :conceptName "CONCEPT_NAME")
     :domain      (g :DOMAIN_ID :domainId "DOMAIN_ID")
     :vocabulary  (g :VOCABULARY_ID :vocabularyId "VOCABULARY_ID")
     :standard    (g :STANDARD_CONCEPT :standardConcept "STANDARD_CONCEPT")
     :code        (g :CONCEPT_CODE :conceptCode "CONCEPT_CODE")
     :validReason (g :INVALID_REASON :invalidReason "INVALID_REASON")}))

(defn- check-issues [concept expected]
  (let [{:keys [domain vocabulary standard validReason]} concept
        exp-domain (some-> (:expectedDomain expected) str)
        exp-vocab (some-> (:expectedVocabulary expected) str)
        issues (cond-> []
                 (and exp-domain
                      (not (str/blank? exp-domain))
                      (not= exp-domain (str domain)))
                 (conj (str "domain mismatch: concept is " domain ", expected " exp-domain))

                 (and exp-vocab
                      (not (str/blank? exp-vocab))
                      (not (str/includes? (str/lower-case (str vocabulary))
                                          (str/lower-case exp-vocab))))
                 (conj (str "vocabulary mismatch: concept is " vocabulary ", expected " exp-vocab))

                 (not= "S" (str standard))
                 (conj (str "non-standard concept (STANDARD_CONCEPT=" standard
                            ") — search_concepts only returns standards but a hand-picked id may be source/classification"))

                 (and validReason (not (str/blank? (str validReason))))
                 (conj (str "concept is invalid: reason=" validReason)))]
    issues))

(defn run
  "Tool entrypoint. Args:
     {:conceptId number
      :expectedDomain string?
      :expectedVocabulary string?}"
  [args req]
  (let [raw (:conceptId args)
        concept-id (cond (number? raw) (long raw)
                         (string? raw) (try (Long/parseLong (str/trim raw)) (catch Exception _ nil))
                         :else nil)
        source-key (or (:source-key req) "EUNOMIA")
        auth (forward-auth (:request req))]
    (cond
      (nil? concept-id)
      {:ok false :errors ["conceptId is required (numeric)"]}

      :else
      (try
        (let [body (fetch-concept source-key concept-id auth)]
          (cond
            (nil? body)
            {:ok false
             :errors [(str "concept " concept-id " not found in vocabulary "
                           source-key " (or WebAPI returned non-200)")]}

            :else
            (let [concept (normalize-concept body)
                  issues (check-issues concept args)]
              {:ok (empty? issues)
               :concept concept
               :issues issues
               :verdict (cond
                          (empty? issues) "OK — safe to use"
                          (some #(str/starts-with? % "concept is invalid") issues)
                          "REJECT — invalid concept"
                          :else
                          "REVIEW — see issues; pick a different concept if domain/vocabulary doesn't match")})))
        (catch Exception e
          (log/warn e "verify_concept_mapping failed for" concept-id)
          {:ok false :errors [(str "WebAPI request failed: " (.getMessage e))]})))))
