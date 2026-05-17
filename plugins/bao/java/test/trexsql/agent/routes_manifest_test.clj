(ns trexsql.agent.routes-manifest-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.routes-manifest :as rm]))

(deftest agent-visible-views-non-empty
  (testing "manifest exposes at least the canonical agent-visible routes"
    (let [views (rm/agent-visible-views)]
      (is (seq views))
      (is (contains? (set views) "cohort-edit"))
      (is (contains? (set views) "characterization-results")
          "characterization-results must be in the manifest after Round 1"))))

(deftest view-params-lookup
  (testing "param keys for known views"
    (is (= ["id"] (rm/view-params "cohort-edit")))
    (is (= ["sourceKey" "conceptId"] (rm/view-params "concept-detail")))
    (is (= [] (rm/view-params "home")))
    (is (= [] (rm/view-params "totally-fake-view")))))

(deftest view-label-lookup
  (testing "labels fall back to name when missing"
    (is (= "Cohort editor" (rm/view-label "cohort-edit")))
    (is (= "made-up-route" (rm/view-label "made-up-route")))))
