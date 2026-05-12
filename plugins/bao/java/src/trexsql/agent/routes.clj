(ns trexsql.agent.routes
  "Reitit routes for the cohort design agent endpoint.

   The endpoint speaks the Vercel UIMessageStream wire format. Each POST
   runs **one** Bedrock Converse turn and ends with a `finish` chunk; the
   client (`@ai-sdk/vue`'s `useChat`, with `maxSteps > 1`) drives the
   multi-turn loop by re-POSTing the appended history."
  (:require [trexsql.agent.bedrock :as bedrock]
            [trexsql.agent.prompt :as prompt]
            [trexsql.agent.sse :as sse]
            [trexsql.agent.tools :as tools]
            [clojure.string :as str]
            [clojure.tools.logging :as log])
  (:import [java.util UUID]))

(defn- health-handler [_request]
  {:status 200
   :headers {"Content-Type" "application/json"}
   :body {:status "ok"
          :model bedrock/model-id
          :region bedrock/aws-region
          :max-steps bedrock/max-steps
          :sdk-loaded (bedrock/sdk-available?)}})

(defn- ui-msg-part->bedrock
  "Translate a single @ai-sdk/vue UIMessagePart into Bedrock-format content
   blocks (returned as Clojure-data items consumable by bedrock/build-message
   variants). Returns a vector of items, since one part can become multiple
   blocks (e.g. a tool call accompanied by its tool result)."
  [part]
  (let [t (str (:type part))]
    (cond
      ;; Plain text part
      (= t "text") [{:kind :text :text (str (:text part))}]

      ;; Tool call: useChat sends both the call and (when available) the result.
      ;; Older shape: type \"tool-<toolName>\" with state + input + output.
      ;; Newer shape: type \"tool-input-available\" / \"tool-output-available\".
      (or (str/starts-with? t "tool-")
          (= t "tool-input-available")
          (= t "tool-output-available"))
      (let [tool-name (or (:toolName part)
                          (when (and (str/starts-with? t "tool-")
                                     (not (#{"tool-input-available" "tool-output-available"} t)))
                            (subs t 5)))
            id   (:toolCallId part)
            in   (or (:input part) (:args part))
            out  (or (:output part) (:result part))
            state (:state part)]
        (cond-> []
          (and id tool-name in)
          (conj {:kind :tool-use :id id :name tool-name :args in})
          (and id (or out (= state "output-available")))
          (conj {:kind :tool-result :id id :result (or out {})})))

      :else [])))

(defn- ui-message->bedrock-items
  "Translate one UIMessage (with `parts: UIMessagePart[]`) into ordered
   Bedrock content items."
  [m]
  (let [parts (or (:parts m) [])]
    {:role (keyword (str (or (:role m) "user")))
     :items (vec (mapcat ui-msg-part->bedrock parts))
     ;; If a message has plain text-only and no parts (older shape), fall back.
     :legacy-content (when (and (empty? parts) (:content m))
                       (str (:content m)))}))

(defn- bedrock-history
  "Translate the incoming UIMessage[] from useChat into the message shape
   our bedrock/build-message understands. We compress runs of items per
   message: text blocks merge into the message's `:content`/`:text`,
   tool-use items become the assistant's tool-uses, tool-result items
   become a synthetic user `:tool-results` message that immediately follows
   the assistant turn."
  [ui-messages]
  (reduce
    (fn [acc m]
      (let [{:keys [role items legacy-content]} (ui-message->bedrock-items m)
            text-parts  (filter #(= :text (:kind %)) items)
            tool-uses   (filter #(= :tool-use (:kind %)) items)
            tool-result (filter #(= :tool-result (:kind %)) items)
            text-joined (str/join "" (map :text text-parts))
            text-or-legacy (if (str/blank? text-joined) (or legacy-content "") text-joined)]
        (cond-> acc
          ;; Assistant-side: combine text + tool-uses into a single message
          (and (= role :assistant) (or (seq tool-uses) (seq text-parts)))
          (conj (cond-> {:role :assistant}
                  (not (str/blank? text-or-legacy)) (assoc :text text-or-legacy)
                  (seq tool-uses) (assoc :tool-uses (mapv #(select-keys % [:id :name :args]) tool-uses))))

          ;; User-side text message
          (and (= role :user) (or (seq text-parts) legacy-content))
          (conj {:role :user :content text-or-legacy})

          ;; Tool-results are a separate user message that follows the assistant turn
          (seq tool-result)
          (conj {:role :user
                 :tool-results (mapv (fn [tr] {:tool-use-id (:id tr) :result (:result tr)})
                                     tool-result)}))))
    []
    (or ui-messages [])))

(defn- text-block-id [n]
  (str "text-" n))

(defn- emit-finish [emit reason]
  (emit {:type "finish" :finishReason (or reason "stop")}))

(defn- format-route-context
  "Render the per-request route + open-artifact snapshot as a short text
   block to append to the system prompt. Returns nil when no useful
   context is available (no route, no open artifact)."
  [route-ctx]
  (when (map? route-ctx)
    (let [route-name (some-> (:routeName route-ctx) str)
          artifact   (:artifact route-ctx)
          lines      (cond-> []
                       (and route-name (not (str/blank? route-name)))
                       (conj (str "Current screen: " route-name))

                       (map? artifact)
                       (conj (str "Open artifact: " (name (:kind artifact))
                                  " \"" (:name artifact) "\""
                                  " (id " (:id artifact) ")"))

                       (and (map? artifact) (string? (:summary artifact))
                            (not (str/blank? (:summary artifact))))
                       (conj (str "Summary: " (:summary artifact))))]
      (when (seq lines)
        (str "## Current context\n"
             (str/join "\n" lines)
             "\n\nThe user is currently on this screen with this artifact open. "
             "When they ask to modify it, call get_artifact first to load its "
             "current state, then propose edits via the matching update_* tool "
             "(or the cohort add_*/set_* tools when the artifact is a cohort). "
             "Do NOT propose creating a new artifact when one is already open "
             "and the user is asking to modify it.")))))

(defn- chat-handler
  "POST /agent/chat — runs ONE Bedrock Converse streaming turn and emits
   the result as a Vercel UIMessageStream. The client (`useChat`) drives
   multi-turn by re-POSTing with the appended message history."
  [request]
  (let [body (or (:body-params request) {})
        ui-messages (or (:messages body) [])
        route-ctx (:routeContext body)
        dynamic-context (format-route-context route-ctx)
        history (bedrock-history ui-messages)
        message-id (str (UUID/randomUUID))
        ;; `text-state` tracks whether we've opened a text block so we can
        ;; emit text-start lazily and text-end before tool-uses or finish.
        text-state (atom {:open? false :id (text-block-id 0) :n 0})]
    (sse/streaming-response
      (fn [emit]
        (try
          (emit {:type "start" :messageId message-id})

          (let [bedrock-emit
                (fn [event-name data]
                  (case event-name
                    "text-delta"
                    (let [delta (str (:delta data))]
                      (when-not (:open? @text-state)
                        (emit {:type "text-start" :id (:id @text-state)})
                        (swap! text-state assoc :open? true))
                      (emit {:type "text-delta" :id (:id @text-state) :delta delta}))

                    "tool-call"
                    (do
                      ;; Close any open text block before the tool call.
                      (when (:open? @text-state)
                        (emit {:type "text-end" :id (:id @text-state)})
                        (swap! text-state (fn [s] (-> s
                                                      (assoc :open? false)
                                                      (update :n inc)
                                                      (assoc :id (text-block-id (inc (:n s))))))))
                      (emit {:type "tool-input-available"
                             :toolCallId (:id data)
                             :toolName (:name data)
                             :input (or (:args data) {})}))

                    "error"
                    (emit {:type "error" :errorText (str (:message data))})

                    ;; Default: ignore unknown event names from older bedrock impls.
                    nil))

                {:keys [stop-reason tool-uses]}
                (bedrock/converse-stream prompt/system-prompt history tools/tool-specs bedrock-emit dynamic-context)]

            ;; Close any still-open text block.
            (when (:open? @text-state)
              (emit {:type "text-end" :id (:id @text-state)}))

            ;; For server-side tools, dispatch synchronously and emit
            ;; tool-output-available before finish. Client-side tools we
            ;; don't auto-stub anymore — the client's onToolCall will
            ;; addToolResult and the next POST drives the next turn.
            (when (= stop-reason :tool-use)
              ;; Server-side tools are independent (search_concepts,
              ;; search_phenotypes, etc. — pure WebAPI lookups). Models
              ;; routinely batch 3-6 of these in one assistant turn; running
              ;; them in parallel cuts a typical turn from ~5 s to ~1 s.
              (let [server-tools (filter #(not (tools/client-side-tool? (:name %))) tool-uses)
                    ctx {:source-key (:sourceKey body) :request request}
                    results (->> server-tools
                                 (mapv (fn [{:keys [id name args]}]
                                         (future
                                           {:id id
                                            :output (tools/dispatch-server-tool name args ctx)})))
                                 (mapv deref))]
                (doseq [{:keys [id output]} results]
                  (emit {:type "tool-output-available"
                         :toolCallId id
                         :output output}))))

            (emit-finish emit
                         (case stop-reason
                           :tool-use   "tool-calls"
                           :end-turn   "stop"
                           :max-tokens "length"
                           :error      "error"
                           "stop")))
          (catch Throwable t
            (log/error t "agent /chat handler failed")
            (emit {:type "error" :errorText (.getMessage t)})
            (emit-finish emit "error")))))))

(def routes
  "Reitit route table fragment, mounted under /WebAPI/trexsql by the servlet."
  [["/agent/chat" {:post {:handler chat-handler}}]
   ["/agent/chat/health" {:get {:handler health-handler}}]])
