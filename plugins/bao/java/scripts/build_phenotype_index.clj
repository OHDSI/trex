#!/usr/bin/env clojure
;; Builds resources/phenotype-library/cohorts-index.edn from the
;; OHDSI/PhenotypeLibrary submodule at plugins/bao/phenotype-library/.
;;
;; Run from plugins/bao/java/:
;;   clojure -M scripts/build_phenotype_index.clj
;;
;; Re-run after bumping the submodule pin.

(require '[clojure.data.json :as json]
         '[clojure.edn :as edn]
         '[clojure.java.io :as io]
         '[clojure.pprint :as pp]
         '[clojure.string :as str])

(def submodule-root "../phenotype-library")
(def csv-path (str submodule-root "/inst/Cohorts.csv"))
(def cohorts-dir (str submodule-root "/inst/cohorts"))
(def out-path "resources/phenotype-library/cohorts-index.edn")

(defn parse-csv-line
  "Naive CSV split that handles \"quoted, fields\"."
  [line]
  (loop [chars (seq line) cur (StringBuilder.) in-q? false acc []]
    (cond
      (empty? chars)
      (conj acc (.toString cur))

      (and (= \" (first chars))) (recur (rest chars) cur (not in-q?) acc)
      (and (not in-q?) (= \, (first chars))) (recur (rest chars) (StringBuilder.) false (conj acc (.toString cur)))
      :else (recur (rest chars) (.append cur (first chars)) in-q? acc))))

(defn read-csv [path]
  (with-open [r (io/reader path)]
    (let [lines (line-seq r)
          ;; strip BOM if present
          first-line (str/replace (first lines) #"^﻿" "")
          header (mapv #(str/replace % #"^\"|\"$" "") (parse-csv-line first-line))
          rows (rest lines)]
      (vec
        (for [line rows
              :when (not (str/blank? line))]
          (zipmap (map keyword header)
                  (mapv #(str/replace (or % "") #"^\"|\"$" "") (parse-csv-line line))))))))

(def domain-keys
  ["ConditionOccurrence" "Measurement" "Observation" "DrugExposure"
   "DrugEra" "ProcedureOccurrence" "VisitOccurrence" "Death"
   "DeviceExposure" "ConditionEra" "ObservationPeriod" "Specimen"
   "PayerPlanPeriod" "VisitDetail" "DoseEra"])

(defn entry-domains
  "Extract OMOP domains used in the cohort's PrimaryCriteria.CriteriaList."
  [body]
  (let [criteria (get-in body ["PrimaryCriteria" "CriteriaList"]) ]
    (->> criteria
         (mapcat keys)
         (filter (set domain-keys))
         distinct
         vec)))

(defn exit-strategy
  "Map EndStrategy shape to a short label."
  [body]
  (let [es (get body "EndStrategy")]
    (cond
      (nil? es) "end_of_continuous_observation"
      (contains? es "DateOffset") "fixed_duration"
      (contains? es "CustomEra") "continuous_drug"
      :else "custom")))

(defn concept-set-summary [cs]
  {:id (get cs "id")
   :name (get cs "name")
   :n-items (count (get-in cs ["expression" "items"]))})

(defn cohort-summary
  "Read a single Circe JSON body and return a structural summary."
  [cohort-id]
  (let [path (str cohorts-dir "/" cohort-id ".json")
        f (io/file path)]
    (when (and (.exists f) (pos? (.length f)))
      (try
        (let [body (json/read-str (slurp f))]
          {:entry-domains (entry-domains body)
           :n-primary-criteria (count (get-in body ["PrimaryCriteria" "CriteriaList"]))
           :n-inclusion-rules (count (get body "InclusionRules"))
           :n-concept-sets (count (get body "ConceptSets"))
           :concept-sets (mapv concept-set-summary (get body "ConceptSets"))
           :exit-strategy (exit-strategy body)
           :censor-criteria? (boolean (seq (get body "CensoringCriteria")))
           :primary-event-limit (get-in body ["PrimaryCriteria" "PrimaryCriteriaLimit" "Type"])
           :qualified-event-limit (get-in body ["QualifiedLimit" "Type"])
           :expression-limit (get-in body ["ExpressionLimit" "Type"])
           :body-path (str "cohorts/" cohort-id ".json")})
        (catch Exception e
          (println "WARN failed to parse" cohort-id ":" (.getMessage e))
          nil)))))

(defn parse-tags [s]
  (when-not (str/blank? s)
    (->> (str/split s #",\s*")
         (remove str/blank?)
         vec)))

(defn build-row [row]
  (let [id (:cohortId row)
        circe? (= "1" (:isCirceJson row))]
    (when (and circe? (not (str/blank? id)))
      (let [summary (cohort-summary id)]
        (when summary
          (merge
            {:id (Long/parseLong id)
             :name (:cohortName row)
             :name-long (:cohortNameLong row)
             :description (:logicDescription row)
             :hashtag (:hashTag row)
             :tags (parse-tags (:hashTag row))
             :status (:status row)
             :added-version (:addedVersion row)
             :librarian (:librarian row)
             :forum-post (:ohdsiForumPost row)
             :reference-concept-ids (:recommendedReferentConceptIds row)}
            summary))))))

(defn -main [& _args]
  (println "Reading" csv-path)
  (let [rows (read-csv csv-path)
        _ (println "  " (count rows) "catalog rows")
        index (->> rows
                   (map build-row)
                   (remove nil?)
                   (sort-by :id)
                   vec)]
    (println "  " (count index) "cohorts indexed")
    (io/make-parents out-path)
    (with-open [w (io/writer out-path)]
      (binding [*out* w
                *print-length* nil
                *print-level* nil]
        ;; Compact print: one cohort per line for grep-friendliness.
        (println "[")
        (doseq [c index]
          (pr c)
          (println))
        (println "]")))
    (let [bytes (.length (io/file out-path))]
      (println "Wrote" out-path "(" (format "%.1f" (/ bytes 1024.0 1024.0)) "MB )"))))

(-main)
