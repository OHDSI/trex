(ns trexsql.agent.tools.search-characterizations
  "search_existing_characterizations tool — lists /WebAPI/cohort-characterization
   and ranks by query-term overlap on name + description."
  (:require [clojure.tools.logging :as log]
            [clojure.string :as str]
            [trexsql.agent.tools._search-util :as su]))

(defn run
  [args req]
  (let [query (str (or (:query args) ""))
        limit (or (:limit args) 10)
        auth (su/forward-auth (:request req))]
    (cond
      (str/blank? query)
      {:results [] :note "empty query"}

      :else
      (try
        (let [body (su/list-entities "/cohort-characterization?size=10000" auth)
              entities (su/extract-content (or body []))
              results (su/ranked-results query entities limit su/default-result)]
          {:results results
           :note (when (empty? results)
                   (str "No existing characterization name or description matched any of the "
                        "query terms (" query ")."))})
        (catch Exception e
          (log/warn e "search_existing_characterizations failed")
          {:results [] :note (str "WebAPI list failed: " (.getMessage e))})))))
