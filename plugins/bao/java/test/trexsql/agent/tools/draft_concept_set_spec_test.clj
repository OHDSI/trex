(ns trexsql.agent.tools.draft-concept-set-spec-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.tools.draft-concept-set-spec :as d]))

(deftest missing-name-rejected
  (let [res (d/run {:clinical_terms ["metformin"]} {})]
    (is (false? (:ok res)))))

(deftest missing-terms-rejected
  (let [res (d/run {:name "T2DM treatment"} {})]
    (is (false? (:ok res)))))

(deftest happy-path-returns-spec-and-next-steps
  (let [res (d/run {:name "Confirmatory T2DM treatment"
                    :clinical_terms ["metformin" "sulfonylurea" "insulin"]
                    :domain "Drug"
                    :include_descendants true} {})]
    (is (true? (:ok res)))
    (is (= "Confirmatory T2DM treatment" (-> res :spec :name)))
    (is (= ["metformin" "sulfonylurea" "insulin"] (-> res :spec :clinical_terms)))
    (is (= "RxNorm (Ingredient)" (-> res :spec :vocabulary)))
    (is (true? (-> res :spec :include_descendants)))
    (testing "next_steps mentions search_concepts and verify_concept_mapping"
      (let [s (clojure.string/join " " (:next_steps res))]
        (is (clojure.string/includes? s "search_concepts"))
        (is (clojure.string/includes? s "verify_concept_mapping"))))))

(deftest single-string-clinical-terms-coerced
  (let [res (d/run {:name "Statins"
                    :clinical_terms "atorvastatin"
                    :domain "Drug"} {})]
    (is (true? (:ok res)))
    (is (= ["atorvastatin"] (-> res :spec :clinical_terms)))))
