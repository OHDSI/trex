(ns trexsql.agent.bedrock-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.bedrock :as bedrock]
            [trexsql.agent.tools :as tools]))

(deftest sdk-available
  (is (bedrock/sdk-available?)))

(deftest assistant-turn-message-shape
  (testing "assistant-turn-message returns Clojure data with text + tool-uses"
    (let [m (bedrock/assistant-turn-message
              "ok"
              [{:id "t1" :name "search_concepts" :args {:query "diabetes"}}])]
      (is (= :assistant (:role m)))
      (is (= "ok" (:text m)))
      (is (= 1 (count (:tool-uses m)))))))

(deftest tool-result-user-message-shape
  (testing "tool-result-user-message wraps tool-results"
    (let [m (bedrock/tool-result-user-message
              [{:tool-use-id "t1" :result {:results []}}])]
      (is (= :user (:role m)))
      (is (= 1 (count (:tool-results m)))))))

(deftest build-request-body-shape
  (testing "system + messages + tools land in the JSON-shaped body"
    (let [body (bedrock/build-request-body
                 "you are pythia"
                 [{:role :user :content "hello"}
                  {:role :assistant :text "hi" :tool-uses [{:id "t1" :name "search_concepts" :args {:query "T2DM"}}]}
                  {:role :user :tool-results [{:tool-use-id "t1" :result {:results [42]}}]}]
                 [{:name "search_concepts" :description "search" :input-schema {:type "object"}}])]
      (is (= [{:text "you are pythia"}] (:system body)))
      (is (= 3 (count (:messages body))))
      (is (= "user" (get-in body [:messages 0 :role])))
      (is (= "assistant" (get-in body [:messages 1 :role])))
      ;; Assistant message with tool-use produces text block + toolUse block
      (is (= [{:text "hi"}
              {:toolUse {:toolUseId "t1" :name "search_concepts" :input {:query "T2DM"}}}]
             (get-in body [:messages 1 :content])))
      ;; Tool-result message wraps tool results
      (is (= [{:toolResult {:toolUseId "t1" :content [{:json {:results [42]}}]}}]
             (get-in body [:messages 2 :content])))
      ;; Tool config carries tool specs
      (is (= 1 (count (get-in body [:toolConfig :tools]))))
      (is (= "search_concepts" (get-in body [:toolConfig :tools 0 :toolSpec :name]))))))

(deftest build-request-body-empty-message-fallback
  (testing "messages with no text/tool-uses/tool-results get a single-space placeholder"
    (let [body (bedrock/build-request-body
                 "sys"
                 [{:role :user}]
                 [])]
      (is (= [{:text " "}] (get-in body [:messages 0 :content]))))))

(deftest build-request-body-dynamic-context
  (testing "without dynamic context the system array is a single text block"
    (let [body (bedrock/build-request-body "sys" [{:role :user :content "hi"}] [])]
      (is (= [{:text "sys"}] (:system body)))))

  (testing "with dynamic context the system array has the static prompt followed by the context"
    (let [body (bedrock/build-request-body
                 "sys"
                 [{:role :user :content "hi"}]
                 []
                 "## Current context\nCurrent screen: cohort-edit")]
      (is (= 2 (count (:system body))))
      (is (= "sys" (get-in body [:system 0 :text])))
      (is (re-find #"cohort-edit" (get-in body [:system 1 :text])))))

  (testing "blank dynamic context is treated as absent"
    (let [body (bedrock/build-request-body "sys" [] [] "   ")]
      (is (= 1 (count (:system body)))))))

(deftest get-artifact-tool-registered
  (testing "tool-specs includes get_artifact as a server-side tool"
    (let [t (some #(when (= "get_artifact" (:name %)) %) tools/tool-specs)]
      (is (some? t) "get_artifact tool spec missing")
      (is (= :server (:side t)))
      (is (= ["kind" "id"] (get-in t [:input-schema :required]))))))

(deftest ask-user-tool-registered
  (testing "tool-specs includes ask_user as a client-side tool"
    (let [t (some #(when (= "ask_user" (:name %)) %) tools/tool-specs)]
      (is (some? t) "ask_user tool spec missing")
      (is (= :client (:side t)))
      (is (= ["question" "options"] (get-in t [:input-schema :required]))))
    (is (tools/client-side-tool? "ask_user"))))

(deftest plan-tools-registered
  (testing "tool-specs includes create_plan / update_plan_step (renamed from create_checklist / update_checklist_step)"
    (let [cp (some #(when (= "create_plan" (:name %)) %) tools/tool-specs)
          up (some #(when (= "update_plan_step" (:name %)) %) tools/tool-specs)]
      (is (some? cp) "create_plan tool spec missing")
      (is (some? up) "update_plan_step tool spec missing")
      (is (= :client (:side cp)))
      (is (= :client (:side up)))
      (is (some #{:document} (keys (get-in cp [:input-schema :properties]))) "create_plan should accept a document field"))
    (is (tools/client-side-tool? "create_plan"))
    (is (tools/client-side-tool? "update_plan_step"))
    (is (not (some #(= "create_checklist" (:name %)) tools/tool-specs)) "create_checklist should be removed")
    (is (not (some #(= "update_checklist_step" (:name %)) tools/tool-specs)) "update_checklist_step should be removed")))

(deftest web-search-tool-registered
  (testing "tool-specs includes web_search as a server-side tool"
    (let [t (some #(when (= "web_search" (:name %)) %) tools/tool-specs)]
      (is (some? t) "web_search tool spec missing")
      (is (= :server (:side t)))
      (is (= ["query"] (get-in t [:input-schema :required]))))
    (is (not (tools/client-side-tool? "web_search")))))
