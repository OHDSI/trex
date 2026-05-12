(ns trexsql.agent.tools.get-reference-phenotype
  "get_reference_phenotype tool — returns the full Circe JSON body of a
   single OHDSI/PhenotypeLibrary cohort by id.

   Resolution order:
     1. On-disk path under BAO_PHENOTYPE_LIBRARY_PATH (env var) or, if unset,
        the default project-relative path
        `plugins/bao/phenotype-library/inst/cohorts/`.
     2. Remote fetch from raw.githubusercontent.com (pinned to v3.37.0).

   The body is returned as a parsed JSON object (Clojure data) plus the
   index summary, so Pythia gets both the structural overview and the
   fully-elaborated source it can mimic."
  (:require [clj-http.client :as http]
            [clojure.data.json :as json]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private library-tag "v3.37.0")
(def ^:private http-timeout-ms 12000)

(def ^:private cohorts-index
  (delay
    (try
      (when-let [resource (io/resource "phenotype-library/cohorts-index.edn")]
        (with-open [r (java.io.PushbackReader. (io/reader resource))]
          (edn/read r)))
      (catch Exception e
        (log/warn e "failed to load cohorts-index.edn")
        nil))))

(def ^:private index-by-id
  (delay
    (when-let [idx @cohorts-index]
      (into {} (map (juxt :id identity)) idx))))

(defn- on-disk-roots []
  (->> [(System/getenv "BAO_PHENOTYPE_LIBRARY_PATH")
        "plugins/bao/phenotype-library/inst/cohorts"
        "../phenotype-library/inst/cohorts"]
       (remove str/blank?)
       (distinct)))

(defn- read-from-disk [cohort-id]
  (some (fn [root]
          (let [f (io/file root (str cohort-id ".json"))]
            (when (and (.exists f) (pos? (.length f)))
              (try
                (slurp f)
                (catch Exception e
                  (log/debug e "could not read" (.getPath f))
                  nil)))))
        (on-disk-roots)))

(defn- read-from-github [cohort-id]
  (try
    (let [url (str "https://raw.githubusercontent.com/OHDSI/PhenotypeLibrary/"
                   library-tag "/inst/cohorts/" cohort-id ".json")
          resp (http/get url {:throw-exceptions false
                              :socket-timeout http-timeout-ms
                              :connection-timeout http-timeout-ms})]
      (when (= 200 (:status resp))
        (:body resp)))
    (catch Exception e
      (log/warn e "github fetch failed for cohort" cohort-id)
      nil)))

(defn run
  "Tool entrypoint. Args: {:cohortId 1234}."
  [args _req]
  (let [raw (:cohortId args)
        id (cond (number? raw) (long raw)
                 (string? raw) (try (Long/parseLong (str/trim raw)) (catch Exception _ nil))
                 :else nil)]
    (cond
      (nil? id)
      {:error "cohortId is required (numeric)"}

      :else
      (let [meta (get @index-by-id id)
            text (or (read-from-disk id) (read-from-github id))]
        (cond
          (nil? text)
          {:error (str "cohort " id " not found on disk or via GitHub")
           :tag library-tag}

          :else
          (let [body (try (json/read-str text :key-fn keyword)
                          (catch Exception e
                            (log/warn e "json parse failed for" id)
                            nil))]
            {:cohortId id
             :tag library-tag
             :name (:name meta)
             :description (:description meta)
             :status (:status meta)
             :tags (:tags meta)
             :summary (when meta
                        (select-keys meta
                                     [:entry-domains :n-primary-criteria
                                      :n-inclusion-rules :n-concept-sets
                                      :concept-sets :exit-strategy
                                      :censor-criteria? :primary-event-limit
                                      :expression-limit]))
             :body body
             :raw-json (when (nil? body) text)
             :url (str "https://github.com/OHDSI/PhenotypeLibrary/blob/"
                       library-tag "/inst/cohorts/" id ".json")}))))))
