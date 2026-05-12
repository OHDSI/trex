(ns trexsql.agent.tools._search-util
  "Shared helpers for search_existing_* tools that list a WebAPI collection
   and score by query-token overlap with name + description."
  (:require [clj-http.client :as http]
            [clojure.string :as str]))

(def webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(defn forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- normalize [s] (str/lower-case (str (or s ""))))

(defn score-match
  "Tiny TF-style scorer: count how many query terms appear in the entity's
   name (heavier weight) or description. Returns an integer score."
  [query entity]
  (let [q (normalize query)
        terms (->> (str/split q #"\s+") (remove str/blank?) distinct)
        name-text (normalize (or (:name entity) (get entity "name")))
        desc-text (normalize (or (:description entity) (get entity "description")))]
    (reduce
      (fn [score t]
        (cond-> score
          (str/includes? name-text t) (+ 3)
          (str/includes? desc-text t) (+ 1)))
      0
      terms)))

(defn list-entities
  "GET <webapi-base><path> with the user's bearer token forwarded.
   Returns the parsed JSON body on 200, nil otherwise."
  [path auth]
  (let [url (str webapi-base path)
        headers (cond-> {"Accept" "application/json"}
                  auth (assoc "Authorization" auth))
        resp (http/get url
                       {:headers headers
                        :as :json
                        :throw-exceptions false
                        :socket-timeout 12000
                        :connection-timeout 5000})]
    (when (= 200 (:status resp))
      (or (:body resp) []))))

(defn extract-content
  "Some WebAPI list endpoints wrap results in a Spring Page `content`
   array. Accept either the wrapped or the bare-array shape."
  [body]
  (cond
    (sequential? body) body
    (map? body) (or (:content body) (get body "content") [])
    :else []))

(defn ranked-results
  "Score `entities` against `query`, keep positive matches, take the top
   `limit`, and shape each into a result map via `result-fn`."
  [query entities limit result-fn]
  (->> entities
       (map (fn [e] [(score-match query e) e]))
       (filter (fn [[s _]] (pos? s)))
       (sort-by (comp - first))
       (take limit)
       (map (fn [[s e]] (assoc (result-fn e) :matchScore s)))
       vec))

(defn default-result [entity]
  {:id           (or (:id entity) (get entity "id"))
   :name         (or (:name entity) (get entity "name"))
   :description  (or (:description entity) (get entity "description"))
   :createdDate  (or (:createdDate entity) (get entity "createdDate"))
   :modifiedDate (or (:modifiedDate entity) (get entity "modifiedDate"))})
