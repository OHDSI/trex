(ns trexsql.agent.tools.web-search
  "Server-side tool: DuckDuckGo Lite scrape. No API key required.

   Mirrors the pattern from trex-dx (devx/functions/tools/web_search.ts):
   POST `q=<query>` to https://lite.duckduckgo.com/lite/, regex out the
   anchor + snippet pairs, return the top N as a clojure map suitable for
   serialisation as a Bedrock tool result."
  (:require [clj-http.client :as http]
            [clojure.string :as str])
  (:import [java.net URLEncoder]))

(def ^:private link-rx
  #"(?s)<a[^>]+href=[\"']([^\"']+)[\"'][^>]+class=[\"']result-link[\"'][^>]*>([^<]*)</a>")

(def ^:private snippet-rx
  #"(?s)<td class=[\"']result-snippet[\"']>(.*?)</td>")

(defn- strip-tags [s]
  (-> (or s "")
      (str/replace #"(?s)<[^>]*>" "")
      str/trim))

(defn parse-html
  "Parse a DuckDuckGo Lite results page into a vector of result maps. Pure
   helper for unit testing."
  [html n]
  (let [links (->> (re-seq link-rx (or html ""))
                   (mapv (fn [[_ url title]] {:url url :title (str/trim (or title ""))})))
        snippets (->> (re-seq snippet-rx (or html ""))
                      (mapv (fn [[_ s]] (strip-tags s))))]
    (->> (map vector links (concat snippets (repeat "")))
         (take n)
         (mapv (fn [[l s]] (assoc l :snippet s))))))

(defn run
  "Tool entry-point. `args` shape: {:query <string> :num_results <number>?}.
   Returns `{:results [{:url :title :snippet} ...]}` on success, or
   `{:error <string>}` on failure / blank query."
  [args _request]
  (let [query (str/trim (str (or (:query args) (get args "query") "")))
        raw-n (or (:num_results args) (get args "num_results") 5)
        n (-> (try (long raw-n) (catch Exception _ 5))
              (max 1)
              (min 10))]
    (if (str/blank? query)
      {:error "query is required"}
      (try
        (let [resp (http/post "https://lite.duckduckgo.com/lite/"
                              {:headers {"User-Agent" "Mozilla/5.0 (compatible; Pythia/1.0)"
                                         "Content-Type" "application/x-www-form-urlencoded"
                                         "Accept" "text/html"}
                               :body (str "q=" (URLEncoder/encode query "UTF-8"))
                               :socket-timeout 15000
                               :connection-timeout 5000
                               :throw-exceptions false})
              status (:status resp)
              html (or (:body resp) "")
              results (parse-html html n)]
          (cond
            (not= 200 status)
            {:error (str "DuckDuckGo returned HTTP " status)}

            (empty? results)
            {:results [] :note (str "No results for: " query)}

            :else
            {:results results}))
        (catch Throwable t
          {:error (str "web_search failed: " (.getMessage t))})))))
