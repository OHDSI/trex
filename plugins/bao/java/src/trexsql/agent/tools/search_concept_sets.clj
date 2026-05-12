(ns trexsql.agent.tools.search-concept-sets
  "search_existing_concept_sets tool — calls /WebAPI/conceptset to list
   the user's concept sets, scores each against the query (name +
   description match), and returns the top hits. Lets the agent suggest
   reusing an existing concept set instead of creating a duplicate."
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private default-max-results 10)

(def ^:private webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(defn- forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- normalize [s] (str/lower-case (str (or s ""))))

(defn- score-match [query cs]
  (let [q (normalize query)
        terms (->> (str/split q #"\s+") (remove str/blank?) distinct)
        name-text (normalize (or (:name cs) (get cs "name")))
        desc-text (normalize (or (:description cs) (get cs "description")))]
    (reduce
      (fn [score t]
        (cond-> score
          (str/includes? name-text t) (+ 3)
          (str/includes? desc-text t) (+ 1)))
      0
      terms)))

(defn- to-result [cs]
  {:id          (or (:id cs) (get cs "id"))
   :name        (or (:name cs) (get cs "name"))
   :description (or (:description cs) (get cs "description"))
   :createdDate  (or (:createdDate cs) (get cs "createdDate"))
   :modifiedDate (or (:modifiedDate cs) (get cs "modifiedDate"))})

(defn- list-concept-sets [auth]
  (let [url (str webapi-base "/conceptset")
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

(defn run
  "Tool entrypoint. `args` is {:query \"..\" :limit n?}; `req` carries
   {:source-key :request} from the route handler."
  [args req]
  (let [query (str (or (:query args) ""))
        limit (or (:limit args) default-max-results)
        auth (forward-auth (:request req))]
    (cond
      (str/blank? query)
      {:results [] :note "empty query"}

      :else
      (try
        (let [sets (or (list-concept-sets auth) [])
              scored (->> sets
                          (map (fn [c] [(score-match query c) c]))
                          (filter (fn [[s _]] (pos? s)))
                          (sort-by (comp - first))
                          (take limit)
                          (map (fn [[s c]] (assoc (to-result c) :matchScore s)))
                          vec)]
          {:results scored
           :note (when (empty? scored)
                   (str "No existing concept set name or description matched any of the "
                        "query terms (" query ")."))})
        (catch Exception e
          (log/warn e "search_existing_concept_sets failed")
          {:results [] :note (str "WebAPI list failed: " (.getMessage e))})))))
