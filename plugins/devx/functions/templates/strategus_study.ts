// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "strategus-study",
  name: "Strategus Study",
  description: "OHDSI observational study with Strategus + HADES",
  tech_stack: "r",
  dev_command: "",
  install_command: "",
  build_command: "",
  files: {
    "AI_RULES.md": `# Strategus Study Project

## Overview
This is an OHDSI Strategus study project for observational health research.
Based on the official [StrategusStudyRepoTemplate](https://github.com/ohdsi-studies/StrategusStudyRepoTemplate).
Use the \\\`/strategus-study\\\` skill for in-depth guidance on study design,
propensity score methodology, and module configuration.

## File Structure

### Core Scripts (Project Author)
- \\\`CreateStrategusAnalysisSpecification.R\\\` — Main analysis specification (Eunomia example — edit this first)
- \\\`CreateStrategusAnalysisSpecificationTcis.R\\\` — Alternative TCIS version for signal detection studies
- \\\`DownloadCohorts.R\\\` — Download cohorts from ATLAS WebAPI
- \\\`CreateResultsDataModel.R\\\` — Set up PostgreSQL results database schema
- \\\`EvidenceSynthesis.R\\\` — Meta-analysis across multiple sites
- \\\`UploadResults.R\\\` — Upload site results to shared database
- \\\`app.R\\\` — Shiny results viewer

### Site Participant Scripts
- \\\`StrategusCodeToRun.R\\\` — Execute the study on a CDM database
- \\\`ShareResults.R\\\` — Zip and SFTP results to study coordinator

### Documentation
- \\\`README.md\\\` — Study metadata (update from template)
- \\\`template_docs/UsingThisTemplate.md\\\` — Author guide
- \\\`template_docs/StudyExecution.md\\\` — Site participant execution guide

### Data
- \\\`inst/sampleStudy/\\\` — Sample study cohorts, negative controls, and specs (Eunomia + full sample)
- \\\`inst/sampleStudy/cohorts/\\\` — Cohort JSON definitions
- \\\`inst/sampleStudy/sql/\\\` — Cohort SQL definitions

## Customization Markers

Files use these markers to indicate what needs changing:
- \\\`# CUSTOMIZE:\\\` — Lines that MUST be modified for your study
- \\\`# DO NOT MODIFY\\\` — Shared infrastructure; edit only with explicit, documented reason

### DO NOT MODIFY bars — where they live

Each generated R file has an approximate position past which the code is
shared infrastructure rather than per-study config:

| File | DO NOT MODIFY bar | What's below |
|---|---|---|
| \\\`CreateStrategusAnalysisSpecification.R\\\` | line ~133 (\\\`# DO NOT MODIFY below unless you need to change module parameters\\\`) | Covariate settings, PS args (incl. \\\`estimator\\\`), match args, strata, outcome model, module wiring |
| \\\`CreateStrategusAnalysisSpecificationTcis.R\\\` | line ~109 (\\\`# Below the line - DO NOT MODIFY\\\`) | Same as above, TCIS edition — expanded for cross-product of target × comparator × indication |
| \\\`StrategusCodeToRun.R\\\` | line ~45 (\\\`# DO NOT MODIFY below this point\\\`) | Pipeline execution, logging, error handling |
| \\\`CreateResultsDataModel.R\\\` | line ~34 (\\\`# DO NOT MODIFY below\\\`) | Schema creation machinery |
| \\\`UploadResults.R\\\` | line ~34 (\\\`# DO NOT MODIFY below\\\`) | Upload helper calls |
| \\\`EvidenceSynthesis.R\\\` | line ~67 (\\\`# DO NOT MODIFY below\\\`) | Meta-analysis machinery |
| \\\`ShareResults.R\\\` | line ~19 (\\\`# DO NOT MODIFY BELOW THIS POINT\\\`) | Zip + SFTP upload |

### Crossing a DO NOT MODIFY bar

Most study configuration lives ABOVE these bars. But a few design-level
parameters — most importantly \\\`estimator = "att"\\\` in the PS config — live
BELOW the bar in shared infrastructure. You ARE allowed to edit below the bar
if and only if you're confident the default is wrong for this specific study.

When you do cross the bar, you MUST leave an audit comment directly above the
changed line (or block) in this format:

\\\`\\\`\\\`r
# OVERRIDE (DO-NOT-MODIFY zone): <date> — <short reason>
# Reason: <one sentence tying the change to the study design, e.g.,
#   "Research question targets population-average effect (policy), not ATT;
#    LEGEND-style pairwise design per Phase 1.5 decision">
# Alternative considered: <what would have happened without the override>
estimator = "overlap"  # was "att" — see override note above
\\\`\\\`\\\`

Rules:
- One audit block per crossing (a multi-line change below the bar = one block).
- No hand-waving reasons. "Because ATE is better" is not acceptable. Tie the
  change to a specific phase decision, study characteristic, or reference
  implementation.
- If you're editing multiple unrelated settings below the bar, write separate
  audit blocks.
- Never silently edit below the bar. A downstream reviewer must be able to
  \\\`grep "OVERRIDE (DO-NOT-MODIFY zone)"\\\` and find every deliberate deviation.

## Customization Checklist

1. **DownloadCohorts.R**: Set ATLAS baseUrl, cohort IDs, cohort names, output paths
2. **CreateStrategusAnalysisSpecification.R** (or Tcis variant):
 - Update cohort file paths (replace \\\`inst/sampleStudy/Eunomia/\\\` references)
 - Set study dates, time-at-risk windows
 - Define target/comparator/outcome cohort IDs
 - Set excluded covariate concept IDs for PS model
 - Enable/disable Strategus modules
3. **StrategusCodeToRun.R**: Set CDM connection details, schemas, output paths
4. **README.md**: Replace all placeholder metadata
5. **template_docs/StudyExecution.md**: Replace \\\`<YourNetworkStudyName>\\\` placeholders
6. **Results scripts** (CreateResultsDataModel.R, UploadResults.R, EvidenceSynthesis.R, app.R): Set PostgreSQL connection details

## Key Rules
- Always exclude target and comparator drugs from propensity score covariates
- Use **minimum 50** negative control outcomes for empirical calibration (≥100 preferred; Tian/Schuemie 2018 benchmark)
- Configure synthetic positive controls at RR 1.5, 2, 4 via \\\`synthesizePositiveControls()\\\`
- Run CohortDiagnostics before any estimation or prediction analysis
- Verify **per-covariate** |SMD| < 0.1 after propensity score adjustment (not aggregate)
- Hard-gate thresholds: preference-score equipoise < 50% in [0.3, 0.7] → abort. PS AUC ≥ 0.85 → abort (groups non-exchangeable).
- TAR must start at \\\`riskWindowStart ≥ 1\\\` (day 0 is the index day, unexposed by definition — including it creates immortal time)
- Strategus 1.5+ bundles all modules as R6 classes (\\\`CohortMethodModule$new()\\\`, etc.); external \\\`*Module\\\` repos are archived
- Remove the \\\`inst/sampleStudy\\\` folder before distributing your study

## Target Trial Protocol (fill in before generating the analysis spec)

Every Strategus parameter maps to a cell in this 7-component table (Hernán,
Wang, Leaf, *JAMA* 2022). Do not skip any cell; blanks mean the parameter is
under-specified.

| # | Component | Your answer |
|---|-----------|-------------|
| 1 | **Eligibility** (who qualifies?) | |
| 2 | **Treatment strategies** (drug A vs B, grace period?) | |
| 3 | **Assignment** (PS method + estimand — ATT or ATE?) | |
| 4 | **Follow-up start / time zero** (identical across arms) | |
| 5 | **Outcome** (phenotype + ascertainment + censoring) | |
| 6 | **Causal contrast** (ITT or per-protocol?) | |
| 7 | **Analysis plan** (pre-specified sensitivities) | |

**Intercurrent events (ICH E9(R1))** — pick a strategy for each, document in
the protocol:
- Treatment discontinuation: treatment-policy (ITT) / while-on-treatment (per-protocol) / composite
- Treatment switching: while-on-treatment (censor at switch) / composite
- Death before outcome: composite / treatment-policy
- Outcome before exposure: always excluded in eligibility

## Required Pre-Specified Sensitivity Analyses
Configure as separate \\\`createCmAnalysis()\\\` entries BEFORE running:
1. **E-value** for unmeasured confounding on the primary effect
2. **Alternative PS specification** (restricted covariate set)
3. **Alternative TAR windows** (ITT + on-treatment + on-treatment+30/180)
4. **Alternative prior-observation window** (365 vs 730 days)
5. Negative-control calibrated p-values + CIs (always on, not optional)

## Coordinator vs Site Ownership

Know who runs what before distributing the study. For a network study:

| File | Coordinator | Site |
|------|:-----------:|:----:|
| CreateStrategusAnalysisSpecification.R | ✓ | |
| DownloadCohorts.R | ✓ | |
| StrategusCodeToRun.R / ExecuteAnalyses.R | | ✓ |
| ShareResults.R (with sensitive-output review gate) | | ✓ |
| CreateResultsDataModel.R | ✓ | |
| UploadResults.R | ✓ | |
| EvidenceSynthesis.R (meta-analysis) | ✓ | |
| app.R (central Shiny) | ✓ | |

State this split explicitly in README.md so site contributors don't touch
coordinator scripts. See \\\`tutorial-strategus-study\\\` KB repo for the canonical
annotated example.

## Knowledge Base References
Use these KB repos for reference:
- \\\`strategus-study-template\\\` — Official OHDSI template structure
- \\\`tutorial-strategus-study\\\` — Annotated network-study coordinator-vs-site reference
- \\\`phenotype-library\\\` — 1100+ pre-defined cohort definitions
- \\\`strategus\\\` — Strategus framework API documentation
- \\\`cohort-method\\\` — CohortMethod module details (R6 API as of CM 6.0)
- \\\`self-controlled-case-series\\\` — SCCS module details (4 assumption-check fns in 6.0)
- \\\`book-of-ohdsi-2nd\\\` — Comprehensive methodology reference
- \\\`ehden-hmb\\\`, \\\`legendt2dm\\\`, \\\`reward\\\` — Example studies
`,

"CreateStrategusAnalysisSpecification.R": `################################################################################
# CreateStrategusAnalysisSpecification.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: Make sure you have downloaded your cohorts using
# DownloadCohorts.R and that those cohorts are stored in the "inst" folder
# of the project. This script is written to use the sample study cohorts
# located in "inst/sampleStudy/Eunomia" so you will need to modify this in
# the code below.
#
# See the Create analysis specifications section
# of the UsingThisTemplate.md for more details.
#
# More information about Strategus HADES modules can be found at:
# https://ohdsi.github.io/Strategus/reference/index.html#omop-cdm-hades-modules
#
# Use /strategus-study skill for detailed methodology guidance.
# ##############################################################################
library(dplyr)
library(Strategus)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: TIME-AT-RISK WINDOWS
# Change: Set risk windows appropriate for your study design
# Common designs:
#   On-treatment: start=1 from cohort start, end=0 at cohort end
#   Intent-to-treat (ITT): start=1 from cohort start, end=365 from cohort start
# ═══════════════════════════════════════════════════════════════════════════════
timeAtRisks <- tibble(
label = c("On treatment"),
riskWindowStart  = c(1),
startAnchor = c("cohort start"),
riskWindowEnd  = c(0),
endAnchor = c("cohort end")
)

# CUSTOMIZE: PLP time-at-risks should use fixed-time TARs
plpTimeAtRisks <- tibble(
riskWindowStart  = c(1),
startAnchor = c("cohort start"),
riskWindowEnd  = c(365),
endAnchor = c("cohort start"),
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: STUDY DATE RANGE
# Change: Set your study period. Use empty strings ("") for no restriction.
# ═══════════════════════════════════════════════════════════════════════════════
studyStartDate <- '20171201' #YYYYMMDD
studyEndDate <- '20231231'   #YYYYMMDD
studyStartDateWithHyphens <- gsub("(\\\\d{4})(\\\\d{2})(\\\\d{2})", "\\\\1-\\\\2-\\\\3", studyStartDate)
studyEndDateWithHyphens <- gsub("(\\\\d{4})(\\\\d{2})(\\\\d{2})", "\\\\1-\\\\2-\\\\3", studyEndDate)


# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: ESTIMATION SETTINGS
# ═══════════════════════════════════════════════════════════════════════════════
useCleanWindowForPriorOutcomeLookback <- FALSE # If FALSE, lookback window is all time prior
psMatchMaxRatio <- 1 # If bigger than 1, the outcome model will be conditioned on the matched set

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: COHORT DEFINITIONS
# Change: Update file paths to point to your downloaded cohorts
# Change: Update cohort IDs to match your study design
# The Eunomia example uses: celecoxib (1), diclofenac (2), GI Bleed (3)
# ═══════════════════════════════════════════════════════════════════════════════
cohortDefinitionSet <- CohortGenerator::getCohortDefinitionSet(
settingsFileName = "inst/sampleStudy/Eunomia/Cohorts.csv",
jsonFolder = "inst/sampleStudy/Eunomia/cohorts",
sqlFolder = "inst/sampleStudy/Eunomia/sql/sql_server"
)

# CUSTOMIZE: Subset definitions for new-user cohorts
# Change targetCohortIds to match your target/comparator cohort IDs
subset1 <- CohortGenerator::createCohortSubsetDefinition(
name = "New Users",
definitionId = 1,
subsetOperators = list(
  CohortGenerator::createLimitSubset(
    priorTime = 365,
    limitTo = "firstEver"
  )
)
)

cohortDefinitionSet <- cohortDefinitionSet |>
CohortGenerator::addCohortSubsetDefinition(subset1, targetCohortIds = c(1,2))

# CUSTOMIZE: Path to negative control outcomes file
negativeControlOutcomeCohortSet <- CohortGenerator::readCsv(
file = "inst/sampleStudy/Eunomia/negativeControlOutcomes.csv"
)

if (any(duplicated(cohortDefinitionSet$cohortId, negativeControlOutcomeCohortSet$cohortId))) {
stop("*** Error: duplicate cohort IDs found ***")
}

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: OUTCOME AND TARGET/COMPARATOR DEFINITIONS
# Change: Update cohort IDs and names to match your study
# ═══════════════════════════════════════════════════════════════════════════════

# Outcomes: Change cohortId filter to your outcome cohort(s)
oList <- cohortDefinitionSet %>%
filter(.data$cohortId == 3) %>%
mutate(outcomeCohortId = cohortId, outcomeCohortName = cohortName) %>%
select(outcomeCohortId, outcomeCohortName) %>%
mutate(cleanWindow = 365)

# CUSTOMIZE: CohortMethod target/comparator pairs (use subsetted cohort IDs)
cmTcList <- data.frame(
targetCohortId = 1001,
targetCohortName = "celecoxib new users",
comparatorCohortId = 2001,
comparatorCohortName = "diclofenac new users"
)

# CUSTOMIZE: Excluded covariate concept IDs
# CRITICAL: Always exclude target and comparator drug concepts from PS covariates
excludedCovariateConcepts <- data.frame(
conceptId = c(1118084, 1124300),
conceptName = c("celecoxib", "diclofenac")
)

# CUSTOMIZE: SCCS target list (uses all-exposure cohorts, not subsetted)
sccsTList <- data.frame(
targetCohortId = c(1,2),
targetCohortName = c("celecoxib", "diclofenac")
)

# ═══════════════════════════════════════════════════════════════════════════════
# MODULE CONFIGURATION
# DO NOT MODIFY below unless you need to change module parameters or
# enable/disable specific modules.
# ═══════════════════════════════════════════════════════════════════════════════

# CohortGeneratorModule --------------------------------------------------------
cgModuleSettingsCreator <- CohortGeneratorModule$new()
cohortDefinitionShared <- cgModuleSettingsCreator$createCohortSharedResourceSpecifications(cohortDefinitionSet)
negativeControlsShared <- cgModuleSettingsCreator$createNegativeControlOutcomeCohortSharedResourceSpecifications(
negativeControlOutcomeCohortSet = negativeControlOutcomeCohortSet,
occurrenceType = "first",
detectOnDescendants = TRUE
)
cohortGeneratorModuleSpecifications <- cgModuleSettingsCreator$createModuleSpecifications(
generateStats = TRUE
)

# CohortDiagnosticsModule Settings ---------------------------------------------
cdModuleSettingsCreator <- CohortDiagnosticsModule$new()
cohortDiagnosticsModuleSpecifications <- cdModuleSettingsCreator$createModuleSpecifications(
cohortIds = cohortDefinitionSet$cohortId,
runInclusionStatistics = TRUE,
runIncludedSourceConcepts = TRUE,
runOrphanConcepts = TRUE,
runTimeSeries = FALSE,
runVisitContext = TRUE,
runBreakdownIndexEvents = TRUE,
runIncidenceRate = TRUE,
runCohortRelationship = TRUE,
runTemporalCohortCharacterization = TRUE,
minCharacterizationMean = 0.01
)

# CharacterizationModule Settings ---------------------------------------------
cModuleSettingsCreator <- CharacterizationModule$new()
characterizationModuleSpecifications <- cModuleSettingsCreator$createModuleSpecifications(
targetIds = cohortDefinitionSet$cohortId,
outcomeIds = oList$outcomeCohortId,
minPriorObservation = 365,
dechallengeStopInterval = 30,
dechallengeEvaluationWindow = 30,
riskWindowStart = timeAtRisks$riskWindowStart,
startAnchor = timeAtRisks$startAnchor,
riskWindowEnd = timeAtRisks$riskWindowEnd,
endAnchor = timeAtRisks$endAnchor,
minCharacterizationMean = .01
)

# CohortIncidenceModule --------------------------------------------------------
ciModuleSettingsCreator <- CohortIncidenceModule$new()
tcIds <- cohortDefinitionSet %>%
filter(!cohortId %in% oList$outcomeCohortId & isSubset) %>%
pull(cohortId)
targetList <- lapply(
tcIds,
function(cohortId) {
  CohortIncidence::createCohortRef(
    id = cohortId,
    name = cohortDefinitionSet$cohortName[cohortDefinitionSet$cohortId == cohortId]
  )
}
)
outcomeList <- lapply(
seq_len(nrow(oList)),
function(i) {
  CohortIncidence::createOutcomeDef(
    id = i,
    name = cohortDefinitionSet$cohortName[cohortDefinitionSet$cohortId == oList$outcomeCohortId[i]],
    cohortId = oList$outcomeCohortId[i],
    cleanWindow = oList$cleanWindow[i]
  )
}
)

tars <- list()
for (i in seq_len(nrow(timeAtRisks))) {
tars[[i]] <- CohortIncidence::createTimeAtRiskDef(
  id = i,
  startWith = gsub("cohort ", "", timeAtRisks$startAnchor[i]),
  endWith = gsub("cohort ", "", timeAtRisks$endAnchor[i]),
  startOffset = timeAtRisks$riskWindowStart[i],
  endOffset = timeAtRisks$riskWindowEnd[i]
)
}
analysis1 <- CohortIncidence::createIncidenceAnalysis(
targets = tcIds,
outcomes = seq_len(nrow(oList)),
tars = seq_along(tars)
)
irDesign <- CohortIncidence::createIncidenceDesign(
targetDefs = targetList,
outcomeDefs = outcomeList,
tars = tars,
analysisList = list(analysis1),
strataSettings = CohortIncidence::createStrataSettings(
  byYear = TRUE,
  byGender = TRUE,
  byAge = TRUE,
  ageBreaks = seq(0, 110, by = 10)
)
)
cohortIncidenceModuleSpecifications <- ciModuleSettingsCreator$createModuleSpecifications(
irDesign = irDesign$toList()
)

# CohortMethodModule -----------------------------------------------------------
cmModuleSettingsCreator <- CohortMethodModule$new()
covariateSettings <- FeatureExtraction::createDefaultCovariateSettings(
addDescendantsToExclude = TRUE
)
outcomeList <- append(
lapply(seq_len(nrow(oList)), function(i) {
  if (useCleanWindowForPriorOutcomeLookback)
    priorOutcomeLookback <- oList$cleanWindow[i]
  else
    priorOutcomeLookback <- 99999
  CohortMethod::createOutcome(
    outcomeId = oList$outcomeCohortId[i],
    outcomeOfInterest = TRUE,
    trueEffectSize = NA,
    priorOutcomeLookback = priorOutcomeLookback
  )
}),
lapply(negativeControlOutcomeCohortSet$cohortId, function(i) {
  CohortMethod::createOutcome(
    outcomeId = i,
    outcomeOfInterest = FALSE,
    trueEffectSize = 1
  )
})
)
targetComparatorOutcomesList <- list()
for (i in seq_len(nrow(cmTcList))) {
targetComparatorOutcomesList[[i]] <- CohortMethod::createTargetComparatorOutcomes(
  targetId = cmTcList$targetCohortId[i],
  comparatorId = cmTcList$comparatorCohortId[i],
  outcomes = outcomeList,
  excludedCovariateConceptIds = c(
    cmTcList$targetConceptId[i],
    cmTcList$comparatorConceptId[i],
    excludedCovariateConcepts$conceptId
  )
)
}
getDbCohortMethodDataArgs <- CohortMethod::createGetDbCohortMethodDataArgs(
restrictToCommonPeriod = TRUE,
studyStartDate = studyStartDate,
studyEndDate = studyEndDate,
maxCohortSize = 0,
covariateSettings = covariateSettings
)
createPsArgs = CohortMethod::createCreatePsArgs(
maxCohortSizeForFitting = 250000,
errorOnHighCorrelation = TRUE,
stopOnError = FALSE,
estimator = "att",
prior = Cyclops::createPrior(
  priorType = "laplace",
  exclude = c(0),
  useCrossValidation = TRUE
),
control = Cyclops::createControl(
  noiseLevel = "silent",
  cvType = "auto",
  seed = 1,
  resetCoefficients = TRUE,
  tolerance = 2e-07,
  cvRepetitions = 1,
  startingVariance = 0.01
)
)
matchOnPsArgs = CohortMethod::createMatchOnPsArgs(
maxRatio = psMatchMaxRatio,
caliper = 0.2,
caliperScale = "standardized logit",
allowReverseMatch = FALSE,
stratificationColumns = c()
)
computeSharedCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
maxCohortSize = 250000,
covariateFilter = NULL
)
computeCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
maxCohortSize = 250000,
covariateFilter = FeatureExtraction::getDefaultTable1Specifications()
)
fitOutcomeModelArgs = CohortMethod::createFitOutcomeModelArgs(
modelType = "cox",
stratified = psMatchMaxRatio != 1,
useCovariates = FALSE,
inversePtWeighting = FALSE,
prior = Cyclops::createPrior(
  priorType = "laplace",
  useCrossValidation = TRUE
),
control = Cyclops::createControl(
  cvType = "auto",
  seed = 1,
  resetCoefficients = TRUE,
  startingVariance = 0.01,
  tolerance = 2e-07,
  cvRepetitions = 1,
  noiseLevel = "quiet"
)
)
cmAnalysisList <- list()
for (i in seq_len(nrow(timeAtRisks))) {
createStudyPopArgs <- CohortMethod::createCreateStudyPopulationArgs(
  firstExposureOnly = FALSE,
  washoutPeriod = 0,
  removeDuplicateSubjects = "keep first",
  censorAtNewRiskWindow = TRUE,
  removeSubjectsWithPriorOutcome = TRUE,
  priorOutcomeLookback = 99999,
  riskWindowStart = timeAtRisks$riskWindowStart[[i]],
  startAnchor = timeAtRisks$startAnchor[[i]],
  riskWindowEnd = timeAtRisks$riskWindowEnd[[i]],
  endAnchor = timeAtRisks$endAnchor[[i]],
  minDaysAtRisk = 1,
  maxDaysAtRisk = 99999
)
cmAnalysisList[[i]] <- CohortMethod::createCmAnalysis(
  analysisId = i,
  description = sprintf(
    "Cohort method, %s",
    timeAtRisks$label[i]
  ),
  getDbCohortMethodDataArgs = getDbCohortMethodDataArgs,
  createStudyPopArgs = createStudyPopArgs,
  createPsArgs = createPsArgs,
  matchOnPsArgs = matchOnPsArgs,
  computeSharedCovariateBalanceArgs = computeSharedCovariateBalanceArgs,
  computeCovariateBalanceArgs = computeCovariateBalanceArgs,
  fitOutcomeModelArgs = fitOutcomeModelArgs
)
}
cohortMethodModuleSpecifications <- cmModuleSettingsCreator$createModuleSpecifications(
cmAnalysisList = cmAnalysisList,
targetComparatorOutcomesList = targetComparatorOutcomesList,
analysesToExclude = NULL,
refitPsForEveryOutcome = FALSE,
refitPsForEveryStudyPopulation = FALSE,
cmDiagnosticThresholds = CohortMethod::createCmDiagnosticThresholds()
)

# SelfControlledCaseSeriesModule -----------------------------------------------
sccsModuleSettingsCreator <- SelfControlledCaseSeriesModule$new()
uniqueTargetIds <- sccsTList$targetCohortId

eoList <- list()
for (targetId in uniqueTargetIds) {
for (outcomeId in oList$outcomeCohortId) {
  eoList[[length(eoList) + 1]] <- SelfControlledCaseSeries::createExposuresOutcome(
    outcomeId = outcomeId,
    exposures = list(
      SelfControlledCaseSeries::createExposure(
        exposureId = targetId,
        trueEffectSize = NA
      )
    )
  )
}
for (outcomeId in negativeControlOutcomeCohortSet$cohortId) {
  eoList[[length(eoList) + 1]] <- SelfControlledCaseSeries::createExposuresOutcome(
    outcomeId = outcomeId,
    exposures = list(SelfControlledCaseSeries::createExposure(
      exposureId = targetId,
      trueEffectSize = 1
    ))
  )
}
}
sccsAnalysisList <- list()
analysisToInclude <- data.frame()
getDbSccsDataArgs <- SelfControlledCaseSeries::createGetDbSccsDataArgs(
maxCasesPerOutcome = 1000000,
useNestingCohort = FALSE,
studyStartDate = studyStartDate,
studyEndDate = studyEndDate,
deleteCovariatesSmallCount = 0
)
createStudyPopulationArgs = SelfControlledCaseSeries::createCreateStudyPopulationArgs(
firstOutcomeOnly = TRUE,
naivePeriod = 365,
minAge = 18,
genderConceptIds = c(8507, 8532)
)
covarPreExp <- SelfControlledCaseSeries::createEraCovariateSettings(
label = "Pre-exposure",
includeEraIds = "exposureId",
start = -30,
startAnchor = "era start",
end = -1,
endAnchor = "era start",
firstOccurrenceOnly = FALSE,
allowRegularization = FALSE,
profileLikelihood = FALSE,
exposureOfInterest = FALSE
)
calendarTimeSettings <- SelfControlledCaseSeries::createCalendarTimeCovariateSettings(
calendarTimeKnots = 5,
allowRegularization = TRUE,
computeConfidenceIntervals = FALSE
)
fitSccsModelArgs <- SelfControlledCaseSeries::createFitSccsModelArgs(
prior = Cyclops::createPrior("laplace", useCrossValidation = TRUE),
control = Cyclops::createControl(
  cvType = "auto",
  selectorType = "byPid",
  startingVariance = 0.1,
  seed = 1,
  resetCoefficients = TRUE,
  noiseLevel = "quiet")
)
for (j in seq_len(nrow(timeAtRisks))) {
covarExposureOfInt <- SelfControlledCaseSeries::createEraCovariateSettings(
  label = "Main",
  includeEraIds = "exposureId",
  start = timeAtRisks$riskWindowStart[j],
  startAnchor = gsub("cohort", "era", timeAtRisks$startAnchor[j]),
  end = timeAtRisks$riskWindowEnd[j],
  endAnchor = gsub("cohort", "era", timeAtRisks$endAnchor[j]),
  firstOccurrenceOnly = FALSE,
  allowRegularization = FALSE,
  profileLikelihood = TRUE,
  exposureOfInterest = TRUE
)
createSccsIntervalDataArgs <- SelfControlledCaseSeries::createCreateSccsIntervalDataArgs(
  eraCovariateSettings = list(covarPreExp, covarExposureOfInt),
  calendarTimeCovariateSettings = calendarTimeSettings
)
description <- "SCCS"
description <- sprintf("%s, male, female, age >= %s", description, createStudyPopulationArgs$minAge)
description <- sprintf("%s, %s", description, timeAtRisks$label[j])
sccsAnalysisList[[length(sccsAnalysisList) + 1]] <- SelfControlledCaseSeries::createSccsAnalysis(
  analysisId = length(sccsAnalysisList) + 1,
  description = description,
  getDbSccsDataArgs = getDbSccsDataArgs,
  createStudyPopulationArgs = createStudyPopulationArgs,
  createIntervalDataArgs = createSccsIntervalDataArgs,
  fitSccsModelArgs = fitSccsModelArgs
)
}
selfControlledModuleSpecifications <- sccsModuleSettingsCreator$createModuleSpecifications(
sccsAnalysisList = sccsAnalysisList,
exposuresOutcomeList = eoList,
combineDataFetchAcrossOutcomes = FALSE,
sccsDiagnosticThresholds = SelfControlledCaseSeries::createSccsDiagnosticThresholds()
)

# PatientLevelPredictionModule -------------------------------------------------
plpModuleSettingsCreator <- PatientLevelPredictionModule$new()

modelSettings <- list(
lassoLogisticRegression = PatientLevelPrediction::setLassoLogisticRegression()
#randomForest = PatientLevelPrediction::setRandomForest()
)
modelDesignList <- list()
for (cohortId in tcIds) {
for (j in seq_len(nrow(plpTimeAtRisks))) {
  for (k in seq_len(nrow(oList))) {
    if (useCleanWindowForPriorOutcomeLookback) {
      priorOutcomeLookback <- oList$cleanWindow[k]
    } else {
      priorOutcomeLookback <- 99999
    }
    for (mSetting in modelSettings) {
      modelDesignList[[length(modelDesignList) + 1]] <- PatientLevelPrediction::createModelDesign(
        targetId = cohortId,
        outcomeId = oList$outcomeCohortId[k],
        restrictPlpDataSettings = PatientLevelPrediction::createRestrictPlpDataSettings(
          sampleSize = 1000000,
          studyStartDate = studyStartDate,
          studyEndDate = studyEndDate,
          firstExposureOnly = FALSE,
          washoutPeriod = 0
        ),
        populationSettings = PatientLevelPrediction::createStudyPopulationSettings(
          riskWindowStart = plpTimeAtRisks$riskWindowStart[j],
          startAnchor = plpTimeAtRisks$startAnchor[j],
          riskWindowEnd = plpTimeAtRisks$riskWindowEnd[j],
          endAnchor = plpTimeAtRisks$endAnchor[j],
          removeSubjectsWithPriorOutcome = TRUE,
          priorOutcomeLookback = priorOutcomeLookback,
          requireTimeAtRisk = FALSE,
          binary = TRUE,
          includeAllOutcomes = TRUE,
          firstExposureOnly = FALSE,
          washoutPeriod = 0,
          minTimeAtRisk = plpTimeAtRisks$riskWindowEnd[j] - plpTimeAtRisks$riskWindowStart[j],
          restrictTarToCohortEnd = FALSE
        ),
        covariateSettings = FeatureExtraction::createCovariateSettings(
          useDemographicsGender = TRUE,
          useDemographicsAgeGroup = TRUE,
          useConditionGroupEraLongTerm = TRUE,
          useDrugGroupEraLongTerm = TRUE,
          useVisitConceptCountLongTerm = TRUE
        ),
        preprocessSettings = PatientLevelPrediction::createPreprocessSettings(),
        modelSettings = mSetting
      )
    }
  }
}
}
plpModuleSpecifications <- plpModuleSettingsCreator$createModuleSpecifications(
modelDesignList = modelDesignList
)


# ═══════════════════════════════════════════════════════════════════════════════
# BUILD SPECIFICATION
# CUSTOMIZE: Comment out modules you are NOT using in your study.
# CUSTOMIZE: Change the output path for your analysis specification JSON.
# ═══════════════════════════════════════════════════════════════════════════════
analysisSpecifications <- Strategus::createEmptyAnalysisSpecificiations() |>
Strategus::addSharedResources(cohortDefinitionShared) |>
Strategus::addSharedResources(negativeControlsShared) |>
Strategus::addModuleSpecifications(cohortGeneratorModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortDiagnosticsModuleSpecifications) |>
Strategus::addModuleSpecifications(characterizationModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortIncidenceModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortMethodModuleSpecifications) |>
Strategus::addModuleSpecifications(selfControlledModuleSpecifications) |>
Strategus::addModuleSpecifications(plpModuleSpecifications)

# CUSTOMIZE: Change output path for your study
ParallelLogger::saveSettingsToJson(
analysisSpecifications,
file.path("inst", "sampleStudy", "Eunomia", "sampleStudyAnalysisSpecification.json")
)
`,

    "CreateStrategusAnalysisSpecificationTcis.R": `################################################################################
# CreateStrategusAnalysisSpecificationTcis.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# ALTERNATIVE to CreateStrategusAnalysisSpecification.R for signal detection
# studies using Target-Comparator-Indication-Stratum (TCIS) pattern.
#
# Use this version when:
# - You have multiple target-comparator pairs with indication-based nesting
# - You need automatic cohort subsetting by indication, demographics, dates
# - You are doing drug safety signal detection
#
# For simpler studies with a single T-C pair, use
# CreateStrategusAnalysisSpecification.R instead.
#
# Use /strategus-study skill for detailed methodology guidance.
# ##############################################################################
library(dplyr)
library(Strategus)

########################################################
# CUSTOMIZE: MODIFY ABOVE THE LINE --------------------
########################################################

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: COHORT DEFINITIONS
# Change: Update file paths to your downloaded cohorts
# ═══════════════════════════════════════════════════════════════════════════════
cohortDefinitionSet <- CohortGenerator::getCohortDefinitionSet(
settingsFileName = "inst/sampleStudy/Cohorts.csv",
jsonFolder = "inst/sampleStudy/cohorts",
sqlFolder = "inst/sampleStudy/sql/sql_server"
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: TARGET-COMPARATOR-INDICATION (TCI) DEFINITIONS
# Change: Define your target/comparator/indication combinations
# Each entry defines a comparison with optional demographic restrictions
# ═══════════════════════════════════════════════════════════════════════════════
tcis <- list(
list(
  targetId = 20126, # CUSTOMIZE: Target cohort ID (e.g., ACE inhibitor)
  comparatorId = 20127, # CUSTOMIZE: Comparator cohort ID (e.g., Diuretic)
  indicationId = 20128, # CUSTOMIZE: Indication cohort ID (e.g., Hypertensive disorder)
  genderConceptIds = c(8507, 8532), # 8507=Male, 8532=Female (remove unknown)
  minAge = NULL, # CUSTOMIZE: Minimum age in years (NULL for all ages)
  maxAge = NULL, # CUSTOMIZE: Maximum age in years (NULL for all ages)
  excludedCovariateConceptIds = c(
    21601783, # CUSTOMIZE: Drug class concept IDs to exclude from PS covariates
    21601461
  )
)
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: OUTCOME DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════
outcomes <- tibble(
cohortId = c(20129, 20130), # CUSTOMIZE: Outcome cohort IDs
cleanWindow = c(365, 365) # CUSTOMIZE: Washout window per outcome
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: TIME-AT-RISK WINDOWS
# ═══════════════════════════════════════════════════════════════════════════════
timeAtRisks <- tibble(
label = c("On treatment", "On treatment"),
riskWindowStart  = c(1, 1),
startAnchor = c("cohort start", "cohort start"),
riskWindowEnd  = c(0, 0),
endAnchor = c("cohort end", "cohort end")
)
# Avoid intent-to-treat TARs for SCCS, or disable calendar time spline:
sccsTimeAtRisks <- tibble(
label = c("On treatment", "On treatment"),
riskWindowStart  = c(1, 1),
startAnchor = c("cohort start", "cohort start"),
riskWindowEnd  = c(0, 0),
endAnchor = c("cohort end", "cohort end")
)
# Use fixed-time TARs for patient-level prediction:
plpTimeAtRisks <- tibble(
riskWindowStart  = c(1, 1),
startAnchor = c("cohort start", "cohort start"),
riskWindowEnd  = c(365, 365),
endAnchor = c("cohort start", "cohort start"),
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: STUDY DATE RANGE
# ═══════════════════════════════════════════════════════════════════════════════
studyStartDate <- '20200101' #YYYYMMDD
studyEndDate <- '20241231'   #YYYYMMDD
studyStartDateWithHyphens <- gsub("(\\\\d{4})(\\\\d{2})(\\\\d{2})", "\\\\1-\\\\2-\\\\3", studyStartDate)
studyEndDateWithHyphens <- gsub("(\\\\d{4})(\\\\d{2})(\\\\d{2})", "\\\\1-\\\\2-\\\\3", studyEndDate)


# CUSTOMIZE: Estimation settings
useCleanWindowForPriorOutcomeLookback <- FALSE
psMatchMaxRatio <- 1
maxCohortSizeForFitting <- 250000
maxCohortSize <- maxCohortSizeForFitting
maxCasesPerOutcome <- 1000000

# CUSTOMIZE: PLP settings
plpMaxSampleSize <- 1000000

########################################################
# Below the line - DO NOT MODIFY -----------------------
# (unless you know what you're doing)
########################################################

# Shared Resources - auto-generates subsets from tcis list ----------------------
dfUniqueTcis <- data.frame()
for (i in seq_along(tcis)) {
dfUniqueTcis <- rbind(dfUniqueTcis, data.frame(cohortId = tcis[[i]]$targetId,
                                               indicationId = paste(tcis[[i]]$indicationId, collapse = ","),
                                               genderConceptIds = paste(tcis[[i]]$genderConceptIds, collapse = ","),
                                               minAge = paste(tcis[[i]]$minAge, collapse = ","),
                                               maxAge = paste(tcis[[i]]$maxAge, collapse = ",")
))
if (!is.null(tcis[[i]]$comparatorId)) {
  dfUniqueTcis <- rbind(dfUniqueTcis, data.frame(cohortId = tcis[[i]]$comparatorId,
                                                 indicationId = paste(tcis[[i]]$indicationId, collapse = ","),
                                                 genderConceptIds = paste(tcis[[i]]$genderConceptIds, collapse = ","),
                                                 minAge = paste(tcis[[i]]$minAge, collapse = ","),
                                                 maxAge = paste(tcis[[i]]$maxAge, collapse = ",")
  ))
}
}

dfUniqueTcis <- unique(dfUniqueTcis)
dfUniqueTcis$subsetDefinitionId <- 0
dfUniqueSubsetCriteria <- unique(dfUniqueTcis[,-1])

for (i in 1:nrow(dfUniqueSubsetCriteria)) {
uniqueSubsetCriteria <- dfUniqueSubsetCriteria[i,]
dfCurrentTcis <- dfUniqueTcis[dfUniqueTcis$indicationId == uniqueSubsetCriteria$indicationId &
                                dfUniqueTcis$genderConceptIds == uniqueSubsetCriteria$genderConceptIds &
                                dfUniqueTcis$minAge == uniqueSubsetCriteria$minAge &
                                dfUniqueTcis$maxAge == uniqueSubsetCriteria$maxAge,]
targetCohortIdsForSubsetCriteria <- as.integer(dfCurrentTcis[, "cohortId"])
dfUniqueTcis[dfUniqueTcis$indicationId == dfCurrentTcis$indicationId &
               dfUniqueTcis$genderConceptIds == dfCurrentTcis$genderConceptIds &
               dfUniqueTcis$minAge == dfCurrentTcis$minAge &
               dfUniqueTcis$maxAge == dfCurrentTcis$maxAge,]$subsetDefinitionId <- i

subsetOperators <- list()
if (uniqueSubsetCriteria$indicationId != "") {
  subsetOperators[[length(subsetOperators) + 1]] <- CohortGenerator::createCohortSubset(
    cohortIds = uniqueSubsetCriteria$indicationId,
    negate = FALSE,
    cohortCombinationOperator = "all",
    startWindow = CohortGenerator::createSubsetCohortWindow(-99999, 0, "cohortStart"),
    endWindow = CohortGenerator::createSubsetCohortWindow(0, 99999, "cohortStart")
  )
}
subsetOperators[[length(subsetOperators) + 1]] <- CohortGenerator::createLimitSubset(
  priorTime = 365,
  followUpTime = 1,
  limitTo = "firstEver"
)
if (uniqueSubsetCriteria$genderConceptIds != "" ||
    uniqueSubsetCriteria$minAge != "" ||
    uniqueSubsetCriteria$maxAge != "") {
  subsetOperators[[length(subsetOperators) + 1]] <- CohortGenerator::createDemographicSubset(
    ageMin = if(uniqueSubsetCriteria$minAge == "") 0 else as.integer(uniqueSubsetCriteria$minAge),
    ageMax = if(uniqueSubsetCriteria$maxAge == "") 99999 else as.integer(uniqueSubsetCriteria$maxAge),
    gender = if(uniqueSubsetCriteria$genderConceptIds == "") NULL else as.integer(strsplit(uniqueSubsetCriteria$genderConceptIds, ",")[[1]])
  )
}
if (studyStartDate != "" || studyEndDate != "") {
  subsetOperators[[length(subsetOperators) + 1]] <- CohortGenerator::createLimitSubset(
    calendarStartDate = if (studyStartDate == "") NULL else as.Date(studyStartDate, "%Y%m%d"),
    calendarEndDate = if (studyEndDate == "") NULL else as.Date(studyEndDate, "%Y%m%d")
  )
}
subsetDef <- CohortGenerator::createCohortSubsetDefinition(
  name = "",
  definitionId = i,
  subsetOperators = subsetOperators
)
cohortDefinitionSet <- cohortDefinitionSet %>%
  CohortGenerator::addCohortSubsetDefinition(
    cohortSubsetDefintion = subsetDef,
    targetCohortIds = targetCohortIdsForSubsetCriteria
  )

if (uniqueSubsetCriteria$indicationId != "") {
  subsetDef <- CohortGenerator::createCohortSubsetDefinition(
    name = "",
    definitionId = i + 100,
    subsetOperators = subsetOperators[2:length(subsetOperators)]
  )
  cohortDefinitionSet <- cohortDefinitionSet %>%
    CohortGenerator::addCohortSubsetDefinition(
      cohortSubsetDefintion = subsetDef,
      targetCohortIds = as.integer(uniqueSubsetCriteria$indicationId)
    )
}
}

negativeControlOutcomeCohortSet <- CohortGenerator::readCsv(
file = "inst/sampleStudy/negativeControlOutcomes.csv"
)

if (any(duplicated(cohortDefinitionSet$cohortId, negativeControlOutcomeCohortSet$cohortId))) {
stop("*** Error: duplicate cohort IDs found ***")
}

# CohortGeneratorModule --------------------------------------------------------
cgModuleSettingsCreator <- CohortGeneratorModule$new()
cohortDefinitionShared <- cgModuleSettingsCreator$createCohortSharedResourceSpecifications(cohortDefinitionSet)
negativeControlsShared <- cgModuleSettingsCreator$createNegativeControlOutcomeCohortSharedResourceSpecifications(
negativeControlOutcomeCohortSet = negativeControlOutcomeCohortSet,
occurrenceType = "first",
detectOnDescendants = TRUE
)
cohortGeneratorModuleSpecifications <- cgModuleSettingsCreator$createModuleSpecifications(
generateStats = TRUE
)

# CohortDiagnosticsModule Settings ---------------------------------------------
cdModuleSettingsCreator <- CohortDiagnosticsModule$new()
cohortDiagnosticsModuleSpecifications <- cdModuleSettingsCreator$createModuleSpecifications(
cohortIds = cohortDefinitionSet$cohortId,
runInclusionStatistics = TRUE,
runIncludedSourceConcepts = TRUE,
runOrphanConcepts = TRUE,
runTimeSeries = FALSE,
runVisitContext = TRUE,
runBreakdownIndexEvents = TRUE,
runIncidenceRate = TRUE,
runCohortRelationship = TRUE,
runTemporalCohortCharacterization = TRUE,
minCharacterizationMean = 0.01
)

# CharacterizationModule Settings ---------------------------------------------
cModuleSettingsCreator <- CharacterizationModule$new()
allCohortIdsExceptOutcomes <- cohortDefinitionSet %>%
filter(!cohortId %in% outcomes$cohortId) %>%
pull(cohortId)

characterizationModuleSpecifications <- cModuleSettingsCreator$createModuleSpecifications(
targetIds = allCohortIdsExceptOutcomes,
outcomeIds = outcomes$cohortId,
outcomeWashoutDays = outcomes$cleanWindow,
minPriorObservation = 365,
dechallengeStopInterval = 30,
dechallengeEvaluationWindow = 30,
riskWindowStart = timeAtRisks$riskWindowStart,
startAnchor = timeAtRisks$startAnchor,
riskWindowEnd = timeAtRisks$riskWindowEnd,
endAnchor = timeAtRisks$endAnchor,
minCharacterizationMean = .01
)

# CohortIncidenceModule --------------------------------------------------------
ciModuleSettingsCreator <- CohortIncidenceModule$new()
exposureIndicationIds <- cohortDefinitionSet %>%
filter(!cohortId %in% outcomes$cohortId & isSubset) %>%
pull(cohortId)
targetList <- lapply(
exposureIndicationIds,
function(cohortId) {
  CohortIncidence::createCohortRef(
    id = cohortId,
    name = cohortDefinitionSet$cohortName[cohortDefinitionSet$cohortId == cohortId]
  )
}
)
outcomeList <- lapply(
seq_len(nrow(outcomes)),
function(i) {
  CohortIncidence::createOutcomeDef(
    id = i,
    name = cohortDefinitionSet$cohortName[cohortDefinitionSet$cohortId == outcomes$cohortId[i]],
    cohortId = outcomes$cohortId[i],
    cleanWindow = outcomes$cleanWindow[i]
  )
}
)
tars <- list()
for (i in seq_len(nrow(timeAtRisks))) {
tars[[i]] <- CohortIncidence::createTimeAtRiskDef(
  id = i,
  startWith = gsub("cohort ", "", timeAtRisks$startAnchor[i]),
  endWith = gsub("cohort ", "", timeAtRisks$endAnchor[i]),
  startOffset = timeAtRisks$riskWindowStart[i],
  endOffset = timeAtRisks$riskWindowEnd[i]
)
}
analysis1 <- CohortIncidence::createIncidenceAnalysis(
targets = exposureIndicationIds,
outcomes = seq_len(nrow(outcomes)),
tars = seq_along(tars)
)
irDesign <- CohortIncidence::createIncidenceDesign(
targetDefs = targetList,
outcomeDefs = outcomeList,
tars = tars,
analysisList = list(analysis1),
strataSettings = CohortIncidence::createStrataSettings(
  byYear = TRUE,
  byGender = TRUE,
  byAge = TRUE,
  ageBreaks = seq(0, 110, by = 10)
)
)
cohortIncidenceModuleSpecifications <- ciModuleSettingsCreator$createModuleSpecifications(
irDesign = irDesign$toList()
)

# CohortMethodModule -----------------------------------------------------------
cmModuleSettingsCreator <- CohortMethodModule$new()
covariateSettings <- FeatureExtraction::createDefaultCovariateSettings(
addDescendantsToExclude = TRUE
)
outcomeList <- append(
lapply(seq_len(nrow(outcomes)), function(i) {
  if (useCleanWindowForPriorOutcomeLookback)
    priorOutcomeLookback <- outcomes$cleanWindow[i]
  else
    priorOutcomeLookback <- 99999
  CohortMethod::createOutcome(
    outcomeId = outcomes$cohortId[i],
    outcomeOfInterest = TRUE,
    trueEffectSize = NA,
    priorOutcomeLookback = priorOutcomeLookback
  )
}),
lapply(negativeControlOutcomeCohortSet$cohortId, function(i) {
  CohortMethod::createOutcome(
    outcomeId = i,
    outcomeOfInterest = FALSE,
    trueEffectSize = 1
  )
})
)
targetComparatorOutcomesList <- list()
for (i in seq_along(tcis)) {
tci <- tcis[[i]]
currentSubsetDefinitionId <- dfUniqueTcis %>%
  filter(cohortId == tci$targetId &
           indicationId == paste(tci$indicationId, collapse = ",") &
           genderConceptIds == paste(tci$genderConceptIds, collapse = ",") &
           minAge == paste(tci$minAge, collapse = ",") &
           maxAge == paste(tci$maxAge, collapse = ",")) %>%
  pull(subsetDefinitionId)
targetId <- cohortDefinitionSet %>%
  filter(subsetParent == tci$targetId & subsetDefinitionId == currentSubsetDefinitionId) %>%
  pull(cohortId)
comparatorId <- cohortDefinitionSet %>%
  filter(subsetParent == tci$comparatorId & subsetDefinitionId == currentSubsetDefinitionId) %>%
  pull(cohortId)
targetComparatorOutcomesList[[i]] <- CohortMethod::createTargetComparatorOutcomes(
  targetId = targetId,
  comparatorId = comparatorId,
  outcomes = outcomeList,
  excludedCovariateConceptIds = tci$excludedCovariateConceptIds
)
}
getDbCohortMethodDataArgs <- CohortMethod::createGetDbCohortMethodDataArgs(
restrictToCommonPeriod = TRUE,
studyStartDate = studyStartDate,
studyEndDate = studyEndDate,
maxCohortSize = 0,
covariateSettings = covariateSettings
)
createPsArgs = CohortMethod::createCreatePsArgs(
maxCohortSizeForFitting = maxCohortSizeForFitting,
errorOnHighCorrelation = TRUE,
stopOnError = FALSE,
estimator = "att",
prior = Cyclops::createPrior(
  priorType = "laplace",
  exclude = c(0),
  useCrossValidation = TRUE
),
control = Cyclops::createControl(
  noiseLevel = "silent",
  cvType = "auto",
  seed = 1,
  resetCoefficients = TRUE,
  tolerance = 2e-07,
  cvRepetitions = 1,
  startingVariance = 0.01
)
)
matchOnPsArgs = CohortMethod::createMatchOnPsArgs(
maxRatio = psMatchMaxRatio,
caliper = 0.2,
caliperScale = "standardized logit",
allowReverseMatch = FALSE,
stratificationColumns = c()
)
computeSharedCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
maxCohortSize = maxCohortSize,
covariateFilter = NULL
)
computeCovariateBalanceArgs = CohortMethod::createComputeCovariateBalanceArgs(
maxCohortSize = maxCohortSize,
covariateFilter = FeatureExtraction::getDefaultTable1Specifications()
)
fitOutcomeModelArgs = CohortMethod::createFitOutcomeModelArgs(
modelType = "cox",
stratified = psMatchMaxRatio != 1,
useCovariates = FALSE,
inversePtWeighting = FALSE,
prior = Cyclops::createPrior(
  priorType = "laplace",
  useCrossValidation = TRUE
),
control = Cyclops::createControl(
  cvType = "auto",
  seed = 1,
  resetCoefficients = TRUE,
  startingVariance = 0.01,
  tolerance = 2e-07,
  cvRepetitions = 1,
  noiseLevel = "quiet"
)
)
cmAnalysisList <- list()
for (i in seq_len(nrow(timeAtRisks))) {
createStudyPopArgs <- CohortMethod::createCreateStudyPopulationArgs(
  firstExposureOnly = FALSE,
  washoutPeriod = 0,
  removeDuplicateSubjects = "keep first",
  censorAtNewRiskWindow = TRUE,
  removeSubjectsWithPriorOutcome = TRUE,
  priorOutcomeLookback = 99999,
  riskWindowStart = timeAtRisks$riskWindowStart[[i]],
  startAnchor = timeAtRisks$startAnchor[[i]],
  riskWindowEnd = timeAtRisks$riskWindowEnd[[i]],
  endAnchor = timeAtRisks$endAnchor[[i]],
  minDaysAtRisk = 1,
  maxDaysAtRisk = 99999
)
cmAnalysisList[[i]] <- CohortMethod::createCmAnalysis(
  analysisId = i,
  description = sprintf(
    "Cohort method, %s",
    timeAtRisks$label[i]
  ),
  getDbCohortMethodDataArgs = getDbCohortMethodDataArgs,
  createStudyPopArgs = createStudyPopArgs,
  createPsArgs = createPsArgs,
  matchOnPsArgs = matchOnPsArgs,
  computeSharedCovariateBalanceArgs = computeSharedCovariateBalanceArgs,
  computeCovariateBalanceArgs = computeCovariateBalanceArgs,
  fitOutcomeModelArgs = fitOutcomeModelArgs
)
}
cohortMethodModuleSpecifications <- cmModuleSettingsCreator$createModuleSpecifications(
cmAnalysisList = cmAnalysisList,
targetComparatorOutcomesList = targetComparatorOutcomesList,
analysesToExclude = NULL,
refitPsForEveryOutcome = FALSE,
refitPsForEveryStudyPopulation = FALSE,
cmDiagnosticThresholds = CohortMethod::createCmDiagnosticThresholds()
)

# SelfControlledCaseSeriesModule -----------------------------------------------
sccsModuleSettingsCreator <- SelfControlledCaseSeriesModule$new()
uniqueTargetIndications <- lapply(tcis,
                                function(x) data.frame(
                                  exposureId = c(x$targetId, x$comparatorId),
                                  indicationId = if (is.null(x$indicationId)) NA else x$indicationId,
                                  genderConceptIds = paste(x$genderConceptIds, collapse = ","),
                                  minAge = if (is.null(x$minAge)) NA else x$minAge,
                                  maxAge = if (is.null(x$maxAge)) NA else x$maxAge
                                )) %>%
bind_rows() %>%
distinct()

uniqueTargetIds <- uniqueTargetIndications %>%
distinct(exposureId) %>%
pull()

eoList <- list()
for (targetId in uniqueTargetIds) {
for (outcomeId in outcomes$cohortId) {
  eoList[[length(eoList) + 1]] <- SelfControlledCaseSeries::createExposuresOutcome(
    outcomeId = outcomeId,
    exposures = list(
      SelfControlledCaseSeries::createExposure(
        exposureId = targetId,
        trueEffectSize = NA
      )
    )
  )
}
for (outcomeId in negativeControlOutcomeCohortSet$cohortId) {
  eoList[[length(eoList) + 1]] <- SelfControlledCaseSeries::createExposuresOutcome(
    outcomeId = outcomeId,
    exposures = list(SelfControlledCaseSeries::createExposure(
      exposureId = targetId,
      trueEffectSize = 1
    ))
  )
}
}
sccsAnalysisList <- list()
analysisToInclude <- data.frame()
for (i in seq_len(nrow(uniqueTargetIndications))) {
targetIndication <- uniqueTargetIndications[i, ]
getDbSccsDataArgs <- SelfControlledCaseSeries::createGetDbSccsDataArgs(
  maxCasesPerOutcome = maxCasesPerOutcome,
  useNestingCohort = !is.na(targetIndication$indicationId),
  nestingCohortId = targetIndication$indicationId,
  studyStartDate = studyStartDate,
  studyEndDate = studyEndDate,
  deleteCovariatesSmallCount = 0
)
createStudyPopulationArgs = SelfControlledCaseSeries::createCreateStudyPopulationArgs(
  firstOutcomeOnly = TRUE,
  naivePeriod = 365,
  minAge = if (is.na(targetIndication$minAge)) NULL else targetIndication$minAge,
  maxAge = if (is.na(targetIndication$maxAge)) NULL else targetIndication$maxAge
)
covarPreExp <- SelfControlledCaseSeries::createEraCovariateSettings(
  label = "Pre-exposure",
  includeEraIds = "exposureId",
  start = -30,
  startAnchor = "era start",
  end = -1,
  endAnchor = "era start",
  firstOccurrenceOnly = FALSE,
  allowRegularization = FALSE,
  profileLikelihood = FALSE,
  exposureOfInterest = FALSE
)
calendarTimeSettings <- SelfControlledCaseSeries::createCalendarTimeCovariateSettings(
  calendarTimeKnots = 5,
  allowRegularization = TRUE,
  computeConfidenceIntervals = FALSE
)
fitSccsModelArgs <- SelfControlledCaseSeries::createFitSccsModelArgs(
  prior = Cyclops::createPrior("laplace", useCrossValidation = TRUE),
  control = Cyclops::createControl(
    cvType = "auto",
    selectorType = "byPid",
    startingVariance = 0.1,
    seed = 1,
    resetCoefficients = TRUE,
    noiseLevel = "quiet")
)
for (j in seq_len(nrow(sccsTimeAtRisks))) {
  covarExposureOfInt <- SelfControlledCaseSeries::createEraCovariateSettings(
    label = "Main",
    includeEraIds = "exposureId",
    start = sccsTimeAtRisks$riskWindowStart[j],
    startAnchor = gsub("cohort", "era", sccsTimeAtRisks$startAnchor[j]),
    end = sccsTimeAtRisks$riskWindowEnd[j],
    endAnchor = gsub("cohort", "era", sccsTimeAtRisks$endAnchor[j]),
    firstOccurrenceOnly = FALSE,
    allowRegularization = FALSE,
    profileLikelihood = TRUE,
    exposureOfInterest = TRUE
  )
  createSccsIntervalDataArgs <- SelfControlledCaseSeries::createCreateSccsIntervalDataArgs(
    eraCovariateSettings = list(covarPreExp, covarExposureOfInt),
    calendarTimeCovariateSettings = calendarTimeSettings
  )
  description <- "SCCS"
  if (!is.na(targetIndication$indicationId)) {
    description <- sprintf("%s, having %s", description, cohortDefinitionSet %>%
                             filter(cohortId == targetIndication$indicationId) %>%
                             pull(cohortName))
  }
  if (targetIndication$genderConceptIds == "8507") {
    description <- sprintf("%s, male", description)
  } else if (targetIndication$genderConceptIds == "8532") {
    description <- sprintf("%s, female", description)
  }
  if (!is.na(targetIndication$minAge) || !is.na(targetIndication$maxAge)) {
    description <- sprintf("%s, age %s-%s",
                           description,
                           if(is.na(targetIndication$minAge)) "" else targetIndication$minAge,
                           if(is.na(targetIndication$maxAge)) "" else targetIndication$maxAge)
  }
  description <- sprintf("%s, %s", description, sccsTimeAtRisks$label[j])
  sccsAnalysisList[[length(sccsAnalysisList) + 1]] <- SelfControlledCaseSeries::createSccsAnalysis(
    analysisId = length(sccsAnalysisList) + 1,
    description = description,
    getDbSccsDataArgs = getDbSccsDataArgs,
    createStudyPopulationArgs = createStudyPopulationArgs,
    createIntervalDataArgs = createSccsIntervalDataArgs,
    fitSccsModelArgs = fitSccsModelArgs
  )
  analysisToInclude <- bind_rows(analysisToInclude, data.frame(
    exposureId = targetIndication$exposureId,
    analysisId = length(sccsAnalysisList)
  ))
}
}
analysesToExclude <- expand.grid(
exposureId = unique(analysisToInclude$exposureId),
analysisId = unique(analysisToInclude$analysisId)
) %>%
anti_join(analysisToInclude, by = join_by(exposureId, analysisId))
selfControlledModuleSpecifications <- sccsModuleSettingsCreator$createModuleSpecifications(
sccsAnalysisList = sccsAnalysisList,
exposuresOutcomeList = eoList,
analysesToExclude = analysesToExclude,
combineDataFetchAcrossOutcomes = FALSE,
sccsDiagnosticThresholds = SelfControlledCaseSeries::createSccsDiagnosticThresholds()
)

# PatientLevelPredictionModule -------------------------------------------------
plpModuleSettingsCreator <- PatientLevelPredictionModule$new()
modelDesignList <- list()
uniqueTargetIds <- unique(unlist(lapply(tcis, function(x) { c(x$targetId ) })))
dfUniqueTis <- dfUniqueTcis[dfUniqueTcis$cohortId %in% uniqueTargetIds, ]
for (i in 1:nrow(dfUniqueTis)) {
tci <- dfUniqueTis[i,]
cohortId <- cohortDefinitionSet %>%
  filter(subsetParent == tci$cohortId & subsetDefinitionId == tci$subsetDefinitionId) %>%
  pull(cohortId)
for (j in seq_len(nrow(plpTimeAtRisks))) {
  for (k in seq_len(nrow(outcomes))) {
    if (useCleanWindowForPriorOutcomeLookback)
      priorOutcomeLookback <- outcomes$cleanWindow[k]
    else
      priorOutcomeLookback <- 99999
    modelDesignList[[length(modelDesignList) + 1]] <- PatientLevelPrediction::createModelDesign(
      targetId = cohortId,
      outcomeId = outcomes$cohortId[k],
      restrictPlpDataSettings = PatientLevelPrediction::createRestrictPlpDataSettings(
        sampleSize = plpMaxSampleSize,
        studyStartDate = studyStartDate,
        studyEndDate = studyEndDate,
        firstExposureOnly = FALSE,
        washoutPeriod = 0
      ),
      populationSettings = PatientLevelPrediction::createStudyPopulationSettings(
        riskWindowStart = plpTimeAtRisks$riskWindowStart[j],
        startAnchor = plpTimeAtRisks$startAnchor[j],
        riskWindowEnd = plpTimeAtRisks$riskWindowEnd[j],
        endAnchor = plpTimeAtRisks$endAnchor[j],
        removeSubjectsWithPriorOutcome = TRUE,
        priorOutcomeLookback = priorOutcomeLookback,
        requireTimeAtRisk = FALSE,
        binary = TRUE,
        includeAllOutcomes = TRUE,
        firstExposureOnly = FALSE,
        washoutPeriod = 0,
        minTimeAtRisk = plpTimeAtRisks$riskWindowEnd[j] - plpTimeAtRisks$riskWindowStart[j],
        restrictTarToCohortEnd = FALSE
      ),
      covariateSettings = FeatureExtraction::createCovariateSettings(
        useDemographicsGender = TRUE,
        useDemographicsAgeGroup = TRUE,
        useConditionGroupEraLongTerm = TRUE,
        useDrugGroupEraLongTerm = TRUE,
        useVisitConceptCountLongTerm = TRUE
      ),
      preprocessSettings = PatientLevelPrediction::createPreprocessSettings(),
      modelSettings = PatientLevelPrediction::setLassoLogisticRegression()
    )
  }
}
}
plpModuleSpecifications <- plpModuleSettingsCreator$createModuleSpecifications(
modelDesignList = modelDesignList
)

# Build specification ----------------------------------------------------------
analysisSpecifications <- Strategus::createEmptyAnalysisSpecificiations() |>
Strategus::addSharedResources(cohortDefinitionShared) |>
Strategus::addSharedResources(negativeControlsShared) |>
Strategus::addModuleSpecifications(cohortGeneratorModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortDiagnosticsModuleSpecifications) |>
Strategus::addModuleSpecifications(characterizationModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortIncidenceModuleSpecifications) |>
Strategus::addModuleSpecifications(cohortMethodModuleSpecifications) |>
Strategus::addModuleSpecifications(selfControlledModuleSpecifications) |>
Strategus::addModuleSpecifications(plpModuleSpecifications)

# CUSTOMIZE: Change output path for your study
ParallelLogger::saveSettingsToJson(
analysisSpecifications,
file.path("inst", "sampleStudy", "sampleStudyAnalysisSpecification.json")
)
`,

    "StrategusCodeToRun.R": `# StrategusCodeToRun.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
# -------------------------------------------------------
#                     PLEASE READ
# -------------------------------------------------------
# You must call "renv::restore()" and follow the prompts
# to install all of the necessary R libraries to run this
# project. This is a one-time operation that you must do
# before running any code.
#
# !!! PLEASE RESTART R AFTER RUNNING renv::restore() !!!
# -------------------------------------------------------
#renv::restore()

# ENVIRONMENT SETTINGS NEEDED FOR RUNNING Strategus
Sys.setenv("_JAVA_OPTIONS"="-Xmx4g")
Sys.setenv("VROOM_THREADS"=1)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Set these values for your CDM environment
# ═══════════════════════════════════════════════════════════════════════════════
##=========== START OF INPUTS ==========
cdmDatabaseSchema <- "main"         # CUSTOMIZE: Your CDM database schema
workDatabaseSchema <- "main"        # CUSTOMIZE: Schema with write access for cohort tables
outputLocation <- file.path(getwd(), "results")
databaseName <- "Eunomia"          # CUSTOMIZE: Used as folder name for results
minCellCount <- 5
cohortTableName <- "sample_study"  # CUSTOMIZE: Prefix for cohort tables

# CUSTOMIZE: Create the connection details for your CDM
# See: https://ohdsi.github.io/DatabaseConnector/reference/createConnectionDetails.html
# connectionDetails <- DatabaseConnector::createConnectionDetails(
#   dbms = Sys.getenv("DBMS_TYPE"),
#   connectionString = Sys.getenv("CONNECTION_STRING"),
#   user = Sys.getenv("DBMS_USERNAME"),
#   password = Sys.getenv("DBMS_PASSWORD")
# )

# For testing with Eunomia sample data (install.packages("Eunomia") first)
connectionDetails <- Eunomia::getEunomiaConnectionDetails()

##=========== END OF INPUTS ==========

# ═══════════════════════════════════════════════════════════════════════════════
# DO NOT MODIFY below this point
# ═══════════════════════════════════════════════════════════════════════════════

# CUSTOMIZE: Update path to your analysis specification JSON
analysisSpecifications <- ParallelLogger::loadSettingsFromJson(
fileName = "inst/sampleStudy/sampleStudyAnalysisSpecification.json"
)

executionSettings <- Strategus::createCdmExecutionSettings(
workDatabaseSchema = workDatabaseSchema,
cdmDatabaseSchema = cdmDatabaseSchema,
cohortTableNames = CohortGenerator::getCohortTableNames(cohortTable = cohortTableName),
workFolder = file.path(outputLocation, databaseName, "strategusWork"),
resultsFolder = file.path(outputLocation, databaseName, "strategusOutput"),
minCellCount = minCellCount
)

if (!dir.exists(file.path(outputLocation, databaseName))) {
dir.create(file.path(outputLocation, databaseName), recursive = T)
}
ParallelLogger::saveSettingsToJson(
object = executionSettings,
fileName = file.path(outputLocation, databaseName, "executionSettings.json")
)

Strategus::execute(
analysisSpecifications = analysisSpecifications,
executionSettings = executionSettings,
connectionDetails = connectionDetails
)
`,

    "DownloadCohorts.R": `################################################################################
# DownloadCohorts.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: This script assumes you have cohorts in an ATLAS instance.
# Update the baseUrl and cohort IDs for your environment.
# Store downloaded cohorts in the "inst" folder.
#
# See the Download cohorts section of UsingThisTemplate.md for more details.
# ##############################################################################

library(dplyr)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: ATLAS Connection
# ═══════════════════════════════════════════════════════════════════════════════
baseUrl <- "https://atlas-demo.ohdsi.org/WebAPI" # CUSTOMIZE: Your ATLAS WebAPI URL

# Use this if your WebAPI instance has security enabled:
# ROhdsiWebApi::authorizeWebApi(
#   baseUrl = baseUrl,
#   authMethod = "windows"
# )

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Cohort IDs and Names
# Change: Set your ATLAS cohort IDs and rename them for your study
# ═══════════════════════════════════════════════════════════════════════════════
cohortDefinitionSet <- ROhdsiWebApi::exportCohortDefinitionSet(
baseUrl = baseUrl,
cohortIds = c(
  1778211, # CUSTOMIZE: Target cohort ATLAS ID (e.g., celecoxib)
  1790989, # CUSTOMIZE: Comparator cohort ATLAS ID (e.g., diclofenac)
  1780946  # CUSTOMIZE: Outcome cohort ATLAS ID (e.g., GI Bleed)
),
generateStats = TRUE
)

# CUSTOMIZE: Rename cohorts to study-meaningful names
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1778211,]$cohortName <- "celecoxib"
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1790989,]$cohortName <- "diclofenac"
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1780946,]$cohortName <- "GI Bleed"

# CUSTOMIZE: Re-number cohorts to sequential IDs
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1778211,]$cohortId <- 1
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1790989,]$cohortId <- 2
cohortDefinitionSet[cohortDefinitionSet$cohortId == 1780946,]$cohortId <- 3

# CUSTOMIZE: Update output paths for your study
CohortGenerator::saveCohortDefinitionSet(
cohortDefinitionSet = cohortDefinitionSet,
settingsFileName = "inst/sampleStudy/Cohorts.csv",
jsonFolder = "inst/sampleStudy/cohorts",
sqlFolder = "inst/sampleStudy/sql/sql_server",
)


# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Negative Control Outcomes
# ═══════════════════════════════════════════════════════════════════════════════
negativeControlOutcomeCohortSet <- ROhdsiWebApi::getConceptSetDefinition(
conceptSetId = 1885090, # CUSTOMIZE: Your negative control concept set ID
baseUrl = baseUrl
) %>%
ROhdsiWebApi::resolveConceptSet(
  baseUrl = baseUrl
) %>%
ROhdsiWebApi::getConcepts(
  baseUrl = baseUrl
) %>%
rename(outcomeConceptId = "conceptId",
       cohortName = "conceptName") %>%
mutate(cohortId = row_number() + 100) %>%
select(cohortId, cohortName, outcomeConceptId)

# CUSTOMIZE: Update file location for your study
CohortGenerator::writeCsv(
x = negativeControlOutcomeCohortSet,
file = "inst/sampleStudy/negativeControlOutcomes.csv",
warnOnFileNameCaseMismatch = F
)
`,

    "CreateResultsDataModel.R": `################################################################################
# CreateResultsDataModel.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: The code below assumes you have access to a PostgreSQL database
# and permissions to create tables in an existing schema specified by the
# resultsDatabaseSchema parameter.
#
# See the Working with results section of UsingThisTemplate.md for more details.
#
# More information about working with results produced by running Strategus
# is found at:
# https://ohdsi.github.io/Strategus/articles/WorkingWithResults.html
# ##############################################################################

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Results database connection
# ═══════════════════════════════════════════════════════════════════════════════
resultsDatabaseSchema <- "results" # CUSTOMIZE: Your results schema name

# CUSTOMIZE: Update path to your analysis specification
analysisSpecifications <- ParallelLogger::loadSettingsFromJson(
fileName = "inst/sampleStudy/sampleStudyAnalysisSpecification.json"
)

# CUSTOMIZE: PostgreSQL connection details
resultsDatabaseConnectionDetails <- DatabaseConnector::createConnectionDetails(
dbms = "postgresql",
server = Sys.getenv("OHDSI_RESULTS_DATABASE_SERVER"),
user = Sys.getenv("OHDSI_RESULTS_DATABASE_USER"),
password = Sys.getenv("OHDSI_RESULTS_DATABASE_PASSWORD")
)

# DO NOT MODIFY below --------------------------------------------------------
resultsFolder <- list.dirs(path = "results", full.names = T, recursive = F)[1]
resultsDataModelSettings <- Strategus::createResultsDataModelSettings(
resultsDatabaseSchema = resultsDatabaseSchema,
resultsFolder = file.path(resultsFolder, "strategusOutput")
)

Strategus::createResultDataModel(
analysisSpecifications = analysisSpecifications,
resultsDataModelSettings = resultsDataModelSettings,
resultsConnectionDetails = resultsDatabaseConnectionDetails
)
`,

    "UploadResults.R": `################################################################################
# UploadResults.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: The code below assumes you have access to a PostgreSQL database
# and permissions to insert data into tables created by running the
# CreateResultsDataModel.R script. This script will loop over all of the
# directories found under the "results" folder and upload the results.
#
# See the Working with results section of UsingThisTemplate.md for more details.
#
# More information:
# https://ohdsi.github.io/Strategus/articles/WorkingWithResults.html
# ##############################################################################

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Results database connection
# ═══════════════════════════════════════════════════════════════════════════════
resultsDatabaseSchema <- "results" # CUSTOMIZE: Your results schema name

# CUSTOMIZE: Update path to your analysis specification
analysisSpecifications <- ParallelLogger::loadSettingsFromJson(
fileName = "inst/sampleStudy/sampleStudyAnalysisSpecification.json"
)

# CUSTOMIZE: PostgreSQL connection details
resultsDatabaseConnectionDetails <- DatabaseConnector::createConnectionDetails(
dbms = "postgresql",
server = Sys.getenv("OHDSI_RESULTS_DATABASE_SERVER"),
user = Sys.getenv("OHDSI_RESULTS_DATABASE_USER"),
password = Sys.getenv("OHDSI_RESULTS_DATABASE_PASSWORD")
)

# DO NOT MODIFY below --------------------------------------------------------

# Setup logging
ParallelLogger::clearLoggers()
ParallelLogger::addDefaultFileLogger(
fileName = "upload-log.txt",
name = "RESULTS_FILE_LOGGER"
)
ParallelLogger::addDefaultErrorReportLogger(
fileName = "upload-errorReport.txt",
name = "RESULTS_ERROR_LOGGER"
)

# Upload Results
for (resultFolder in list.dirs(path = "results", full.names = T, recursive = F)) {
resultsDataModelSettings <- Strategus::createResultsDataModelSettings(
  resultsDatabaseSchema = resultsDatabaseSchema,
  resultsFolder = file.path(resultFolder, "strategusOutput"),
)

Strategus::uploadResults(
  analysisSpecifications = analysisSpecifications,
  resultsDataModelSettings = resultsDataModelSettings,
  resultsConnectionDetails = resultsDatabaseConnectionDetails
)
}

connection <- DatabaseConnector::connect(
connectionDetails = resultsDatabaseConnectionDetails
)

# Optional: Grant read-only permissions for Shiny viewer
# sql <- "GRANT USAGE ON SCHEMA @schema TO @results_user;
# GRANT SELECT ON ALL TABLES IN SCHEMA @schema TO @results_user;
# GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA @schema TO @results_user;"
# DatabaseConnector::executeSql(connection, SqlRender::render(sql,
#   schema = resultsDatabaseSchema, results_user = 'shinyproxy'))

# Unregister loggers
ParallelLogger::unregisterLogger("RESULTS_FILE_LOGGER")
ParallelLogger::unregisterLogger("RESULTS_ERROR_LOGGER")
`,

    "EvidenceSynthesis.R": `################################################################################
# EvidenceSynthesis.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: The code below assumes you uploaded results to a PostgreSQL
# database per the UploadResults.R script. This script will create the
# analysis specification for running the EvidenceSynthesis module, execute
# EvidenceSynthesis, create the results tables and upload the results.
#
# Review the code below and note the "sourceMethod" parameter. If your
# study is not using CohortMethod and/or SelfControlledCaseSeries you should
# remove that from the evidenceSynthesisAnalysisList.
# ##############################################################################

library(dplyr)
library(Strategus)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Results database connection
# ═══════════════════════════════════════════════════════════════════════════════
resultsDatabaseSchema <- "results" # CUSTOMIZE: Your results schema name

# CUSTOMIZE: PostgreSQL connection details
resultsConnectionDetails <- DatabaseConnector::createConnectionDetails(
dbms = "postgresql",
server = Sys.getenv("OHDSI_RESULTS_DATABASE_SERVER"),
user = Sys.getenv("OHDSI_RESULTS_DATABASE_USER"),
password = Sys.getenv("OHDSI_RESULTS_DATABASE_PASSWORD")
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Evidence Synthesis Configuration
# Remove CohortMethod or SCCS source if not used in your study
# ═══════════════════════════════════════════════════════════════════════════════
esModuleSettingsCreator = EvidenceSynthesisModule$new()
evidenceSynthesisSourceCm <- esModuleSettingsCreator$createEvidenceSynthesisSource(
sourceMethod = "CohortMethod",
likelihoodApproximation = "adaptive grid"
)
metaAnalysisCm <- esModuleSettingsCreator$createBayesianMetaAnalysis(
evidenceSynthesisAnalysisId = 1,
alpha = 0.05,
evidenceSynthesisDescription = "Bayesian random-effects alpha 0.05 - adaptive grid",
evidenceSynthesisSource = evidenceSynthesisSourceCm
)
evidenceSynthesisSourceSccs <- esModuleSettingsCreator$createEvidenceSynthesisSource(
sourceMethod = "SelfControlledCaseSeries",
likelihoodApproximation = "adaptive grid"
)
metaAnalysisSccs <- esModuleSettingsCreator$createBayesianMetaAnalysis(
evidenceSynthesisAnalysisId = 2,
alpha = 0.05,
evidenceSynthesisDescription = "Bayesian random-effects alpha 0.05 - adaptive grid",
evidenceSynthesisSource = evidenceSynthesisSourceSccs
)
evidenceSynthesisAnalysisList <- list(metaAnalysisCm, metaAnalysisSccs)
evidenceSynthesisAnalysisSpecifications <- esModuleSettingsCreator$createModuleSpecifications(
evidenceSynthesisAnalysisList
)
esAnalysisSpecifications <- Strategus::createEmptyAnalysisSpecificiations() |>
Strategus::addModuleSpecifications(evidenceSynthesisAnalysisSpecifications)

ParallelLogger::saveSettingsToJson(
esAnalysisSpecifications,
file.path("inst/sampleStudy/esAnalysisSpecification.json"))

# DO NOT MODIFY below --------------------------------------------------------
resultsExecutionSettings <- Strategus::createResultsExecutionSettings(
resultsDatabaseSchema = resultsDatabaseSchema,
resultsFolder = file.path("results", "evidence_sythesis", "strategusOutput"),
workFolder = file.path("results", "evidence_sythesis", "strategusWork")
)

Strategus::execute(
analysisSpecifications = esAnalysisSpecifications,
executionSettings = resultsExecutionSettings,
connectionDetails = resultsConnectionDetails
)

resultsDataModelSettings <- Strategus::createResultsDataModelSettings(
resultsDatabaseSchema = resultsDatabaseSchema,
resultsFolder = resultsExecutionSettings$resultsFolder,
)

Strategus::createResultDataModel(
analysisSpecifications = esAnalysisSpecifications,
resultsDataModelSettings = resultsDataModelSettings,
resultsConnectionDetails = resultsConnectionDetails
)

Strategus::uploadResults(
analysisSpecifications = esAnalysisSpecifications,
resultsDataModelSettings = resultsDataModelSettings,
resultsConnectionDetails = resultsConnectionDetails
)
`,

    "ShareResults.R": `# ShareResults.R
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# Zips and uploads results to the study coordinator via SFTP.

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Set these values to match your StrategusCodeToRun.R settings
# ═══════════════════════════════════════════════════════════════════════════════
##=========== START OF INPUTS ==========
outputLocation <- file.path(getwd()) # CUSTOMIZE: Path to your project root
databaseName <- "Eunomia"           # CUSTOMIZE: Must match StrategusCodeToRun.R
# For uploading the results. You should have received the key file from the study coordinator:
keyFileName <- "[location where you are storing: e.g. ~/keys/study-data-site-covid19.dat]" # CUSTOMIZE
userName <- "[user name provided by the study coordinator]"                                  # CUSTOMIZE

##=========== END OF INPUTS ==========

##################################
# DO NOT MODIFY BELOW THIS POINT
##################################
outputLocation <- file.path(outputLocation, "results", databaseName, "strategusOutput")
zipFile <- file.path(outputLocation, paste0(databaseName, ".zip"))

Strategus::zipResults(
resultsFolder = outputLocation,
zipFile = zipFile
)

OhdsiSharing::sftpUploadFile(
privateKeyFileName = keyFileName,
userName = userName,
remoteFolder = "/your-study/",
fileName = zipFile
)
`,

    "app.R": `################################################################################
# app.R - Shiny Results Viewer
# Based on: https://github.com/ohdsi-studies/StrategusStudyRepoTemplate
#
# INSTRUCTIONS: The code below assumes you uploaded results to a PostgreSQL
# database per the UploadResults.R script. This script will launch a Shiny
# results viewer to analyze results from the study.
#
# See the Working with results section of UsingThisTemplate.md for more details.
#
# More information:
# https://ohdsi.github.io/Strategus/articles/WorkingWithResults.html
# ##############################################################################

library(ShinyAppBuilder)
library(OhdsiShinyModules)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: Results database connection
# ═══════════════════════════════════════════════════════════════════════════════
resultsDatabaseSchema <- "results" # CUSTOMIZE: Your results schema name

# CUSTOMIZE: PostgreSQL connection details
resultsConnectionDetails <- DatabaseConnector::createConnectionDetails(
dbms = "postgresql",
server = Sys.getenv("OHDSI_RESULTS_DATABASE_SERVER"),
user = Sys.getenv("OHDSI_RESULTS_DATABASE_USER"),
password = Sys.getenv("OHDSI_RESULTS_DATABASE_PASSWORD")
)

# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMIZE: ADD OR REMOVE MODULES TAILORED TO YOUR STUDY
# Comment out modules you did not include in your analysis specification
# ═══════════════════════════════════════════════════════════════════════════════
shinyConfig <- initializeModuleConfig() |>
addModuleConfig(
  createDefaultAboutConfig()
)  |>
addModuleConfig(
  createDefaultDatasourcesConfig()
)  |>
addModuleConfig(
  createDefaultCohortGeneratorConfig()
) |>
addModuleConfig(
  createDefaultCohortDiagnosticsConfig()
) |>
addModuleConfig(
  createDefaultCharacterizationConfig()
) |>
addModuleConfig(
  createDefaultPredictionConfig()
) |>
addModuleConfig(
  createDefaultEstimationConfig()
)

# DO NOT MODIFY below --------------------------------------------------------
ShinyAppBuilder::createShinyApp(
config = shinyConfig,
connectionDetails = resultsConnectionDetails,
resultDatabaseSettings = createDefaultResultDatabaseSettings(schema = resultsDatabaseSchema)
)
`,

    "README.md": `[Study title]
=============

<img src="https://img.shields.io/badge/Study%20Status-Repo%20Created-lightgray.svg" alt="Study Status: Repo Created">

- Analytics use case(s): **-**
- Study type: **-**
- Tags: **-**
- Study lead: **-**
- Study lead forums tag: **[[Lead tag]](https://forums.ohdsi.org/u/[Lead tag])**
- Study start date: **-**
- Study end date: **-**
- Protocol: **-**
- Publications: **-**
- Results explorer: **-**

[Description (single paragraph)]

[You can add other text at this point]

## Requirements

- R (version 4.x recommended)
- Java (for DatabaseConnector)
- Python (for PatientLevelPrediction)
- Access to an OMOP CDM database

## Execution

See [template_docs/StudyExecution.md](template_docs/StudyExecution.md) for detailed instructions.

1. Clone this repository
2. Open the .Rproj file in RStudio
3. Run \\\`renv::restore()\\\` to install dependencies
4. Edit \\\`StrategusCodeToRun.R\\\` with your database connection details
5. Source \\\`StrategusCodeToRun.R\\\` to execute the study
`,

    "inst/sampleStudy/Cohorts.csv": `atlas_id,cohort_id,cohort_name,logic_description,generate_stats
20126,20126,ACE inhibitor,NA,TRUE
20127,20127,Diuretic,NA,TRUE
20128,20128,Hypertensive disorder,NA,TRUE
20129,20129,Acute myocardial infarction,NA,TRUE
20130,20130,Angioedema,NA,TRUE
`,

    "inst/sampleStudy/negativeControlOutcomes.csv": `cohort_id,cohort_name,outcome_concept_id
101,Allergic rhinitis,257007
102,Carpal tunnel syndrome,380094
103,Cerebral palsy,4134120
104,Chronic obstructive lung disease,255573
105,Contact dermatitis,134438
106,Cyst of ovary,197610
107,Deviated nasal septum,377910
108,Dislocation of shoulder joint,4213373
109,Endometriosis (clinical),433527
110,Foreign body in ear,374801
111,Gout,440674
112,Hemorrhoids,195562
113,Hypoparathyroidism,140362
114,Influenza,4266367
115,Ingrowing nail,139099
116,Osteoarthritis of knee,4079750
117,Prostatitis,194997
118,Sciatica,372409
119,Sleep apnea,313459
120,Vitamin D deficiency,436070
`,

    "inst/sampleStudy/cohorts/.gitkeep": ``,

    "inst/sampleStudy/sql/.gitkeep": ``,

    ".gitignore": `# R
.Rhistory
.Rdata
.Ruserdata
.RData
.Rproj.user/

# Results (do not commit patient-level data)
results/
output/

# renv library (installed packages)
renv/library/
renv/staging/
renv/cellar/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Credentials
.Renviron
`,

    ".Rprofile": `source("renv/activate.R")
`,

    ".renvignore": `/extras/
/tests/
/results/
`,

    "template_docs/UsingThisTemplate.md": `Using the Strategus Study Repo Template
=================

This guide walks through how to use the Strategus study repo template to set
up a project for an OHDSI Network study. Based on the official
[StrategusStudyRepoTemplate](https://github.com/ohdsi-studies/StrategusStudyRepoTemplate).

## Roles

- **Project Author**: Responsible for study design, creating the analysis
specification, testing on sample data, and distributing to sites.
- **Site Participant**: Responsible for executing the study against their
OMOP CDM and sharing results. See [StudyExecution.md](StudyExecution.md).

## Workflow

### 1. Environment Setup
- Follow [HADES R Setup guide](https://ohdsi.github.io/Hades/rSetup.html)
- Install Python via [Reticulate](https://ohdsi.github.io/PatientLevelPrediction/articles/InstallationGuide.html#creating-python-reticulate-environment)
- Run \\\`renv::restore()\\\` to restore the R & Python environment

### 2. Download Cohorts
- Define cohorts and negative controls in [ATLAS](https://atlas-demo.ohdsi.org/)
- Use \\\`DownloadCohorts.R\\\` to download and store them in \\\`inst/\\\`
- See [Creating Cohort Definitions](https://ohdsi.github.io/TheBookOfOhdsi/Cohorts.html)

### 3. Create Analysis Specifications
- Review [Strategus docs](https://ohdsi.github.io/Strategus/articles/CreatingAnalysisSpecification.html)
- Edit \\\`CreateStrategusAnalysisSpecification.R\\\` (or the TCIS variant for signal detection)
- Look for \\\`# CUSTOMIZE:\\\` markers indicating what to change
- Comment out unused modules in the Build Specification section
- Output: JSON specification file in \\\`inst/\\\`

### 4. Test on Sample Data
- Run \\\`StrategusCodeToRun.R\\\` with Eunomia sample data
- Verify results are generated in \\\`results/\\\` folder

### 5. Working with Results
- \\\`CreateResultsDataModel.R\\\`: Create PostgreSQL schema for results
- \\\`UploadResults.R\\\`: Upload site results to shared database
- \\\`app.R\\\`: Launch Shiny results viewer
- \\\`EvidenceSynthesis.R\\\`: Meta-analysis across databases (if applicable)

### 6. Distribution
- Update \\\`README.md\\\` with study details
- Customize \\\`template_docs/StudyExecution.md\\\` for site participants
- Remove \\\`inst/sampleStudy\\\` sample data before distributing
`,

    "template_docs/StudyExecution.md": `## How to run the study

The following instructions will guide site participants through executing
this network study.

## System setup

1. Follow [HADES R Setup](https://ohdsi.github.io/Hades/rSetup.html) - install R, RTools, RStudio, Java
2. Install Python via [Reticulate](https://ohdsi.github.io/PatientLevelPrediction/articles/InstallationGuide.html#creating-python-reticulate-environment)
3. Verify database connectivity via DatabaseConnector

## Download and restore

1. Download the study package
2. Open the \\\`.Rproj\\\` file in RStudio
3. Run \\\`renv::restore()\\\` and follow prompts (~30 minutes first time)
4. Restart RStudio after restore completes

## Running the study

Open \\\`StrategusCodeToRun.R\\\` and edit the inputs section:

- **cdmDatabaseSchema**: Schema holding your OMOP CDM data
- **workDatabaseSchema**: Schema with write access for cohort tables
- **outputLocation**: Path to your project directory
- **databaseName**: Name of your OMOP CDM database (used for folder naming)
- **minCellCount**: Site-specific privacy threshold
- **cohortTableName**: Prefix for cohort tables
- **connectionDetails**: Your CDM connection details

Then run the full script.

## Sharing Results

Results are in: \\\`results/<databaseName>/strategusOutput/\\\`

Use \\\`ShareResults.R\\\` to zip and upload:
- Set **outputLocation** and **databaseName** to match StrategusCodeToRun.R
- Set **keyFileName** and **userName** from the study coordinator
`,

  },
};
