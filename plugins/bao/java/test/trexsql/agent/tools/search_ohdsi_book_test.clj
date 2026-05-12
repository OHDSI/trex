(ns trexsql.agent.tools.search-ohdsi-book-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [trexsql.agent.tools.search-ohdsi-book :as b]))

(deftest empty-query-returns-empty
  (let [res (b/run {:query ""} {})]
    (is (string? (:note res)))
    (is (empty? (:results res)))))

(deftest cohort-query-returns-relevant-passages
  (let [res (b/run {:query "cohort definition phenotype"} {})
        hits (:results res)]
    (is (vector? hits))
    (is (seq hits))
    (testing "each hit has citation fields"
      (let [h (first hits)]
        (is (string? (:chapter h)))
        (is (string? (:section h)))
        (is (string? (:snippet h)))
        (is (number? (:score h)))
        (is (str/starts-with? (:url h) "https://"))))))

(deftest stopword-only-query-degrades-gracefully
  (let [res (b/run {:query "the and of"} {})]
    (is (vector? (:results res)))))

(deftest k-parameter-respected
  (let [res (b/run {:query "cohort phenotype data" :k 2} {})]
    (is (<= (count (:results res)) 2))))
