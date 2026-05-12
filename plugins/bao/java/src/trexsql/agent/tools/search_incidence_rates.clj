(ns trexsql.agent.tools.search-incidence-rates
  "search_existing_incidence_rates tool — lists /WebAPI/ir/ and ranks by
   query-term overlap on name + description."
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
        (let [body (su/list-entities "/ir/" auth)
              entities (su/extract-content (or body []))
              results (su/ranked-results query entities limit su/default-result)]
          {:results results
           :note (when (empty? results)
                   (str "No existing incidence rate name or description matched any of the "
                        "query terms (" query ")."))})
        (catch Exception e
          (log/warn e "search_existing_incidence_rates failed")
          {:results [] :note (str "WebAPI list failed: " (.getMessage e))})))))
