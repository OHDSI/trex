(ns trexsql.agent.route-context-format-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.route-context-format :as rcf]))

(deftest format-route-context-with-params
  (testing "renders the route name with its parameters"
    (let [out (rcf/format-route-context
                {:routeName "cohort-edit"
                 :routeParams {:id 42}
                 :artifact nil})]
      (is (re-find #"Current screen: cohort-edit \(id: 42\)" out)))))

(deftest format-route-context-multi-params
  (testing "renders multiple params"
    (let [out (rcf/format-route-context
                {:routeName "profile-view"
                 :routeParams {:sourceKey "EUNOMIA" :personId 12345}
                 :artifact nil})]
      (is (re-find #"sourceKey: EUNOMIA" out))
      (is (re-find #"personId: 12345" out)))))

(deftest format-route-context-no-params
  (testing "the Current screen: line has no params segment when params are empty"
    (let [out (rcf/format-route-context
                {:routeName "home"
                 :routeParams {}
                 :artifact nil})
          screen-line (->> (clojure.string/split-lines out)
                           (some #(when (clojure.string/starts-with? % "Current screen:") %)))]
      (is (= "Current screen: home" screen-line)))))

(deftest format-route-context-nil
  (testing "returns nil for a fully empty context"
    (is (nil? (rcf/format-route-context {})))))
