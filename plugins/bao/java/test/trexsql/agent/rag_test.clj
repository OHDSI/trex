(ns trexsql.agent.rag-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.rag :as rag]))

(def ^:private sample-docs
  [{:id 1 :title "OMOP CDM" :text "OMOP common data model standardises observational health data."}
   {:id 2 :title "Cohort definition" :text "A cohort is a set of persons satisfying inclusion criteria over time."}
   {:id 3 :title "Vocabulary" :text "Standard concepts come from SNOMED, RxNorm, and LOINC vocabularies."}
   {:id 4 :title "Phenotype" :text "A phenotype is the algorithm that defines a clinical cohort."}])

(deftest tokenize-strips-stopwords-and-punctuation
  (let [t (rag/tokenize "The quick, brown fox over there!")]
    (is (= ["quick" "brown" "fox" "over" "there"] t))))

(deftest bm25-search-ranks-relevant-doc-first
  (let [corpus (rag/build-bm25-corpus sample-docs :text)
        hits (rag/bm25-search corpus "phenotype clinical algorithm" 3)]
    (is (seq hits))
    (is (= 4 (-> hits first :doc :id)))))

(deftest hybrid-search-falls-back-to-bm25-when-no-embeddings
  (let [corpus (rag/build-bm25-corpus sample-docs :text)
        bm25-hits (rag/bm25-search corpus "vocabulary SNOMED" 3)
        hybrid-hits (rag/hybrid-search corpus "vocabulary SNOMED" 3 "non/existent.edn")]
    (is (= (mapv (comp :id :doc) bm25-hits)
           (mapv (comp :id :doc) hybrid-hits)))))

(deftest embeddings-not-shipped-in-this-phase
  ;; Sanity: until Phase 6 actually generates embeddings, the resource
  ;; should not exist anywhere we'd try to load it.
  (is (false? (rag/embeddings-available? "book-of-ohdsi/embeddings.bin"))))
