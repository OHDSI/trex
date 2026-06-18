(ns trexsql.core-init-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.core :as core]))

(deftest select-mode-no-orchestrator-wins
  (is (= :scoped-or-default
         (core/select-mode {:no-orchestrator true
                            :swarm-config    {:any "thing"}}
                           {"SWARM_CONFIG" "{}"}))))

(deftest select-mode-explicit-swarm-config-wins-over-env
  (is (= :orchestrated
         (core/select-mode {:swarm-config {:cluster_id "x"}} {}))))

(deftest select-mode-extensions-list-implies-scoped
  (is (= :scoped
         (core/select-mode {:extensions [:circe]} {"SWARM_CONFIG" "{}"}))))

(deftest select-mode-env-swarm-config-triggers-orchestrated
  (is (= :orchestrated
         (core/select-mode {} {"SWARM_CONFIG" "{}"}))))

(deftest select-mode-default-when-nothing-set
  (is (= :default (core/select-mode {} {}))))

(deftest select-mode-orchestrator-flag-without-config-triggers-orchestrated
  (is (= :orchestrated
         (core/select-mode {:orchestrator? true} {}))))

(deftest pooled?-reads-system-property
  (let [prev (System/getProperty "trexsql.use.pool")]
    (try
      (System/setProperty "trexsql.use.pool" "true")
      (is (true? (core/pooled?)))
      (System/setProperty "trexsql.use.pool" "false")
      (is (false? (core/pooled?)))
      (System/clearProperty "trexsql.use.pool")
      (is (false? (core/pooled?)))
      (finally
        (if prev
          (System/setProperty "trexsql.use.pool" prev)
          (System/clearProperty "trexsql.use.pool"))))))
