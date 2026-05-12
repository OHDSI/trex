(ns trexsql.agent.tools
  "Tool registry for the cohort design agent.
   Phase A tools mirror AtlasNeo:
     - search_concepts   (server-side)
     - search_phenotypes (server-side)
     - add_criterion     (client-side, server stub)
     - add_criteria      (client-side, server stub)")

(def domain-enum
  ["Condition" "Drug" "Procedure" "Measurement"
   "Observation" "Visit" "Device" "Specimen"])

(def operator-enum ["gt" "gte" "lt" "lte" "eq" "between"])

(def criterion-schema
  {:type "object"
   :properties {:conceptId          {:type "number" :description "OMOP concept ID"}
                :conceptName        {:type "string" :description "Human-readable concept name"}
                :domain             {:type "string" :enum domain-enum :description "OMOP domain"}
                :group              {:type "string" :enum ["inclusion" "exclusion"]}
                :includeDescendants {:type "boolean"}
                :operator           {:type "string" :enum operator-enum
                                     :description "Measurement value operator (only for Measurement domain)"}
                :value              {:type "number" :description "Threshold value (only for Measurement domain)"}
                :value2             {:type "number" :description "Upper bound for between operator"}}
   :required ["conceptId" "conceptName" "domain" "group" "includeDescendants"]})

(def concept-ref-schema
  "A concept reference used for entry/exit/censor events and concept-set items."
  {:type "object"
   :properties {:conceptId          {:type "number"}
                :conceptName        {:type "string"}
                :domain             {:type "string" :enum domain-enum}
                :includeDescendants {:type "boolean"}
                :isExcluded         {:type "boolean" :description "Optional exclusion flag for concept-set items"}}
   :required ["conceptId" "conceptName" "domain"]})

(def temporal-window-schema
  {:type "object"
   :properties {:priorStart {:type "number"}
                :priorEnd   {:type "number"}
                :postStart  {:type "number"}
                :postEnd    {:type "number"}}})

(def tool-specs
  "Phase A + Phase B tool specs in Bedrock Converse format."
  [;; ----- Phase A -----
   {:name "search_existing_cohorts"
    :description "Look up cohorts the user has already defined in this WebAPI instance. ALWAYS call this BEFORE building a new cohort from scratch — if a strong match exists (matchScore >= 6), suggest reusing it (by id+name) instead of redefining."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Clinical condition or phenotype to look for in existing cohort names/descriptions"}}
                   :required ["query"]}}

   {:name "search_existing_concept_sets"
    :description "Look up concept sets the user has already saved on the server. Call this BEFORE proposing create_standalone_concept_set, so you can suggest reusing an existing set when the user's request closely matches one (matchScore >= 6)."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Clinical concept group to search for in concept-set names/descriptions (e.g. 'statins', 'metformin', 'NSAIDs')."}
                                :limit {:type "number" :description "Max results to return (default 10)"}}
                   :required ["query"]}}

   {:name "search_existing_feature_analyses"
    :description "Look up feature analyses (covariate definitions) already saved on the server. ALWAYS call this BEFORE create_characterization (a characterization needs at least one feature analysis attached) and before create_feature_analysis (so you can suggest reusing one)."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Topic to search for in feature-analysis names/descriptions (e.g. 'demographics', 'condition era', 'drug exposure')."}
                                :limit {:type "number" :description "Max results to return (default 10)"}}
                   :required ["query"]}}

   {:name "search_existing_characterizations"
    :description "Look up characterizations already saved on the server. Call before proposing create_characterization to suggest reusing an existing one."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Topic to search for in characterization names/descriptions."}
                                :limit {:type "number" :description "Max results to return (default 10)"}}
                   :required ["query"]}}

   {:name "search_existing_pathways"
    :description "Look up pathway analyses already saved on the server. Call before proposing create_pathway."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Topic to search for in pathway-analysis names/descriptions (e.g. 'antidiabetic sequencing', 'opioid initiation')."}
                                :limit {:type "number" :description "Max results to return (default 10)"}}
                   :required ["query"]}}

   {:name "search_existing_incidence_rates"
    :description "Look up incidence-rate definitions already saved on the server. Call before proposing create_incidence_rate."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Topic to search for in incidence-rate names/descriptions."}
                                :limit {:type "number" :description "Max results to return (default 10)"}}
                   :required ["query"]}}

   {:name "search_phenotypes"
    :description "Search PheKB, OHDSI Forums, and the OHDSI Phenotype Library (v3.37.0) for validated phenotype definitions. Call after search_existing_cohorts when no existing cohort matches. Each Phenotype Library hit includes a `:circe-summary` (entry domains, # primary criteria, # inclusion rules, concept-set list, exit strategy) — use it to mimic canonical OHDSI patterns directly. When a hit is the right template and you want the full Circe JSON to copy concept-set IDs, criteria shapes, or temporal logic verbatim, follow up with `get_reference_phenotype(cohortId)`."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Clinical condition or phenotype to search for"}}
                   :required ["query"]}}

   {:name "get_reference_phenotype"
    :description "Fetch the full Circe JSON body of a single OHDSI Phenotype Library cohort by id. Use this AFTER search_phenotypes returns a hit you want to study or mirror in detail (concept-set members, criteria shapes, temporal windows). Returns the parsed Circe expression plus the catalog metadata (status, tags, contributors)."
    :side :server
    :input-schema {:type "object"
                   :properties {:cohortId {:type "number" :description "Phenotype Library cohort id (the numeric `:cohort-id` returned in a search_phenotypes hit)."}}
                   :required ["cohortId"]}}

   {:name "validate_circe"
    :description "Compile a draft Circe cohort-expression JSON to SQL via WebAPI to confirm it is structurally valid. Call this BEFORE issuing a non-trivial cohort proposal so you can self-correct compile errors. Returns {:ok true :sql \"<rendered SQL>\"} on success or {:ok false :errors [...]} on failure. On error, fix the expression and re-validate (max 2 retries) before proposing. Pass `expression` as either a JSON string or a parsed object."
    :side :server
    :input-schema {:type "object"
                   :properties {:expression {:type ["string" "object"]
                                             :description "The draft Circe CohortExpression — either a JSON string or the equivalent JSON object. Must contain at minimum a PrimaryCriteria.CriteriaList."}}
                   :required ["expression"]}}

   {:name "search_ohdsi_book"
    :description "Search The Book of OHDSI (2nd Edition) for canonical guidance on OMOP CDM, cohort definition, study design, washout/exit/censoring patterns, vocabularies, and methodology. Returns BM25-ranked passages with chapter, section, snippet, and URL. Call this for ANY methodology question (\"how do I handle washout\", \"what's the OHDSI exit-strategy convention\", \"explain incidence rate denominators\") and cite the chapter/section in your reply."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Methodology question or topic, e.g. \"exit strategy continuous drug exposure\" or \"index date washout\"."}
                                :k     {:type "number" :description "Number of passages to return (default 3, max 10)."}}
                   :required ["query"]}}

   {:name "web_search"
    :description "Search the open web (DuckDuckGo) for clinical guidelines, published literature, OHDSI documentation, drug-class definitions, etc. Use sparingly: prefer local lookups (search_concepts, search_phenotypes, search_existing_*) for things in the OMOP vocabulary or already-saved artifacts. Returns top-N results with title, URL, and snippet."
    :side :server
    :input-schema {:type "object"
                   :properties {:query       {:type "string"
                                              :description "What to search for. Use specific terms; for clinical phenotype validation include 'OHDSI', 'OMOP', 'PheKB', or 'phenotype' to bias toward relevant sources."}
                                :num_results {:type "number"
                                              :description "Number of results to return (default 5, max 10)."}}
                   :required ["query"]}}

   {:name "get_artifact"
    :description "Fetch the FULL editable content of a saved artifact by kind + id. Use this BEFORE proposing edits to an existing artifact so you reason about its current state instead of overwriting blindly. Mandatory when the user is asking to modify the artifact currently open on screen — the conversation system message tells you what's open. Returns the full WebAPI definition under :artifact (or :error)."
    :side :server
    :input-schema {:type "object"
                   :properties {:kind {:type "string"
                                       :enum ["cohort" "concept_set" "feature_analysis"
                                              "characterization" "pathway" "incidence_rate"]
                                       :description "Artifact type. Use the same kind reported in the current-context system message."}
                                :id   {:type "number"
                                       :description "Artifact id. For 'open artifact' use the id from the current-context block; for cross-referenced artifacts use the id from a search_existing_* result."}}
                   :required ["kind" "id"]}}

   {:name "search_concepts"
    :description "Search OMOP standard concepts in the local vocabulary by query and optional domain filter. Returns up to 15 Standard Concepts. Each result carries a `:confidence` (`:high|:medium|:low`) and optional `:flags` listing concrete concerns (vocabulary-spread, ICD↔SNOMED divergence, weak-name-match). The top-level `:ambiguity` summarizes the hit set and warns about cross-vocabulary divergence. When picking a `:low`-confidence concept or any with flags, call `verify_concept_mapping` to re-check before adding it to a proposal."
    :side :server
    :input-schema {:type "object"
                   :properties {:query  {:type "string"}
                                :domain {:type "string" :enum domain-enum}}
                   :required ["query"]}}

   {:name "draft_concept_set_spec"
    :description "Record a concept-set SPEC (clinical name, list of clinical terms, target vocabulary, descendant policy) BEFORE any concept-id resolution. Use this for any non-trivial concept set as the first step of the two-stage pattern: commit to logic, then resolve IDs. Returns the spec back plus an explicit next_steps list of search_concepts calls to make. Skip for single-concept embeds where there is nothing to disambiguate."
    :side :server
    :input-schema {:type "object"
                   :properties {:name           {:type "string" :description "Clinical name for the concept set, e.g. 'Confirmatory T2DM treatment'."}
                                :clinical_terms {:type "array" :items {:type "string"}
                                                 :description "One or more clinical terms (e.g. ['metformin', 'sulfonylurea', 'insulin'])."}
                                :domain         {:type "string" :enum domain-enum}
                                :vocabulary     {:type "string" :description "Optional vocabulary hint (SNOMED, RxNorm, LOINC). Inferred from domain if omitted."}
                                :include_descendants {:type "boolean"}
                                :rationale      {:type "string" :description "Optional one-line clinical rationale."}}
                   :required ["name" "clinical_terms"]}}

   {:name "verify_concept_mapping"
    :description "Look up a single OMOP concept by id and check it against an expected domain and/or vocabulary. Use AFTER picking a concept from search_concepts when its `:confidence` is `:low` or when it carries `:flags`, AND for any concept id you used from your own knowledge (the limited-vocabulary fallback list). Returns {:ok :concept :issues [...]} so you can swap out a wrong pick before proposing."
    :side :server
    :input-schema {:type "object"
                   :properties {:conceptId          {:type "number" :description "OMOP concept id to verify."}
                                :expectedDomain     {:type "string" :enum domain-enum}
                                :expectedVocabulary {:type "string" :description "Expected vocabulary (e.g. SNOMED, RxNorm, LOINC). Substring match."}}
                   :required ["conceptId"]}}

   {:name "get_cohort_generation_summary"
    :description "Pull a saved cohort's generation status and headline person/record counts on a given source. Use this AFTER the user has generated a cohort, when they ask whether the cohort is sensible, healthy, or as expected. Returns {:summary :interpretation} — the interpretation flags zero-population or very-low-population cases and points at the next diagnostic step. Source key defaults to the agent's session source."
    :side :server
    :input-schema {:type "object"
                   :properties {:cohortId  {:type "number" :description "Saved cohort id from search_existing_cohorts."}
                                :sourceKey {:type "string" :description "Optional source key (e.g. 'EUNOMIA'). Defaults to the chat session's source."}}
                   :required ["cohortId"]}}

   {:name "summarise_attrition"
    :description "Pull per-inclusion-rule person counts and identify rules that drop ≥90% of subjects in one step (likely too restrictive) or eliminate everyone (broken concept set). Use this AFTER get_cohort_generation_summary when the population is lower than expected — surfaces WHICH inclusion rule is the bottleneck."
    :side :server
    :input-schema {:type "object"
                   :properties {:cohortId  {:type "number"}
                                :sourceKey {:type "string"}}
                   :required ["cohortId"]}}

   {:name "get_cohort_overlap"
    :description "Pairwise overlap between 2+ generated cohorts on a source. Use when comparing target vs. comparator populations or checking whether two phenotypes are redundant. Flags near-total overlap (likely redundant) and near-zero overlap (likely too disjoint for a comparator design)."
    :side :server
    :input-schema {:type "object"
                   :properties {:cohortIds {:type "array" :items {:type "number"}
                                            :description "2+ saved cohort ids."}
                                :sourceKey {:type "string"}}
                   :required ["cohortIds"]}}

   {:name "search_ohdsi_studies"
    :description "On-demand search across the ~187 repos in the public `ohdsi-studies` GitHub organization (network studies, study packages, protocols). Use when the user asks about a published OHDSI study, a network protocol, or wants a template for a new study. Returns repo name, description, URL, stars, and topics. Uses GitHub's search API; set GITHUB_TOKEN to raise rate limits."
    :side :server
    :input-schema {:type "object"
                   :properties {:query {:type "string" :description "Study topic, condition, or method name (e.g. 'covid vaccine safety', 'antidepressant comparative effectiveness')."}}
                   :required ["query"]}}

   {:name "add_criterion"
    :description "Propose adding one criterion to the cohort. The user sees a confirmation card and accepts or rejects."
    :side :client
    :input-schema criterion-schema}

   {:name "add_criteria"
    :description "Propose adding multiple criteria to the cohort with AND/OR logic. ALWAYS provide a `name` describing the rule (e.g. \"On metformin or sulfonylurea\", \"Excludes pregnancy\"); never omit it. Prefer add_inclusion_rule when cardinality or temporal constraints are needed."
    :side :client
    :input-schema {:type "object"
                   :properties {:name  {:type "string" :description "Short, human-readable label for this group (REQUIRED). E.g. 'Confirmatory T2DM treatment', 'Exclude Type 1 DM'."}
                                :group {:type "string" :enum ["inclusion" "exclusion"]}
                                :logic {:type "string" :enum ["AND" "OR"]}
                                :items {:type "array" :items criterion-schema}}
                   :required ["name" "group" "logic" "items"]}}

   ;; ----- Phase B (ATLAS v3.0 cohort model) -----
   {:name "set_entry_event"
    :description "Set the cohort's primary qualifying entry event. Replaces any existing entry event."
    :side :client
    :input-schema concept-ref-schema}

   {:name "set_observation_window"
    :description "Set the prior + post observation window (in days) around the entry event. priorDays = days of continuous observation required BEFORE entry; postDays = days of continuous observation required AFTER entry."
    :side :client
    :input-schema {:type "object"
                   :properties {:priorDays {:type "number"}
                                :postDays  {:type "number"}}
                   :required ["priorDays" "postDays"]}}

   {:name "add_exit_criterion"
    :description "Define how a patient exits the cohort. Strategy: end_of_observation = end of continuous observation period; fixed_duration = N days after entry; continuous_drug = persistence-window-driven exit; custom_event = exit on a clinical event."
    :side :client
    :input-schema {:type "object"
                   :properties {:strategy {:type "string" :enum ["end_of_observation" "fixed_duration" "continuous_drug" "custom_event"]}
                                :offset    {:type "number" :description "Days offset (for fixed_duration and continuous_drug)"}
                                :dateField {:type "string" :enum ["START_DATE" "END_DATE"] :description "Anchor for offset"}
                                :persistenceWindow {:type "number" :description "Gap days between exposures for continuous_drug"}
                                :surveillanceWindow {:type "number" :description "Trailing days after final exposure for continuous_drug"}
                                :concept   (assoc concept-ref-schema :description "Concept defining the exit event (for continuous_drug or custom_event)")}
                   :required ["strategy"]}}

   {:name "set_censor_event"
    :description "Add a censoring criterion that ends a patient's time-at-risk when the event occurs."
    :side :client
    :input-schema concept-ref-schema}

   {:name "create_standalone_concept_set"
    :description "Create a NEW reusable concept set on the server via WebAPI. This is the ONLY way pythia creates concept sets. The host persists it, then: if the user has a cohort open, attaches the concept set to that cohort and stays in the cohort builder; otherwise navigates to the concept-set editor. We deliberately do NOT support cohort-local (in-line) concept sets — every set is reusable across cohorts. Use a clinical, descriptive name (e.g. 'Statins', 'Inhaled corticosteroids', 'Type 2 Diabetes diagnoses')."
    :side :client
    :input-schema {:type "object"
                   :properties {:name        {:type "string" :description "Concept set name (REQUIRED). Clinical and descriptive."}
                                :description {:type "string" :description "Optional one-line description"}
                                :items       {:type "array" :items concept-ref-schema}}
                   :required ["name" "items"]}}

   {:name "navigate_to"
    :description "Suggest moving the user to a different view in ATLAS. The user sees an approval card and can accept (navigate) or reject (stay). Always include a one-sentence reason in your reply text so the user understands why the navigation is helpful. Each `view` accepts a specific set of params — pass only the params listed for that view."
    :side :client
    :input-schema {:type "object"
                   :properties {:view    {:type "string"
                                          :enum ["home"
                                                 "cohorts" "cohort-new" "cohort-edit"
                                                 "concepts" "concept-detail"
                                                 "datasources"
                                                 "profiles" "profile-view"
                                                 "feature-analyses" "feature-analysis-new" "feature-analysis-edit"
                                                 "characterizations" "characterization-new" "characterization-edit"
                                                 "pathways" "pathway-new" "pathway-edit" "pathway-results"
                                                 "incidence-rates" "incidence-rate-new" "incidence-rate-edit"]
                                          :description "Closed list of route names. cohort-edit/feature-analysis-edit/characterization-edit/pathway-edit/incidence-rate-edit need {id}. concept-detail needs {sourceKey, conceptId}. profile-view needs {sourceKey, personId}. datasources optionally takes {sourceKey}. pathway-results needs {id, executionId}. Other views take no params."}
                                :id          {:type "number" :description "Resource id for *-edit views"}
                                :sourceKey   {:type "string"}
                                :conceptId   {:type "number"}
                                :personId    {:type "number"}
                                :executionId {:type "number"}
                                :reason      {:type "string" :description "One short sentence describing WHY this navigation is useful — shown on the approval card."}}
                   :required ["view"]}}

   {:name "add_inclusion_rule"
    :description "Add an inclusion rule: a named group of criteria with AND/OR logic and optional cardinality (AT_LEAST/AT_MOST count) or temporal window. Prefer this over add_criteria when the model needs cardinality or temporal constraints."
    :side :client
    :input-schema {:type "object"
                   :properties {:name        {:type "string"}
                                :description {:type "string"}
                                :logicType   {:type "string" :enum ["ALL" "ANY" "AT_LEAST" "AT_MOST"]}
                                :count       {:type "number" :description "Required for AT_LEAST and AT_MOST"}
                                :temporalWindow temporal-window-schema
                                :events      {:type "array" :items criterion-schema}}
                   :required ["name" "logicType" "events"]}}

   ;; ----- Analysis-type creation (client-side, server-persisted via WebAPI) -----

   {:name "create_feature_analysis"
    :description "Persist a NEW feature analysis (covariate definition) on the server. The user sees an approval card; on accept, ATLAS navigates to the editor. `type` controls the design shape: PRESET (built-in OHDSI preset id as a string), CRITERIA_SET (JSON object with conceptSets + criteria), or CUSTOM_FE (raw SQL string). Pass `design` accordingly."
    :side :client
    :input-schema {:type "object"
                   :properties {:name        {:type "string" :description "Clinical, descriptive name. REQUIRED."}
                                :description {:type "string"}
                                :type        {:type "string" :enum ["PRESET" "CRITERIA_SET" "CUSTOM_FE"]
                                              :description "PRESET for built-in feature library entries; CRITERIA_SET for custom criteria sets; CUSTOM_FE for raw SQL."}
                                :domain      {:type "string"}
                                :statType    {:type "string" :enum ["PREVALENCE" "DISTRIBUTION"]}
                                :design      {:description "Type-dependent: string for PRESET/CUSTOM_FE; object for CRITERIA_SET."}}
                   :required ["name" "type"]}}

   {:name "create_characterization"
    :description "Persist a NEW cohort characterization on the server. REQUIRES at least one cohort and at least one feature analysis attached. Before calling this you MUST have called search_existing_cohorts and search_existing_feature_analyses to find the IDs. If neither result has matches, do NOT call this — instead, propose creating the missing prerequisite (cohort first, then feature analysis) and emit a navigate_to(view='cohort-new' or 'feature-analysis-new')."
    :side :client
    :input-schema {:type "object"
                   :properties {:name             {:type "string" :description "Clinical, descriptive name. REQUIRED."}
                                :description      {:type "string"}
                                :cohorts          {:type "array"
                                                   :description "REQUIRED. One or more cohorts to characterize. Each item is {id, name} pulled from search_existing_cohorts results."
                                                   :items {:type "object"
                                                           :properties {:id {:type "number"}
                                                                        :name {:type "string"}}
                                                           :required ["id" "name"]}}
                                :featureAnalyses  {:type "array"
                                                   :description "REQUIRED. One or more feature analyses to apply. Each item is {id, name} pulled from search_existing_feature_analyses results."
                                                   :items {:type "object"
                                                           :properties {:id {:type "number"}
                                                                        :name {:type "string"}}
                                                           :required ["id"]}}}
                   :required ["name" "cohorts" "featureAnalyses"]}}

   {:name "create_pathway"
    :description "Persist a NEW pathway analysis on the server. Only `name` is required; sensible OHDSI defaults are applied for the rest (combinationWindow=30, minCellCount=5, maxDepth=5, allowRepeats=false). Pass target/event cohort references when the user has named them."
    :side :client
    :input-schema {:type "object"
                   :properties {:name              {:type "string" :description "Clinical, descriptive name. REQUIRED."}
                                :description       {:type "string"}
                                :targetCohorts     {:type "array"
                                                    :items {:type "object"
                                                            :properties {:id {:type "number"} :name {:type "string"}}
                                                            :required ["id" "name"]}}
                                :eventCohorts      {:type "array"
                                                    :items {:type "object"
                                                            :properties {:id {:type "number"} :name {:type "string"}}
                                                            :required ["id" "name"]}}
                                :combinationWindow {:type "number" :description "Days for collapsing concurrent events (default 30)"}
                                :minCellCount      {:type "number" :description "Minimum cell count to display (default 5)"}
                                :maxDepth          {:type "number" :description "Max pathway depth, 1-10 (default 5)"}
                                :allowRepeats      {:type "boolean" :description "Whether the same event can repeat in a pathway (default false)"}}
                   :required ["name"]}}

   ;; ----- Edit-existing tools (client-side, partial merge into open editor) -----
   ;;
   ;; Use these instead of create_* when an artifact is already open (the
   ;; current-context block in the system prompt tells you what's open).
   ;; The host merges the partial payload into the in-memory editor state
   ;; and lets the user save through the existing editor flow. ALL of these
   ;; require the artifact's `id` so the host knows which artifact to edit;
   ;; load the id from the current-context block (when the user is editing
   ;; the open artifact) or from a search_existing_* result.

   {:name "update_concept_set"
    :description "Apply a partial edit to an existing standalone concept set: rename, change description, append items, or replace items. Mutates the open editor; user clicks Save to persist. Use itemsToAdd to append (skips duplicate conceptIds), items to fully replace."
    :side :client
    :input-schema {:type "object"
                   :properties {:id          {:type "number" :description "Concept set id (REQUIRED)."}
                                :name        {:type "string"}
                                :description {:type "string"}
                                :items       {:type "array" :items concept-ref-schema
                                              :description "Full replace — overwrites the existing items array."}
                                :itemsToAdd  {:type "array" :items concept-ref-schema
                                              :description "Append-only — skips items whose conceptId already exists."}}
                   :required ["id"]}}

   {:name "update_feature_analysis"
    :description "Apply a partial edit to an existing feature analysis: rename, change description, change type/domain/statType, or replace the design payload. Mutates the open editor; user clicks Save to persist."
    :side :client
    :input-schema {:type "object"
                   :properties {:id          {:type "number" :description "Feature analysis id (REQUIRED)."}
                                :name        {:type "string"}
                                :description {:type "string"}
                                :type        {:type "string" :enum ["PRESET" "CRITERIA_SET" "CUSTOM_FE"]}
                                :domain      {:type "string"}
                                :statType    {:type "string" :enum ["PREVALENCE" "DISTRIBUTION"]}
                                :design      {:description "Type-dependent: string for PRESET/CUSTOM_FE; object for CRITERIA_SET. Replaces the existing design entirely."}}
                   :required ["id"]}}

   {:name "update_characterization"
    :description "Apply a partial edit to an existing characterization: rename, change description, replace or extend cohorts/featureAnalyses. Each cohort and feature-analysis ref is {id, name} from search_existing_* results."
    :side :client
    :input-schema {:type "object"
                   :properties {:id                   {:type "number" :description "Characterization id (REQUIRED)."}
                                :name                 {:type "string"}
                                :description          {:type "string"}
                                :cohorts              {:type "array"
                                                       :items {:type "object"
                                                               :properties {:id {:type "number"} :name {:type "string"}}
                                                               :required ["id" "name"]}
                                                       :description "Full replace."}
                                :cohortsToAdd         {:type "array"
                                                       :items {:type "object"
                                                               :properties {:id {:type "number"} :name {:type "string"}}
                                                               :required ["id" "name"]}
                                                       :description "Append-only."}
                                :featureAnalyses      {:type "array"
                                                       :items {:type "object"
                                                               :properties {:id {:type "number"} :name {:type "string"}}
                                                               :required ["id" "name"]}
                                                       :description "Full replace."}
                                :featureAnalysesToAdd {:type "array"
                                                       :items {:type "object"
                                                               :properties {:id {:type "number"} :name {:type "string"}}
                                                               :required ["id" "name"]}
                                                       :description "Append-only."}}
                   :required ["id"]}}

   {:name "update_pathway"
    :description "Apply a partial edit to an existing pathway analysis: rename, change description, replace or extend target/event cohorts, tweak combinationWindow / minCellCount / maxDepth / allowRepeats."
    :side :client
    :input-schema {:type "object"
                   :properties {:id                {:type "number" :description "Pathway id (REQUIRED)."}
                                :name              {:type "string"}
                                :description       {:type "string"}
                                :targetCohorts     {:type "array"
                                                    :items {:type "object"
                                                            :properties {:id {:type "number"} :name {:type "string"}}
                                                            :required ["id" "name"]}
                                                    :description "Full replace."}
                                :targetCohortsToAdd {:type "array"
                                                     :items {:type "object"
                                                             :properties {:id {:type "number"} :name {:type "string"}}
                                                             :required ["id" "name"]}
                                                     :description "Append-only."}
                                :eventCohorts      {:type "array"
                                                    :items {:type "object"
                                                            :properties {:id {:type "number"} :name {:type "string"}}
                                                            :required ["id" "name"]}
                                                    :description "Full replace."}
                                :eventCohortsToAdd {:type "array"
                                                    :items {:type "object"
                                                            :properties {:id {:type "number"} :name {:type "string"}}
                                                            :required ["id" "name"]}
                                                    :description "Append-only."}
                                :combinationWindow {:type "number"}
                                :minCellCount      {:type "number"}
                                :maxDepth          {:type "number"}
                                :allowRepeats      {:type "boolean"}}
                   :required ["id"]}}

   {:name "update_incidence_rate"
    :description "Apply a partial edit to an existing incidence-rate analysis: rename, change description, replace or extend target/outcome cohort ids, tweak timeAtRisk or studyWindow."
    :side :client
    :input-schema {:type "object"
                   :properties {:id              {:type "number" :description "Incidence-rate id (REQUIRED)."}
                                :name            {:type "string"}
                                :description     {:type "string"}
                                :targetIds       {:type "array" :items {:type "number"} :description "Full replace."}
                                :targetIdsToAdd  {:type "array"
                                                  :items {:type "object"
                                                          :properties {:id {:type "number"} :name {:type "string"}}
                                                          :required ["id"]}
                                                  :description "Append-only with optional display names."}
                                :outcomeIds      {:type "array" :items {:type "number"} :description "Full replace."}
                                :outcomeIdsToAdd {:type "array"
                                                  :items {:type "object"
                                                          :properties {:id {:type "number"} :name {:type "string"}}
                                                          :required ["id"]}
                                                  :description "Append-only with optional display names."}
                                :timeAtRisk      {:type "object"
                                                  :properties {:start {:type "object"
                                                                       :properties {:DateField {:type "string" :enum ["StartDate" "EndDate"]}
                                                                                    :Offset    {:type "number"}}
                                                                       :required ["DateField" "Offset"]}
                                                               :end   {:type "object"
                                                                       :properties {:DateField {:type "string" :enum ["StartDate" "EndDate"]}
                                                                                    :Offset    {:type "number"}}
                                                                       :required ["DateField" "Offset"]}}
                                                  :required ["start" "end"]}
                                :studyWindow     {:type "object"
                                                  :properties {:startDate {:type "string"}
                                                               :endDate   {:type "string"}}}}
                   :required ["id"]}}

   {:name "create_incidence_rate"
    :description "Persist a NEW incidence-rate analysis on the server. Only `name` is required; the time-at-risk window defaults to {start: StartDate +0, end: EndDate +0} which means 'from cohort start to cohort end'. Provide a custom timeAtRisk when the user describes a specific risk window (e.g., '365 days after exposure' → start: StartDate +0, end: StartDate +365)."
    :side :client
    :input-schema {:type "object"
                   :properties {:name        {:type "string" :description "Clinical, descriptive name. REQUIRED."}
                                :description {:type "string"}
                                :targetIds   {:type "array" :items {:type "number"} :description "Target cohort IDs (denominator)"}
                                :outcomeIds  {:type "array" :items {:type "number"} :description "Outcome cohort IDs (numerator)"}
                                :timeAtRisk  {:type "object"
                                              :properties {:start {:type "object"
                                                                   :properties {:DateField {:type "string" :enum ["StartDate" "EndDate"]}
                                                                                :Offset    {:type "number" :description "Days from the anchor date"}}
                                                                   :required ["DateField" "Offset"]}
                                                           :end   {:type "object"
                                                                   :properties {:DateField {:type "string" :enum ["StartDate" "EndDate"]}
                                                                                :Offset    {:type "number"}}
                                                                   :required ["DateField" "Offset"]}}
                                              :required ["start" "end"]}
                                :studyWindow {:type "object"
                                              :properties {:startDate {:type "string" :description "ISO date YYYY-MM-DD"}
                                                           :endDate   {:type "string" :description "ISO date YYYY-MM-DD"}}}}
                   :required ["name"]}}

   ;; ----- Ask the user (clarifying question) -----
   ;;
   ;; Resolved entirely in the browser: the chat panel renders option
   ;; buttons; the user's selection arrives as the next user message so
   ;; the model can act on it. Does NOT render an accept/reject card and
   ;; does NOT navigate; it just gates the next turn on a discrete choice.

   {:name "ask_user"
    :description "Ask the user a clarifying question with 2–4 discrete clickable options when the next action genuinely depends on their preference and the surrounding context can't disambiguate. Canonical case: the user is editing artifact X and asks to 'create a Y' — should you UPDATE X (repurpose the open editor) or CREATE Y as a new artifact (leaving X alone)? Other cases: pick which of multiple search-result matches the user means; confirm a potentially destructive change. Do NOT use for routine yes/no — only when the choice changes which tools you'd call. After calling this, write a brief one-line preamble and END YOUR TURN; do not call other tools. The user's selection arrives as the next user message so you can act on it."
    :side :client
    :input-schema {:type "object"
                   :properties {:question    {:type "string"
                                              :description "The question, phrased as one short sentence."}
                                :options     {:type "array"
                                              :description "2–4 mutually-exclusive options. List the recommended option first when applicable."
                                              :items {:type "object"
                                                      :properties {:id          {:type "string"
                                                                                  :description "Stable id; for your own disambiguation."}
                                                                   :label       {:type "string"
                                                                                 :description "1–5 word button text."}
                                                                   :description {:type "string"
                                                                                 :description "Optional one-line explanation of what choosing this does."}}
                                                      :required ["id" "label"]}}
                                :allowCustom {:type "boolean"
                                              :description "If true, also show an 'Other…' free-text option (default false)."}}
                   :required ["question" "options"]}}

   ;; ----- Plans -----
   ;;
   ;; Resolved entirely in the browser: the frontend mutates module-level
   ;; reactive state and auto-stubs the tool result. Unlike proposal tools,
   ;; these do NOT render an accept/reject card — they apply immediately.
   ;; They also do NOT terminate the turn (rule #12 in the prompt does not
   ;; apply); the model should continue with the first step's tool calls
   ;; in the same turn after creating the plan.

   {:name "create_plan"
    :description "Declare a multi-step plan for the user's request: an optional prose `document` describing goal/approach/success criteria, plus an ordered checklist of concrete `steps`. Use this for ANY analysis that needs 3+ artifacts or multiple phases (e.g. cohort + concept set + incidence-rate; phenotype validation across multiple sources; treatment-pattern study). For non-trivial plans pass a `document` field (3-5 sentences of markdown — goal, approach, key constraints, success criteria); the chat panel renders it as a collapsible 'Plan details' section above the steps. Trivial single-step requests skip create_plan and go straight to the proposal. Replaces any prior active plan. Does NOT end your turn — continue with the first step's tool calls in the same turn."
    :side :client
    :input-schema {:type "object"
                   :properties {:title    {:type "string" :description "Short, user-facing title, e.g. 'Run incidence rate for diabetes patients'."}
                                :document {:type "string"
                                           :description "Optional markdown narrative (3-5 sentences) covering goal, approach, prerequisites, and success criteria. Skip for trivial 1-2 step flows."}
                                :steps    {:type "array"
                                           :description "Ordered steps the user must walk through. Set linkedProposalKind on any step that maps to a proposal you will issue — the UI auto-marks the step 'done' when the user accepts that proposal, so you don't need to call update_plan_step after."
                                           :items {:type "object"
                                                   :properties {:id    {:type "string" :description "Stable id; pass to update_plan_step."}
                                                                :label {:type "string" :description "Short user-visible label, e.g. 'Create concept set for statins'."}
                                                                :description {:type "string" :description "Optional one-line clarification."}
                                                                :linkedProposalKind {:type "string"
                                                                                     :enum ["addEntryEvent" "addInclusionRule" "addConceptSet"
                                                                                            "setObservationPeriod" "setExitCriteria" "addCensoringCriterion"
                                                                                            "createStandaloneConceptSet" "createFeatureAnalysis"
                                                                                            "createCharacterization" "createPathway" "createIncidenceRate"
                                                                                            "navigate"]
                                                                                     :description "Optional. AgentProposal kind the host applies. When set, the UI auto-ticks this step the moment a matching proposal is accepted, so you don't need a follow-up update_plan_step."}
                                                                :linkedRoute {:type "string" :description "Optional ATLAS route name (matches the navigate_to view enum). Renders an 'Open' button on the step row."}}
                                                   :required ["id" "label"]}}}
                   :required ["title" "steps"]}}

   {:name "update_plan_step"
    :description "Update the status of one step on the active plan. Use when reasoning advances a step but you are NOT issuing a linked proposal (e.g. you finished a search-only step, decided a step is blocked, or want to mark a step in_progress before walking the user through it). DO NOT call this after issuing a proposal whose kind is linked to the step — the UI auto-ticks on acceptance, and a redundant call would briefly show 'done' before the proposal is even applied. Does NOT end your turn."
    :side :client
    :input-schema {:type "object"
                   :properties {:stepId {:type "string"}
                                :status {:type "string" :enum ["pending" "in_progress" "done" "blocked"]}}
                   :required ["stepId" "status"]}}])

