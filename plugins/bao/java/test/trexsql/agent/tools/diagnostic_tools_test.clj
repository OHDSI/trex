(ns trexsql.agent.tools.diagnostic-tools-test
  (:require [clojure.test :refer [deftest is testing]]
            [clj-http.client :as http]
            [trexsql.agent.tools.get-cohort-generation-summary :as gen]
            [trexsql.agent.tools.summarise-attrition :as att]
            [trexsql.agent.tools.search-ohdsi-studies :as studies]))

(deftest gen-summary-zero-population-flagged
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body [{:sourceKey "EUNOMIA"
                                    :status "COMPLETE"
                                    :personCount 0
                                    :recordCount 0}]})]
    (let [res (gen/run {:cohortId 42 :sourceKey "EUNOMIA"} {})]
      (is (some? (:summary res)))
      (is (= 0 (-> res :summary :person-count)))
      (is (re-find #"vocabulary/concept-id mismatch" (:interpretation res))))))

(deftest gen-summary-failure-flagged
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body [{:sourceKey "EUNOMIA"
                                    :status "FAILED"
                                    :failMessage "concept set not found"}]})]
    (let [res (gen/run {:cohortId 42 :sourceKey "EUNOMIA"} {})]
      (is (= "FAILED" (-> res :summary :status)))
      (is (re-find #"FAILED" (:interpretation res))))))

(deftest attrition-flags-large-drop
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body {:inclusionRuleStats
                                   [{:ruleId 1 :name "Has T2DM" :personCount 1000}
                                    {:ruleId 2 :name "On metformin" :personCount 800}
                                    {:ruleId 3 :name "Confirmed by lab" :personCount 50}]}})]
    (let [res (att/run {:cohortId 42} {})]
      (is (= 3 (count (:rules res))))
      (let [last-rule (last (:rules res))]
        (is (some? (:flag last-rule)))
        (is (re-find #"large drop" (:flag last-rule))))
      (is (= 1 (count (:flagged res)))))))

(deftest attrition-zero-cohort-flagged
  (with-redefs [http/get (fn [_url _opts]
                           {:status 200
                            :body {:inclusionRuleStats
                                   [{:ruleId 1 :name "Entry" :personCount 1000}
                                    {:ruleId 2 :name "Bad rule" :personCount 0}]}})]
    (let [res (att/run {:cohortId 42} {})
          rule-2 (second (:rules res))]
      (is (some? (:flag rule-2)))
      (is (re-find #"zero subjects" (:flag rule-2)))
      (is (re-find #"eliminate ALL subjects" (:interpretation res))))))

(deftest studies-empty-query-returns-empty
  (let [res (studies/run {:query ""} {})]
    (is (string? (:note res)))
    (is (empty? (:results res)))))

(deftest studies-rate-limit-degrades-gracefully
  (with-redefs [http/get (fn [& _] {:status 403 :body {}})]
    (let [res (studies/run {:query "covid"} {})]
      (is (vector? (:results res)))
      (is (empty? (:results res))))))
