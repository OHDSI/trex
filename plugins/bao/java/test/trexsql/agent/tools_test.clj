(ns trexsql.agent.tools-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.tools :as tools]))

(deftest client-side-tool-predicate
  (testing "client-side tools"
    (is (tools/client-side-tool? "add_criterion"))
    (is (tools/client-side-tool? "add_criteria"))
    (is (tools/client-side-tool? "set_entry_event"))
    (is (tools/client-side-tool? "set_observation_window"))
    (is (tools/client-side-tool? "add_exit_criterion"))
    (is (tools/client-side-tool? "set_censor_event"))
    ;; embed_concept_set_in_cohort + create_concept_set were removed —
    ;; create_standalone_concept_set is now the single concept-set tool.
    (is (tools/client-side-tool? "create_standalone_concept_set"))
    (is (not (tools/client-side-tool? "embed_concept_set_in_cohort")))
    (is (not (tools/client-side-tool? "create_concept_set")))
    (is (tools/client-side-tool? "add_inclusion_rule")))

  (testing "server-side tools"
    (is (not (tools/client-side-tool? "search_concepts")))
    (is (not (tools/client-side-tool? "search_phenotypes"))))

  (testing "unknown tools"
    (is (not (tools/client-side-tool? "nonsense_tool")))))

(deftest tool-spec-shape
  (testing "every tool has name + description + input-schema + side"
    (doseq [t tools/tool-specs]
      (is (string? (:name t)) (str (:name t) " missing name"))
      (is (string? (:description t)) (str (:name t) " missing description"))
      (is (#{:server :client} (:side t)) (str (:name t) " has invalid side"))
      (is (= "object" (get-in t [:input-schema :type])) (str (:name t) " input-schema must be object")))))

(deftest dispatch-server-tool-rejects-unknown
  (testing "unknown server-side tool returns an :error result"
    (let [res (tools/dispatch-server-tool "nope" {} {})]
      (is (string? (:error res))))))
