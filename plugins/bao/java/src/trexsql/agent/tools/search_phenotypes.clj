(ns trexsql.agent.tools.search-phenotypes
  "search_phenotypes tool — queries PheKB, OHDSI Forums (Discourse), and the
   bundled OHDSI Phenotype Library (v3.37.0) in parallel, merges results,
   returns up to 5 hits per source.

   The Phenotype Library backend now reads a pre-built EDN index built by
   `scripts/build_phenotype_index.clj` from the OHDSI/PhenotypeLibrary
   submodule. Each hit carries a `:circe-summary` (entry domains, criteria
   counts, concept-set list, exit strategy) so Pythia can mimic canonical
   patterns without a follow-up `get_reference_phenotype` fetch."
  (:require [clj-http.client :as http]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private per-source-limit 5)
(def ^:private http-timeout-ms 12000)

(defn- match-all-terms?
  "Case-insensitive: every word in `query` appears somewhere in `text`."
  [query text]
  (let [t (str/lower-case (or text ""))
        terms (->> (str/split (str/lower-case (or query "")) #"\s+")
                   (remove str/blank?))]
    (and (seq terms)
         (every? #(str/includes? t %) terms))))

(def ^:private cohorts-index
  (delay
    (try
      (if-let [resource (io/resource "phenotype-library/cohorts-index.edn")]
        (with-open [r (java.io.PushbackReader. (io/reader resource))]
          (edn/read r))
        (do (log/warn "phenotype-library/cohorts-index.edn not found on classpath")
            []))
      (catch Exception e
        (log/warn e "failed to load cohorts-index.edn")
        []))))

(defn- status-rank
  "Sort accepted/peer-reviewed cohorts ahead of pending/withdrawn."
  [status]
  (case (or status "")
    "Accepted" 0
    "Pending peer review" 1
    "Pending" 2
    "Prediction" 3
    "Withdrawn" 9
    "Deprecated" 9
    5))

(defn- search-phenotype-library [query]
  (try
    (let [hits (->> @cohorts-index
                    (filter (fn [c]
                              (or (match-all-terms? query (:name c))
                                  (match-all-terms? query (:name-long c))
                                  (match-all-terms? query (:description c))
                                  (match-all-terms? query (:hashtag c)))))
                    (sort-by (juxt #(status-rank (:status %)) :id))
                    (take per-source-limit))]
      (mapv (fn [c]
              {:source "OHDSI Phenotype Library"
               :title (:name c)
               :description (:description c)
               :url (str "https://github.com/OHDSI/PhenotypeLibrary/blob/main/inst/cohorts/"
                         (:id c) ".json")
               :cohort-id (:id c)
               :status (:status c)
               :tags (:tags c)
               :circe-summary {:entry-domains (:entry-domains c)
                               :n-primary-criteria (:n-primary-criteria c)
                               :n-inclusion-rules (:n-inclusion-rules c)
                               :n-concept-sets (:n-concept-sets c)
                               :concept-sets (:concept-sets c)
                               :exit-strategy (:exit-strategy c)
                               :censor-criteria? (:censor-criteria? c)
                               :primary-event-limit (:primary-event-limit c)
                               :expression-limit (:expression-limit c)}
               :get-full-body-hint (str "Call get_reference_phenotype with cohortId=" (:id c)
                                        " to fetch the full Circe JSON.")})
            hits))
    (catch Exception e
      (log/warn e "phenotype-library lookup failed")
      [])))

(defn- search-phekb [query]
  (try
    (let [resp (http/get "https://phekb.org/services/phenotypes/views/phenotype_table.json"
                         {:query-params {:display_id "services_1"}
                          :as :json
                          :throw-exceptions false
                          :socket-timeout http-timeout-ms
                          :connection-timeout http-timeout-ms})
          rows (or (:body resp) [])
          hits (->> rows
                    (filter (fn [row]
                              (let [text (str (get row :title) " " (get row :description))]
                                (match-all-terms? query text))))
                    (take per-source-limit))]
      (mapv (fn [row]
              {:source "PheKB"
               :title (or (:title row) "Untitled")
               :description (or (:description row) "")
               :url (or (:url row) "https://phekb.org")})
            hits))
    (catch Exception e
      (log/warn e "phekb lookup failed")
      [])))

(defn- search-discourse [query]
  (try
    (let [resp (http/get "https://forums.ohdsi.org/search.json"
                         {:query-params {:q query}
                          :as :json
                          :throw-exceptions false
                          :socket-timeout http-timeout-ms
                          :connection-timeout http-timeout-ms})
          topics (or (get-in resp [:body :topics]) [])
          posts  (or (get-in resp [:body :posts]) [])
          post-by-topic (into {} (for [p posts] [(:topic_id p) p]))
          hits (->> topics
                    (take per-source-limit)
                    (map (fn [topic]
                           (let [post (post-by-topic (:id topic))]
                             {:source "OHDSI Forums"
                              :title (:title topic)
                              :description (or (:blurb post) "")
                              :url (str "https://forums.ohdsi.org/t/"
                                        (:slug topic) "/" (:id topic))}))))]
      (vec hits))
    (catch Exception e
      (log/warn e "discourse lookup failed")
      [])))

(defn run
  "Tool entrypoint. Args: {:query \"clinical condition\"}."
  [args _req]
  (let [query (str (or (:query args) ""))]
    (if (str/blank? query)
      {:results [] :note "empty query"}
      (let [all (concat (search-phenotype-library query)
                        (search-phekb query)
                        (search-discourse query))]
        {:results (vec all)}))))
