(ns trexsql.agent.tools.search-ohdsi-studies
  "search_ohdsi_studies tool — on-demand search across the public
   `ohdsi-studies` GitHub organization (~187 study repos). Skips bundling
   them in the plugin (would be GBs); fetches metadata via the GitHub
   search API and returns top hits with description, URL, and topics so
   Pythia can refer the user to a relevant published study protocol or
   package.

   Auth: optional `GITHUB_TOKEN` env var raises the rate limit from 10
   to 30 req/min for unauthenticated callers."
  (:require [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private github-search-url
  "https://api.github.com/search/repositories")

(def ^:private http-timeout-ms 12000)

(defn- bearer-token []
  (or (System/getenv "GITHUB_TOKEN") (System/getenv "BAO_GITHUB_TOKEN")))

(defn- search-org-repos [query]
  (let [q (str query " org:ohdsi-studies in:name,description,readme")
        token (bearer-token)
        headers (cond-> {"Accept" "application/vnd.github+json"
                         "X-GitHub-Api-Version" "2022-11-28"}
                  token (assoc "Authorization" (str "Bearer " token)))
        resp (http/get github-search-url
                       {:query-params {:q q :per_page 8 :sort "stars"}
                        :headers headers
                        :as :json
                        :throw-exceptions false
                        :socket-timeout http-timeout-ms
                        :connection-timeout 5000})]
    (cond
      (= 200 (:status resp))
      (or (get-in resp [:body :items]) [])

      (= 403 (:status resp))
      (do (log/warn "GitHub rate limit hit on search_ohdsi_studies — set GITHUB_TOKEN")
          [])

      :else
      (do (log/debug "github search returned" (:status resp))
          []))))

(defn- to-result [repo]
  {:source "ohdsi-studies"
   :name (:full_name repo)
   :title (:name repo)
   :description (or (:description repo) "")
   :url (:html_url repo)
   :stars (:stargazers_count repo)
   :topics (or (:topics repo) [])
   :updated (:updated_at repo)})

(defn run
  "Tool entrypoint. Args: {:query string}."
  [args _req]
  (let [query (str (or (:query args) ""))]
    (cond
      (str/blank? query)
      {:results [] :note "empty query"}

      :else
      (try
        (let [hits (search-org-repos query)]
          {:results (mapv to-result hits)
           :note (when (empty? hits)
                   "No matches in ohdsi-studies — try a broader query, or check that GITHUB_TOKEN is set if rate-limited.")})
        (catch Exception e
          (log/warn e "search_ohdsi_studies failed")
          {:results [] :note (str "GitHub search failed: " (.getMessage e))})))))
