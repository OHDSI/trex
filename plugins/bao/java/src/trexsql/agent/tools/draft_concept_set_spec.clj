(ns trexsql.agent.tools.draft-concept-set-spec
  "draft_concept_set_spec tool — server-side scratchpad that lets Pythia
   commit to clinical logic (\"Confirmatory T2DM treatment\" = metformin OR
   sulfonylurea OR insulin, RxNorm Ingredient, include descendants) BEFORE
   resolving any concept IDs.

   The two-stage pattern (logic → IDs) is the single biggest reducer of
   concept-ID hallucination. The recorded spec is echoed back verbatim
   plus a mandated next-step hint so Pythia visibly progresses through
   the workflow."
  (:require [clojure.string :as str]))

(defn- normalize-terms [terms]
  (cond
    (sequential? terms) (->> terms (map str) (remove str/blank?) vec)
    (string? terms) [(str/trim terms)]
    :else []))

(defn- vocabulary-hint
  "Suggest the OMOP-standard vocabulary that downstream search_concepts
   calls should use for this domain."
  [domain]
  (case (str domain)
    "Condition"    "SNOMED"
    "Drug"         "RxNorm (Ingredient)"
    "Procedure"    "SNOMED / CPT4"
    "Measurement"  "LOINC"
    "Observation"  "SNOMED / LOINC"
    "Visit"        "Visit"
    "Device"       "SNOMED"
    "Specimen"     "SNOMED"
    "(no domain hint)"))

(defn run
  "Tool entrypoint. Args:
     {:name string
      :clinical_terms [string ...]
      :vocabulary string?
      :domain string?
      :include_descendants boolean?
      :rationale string?}
   Returns the spec back plus a next-step instruction to call
   search_concepts for each clinical term."
  [args _req]
  (let [name (str (or (:name args) ""))
        terms (normalize-terms (:clinical_terms args))
        domain (some-> (:domain args) str)
        vocabulary (or (some-> (:vocabulary args) str)
                       (vocabulary-hint domain))
        include-desc (boolean (:include_descendants args))
        rationale (some-> (:rationale args) str)]
    (cond
      (str/blank? name)
      {:ok false :errors ["concept-set name is required (e.g. \"Confirmatory T2DM treatment\")"]}

      (empty? terms)
      {:ok false :errors ["clinical_terms is required (one or more clinical terms before concept-id resolution)"]}

      :else
      {:ok true
       :spec {:name name
              :clinical_terms terms
              :vocabulary vocabulary
              :domain domain
              :include_descendants include-desc
              :rationale rationale}
       :next_steps
       [(str "Call search_concepts for each of: " (str/join ", " (map pr-str terms))
             (when domain (str " (DOMAIN_ID=" domain ")"))
             ".")
        "For each search_concepts result, prefer hits with :confidence :high. If the chosen pick has :confidence :low or any :flags, call verify_concept_mapping(conceptId, expectedDomain) before adding it to the concept set."
        (str "When all terms are resolved, propose the concept set via "
             (if include-desc
               "embed_concept_set_in_cohort or create_standalone_concept_set with includeDescendants=true."
               "the appropriate concept-set tool."))]})))
