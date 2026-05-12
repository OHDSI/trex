(ns trexsql.agent.tools.search-existing-cohorts
  "search_existing_cohorts tool — calls /WebAPI/cohortdefinition to list
   the user's cohort definitions, scores each against the query (name +
   description match), and returns the top hits. Lets the agent suggest
   reusing an existing cohort instead of building one from scratch."
  (:require [clj-http.client :as http]
            [clojure.data.json :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private max-results 5)

(def ^:private webapi-base
  (or (System/getenv "BAO_AGENT_WEBAPI_URL")
      "http://localhost:8080/WebAPI"))

(defn- forward-auth [request]
  (when request
    (or (get-in request [:headers "authorization"])
        (get-in request [:headers "Authorization"]))))

(defn- normalize [s] (str/lower-case (str (or s ""))))

(defn- score-match
  "Tiny TF-style scorer: count how many query terms appear in the cohort's
   name or description. Names match heavier than descriptions."
  [query cohort]
  (let [q (normalize query)
        terms (->> (str/split q #"\s+") (remove str/blank?) distinct)
        name-text (normalize (or (:name cohort) (get cohort "name")))
        desc-text (normalize (or (:description cohort) (get cohort "description")))]
    (reduce
      (fn [score t]
        (cond-> score
          (str/includes? name-text t) (+ 3)
          (str/includes? desc-text t) (+ 1)))
      0
      terms)))

(defn- to-result [cohort]
  {:id          (or (:id cohort) (get cohort "id"))
   :name        (or (:name cohort) (get cohort "name"))
   :description (or (:description cohort) (get cohort "description"))
   :createdDate (or (:createdDate cohort) (get cohort "createdDate"))
   :modifiedDate (or (:modifiedDate cohort) (get cohort "modifiedDate"))})

(defn- list-cohorts [auth]
  (let [url (str webapi-base "/cohortdefinition")
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
  "Tool entrypoint. `args` is {:query \"..\"}; `req` carries
   {:source-key :request} from the route handler."
  [args req]
  (let [query (str (or (:query args) ""))
        auth (forward-auth (:request req))]
    (cond
      (str/blank? query)
      {:results [] :note "empty query"}

      :else
      (try
        (let [cohorts (or (list-cohorts auth) [])
              scored (->> cohorts
                          (map (fn [c] [(score-match query c) c]))
                          (filter (fn [[s _]] (pos? s)))
                          (sort-by (comp - first))
                          (take max-results)
                          (map (fn [[s c]] (assoc (to-result c) :matchScore s)))
                          vec)]
          {:results scored
           :note (when (empty? scored)
                   (str "No existing cohort name or description matched any of the "
                        "query terms (" query ")."))})
        (catch Exception e
          (log/warn e "search_existing_cohorts failed")
          {:results [] :note (str "WebAPI list failed: " (.getMessage e))})))))
