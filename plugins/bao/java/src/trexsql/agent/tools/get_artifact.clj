(ns trexsql.agent.tools.get-artifact
  "Server-side tool: fetch the full editable content of a saved artifact
   by kind + id. Pythia must call this BEFORE proposing edits to an
   existing artifact, so it reasons about the artifact's current state
   rather than overwriting blindly."
  (:require [clj-http.client :as http]
            [trexsql.agent.tools._search-util :as su]))

(def ^:private kind->path
  "Maps the tool's `kind` enum to the WebAPI GET endpoint that returns the
   full editable definition for that artifact."
  {"cohort"           (fn [id] (str "/cohortdefinition/" id))
   "concept_set"      (fn [id] (str "/conceptset/" id "/expression"))
   "feature_analysis" (fn [id] (str "/feature-analysis/" id))
   "characterization" (fn [id] (str "/cohort-characterization/" id "/design"))
   "pathway"          (fn [id] (str "/pathway-analysis/" id))
   "incidence_rate"   (fn [id] (str "/ir/" id))})

(defn- fetch [path auth]
  (let [url (str su/webapi-base path)
        headers (cond-> {"Accept" "application/json"}
                  auth (assoc "Authorization" auth))
        resp (http/get url
                       {:headers headers
                        :as :json
                        :throw-exceptions false
                        :socket-timeout 12000
                        :connection-timeout 5000})]
    {:status (:status resp)
     :body   (:body resp)}))

(defn run
  "Tool entry-point. `args` shape: {:kind <enum> :id <number>}.
   Returns a result map suitable for serialisation as a Bedrock toolResult."
  [args request]
  (let [kind (str (or (:kind args) (get args "kind")))
        id   (or (:id args) (get args "id"))
        path-fn (kind->path kind)
        auth (su/forward-auth request)]
    (cond
      (nil? path-fn)
      {:error (str "unknown kind: " kind
                   " (allowed: cohort, concept_set, feature_analysis, "
                   "characterization, pathway, incidence_rate)")}

      (nil? id)
      {:error "id is required"}

      :else
      (let [{:keys [status body]} (fetch (path-fn id) auth)]
        (cond
          (= 200 status) {:kind kind :id id :artifact body}
          (= 404 status) {:error (str kind " " id " not found")}
          :else {:error (str "WebAPI returned HTTP " status
                             " for " kind " " id)})))))
