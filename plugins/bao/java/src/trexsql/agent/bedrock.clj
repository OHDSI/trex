(ns trexsql.agent.bedrock
  "Amazon Bedrock Converse streaming client for the cohort-design agent.

   Posts directly to the bedrock-runtime REST endpoint with bearer-token
   auth (`Authorization: Bearer ${AWS_BEARER_TOKEN_BEDROCK}`) and decodes
   the AWS event-stream response with software.amazon.eventstream.MessageDecoder.

   We deliberately do NOT use the AWS SDK BedrockRuntimeClient: the bundled
   SDK is 2.28.x, which predates Bedrock long-term API key support
   (`tokenProvider(...)` on the client builder + `AWS_BEARER_TOKEN_BEDROCK`
   auto-detection landed in 2.31). MessageDecoder itself is decoupled from
   the service clients and works fine on 2.28."
  (:require [clojure.data.json :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [clj-http.client :as http]
            [clj-http.conn-mgr :as conn-mgr])
  (:import [java.io InputStream]
           [java.nio ByteBuffer]
           [java.util.function Consumer]
           [software.amazon.eventstream HeaderValue Message MessageDecoder]))

;; Reusable TLS-pooled HTTP connection manager so consecutive Converse
;; turns don't pay a fresh handshake to bedrock-runtime each time. With
;; ~250 ms RTT to us-east-1 and 5-10 turns per "build a cohort" session,
;; this saves 1-2 s per session of pure TLS-handshake overhead.
(defonce ^:private conn-pool
  (conn-mgr/make-reusable-conn-manager
    {:timeout 30           ; idle keep-alive in seconds
     :threads 8            ; max concurrent connections
     :default-per-route 4}))

(def model-id
  (or (System/getenv "BAO_AGENT_MODEL")
      "anthropic.claude-sonnet-4-6-20250514-v1:0"))

(def aws-region
  (or (System/getenv "AWS_REGION") "us-east-1"))

(def max-steps
  (let [v (System/getenv "BAO_AGENT_MAX_STEPS")]
    (if (and v (not (.isBlank ^String v)))
      (try (Integer/parseInt v) (catch Exception _ 20))
      20)))

(defn- bearer-token ^String []
  (let [t (System/getenv "AWS_BEARER_TOKEN_BEDROCK")]
    (when (or (nil? t) (.isBlank ^String t))
      (throw (IllegalStateException.
               "AWS_BEARER_TOKEN_BEDROCK env var not set; cannot call Bedrock")))
    t))

(defn sdk-available?
  "Always true — the event-stream decoder ships with the bundled JAR. Kept
   for backwards compatibility with /chat/health probes that used to gate
   on SDK presence."
  [] true)

(defn- endpoint ^String []
  (str "https://bedrock-runtime." aws-region ".amazonaws.com"
       "/model/" model-id "/converse-stream"))

;; ---- Request-body construction ------------------------------------------

(defn- text-block [^String s] {:text s})

(defn- tool-use-block [{:keys [id name args]}]
  {:toolUse {:toolUseId (str id)
             :name (str name)
             :input (or args {})}})

(defn- tool-result-block [{:keys [tool-use-id result]}]
  {:toolResult {:toolUseId (str tool-use-id)
                :content [(if (string? result)
                            {:text result}
                            {:json result})]}})

(defn- message->json [m]
  (let [role (str/lower-case (name (:role m)))
        text (let [t (or (:text m) (:content m))]
               (when (and (string? t) (not (str/blank? t))) t))
        tool-uses (:tool-uses m)
        tool-results (:tool-results m)
        content (cond
                  (seq tool-results)
                  (mapv tool-result-block tool-results)

                  (and (= role "assistant") (or (seq tool-uses) text))
                  (let [tu-blocks (mapv tool-use-block tool-uses)]
                    (if text
                      (into [(text-block text)] tu-blocks)
                      tu-blocks))

                  text
                  [(text-block text)]

                  ;; Bedrock rejects empty content arrays. Emit a single
                  ;; space placeholder; log so the caller can be fixed.
                  :else
                  (do (log/warn "build-message: dropping empty message" m)
                      [(text-block " ")]))]
    {:role role :content content}))

(defn- tool-spec->json [{:keys [name description input-schema]}]
  {:toolSpec {:name (str name)
              :description (str description)
              :inputSchema {:json input-schema}}})

(defn build-request-body
  "Pure helper, exposed for testing. Produces the JSON-shaped Clojure map
   posted to bedrock-runtime/converse-stream.

   `dynamic-context` is an optional string appended as a second :system
   block — used to surface per-request facts (current screen / open
   artifact) without mutating the static system prompt."
  ([system-prompt messages tool-specs]
   (build-request-body system-prompt messages tool-specs nil))
  ([system-prompt messages tool-specs dynamic-context]
   {:system (cond-> [{:text system-prompt}]
              (and (string? dynamic-context) (not (str/blank? dynamic-context)))
              (conj {:text dynamic-context}))
    :messages (mapv message->json messages)
    :toolConfig {:tools (mapv tool-spec->json tool-specs)}}))

;; ---- Public message helpers (shape unchanged) ---------------------------

(defn assistant-turn-message
  "Build a Clojure-data assistant message that captures one finished turn:
   the model's accumulated text plus any tool-use blocks it emitted."
  [text tool-uses]
  {:role :assistant
   :text text
   :tool-uses tool-uses})

(defn tool-result-user-message
  "Build a Clojure-data user message containing tool-result blocks for
   every tool the previous assistant turn called."
  [tool-results]
  {:role :user
   :tool-results (mapv (fn [{:keys [tool-use-id result]}]
                         {:tool-use-id tool-use-id :result result})
                       tool-results)})

;; ---- Event-stream decoding ----------------------------------------------

(defn- header-string [^Message msg ^String name]
  (when-let [^HeaderValue hv (get (.getHeaders msg) name)]
    (try (.getString hv) (catch Exception _ nil))))

(defn- payload->clj [^Message msg]
  (try
    (json/read-str (String. (.getPayload msg) "UTF-8") :key-fn keyword)
    (catch Exception _ nil)))

(defn- handle-event [emit state ^Message msg]
  (let [event-type (header-string msg ":event-type")
        message-type (header-string msg ":message-type")
        payload (payload->clj msg)]
    (cond
      (= "exception" message-type)
      (let [exc-type (header-string msg ":exception-type")
            text (or (when (map? payload) (:message payload))
                     exc-type
                     "Bedrock event-stream exception")]
        (log/error "bedrock event-stream exception" exc-type text)
        (swap! state assoc :error text))

      :else
      (case event-type
        "messageStart" nil

        "contentBlockStart"
        (let [idx (:contentBlockIndex payload)
              tu (get-in payload [:start :toolUse])]
          (when tu
            (swap! state assoc-in [:tool-uses idx]
                   {:id (:toolUseId tu)
                    :name (:name tu)
                    :buffer (StringBuilder.)})))

        "contentBlockDelta"
        (let [idx (:contentBlockIndex payload)
              delta (:delta payload)
              t (:text delta)
              tu (:toolUse delta)]
          (cond
            (string? t)
            (do (swap! state update :text str t)
                (emit "text-delta" {:delta t}))

            tu
            (when-let [^StringBuilder buf (get-in @state [:tool-uses idx :buffer])]
              (.append buf (str (:input tu))))))

        "contentBlockStop"
        (let [idx (:contentBlockIndex payload)
              entry (get-in @state [:tool-uses idx])]
          (when entry
            (let [args (try
                         (json/read-str (str (:buffer entry)) :key-fn keyword)
                         (catch Exception _ {}))
                  normalized {:id (:id entry)
                              :name (:name entry)
                              :args args}]
              (swap! state update :collected-tool-uses (fnil conj []) normalized)
              (emit "tool-call" {:id (:id normalized)
                                 :name (:name normalized)
                                 :args args}))))

        "messageStop"
        (swap! state assoc :stop-reason (:stopReason payload))

        ;; metadata, ping, unknown — ignore
        nil))))

(defn- drain-stream! [^InputStream is ^MessageDecoder decoder]
  (let [buf (byte-array 8192)]
    (loop []
      (let [n (.read is buf)]
        (when (pos? n)
          (.feed decoder (ByteBuffer/wrap buf 0 n))
          (recur))))))

;; ---- Public converse-stream ---------------------------------------------

(declare ^:private converse-stream-impl)

(defn- normalize-stop-reason [s error?]
  (cond
    error? :error
    :else (case (str s)
            "tool_use"      :tool-use
            "TOOL_USE"      :tool-use
            "end_turn"      :end-turn
            "END_TURN"      :end-turn
            "max_tokens"    :max-tokens
            "MAX_TOKENS"    :max-tokens
            "stop_sequence" :end-turn
            :end-turn)))

(defn converse-stream
  "Run one Bedrock Converse streaming turn against bedrock-runtime via
   bearer-token HTTP.

   `messages`   — vector of Clojure-data messages, where each is one of:
                    {:role :user      :content \"...\"}
                    {:role :assistant :content \"...\"}
                    {:role :assistant :text \"...\" :tool-uses [{:id :name :args}]}
                    {:role :user      :tool-results [{:tool-use-id :result}]}
   `tools`      — tool specs (see trexsql.agent.tools)
   `emit`       — fn (event-name data) -> bool, supplied by the route handler
   `system-prompt` — string
   `dynamic-context` — optional string appended as a second :system block
                      (route + open artifact summary at request time).

   Returns
   {:stop-reason kw          ; :end-turn | :tool-use | :max-tokens | :error
    :text       string       ; accumulated text from this turn
    :tool-uses  [{:id :name :args}]}"
  ([system-prompt messages tools emit]
   (converse-stream system-prompt messages tools emit nil))
  ([system-prompt messages tools emit dynamic-context]
   (converse-stream-impl system-prompt messages tools emit dynamic-context)))

(defn- converse-stream-impl
  [system-prompt messages tools emit dynamic-context]
  (let [state (atom {:tool-uses {} :collected-tool-uses [] :text "" :stop-reason nil :error nil})
        body (json/write-str (build-request-body system-prompt messages tools dynamic-context))
        decoder (MessageDecoder.
                  (reify Consumer
                    (accept [_ msg] (handle-event emit state msg))))]
    (try
      (let [resp (http/post (endpoint)
                            {:as :stream
                             :headers {"Authorization" (str "Bearer " (bearer-token))
                                       "Content-Type" "application/json"
                                       "Accept" "application/vnd.amazon.eventstream"}
                             :body body
                             :throw-exceptions false
                             :socket-timeout 120000
                             :connection-timeout 30000
                             :connection-manager conn-pool})
            status (:status resp)]
        (when-not (= 200 status)
          (let [err-body (when (instance? InputStream (:body resp))
                           (try (slurp (:body resp)) (catch Exception _ nil)))]
            (throw (ex-info (str "bedrock-runtime returned HTTP " status)
                            {:status status :body err-body}))))
        (with-open [^InputStream is (:body resp)]
          (drain-stream! is decoder))
        (when-let [err (:error @state)]
          (emit "error" {:message err}))
        {:stop-reason (normalize-stop-reason (:stop-reason @state) (some? (:error @state)))
         :text (:text @state)
         :tool-uses (:collected-tool-uses @state)})
      (catch Throwable t
        (log/error t "converse-stream failed")
        (emit "error" {:message (.getMessage t)})
        {:stop-reason :error :text "" :tool-uses []}))))
