(ns trexsql.agent.tools.get-reference-phenotype-test
  (:require [clojure.test :refer [deftest is testing]]
            [clj-http.client :as http]
            [trexsql.agent.tools.get-reference-phenotype :as g]))

(deftest missing-id-returns-error
  (let [res (g/run {} {})]
    (is (string? (:error res)))))

(deftest reads-from-disk-when-submodule-present
  ;; The submodule ships at plugins/bao/phenotype-library/ during dev.
  ;; This test runs from plugins/bao/java/, so the relative path
  ;; "../phenotype-library/inst/cohorts" resolves under the default search.
  (with-redefs [http/get (fn [& _] (throw (ex-info "should not network" {})))]
    (let [res (g/run {:cohortId 2} {})]
      (testing "returns parsed body for a known cohort id"
        (is (= 2 (:cohortId res)))
        (is (= "v3.37.0" (:tag res)))
        (is (map? (:body res)))
        (is (contains? (:body res) :PrimaryCriteria)))
      (testing "merges catalog summary"
        (is (string? (:name res)))
        (is (map? (:summary res)))
        (is (vector? (-> res :summary :entry-domains)))))))

(deftest unknown-id-returns-error-without-network
  (with-redefs [http/get (fn [& _] {:status 404 :body ""})]
    (let [res (g/run {:cohortId 99999999} {})]
      (is (string? (:error res))))))
