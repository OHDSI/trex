(ns trexsql.agent.tools.search-phenotypes-test
  (:require [clojure.test :refer [deftest is testing]]
            [clj-http.client :as http]
            [trexsql.agent.tools.search-phenotypes :as sp]))

(defn mock-http [_url & [_opts]]
  ;; default: empty PheKB / Discourse responses
  {:status 200 :body []})

(deftest empty-query-returns-empty
  (with-redefs [http/get mock-http]
    (let [res (sp/run {:query ""} {})]
      (is (= "empty query" (:note res)))
      (is (empty? (:results res))))))

(deftest local-csv-returns-hits-for-diabetes
  (with-redefs [http/get mock-http]
    (let [res (sp/run {:query "diabetes"} {})
          hits (:results res)
          lib-hits (filter #(= "OHDSI Phenotype Library" (:source %)) hits)]
      (is (vector? hits))
      ;; the bundled phenotype-library/cohorts-index.edn ships ~1100 cohorts;
      ;; "diabetes" is well-represented so we expect at least one local hit
      (is (seq lib-hits)
          (str "expected at least one OHDSI Phenotype Library hit, got: " hits))
      (testing "library hits carry a circe-summary"
        (let [h (first lib-hits)]
          (is (number? (:cohort-id h)))
          (is (map? (:circe-summary h)))
          (is (contains? (:circe-summary h) :entry-domains))
          (is (contains? (:circe-summary h) :n-concept-sets))
          (is (contains? (:circe-summary h) :exit-strategy)))))))

(deftest merges-three-sources
  (testing "results from all three sources flow through"
    (with-redefs [http/get
                  (fn [url & [_opts]]
                    (cond
                      (re-find #"phekb\.org" url)
                      {:status 200
                       :body [{:title "Type 2 Diabetes (PheKB)"
                               :description "PheKB algorithm"
                               :url "https://phekb.org/phenotype/123"}]}

                      (re-find #"forums\.ohdsi\.org" url)
                      {:status 200
                       :body {:topics [{:id 1 :slug "t2dm" :title "T2DM thread"}]
                              :posts  [{:topic_id 1 :blurb "discussion blurb"}]}}

                      :else {:status 200 :body []}))]
      (let [res (sp/run {:query "diabetes"} {})
            sources (set (map :source (:results res)))]
        (is (contains? sources "PheKB"))
        (is (contains? sources "OHDSI Forums"))
        (is (contains? sources "OHDSI Phenotype Library"))))))

(deftest http-failure-degrades-gracefully
  (testing "HTTP failures don't crash the tool"
    (with-redefs [http/get (fn [& _] (throw (ex-info "boom" {})))]
      (let [res (sp/run {:query "diabetes"} {})]
        (is (vector? (:results res)))
        ;; the local CSV path still runs
        (is (every? #(= "OHDSI Phenotype Library" (:source %)) (:results res)))))))
