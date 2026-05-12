(ns trexsql.agent.tools.validate-circe-test
  (:require [clojure.test :refer [deftest is testing]]
            [clj-http.client :as http]
            [clojure.data.json :as json]
            [trexsql.agent.tools.validate-circe :as v]))

(deftest missing-expression-returns-error
  (let [res (v/run {} {})]
    (is (false? (:ok res)))
    (is (some #(re-find #"required" %) (:errors res)))))

(deftest invalid-json-returns-error
  (let [res (v/run {:expression "{not json"} {})]
    (is (false? (:ok res)))
    (is (some #(re-find #"not valid JSON" %) (:errors res)))))

(deftest non-circe-shape-rejected-without-network
  (with-redefs [http/post (fn [& _] (throw (ex-info "should not network" {})))]
    (let [res (v/run {:expression (json/write-str {:foo "bar"})} {})]
      (is (false? (:ok res)))
      (is (some #(re-find #"PrimaryCriteria" %) (:errors res))))))

(deftest valid-circe-passes-through-and-returns-sql
  (with-redefs [http/post (fn [_url _opts]
                            {:status 200
                             :body {:templateSql "SELECT * FROM @cdm.condition_occurrence;"}})]
    (let [expr {:PrimaryCriteria {:CriteriaList [{:ConditionOccurrence {:CodesetId 1}}]}
                :ConceptSets []
                :InclusionRules []}
          res (v/run {:expression expr} {})]
      (is (true? (:ok res)))
      (is (string? (:sql res)))
      (is (re-find #"SELECT" (:sql res))))))

(deftest webapi-4xx-surfaces-error-message
  (with-redefs [http/post (fn [_url _opts]
                            {:status 400
                             :body {:message "CodesetId 999 not found"}})]
    (let [expr {:PrimaryCriteria {:CriteriaList [{:ConditionOccurrence {:CodesetId 999}}]}}
          res (v/run {:expression expr} {})]
      (is (false? (:ok res)))
      (is (= 400 (:http-status res)))
      (is (some #(re-find #"CodesetId" %) (:errors res))))))