(defn client-side-tool?
  "True if the tool is resolved client-side (UI presents an accept/reject card)."
  [tool-name]
  (boolean
    (some (fn [t] (and (= (:name t) tool-name) (= (:side t) :client)))
          tool-specs)))

(defn dispatch-server-tool
  "Dispatch a server-side tool call. Returns a Clojure map representing the
   tool result, suitable for serialisation into a Bedrock toolResult block."
  [tool-name args req]
  (case tool-name
    "search_concepts"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-concepts/run)]
      (f args req))

    "search_phenotypes"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-phenotypes/run)]
      (f args req))

    "get_reference_phenotype"
    (let [f (requiring-resolve 'trexsql.agent.tools.get-reference-phenotype/run)]
      (f args req))

    "validate_circe"
    (let [f (requiring-resolve 'trexsql.agent.tools.validate-circe/run)]
      (f args req))

    "search_ohdsi_book"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-ohdsi-book/run)]
      (f args req))

    "draft_concept_set_spec"
    (let [f (requiring-resolve 'trexsql.agent.tools.draft-concept-set-spec/run)]
      (f args req))

    "verify_concept_mapping"
    (let [f (requiring-resolve 'trexsql.agent.tools.verify-concept-mapping/run)]
      (f args req))

    "get_cohort_generation_summary"
    (let [f (requiring-resolve 'trexsql.agent.tools.get-cohort-generation-summary/run)]
      (f args req))

    "summarise_attrition"
    (let [f (requiring-resolve 'trexsql.agent.tools.summarise-attrition/run)]
      (f args req))

    "get_cohort_overlap"
    (let [f (requiring-resolve 'trexsql.agent.tools.get-cohort-overlap/run)]
      (f args req))

    "search_ohdsi_studies"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-ohdsi-studies/run)]
      (f args req))

    "search_existing_cohorts"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-existing-cohorts/run)]
      (f args req))

    "search_existing_concept_sets"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-concept-sets/run)]
      (f args req))

    "search_existing_feature_analyses"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-feature-analyses/run)]
      (f args req))

    "search_existing_characterizations"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-characterizations/run)]
      (f args req))

    "search_existing_pathways"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-pathways/run)]
      (f args req))

    "search_existing_incidence_rates"
    (let [f (requiring-resolve 'trexsql.agent.tools.search-incidence-rates/run)]
      (f args req))

    "get_artifact"
    (let [f (requiring-resolve 'trexsql.agent.tools.get-artifact/run)]
      (f args req))

    "web_search"
    (let [f (requiring-resolve 'trexsql.agent.tools.web-search/run)]
      (f args req))

    {:error (str "unknown server-side tool: " tool-name)}))
