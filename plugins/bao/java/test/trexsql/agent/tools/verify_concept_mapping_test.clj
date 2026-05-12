(ns trexsql.agent.tools.verify-concept-mapping-test
  (:require [clojure.test :refer [deftest is testing]]
            [clj-http.client :as http]
            [trexsql.agent.tools.verify-concept-mapping :as v]))

(deftest missing-id-returns-error
  (let [res (v/run {} {})]
    (is (false? (:ok res)))))

(deftest happy-path-standard-snomed-condition
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body {:CONCEPT_ID 201826
                                   :CONCEPT_NAME "Type 2 diabetes mellitus"
                                   :DOMAIN_ID "Condition"
                                   :VOCABULARY_ID "SNOMED"
                                   :STANDARD_CONCEPT "S"
                                   :CONCEPT_CODE "44054006"
                                   :INVALID_REASON nil}})]
    (let [res (v/run {:conceptId 201826
                      :expectedDomain "Condition"
                      :expectedVocabulary "SNOMED"} {})]
      (is (true? (:ok res)))
      (is (empty? (:issues res)))
      (is (= "Condition" (-> res :concept :domain))))))

(deftest domain-mismatch-flagged
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body {:CONCEPT_ID 1503297
                                   :CONCEPT_NAME "Metformin"
                                   :DOMAIN_ID "Drug"
                                   :VOCABULARY_ID "RxNorm"
                                   :STANDARD_CONCEPT "S"}})]
    (let [res (v/run {:conceptId 1503297
                      :expectedDomain "Condition"} {})]
      (is (false? (:ok res)))
      (is (some #(re-find #"domain mismatch" %) (:issues res))))))

(deftest non-standard-concept-flagged
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body {:CONCEPT_ID 9999
                                   :CONCEPT_NAME "Unknown coded thing"
                                   :DOMAIN_ID "Condition"
                                   :VOCABULARY_ID "ICD10CM"
                                   :STANDARD_CONCEPT "C"}})]
    (let [res (v/run {:conceptId 9999} {})]
      (is (false? (:ok res)))
      (is (some #(re-find #"non-standard" %) (:issues res))))))
