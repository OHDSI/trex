"""
Strategus Spec Builder for Pyodide

Standalone Strategus Analysis Specification Builder for Pyodide (browser-based Python).
This module provides functions to create Strategus analysis specifications
without requiring Java dependencies or R packages.

Usage:
    # In Pyodide (browser)
    from strategus_spec_builder import *

    # Or load from URL
    import pyodide_http
    pyodide_http.patch_all()
    exec(requests.get("https://raw.githubusercontent.com/OHDSI/Strategus/main/inst/pyodide/strategus_spec_builder.py").text)

Dependencies:
    - None (pure Python, works in Pyodide)

Based on Strategus v1.4.1

HADES Package Version Tracking (for maintenance):
    - CohortMethod 5.4.0
    - CohortDiagnostics 3.3.0
    - FeatureExtraction 3.7.0
    - Characterization 2.0.0
    - Cyclops 3.5.0
    - SelfControlledCaseSeries (latest)
    - PatientLevelPrediction (latest)
    - EvidenceSynthesis (latest)
    - CohortIncidence (latest)
    - CohortSurvival (darwin-eu)

Note: Default settings are inlined from the HADES packages listed above.
If HADES package defaults change, this file may need updates.
"""

from __future__ import annotations
import json
import math
from dataclasses import dataclass, field
from typing import Any, Optional, Union


# =============================================================================
# Specification Classes
# =============================================================================

@dataclass
class AnalysisSpecifications:
    """Container for Strategus analysis specifications."""
    shared_resources: list = field(default_factory=list)
    module_specifications: list = field(default_factory=list)
    _class: str = field(default="AnalysisSpecifications", repr=False)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "sharedResources": self.shared_resources,
            "moduleSpecifications": self.module_specifications
        }

    def to_json(self, pretty: bool = True) -> str:
        """Serialize to JSON string."""
        return json.dumps(self.to_dict(), indent=2 if pretty else None)


@dataclass
class SharedResources:
    """Base class for shared resources."""
    _class: tuple = field(default=("SharedResources",), repr=False)

    def to_dict(self) -> dict:
        """Convert to dictionary, excluding private fields."""
        result = {}
        for k, v in self.__dict__.items():
            if not k.startswith("_"):
                result[k] = v
        return result


@dataclass
class ModuleSpecifications:
    """Base class for module specifications."""
    module: str
    settings: dict
    _class: tuple = field(default=("ModuleSpecifications",), repr=False)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "module": self.module,
            "settings": self.settings
        }


# =============================================================================
# Internal Helper Functions
# =============================================================================

def _is_cohort_definition_set(df: list[dict]) -> bool:
    """Validate cohort definition set structure."""
    if not isinstance(df, list) or len(df) == 0:
        return False
    required_cols = {"cohortId", "cohortName", "sql", "json"}
    return all(required_cols.issubset(row.keys()) for row in df)


def _listafy(df: list[dict]) -> list[dict]:
    """Convert cohort definition set to list format for JSON."""
    result = []
    for row in df:
        cohort_data = {
            "cohortId": row["cohortId"],
            "cohortName": row["cohortName"],
            "cohortDefinition": row["json"]
        }
        result.append(cohort_data)
    return result


# =============================================================================
# Inlined Default Settings (from HADES packages)
# =============================================================================

def _create_default_cm_diagnostic_thresholds() -> dict:
    """CohortMethod diagnostic thresholds (from CohortMethod::createCmDiagnosticThresholds)."""
    return {
        "mdrrThreshold": 10,
        "easeThreshold": 0.25,
        "sdmThreshold": 0.1,
        "equipoiseThreshold": 0.2,
        "generalizabilitySdmThreshold": 1,
        "_class": "CmDiagnosticThresholds"
    }


def _create_default_es_diagnostic_thresholds() -> dict:
    """Evidence Synthesis diagnostic thresholds."""
    return {
        "mdrrThreshold": 10,
        "easeThreshold": 0.25,
        "i2Threshold": 0.4,
        "tauThreshold": math.log(2),  # ~0.693
        "_class": "EsDiagnosticThresholds"
    }


def _get_default_characterization_covariate_settings() -> dict:
    """Characterization covariate settings (from FeatureExtraction)."""
    return {
        "temporal": False,
        "temporalSequence": False,
        # Demographics - all enabled
        "useDemographicsGender": True,
        "useDemographicsAge": True,
        "useDemographicsAgeGroup": True,
        "useDemographicsRace": True,
        "useDemographicsEthnicity": True,
        "useDemographicsIndexYear": True,
        "useDemographicsIndexMonth": True,
        "useDemographicsTimeInCohort": True,
        "useDemographicsPriorObservationTime": True,
        "useDemographicsPostObservationTime": True,
        # Long term covariates
        "useConditionGroupEraLongTerm": True,
        "useDrugGroupEraOverlapping": True,
        "useDrugGroupEraLongTerm": True,
        "useProcedureOccurrenceLongTerm": True,
        "useMeasurementLongTerm": True,
        "useObservationLongTerm": True,
        "useDeviceExposureLongTerm": True,
        "useVisitConceptCountLongTerm": True,
        # Short term covariates
        "useConditionGroupEraShortTerm": True,
        "useDrugGroupEraShortTerm": True,
        "useProcedureOccurrenceShortTerm": True,
        "useMeasurementShortTerm": True,
        "useObservationShortTerm": True,
        "useDeviceExposureShortTerm": True,
        "useVisitConceptCountShortTerm": True,
        # Time windows
        "endDays": 0,
        "longTermStartDays": -365,
        "shortTermStartDays": -30,
        # Concept filtering
        "includedCovariateConceptIds": [],
        "excludedCovariateConceptIds": [],
        "includedCovariateIds": [],
        "addDescendantsToInclude": False,
        "addDescendantsToExclude": False,
        "_class": "covariateSettings",
        "_fun": "getDbCovariateData"
    }


def _get_default_case_covariate_settings() -> dict:
    """Characterization case (during) covariate settings."""
    return {
        "useConditionGroupEraDuring": True,
        "useDrugGroupEraDuring": True,
        "useProcedureOccurrenceDuring": True,
        "useDeviceExposureDuring": True,
        "useMeasurementDuring": True,
        "useObservationDuring": True,
        "useVisitConceptCountDuring": True,
        "_class": "covariateSettings",
        "_fun": "Characterization::getDuringCovariateData"
    }


def _get_default_temporal_covariate_settings() -> dict:
    """CohortDiagnostics temporal covariate settings."""
    return {
        "temporal": True,
        "temporalSequence": False,
        # Condition covariates
        "useConditionEraGroupStart": True,
        "useConditionEraGroupOverlap": True,
        # Drug covariates
        "useDrugEraGroupStart": True,
        "useDrugEraGroupOverlap": True,
        # Visit covariates
        "useVisitConceptCountStart": True,
        "useVisitConceptCountOverlap": True,
        # Time windows (mandatory for CohortDiagnostics)
        "temporalStartDays": [-365, -30, -365, -30, 0, 1, 31, -9999],
        "temporalEndDays": [0, 0, -31, -1, 0, 30, 365, 9999],
        # Concept filtering
        "includedCovariateConceptIds": [],
        "excludedCovariateConceptIds": [],
        "includedCovariateIds": [],
        "addDescendantsToInclude": False,
        "addDescendantsToExclude": False,
        "_class": "covariateSettings",
        "_fun": "getDbCovariateData"
    }


# =============================================================================
# Cyclops Helper Functions
# =============================================================================

def create_prior(prior_type: str = "laplace",
                 variance: float = 1,
                 exclude: list = None,
                 graph: Any = None,
                 neighborhood: Any = None,
                 use_cross_validation: bool = True,
                 force_intercept: bool = False) -> dict:
    """Create a Cyclops prior specification."""
    return {
        "priorType": prior_type,
        "variance": variance,
        "exclude": exclude if exclude is not None else [],
        "graph": graph,
        "neighborhood": neighborhood,
        "useCrossValidation": use_cross_validation,
        "forceIntercept": force_intercept,
        "_class": "cyclopsPrior"
    }


def create_control(max_iterations: int = 1000,
                   tolerance: float = 1e-6,
                   convergence_type: str = "gradient",
                   auto_search: bool = True,
                   fold: int = 10,
                   cv_repetitions: int = 1,
                   starting_variance: float = 0.01,
                   lower_limit: float = 0.01,
                   upper_limit: float = 20,
                   seed: Optional[int] = None,
                   reset_coefficients: bool = False,
                   noise_level: str = "silent",
                   threads: int = 1,
                   cv_type: str = "auto",
                   selector_type: str = "byPid") -> dict:
    """Create a Cyclops control specification."""
    return {
        "maxIterations": max_iterations,
        "tolerance": tolerance,
        "convergenceType": convergence_type,
        "autoSearch": auto_search,
        "fold": fold,
        "cvRepetitions": cv_repetitions,
        "startingVariance": starting_variance,
        "lowerLimit": lower_limit,
        "upperLimit": upper_limit,
        "seed": seed,
        "resetCoefficients": reset_coefficients,
        "noiseLevel": noise_level,
        "threads": threads,
        "cvType": cv_type,
        "selectorType": selector_type,
        "_class": "cyclopsControl"
    }


# =============================================================================
# FeatureExtraction Builder Functions
# =============================================================================

def create_covariate_settings(**kwargs) -> dict:
    """Create covariate settings for FeatureExtraction.

    Accepts all use* boolean flags (default False) plus:
    - long_term_start_days (-365), medium_term_start_days (-180),
      short_term_start_days (-30), end_days (0)
    - included/excluded covariate concept/covariate IDs
    """
    _USE_FLAGS = [
        "useDemographicsGender", "useDemographicsAge", "useDemographicsAgeGroup",
        "useDemographicsRace", "useDemographicsEthnicity", "useDemographicsIndexYear",
        "useDemographicsIndexMonth", "useDemographicsPriorObservationTime",
        "useDemographicsPostObservationTime", "useDemographicsTimeInCohort",
        "useDemographicsIndexYearMonth", "useCareSiteId",
        "useConditionOccurrenceAnyTimePrior", "useConditionOccurrenceLongTerm",
        "useConditionOccurrenceMediumTerm", "useConditionOccurrenceShortTerm",
        "useConditionOccurrencePrimaryInpatientAnyTimePrior",
        "useConditionOccurrencePrimaryInpatientLongTerm",
        "useConditionOccurrencePrimaryInpatientMediumTerm",
        "useConditionOccurrencePrimaryInpatientShortTerm",
        "useConditionEraAnyTimePrior", "useConditionEraLongTerm",
        "useConditionEraMediumTerm", "useConditionEraShortTerm",
        "useConditionEraOverlapping", "useConditionEraStartLongTerm",
        "useConditionEraStartMediumTerm", "useConditionEraStartShortTerm",
        "useConditionGroupEraAnyTimePrior", "useConditionGroupEraLongTerm",
        "useConditionGroupEraMediumTerm", "useConditionGroupEraShortTerm",
        "useConditionGroupEraOverlapping", "useConditionGroupEraStartLongTerm",
        "useConditionGroupEraStartMediumTerm", "useConditionGroupEraStartShortTerm",
        "useDrugExposureAnyTimePrior", "useDrugExposureLongTerm",
        "useDrugExposureMediumTerm", "useDrugExposureShortTerm",
        "useDrugEraAnyTimePrior", "useDrugEraLongTerm",
        "useDrugEraMediumTerm", "useDrugEraShortTerm",
        "useDrugEraOverlapping", "useDrugEraStartLongTerm",
        "useDrugEraStartMediumTerm", "useDrugEraStartShortTerm",
        "useDrugGroupEraAnyTimePrior", "useDrugGroupEraLongTerm",
        "useDrugGroupEraMediumTerm", "useDrugGroupEraShortTerm",
        "useDrugGroupEraOverlapping", "useDrugGroupEraStartLongTerm",
        "useDrugGroupEraStartMediumTerm", "useDrugGroupEraStartShortTerm",
        "useProcedureOccurrenceAnyTimePrior", "useProcedureOccurrenceLongTerm",
        "useProcedureOccurrenceMediumTerm", "useProcedureOccurrenceShortTerm",
        "useDeviceExposureAnyTimePrior", "useDeviceExposureLongTerm",
        "useDeviceExposureMediumTerm", "useDeviceExposureShortTerm",
        "useMeasurementAnyTimePrior", "useMeasurementLongTerm",
        "useMeasurementMediumTerm", "useMeasurementShortTerm",
        "useMeasurementValueAnyTimePrior", "useMeasurementValueLongTerm",
        "useMeasurementValueMediumTerm", "useMeasurementValueShortTerm",
        "useMeasurementRangeGroupAnyTimePrior", "useMeasurementRangeGroupLongTerm",
        "useMeasurementRangeGroupMediumTerm", "useMeasurementRangeGroupShortTerm",
        "useMeasurementValueAsConceptAnyTimePrior", "useMeasurementValueAsConceptLongTerm",
        "useMeasurementValueAsConceptMediumTerm", "useMeasurementValueAsConceptShortTerm",
        "useObservationAnyTimePrior", "useObservationLongTerm",
        "useObservationMediumTerm", "useObservationShortTerm",
        "useObservationValueAsConceptAnyTimePrior", "useObservationValueAsConceptLongTerm",
        "useObservationValueAsConceptMediumTerm", "useObservationValueAsConceptShortTerm",
        "useCharlsonIndex", "useDcsi", "useChads2", "useChads2Vasc", "useHfrs",
        "useDistinctConditionCountLongTerm", "useDistinctConditionCountMediumTerm",
        "useDistinctConditionCountShortTerm", "useDistinctIngredientCountLongTerm",
        "useDistinctIngredientCountMediumTerm", "useDistinctIngredientCountShortTerm",
        "useDistinctProcedureCountLongTerm", "useDistinctProcedureCountMediumTerm",
        "useDistinctProcedureCountShortTerm", "useDistinctMeasurementCountLongTerm",
        "useDistinctMeasurementCountMediumTerm", "useDistinctMeasurementCountShortTerm",
        "useDistinctObservationCountLongTerm", "useDistinctObservationCountMediumTerm",
        "useDistinctObservationCountShortTerm", "useVisitCountLongTerm",
        "useVisitCountMediumTerm", "useVisitCountShortTerm",
        "useVisitConceptCountLongTerm", "useVisitConceptCountMediumTerm",
        "useVisitConceptCountShortTerm",
    ]
    settings = {"temporal": False, "temporalSequence": False}
    any_use_true = False
    for flag in _USE_FLAGS:
        val = kwargs.get(flag, False)
        if val:
            settings[flag.replace("use", "", 1)] = True
            any_use_true = True
    if not any_use_true:
        raise ValueError("No covariate analysis selected. Must select at least one")
    settings["longTermStartDays"] = kwargs.get("longTermStartDays", -365)
    settings["mediumTermStartDays"] = kwargs.get("mediumTermStartDays", -180)
    settings["shortTermStartDays"] = kwargs.get("shortTermStartDays", -30)
    settings["endDays"] = kwargs.get("endDays", 0)
    settings["includedCovariateConceptIds"] = kwargs.get("includedCovariateConceptIds", [])
    settings["addDescendantsToInclude"] = kwargs.get("addDescendantsToInclude", False)
    settings["excludedCovariateConceptIds"] = kwargs.get("excludedCovariateConceptIds", [])
    settings["addDescendantsToExclude"] = kwargs.get("addDescendantsToExclude", False)
    settings["includedCovariateIds"] = kwargs.get("includedCovariateIds", [])
    settings["_fun"] = "getDbDefaultCovariateData"
    settings["_class"] = "covariateSettings"
    return settings


def create_default_covariate_settings(
    included_covariate_concept_ids: list = None,
    add_descendants_to_include: bool = False,
    excluded_covariate_concept_ids: list = None,
    add_descendants_to_exclude: bool = False,
    included_covariate_ids: list = None
) -> dict:
    """Create default covariate settings (common demographics + condition/drug/procedure)."""
    settings = _get_default_characterization_covariate_settings()
    settings["includedCovariateConceptIds"] = included_covariate_concept_ids or []
    settings["addDescendantsToInclude"] = add_descendants_to_include
    settings["excludedCovariateConceptIds"] = excluded_covariate_concept_ids or []
    settings["addDescendantsToExclude"] = add_descendants_to_exclude
    settings["includedCovariateIds"] = included_covariate_ids or []
    settings["_fun"] = "getDbDefaultCovariateData"
    return settings


def create_temporal_covariate_settings(**kwargs) -> dict:
    """Create temporal covariate settings for FeatureExtraction.

    Accepts temporal use* boolean flags (default False) plus:
    - temporal_start_days (default [-365, -30, 0, 1, 31])
    - temporal_end_days (default [-31, -1, 0, 30, 365])
    - included/excluded covariate concept/covariate IDs
    """
    _USE_FLAGS = [
        "useDemographicsGender", "useDemographicsAge", "useDemographicsAgeGroup",
        "useDemographicsRace", "useDemographicsEthnicity", "useDemographicsIndexYear",
        "useDemographicsIndexMonth", "useDemographicsPriorObservationTime",
        "useDemographicsPostObservationTime", "useDemographicsTimeInCohort",
        "useDemographicsIndexYearMonth",
        "useConditionEraGroupStart", "useConditionEraGroupOverlap",
        "useDrugEraGroupStart", "useDrugEraGroupOverlap",
        "useProcedureOccurrenceStart", "useProcedureOccurrenceOverlap",
        "useDeviceExposureStart", "useDeviceExposureOverlap",
        "useMeasurementStart", "useMeasurementOverlap",
        "useObservationStart", "useObservationOverlap",
        "useVisitCountStart", "useVisitCountOverlap",
        "useVisitConceptCountStart", "useVisitConceptCountOverlap",
        "useConditionOccurrenceStart", "useConditionOccurrenceOverlap",
        "useDrugExposureStart", "useDrugExposureOverlap",
        "useConditionEraStart", "useConditionEraOverlap",
    ]
    settings = {"temporal": True, "temporalSequence": False}
    any_use_true = False
    for flag in _USE_FLAGS:
        val = kwargs.get(flag, False)
        if val:
            settings[flag.replace("use", "", 1)] = True
            any_use_true = True
    if not any_use_true:
        raise ValueError("No covariate analysis selected. Must select at least one")
    settings["temporalStartDays"] = kwargs.get("temporalStartDays", [-365, -30, 0, 1, 31])
    settings["temporalEndDays"] = kwargs.get("temporalEndDays", [-31, -1, 0, 30, 365])
    settings["includedCovariateConceptIds"] = kwargs.get("includedCovariateConceptIds", [])
    settings["addDescendantsToInclude"] = kwargs.get("addDescendantsToInclude", False)
    settings["excludedCovariateConceptIds"] = kwargs.get("excludedCovariateConceptIds", [])
    settings["addDescendantsToExclude"] = kwargs.get("addDescendantsToExclude", False)
    settings["includedCovariateIds"] = kwargs.get("includedCovariateIds", [])
    settings["_fun"] = "getDbDefaultCovariateData"
    settings["_class"] = "covariateSettings"
    return settings


def create_detailed_covariate_settings(analyses: list = None) -> dict:
    """Create detailed covariate settings."""
    return {
        "temporal": False,
        "temporalSequence": False,
        "analyses": analyses or [],
        "_fun": "getDbCovariateData",
        "_class": "covariateSettings"
    }


def create_analysis_details(
    analysis_id: int,
    sql_file_name: str,
    parameters: dict = None,
    included_covariate_concept_ids: list = None,
    add_descendants_to_include: bool = False,
    excluded_covariate_concept_ids: list = None,
    add_descendants_to_exclude: bool = False,
    included_covariate_ids: list = None
) -> dict:
    """Create analysis details for detailed covariate settings."""
    return {
        "analysisId": analysis_id,
        "sqlFileName": sql_file_name,
        "parameters": parameters or {},
        "includedCovariateConceptIds": included_covariate_concept_ids or [],
        "addDescendantsToInclude": add_descendants_to_include,
        "excludedCovariateConceptIds": excluded_covariate_concept_ids or [],
        "addDescendantsToExclude": add_descendants_to_exclude,
        "includedCovariateIds": included_covariate_ids or [],
        "_class": "analysisDetail"
    }


# =============================================================================
# CohortMethod Builder Functions
# =============================================================================

def create_get_db_cohort_method_data_args(
    covariate_settings: Optional[dict] = None,
    remove_duplicate_subjects: str = "keep first, truncate to second",
    first_exposure_only: bool = True,
    washout_period: int = 365,
    nesting_cohort_id: Optional[int] = None,
    restrict_to_common_period: bool = True,
    min_age: Optional[int] = None,
    max_age: Optional[int] = None,
    gender_concept_ids: Optional[list] = None,
    study_start_date: str = "",
    study_end_date: str = "",
    max_cohort_size: int = 0
) -> dict:
    """Create arguments for getDbCohortMethodData."""
    if covariate_settings is None:
        covariate_settings = create_default_covariate_settings()
    return {
        "covariateSettings": covariate_settings,
        "removeDuplicateSubjects": remove_duplicate_subjects,
        "firstExposureOnly": first_exposure_only,
        "washoutPeriod": washout_period,
        "nestingCohortId": nesting_cohort_id,
        "restrictToCommonPeriod": restrict_to_common_period,
        "minAge": min_age,
        "maxAge": max_age,
        "genderConceptIds": gender_concept_ids,
        "studyStartDate": study_start_date,
        "studyEndDate": study_end_date,
        "maxCohortSize": max_cohort_size,
        "_class": "GetDbCohortMethodDataArgs"
    }


def create_create_study_population_args(
    remove_subjects_with_prior_outcome: bool = True,
    prior_outcome_lookback: int = 99999,
    min_days_at_risk: int = 1,
    max_days_at_risk: int = 99999,
    risk_window_start: int = 0,
    start_anchor: str = "cohort start",
    risk_window_end: int = 0,
    end_anchor: str = "cohort end",
    censor_at_new_risk_window: bool = False
) -> dict:
    """Create arguments for CohortMethod createStudyPopulation."""
    return {
        "removeSubjectsWithPriorOutcome": remove_subjects_with_prior_outcome,
        "priorOutcomeLookback": prior_outcome_lookback,
        "minDaysAtRisk": min_days_at_risk,
        "maxDaysAtRisk": max_days_at_risk,
        "riskWindowStart": risk_window_start,
        "startAnchor": start_anchor,
        "riskWindowEnd": risk_window_end,
        "endAnchor": end_anchor,
        "censorAtNewRiskWindow": censor_at_new_risk_window,
        "_class": "CreateStudyPopulationArgs"
    }


def create_create_ps_args(
    exclude_covariate_ids: list = None,
    include_covariate_ids: list = None,
    max_cohort_size_for_fitting: int = 250000,
    error_on_high_correlation: bool = True,
    stop_on_error: bool = True,
    prior: Optional[dict] = None,
    control: Optional[dict] = None,
    estimator: str = "att"
) -> dict:
    """Create arguments for createPs."""
    if prior is None:
        prior = create_prior(prior_type="laplace", exclude=[0], use_cross_validation=True)
    if control is None:
        control = create_control(noise_level="silent", cv_type="auto", seed=1,
                                 reset_coefficients=True, tolerance=2e-07,
                                 cv_repetitions=10, starting_variance=0.01)
    return {
        "excludeCovariateIds": exclude_covariate_ids or [],
        "includeCovariateIds": include_covariate_ids or [],
        "maxCohortSizeForFitting": max_cohort_size_for_fitting,
        "errorOnHighCorrelation": error_on_high_correlation,
        "stopOnError": stop_on_error,
        "prior": prior,
        "control": control,
        "estimator": estimator,
        "_class": "CreatePsArgs"
    }


def create_trim_by_ps_args(
    trim_fraction: Optional[float] = None,
    equipoise_bounds: Optional[list] = None,
    max_weight: Optional[float] = None,
    trim_method: str = "symmetric"
) -> dict:
    """Create arguments for trimByPs."""
    return {
        "trimFraction": trim_fraction,
        "equipoiseBounds": equipoise_bounds,
        "maxWeight": max_weight,
        "trimMethod": trim_method,
        "_class": "TrimByPsArgs"
    }


def create_truncate_iptw_args(max_weight: float = 10) -> dict:
    """Create arguments for truncateIptw."""
    return {"maxWeight": max_weight, "_class": "TruncateIptwArgs"}


def create_match_on_ps_args(
    caliper: float = 0.2,
    caliper_scale: str = "standardized logit",
    max_ratio: int = 1,
    allow_reverse_match: bool = False,
    match_columns: list = None,
    match_covariate_ids: list = None
) -> dict:
    """Create arguments for matchOnPs."""
    return {
        "caliper": caliper,
        "caliperScale": caliper_scale,
        "maxRatio": max_ratio,
        "allowReverseMatch": allow_reverse_match,
        "matchColumns": match_columns or [],
        "matchCovariateIds": match_covariate_ids or [],
        "_class": "MatchOnPsArgs"
    }


def create_stratify_by_ps_args(
    number_of_strata: int = 10,
    base_selection: str = "all",
    stratification_columns: list = None,
    stratification_covariate_ids: list = None
) -> dict:
    """Create arguments for stratifyByPs."""
    return {
        "numberOfStrata": number_of_strata,
        "baseSelection": base_selection,
        "stratificationColumns": stratification_columns or [],
        "stratificationCovariateIds": stratification_covariate_ids or [],
        "_class": "StratifyByPsArgs"
    }


def create_compute_covariate_balance_args(
    subgroup_covariate_id: Optional[int] = None,
    max_cohort_size: int = 250000,
    covariate_filter: Optional[list] = None,
    threshold: float = 0.1,
    alpha: float = 0.05
) -> dict:
    """Create arguments for computeCovariateBalance."""
    return {
        "subgroupCovariateId": subgroup_covariate_id,
        "maxCohortSize": max_cohort_size,
        "covariateFilter": covariate_filter,
        "threshold": threshold,
        "alpha": alpha,
        "_class": "ComputeCovariateBalanceArgs"
    }


def create_fit_outcome_model_args(
    model_type: str = "cox",
    stratified: bool = False,
    use_covariates: bool = False,
    inverse_pt_weighting: bool = False,
    bootstrap_ci: bool = False,
    bootstrap_replicates: int = 200,
    interaction_covariate_ids: list = None,
    exclude_covariate_ids: list = None,
    include_covariate_ids: list = None,
    profile_grid: Optional[list] = None,
    profile_bounds: Optional[list] = None,
    prior: Optional[dict] = None,
    control: Optional[dict] = None
) -> dict:
    """Create arguments for fitOutcomeModel."""
    if profile_bounds is None:
        profile_bounds = [math.log(0.1), math.log(10)]
    if prior is None:
        prior = create_prior(prior_type="laplace", use_cross_validation=True)
    if control is None:
        control = create_control(cv_type="auto", starting_variance=0.01,
                                 tolerance=2e-07, noise_level="silent")
    return {
        "modelType": model_type,
        "stratified": stratified,
        "useCovariates": use_covariates,
        "inversePtWeighting": inverse_pt_weighting,
        "bootstrapCi": bootstrap_ci,
        "bootstrapReplicates": bootstrap_replicates,
        "interactionCovariateIds": interaction_covariate_ids or [],
        "excludeCovariateIds": exclude_covariate_ids or [],
        "includeCovariateIds": include_covariate_ids or [],
        "profileGrid": profile_grid,
        "profileBounds": profile_bounds,
        "prior": prior,
        "control": control,
        "_class": "FitOutcomeModelArgs"
    }


def create_cm_analysis(
    analysis_id: int = 1,
    description: str = "",
    get_db_cohort_method_data_args: dict = None,
    create_study_pop_args: dict = None,
    create_ps_args: Optional[dict] = None,
    trim_by_ps_args: Optional[dict] = None,
    truncate_iptw_args: Optional[dict] = None,
    match_on_ps_args: Optional[dict] = None,
    stratify_by_ps_args: Optional[dict] = None,
    compute_shared_covariate_balance_args: Optional[dict] = None,
    compute_covariate_balance_args: Optional[dict] = None,
    fit_outcome_model_args: Optional[dict] = None
) -> dict:
    """Create a CohortMethod analysis specification."""
    return {
        "analysisId": analysis_id,
        "description": description,
        "getDbCohortMethodDataArgs": get_db_cohort_method_data_args,
        "createStudyPopArgs": create_study_pop_args,
        "createPsArgs": create_ps_args,
        "trimByPsArgs": trim_by_ps_args,
        "truncateIptwArgs": truncate_iptw_args,
        "matchOnPsArgs": match_on_ps_args,
        "stratifyByPsArgs": stratify_by_ps_args,
        "computeSharedCovariateBalanceArgs": compute_shared_covariate_balance_args,
        "computeCovariateBalanceArgs": compute_covariate_balance_args,
        "fitOutcomeModelArgs": fit_outcome_model_args,
        "_class": "CmAnalysis"
    }


def create_outcome(
    outcome_id: int,
    outcome_of_interest: bool = True,
    true_effect_size: float = None,
    prior_outcome_lookback: Optional[int] = None,
    risk_window_start: Optional[int] = None,
    start_anchor: Optional[str] = None,
    risk_window_end: Optional[int] = None,
    end_anchor: Optional[str] = None
) -> dict:
    """Create an outcome definition for CohortMethod."""
    return {
        "outcomeId": outcome_id,
        "outcomeOfInterest": outcome_of_interest,
        "trueEffectSize": true_effect_size if true_effect_size is not None else math.nan,
        "priorOutcomeLookback": prior_outcome_lookback,
        "riskWindowStart": risk_window_start,
        "startAnchor": start_anchor,
        "riskWindowEnd": risk_window_end,
        "endAnchor": end_anchor,
        "_class": "Outcome"
    }


def create_target_comparator_outcomes(
    target_id: int,
    comparator_id: int,
    outcomes: list,
    nesting_cohort_id: Optional[int] = None,
    excluded_covariate_concept_ids: list = None,
    included_covariate_concept_ids: list = None
) -> dict:
    """Create a target-comparator-outcomes specification."""
    return {
        "targetId": target_id,
        "comparatorId": comparator_id,
        "outcomes": outcomes,
        "nestingCohortId": nesting_cohort_id,
        "excludedCovariateConceptIds": excluded_covariate_concept_ids or [],
        "includedCovariateConceptIds": included_covariate_concept_ids or [],
        "_class": "TargetComparatorOutcomes"
    }


def create_cm_diagnostic_thresholds(
    mdrr_threshold: float = 10,
    ease_threshold: float = 0.25,
    sdm_threshold: float = 0.1,
    sdm_alpha: Optional[float] = None,
    equipoise_threshold: float = 0.2,
    generalizability_sdm_threshold: float = 999
) -> dict:
    """Create CohortMethod diagnostic thresholds."""
    return {
        "mdrrThreshold": mdrr_threshold,
        "easeThreshold": ease_threshold,
        "sdmThreshold": sdm_threshold,
        "sdmAlpha": sdm_alpha,
        "equipoiseThreshold": equipoise_threshold,
        "generalizabilitySdmThreshold": generalizability_sdm_threshold,
        "_class": "CmDiagnosticThresholds"
    }


# =============================================================================
# SelfControlledCaseSeries Builder Functions
# =============================================================================

def create_era_covariate_settings(
    include_era_ids: Union[list, str],
    exclude_era_ids: Optional[list] = None,
    label: str = "Covariates",
    stratify_by_id: bool = False,
    start: int = 0,
    start_anchor: str = "era start",
    end: int = 0,
    end_anchor: str = "era end",
    first_occurrence_only: bool = False,
    allow_regularization: bool = False,
    profile_likelihood: bool = False,
    exposure_of_interest: bool = False
) -> dict:
    """Create era covariate settings for SCCS."""
    return {
        "includeEraIds": include_era_ids,
        "excludeEraIds": exclude_era_ids,
        "label": label,
        "stratifyById": stratify_by_id,
        "start": start,
        "startAnchor": start_anchor,
        "end": end,
        "endAnchor": end_anchor,
        "firstOccurrenceOnly": first_occurrence_only,
        "allowRegularization": allow_regularization,
        "profileLikelihood": profile_likelihood,
        "exposureOfInterest": exposure_of_interest,
        "_class": "EraCovariateSettings"
    }


def create_age_covariate_settings(
    age_knots: int = 5,
    allow_regularization: bool = False,
    compute_confidence_intervals: bool = False
) -> dict:
    """Create age covariate settings for SCCS."""
    return {
        "ageKnots": age_knots,
        "allowRegularization": allow_regularization,
        "computeConfidenceIntervals": compute_confidence_intervals,
        "_class": "AgeCovariateSettings"
    }


def create_seasonality_covariate_settings(
    season_knots: int = 5,
    allow_regularization: bool = False,
    compute_confidence_intervals: bool = False
) -> dict:
    """Create seasonality covariate settings for SCCS."""
    return {
        "seasonKnots": season_knots,
        "allowRegularization": allow_regularization,
        "computeConfidenceIntervals": compute_confidence_intervals,
        "_class": "SeasonalityCovariateSettings"
    }


def create_calendar_time_covariate_settings(
    calendar_time_knots: int = 5,
    allow_regularization: bool = False,
    compute_confidence_intervals: bool = False
) -> dict:
    """Create calendar time covariate settings for SCCS."""
    return {
        "calendarTimeKnots": calendar_time_knots,
        "allowRegularization": allow_regularization,
        "computeConfidenceIntervals": compute_confidence_intervals,
        "_class": "CalendarTimeCovariateSettings"
    }


def create_control_interval_settings(
    include_era_ids: Optional[list] = None,
    exclude_era_ids: Optional[list] = None,
    start: int = 0,
    start_anchor: str = "era start",
    end: int = 0,
    end_anchor: str = "era end",
    first_occurrence_only: bool = False
) -> dict:
    """Create control interval settings for SCRI."""
    return {
        "includeEraIds": include_era_ids,
        "excludeEraIds": exclude_era_ids,
        "start": start,
        "startAnchor": start_anchor,
        "end": end,
        "endAnchor": end_anchor,
        "firstOccurrenceOnly": first_occurrence_only,
        "_class": "ControlIntervalSettings"
    }


def create_get_db_sccs_data_args(
    nesting_cohort_id: Optional[int] = None,
    delete_covariates_small_count: int = 0,
    study_start_dates: list = None,
    study_end_dates: list = None,
    max_cases_per_outcome: int = 0,
    exposure_ids: Union[str, list] = "exposureId",
    custom_covariate_ids: Optional[list] = None
) -> dict:
    """Create arguments for getDbSccsData."""
    return {
        "nestingCohortId": nesting_cohort_id,
        "deleteCovariatesSmallCount": delete_covariates_small_count,
        "studyStartDates": study_start_dates or [],
        "studyEndDates": study_end_dates or [],
        "maxCasesPerOutcome": max_cases_per_outcome,
        "exposureIds": exposure_ids,
        "customCovariateIds": custom_covariate_ids,
        "_class": "GetDbSccsDataArgs"
    }


def create_sccs_create_study_population_args(
    first_outcome_only: bool = False,
    naive_period: int = 0,
    min_age: Optional[float] = None,
    max_age: Optional[float] = None,
    gender_concept_ids: Optional[list] = None,
    restrict_time_to_era_id: Optional[int] = None
) -> dict:
    """Create study population args for SCCS (different from CohortMethod version)."""
    return {
        "firstOutcomeOnly": first_outcome_only,
        "naivePeriod": naive_period,
        "minAge": min_age,
        "maxAge": max_age,
        "genderConceptIds": gender_concept_ids,
        "restrictTimeToEraId": restrict_time_to_era_id,
        "_class": "CreateStudyPopulationArgs"
    }


def create_create_sccs_interval_data_args(
    era_covariate_settings: Union[dict, list],
    age_covariate_settings: Optional[dict] = None,
    seasonality_covariate_settings: Optional[dict] = None,
    calendar_time_covariate_settings: Optional[dict] = None,
    min_cases_for_time_covariates: int = 10000,
    end_of_observation_era_length: int = 30,
    event_dependent_observation: bool = False
) -> dict:
    """Create arguments for createSccsIntervalData."""
    return {
        "eraCovariateSettings": era_covariate_settings,
        "ageCovariateSettings": age_covariate_settings,
        "seasonalityCovariateSettings": seasonality_covariate_settings,
        "calendarTimeCovariateSettings": calendar_time_covariate_settings,
        "minCasesForTimeCovariates": min_cases_for_time_covariates,
        "endOfObservationEraLength": end_of_observation_era_length,
        "eventDependentObservation": event_dependent_observation,
        "_class": "CreateSccsIntervalDataArgs"
    }


def create_create_scri_interval_data_args(
    era_covariate_settings: Union[dict, list],
    control_interval_settings: dict
) -> dict:
    """Create arguments for createScriIntervalData."""
    return {
        "eraCovariateSettings": era_covariate_settings,
        "controlIntervalSettings": control_interval_settings,
        "_class": "CreateScriIntervalDataArgs"
    }


def create_fit_sccs_model_args(
    prior: Optional[dict] = None,
    control: Optional[dict] = None,
    profile_grid: Optional[list] = None,
    profile_bounds: Optional[list] = None
) -> dict:
    """Create arguments for fitSccsModel."""
    if prior is None:
        prior = create_prior("laplace", use_cross_validation=True)
    if control is None:
        control = create_control(cv_type="auto", selector_type="byPid",
                                 starting_variance=0.1, seed=1,
                                 reset_coefficients=True, noise_level="quiet")
    if profile_bounds is None:
        profile_bounds = [math.log(0.1), math.log(10)]
    return {
        "prior": prior,
        "control": control,
        "profileGrid": profile_grid,
        "profileBounds": profile_bounds,
        "_class": "FitSccsModelArgs"
    }


def create_sccs_analysis(
    analysis_id: int = 1,
    description: str = "",
    get_db_sccs_data_args: dict = None,
    create_study_population_args: dict = None,
    create_interval_data_args: dict = None,
    fit_sccs_model_args: dict = None
) -> dict:
    """Create an SCCS analysis specification."""
    return {
        "analysisId": analysis_id,
        "description": description,
        "getDbSccsDataArgs": get_db_sccs_data_args,
        "createStudyPopulationArgs": create_study_population_args,
        "createIntervalDataArgs": create_interval_data_args,
        "fitSccsModelArgs": fit_sccs_model_args,
        "_class": "SccsAnalysis"
    }


def create_exposure(
    exposure_id: int,
    exposure_id_ref: str = "exposureId",
    true_effect_size: float = None
) -> dict:
    """Create an exposure definition for SCCS."""
    return {
        "exposureId": exposure_id,
        "exposureIdRef": exposure_id_ref,
        "trueEffectSize": true_effect_size if true_effect_size is not None else math.nan,
        "_class": "Exposure"
    }


def create_exposures_outcome(
    outcome_id: int,
    exposures: list,
    nesting_cohort_id: Optional[int] = None
) -> dict:
    """Create an exposures-outcome combination for SCCS."""
    return {
        "outcomeId": outcome_id,
        "exposures": exposures,
        "nestingCohortId": nesting_cohort_id,
        "_class": "ExposuresOutcome"
    }


def create_sccs_diagnostic_thresholds(
    mdrr_threshold: float = 10,
    ease_threshold: float = 0.25,
    time_trend_max_ratio: float = 1.1,
    rare_outcome_max_prevalence: float = 0.1,
    event_observation_dependence_null_bounds: list = None,
    event_exposure_dependence_null_bounds: list = None
) -> dict:
    """Create SCCS diagnostic thresholds."""
    return {
        "mdrrThreshold": mdrr_threshold,
        "easeThreshold": ease_threshold,
        "timeTrendMaxRatio": time_trend_max_ratio,
        "rareOutcomeMaxPrevalence": rare_outcome_max_prevalence,
        "eventObservationDependenceNullBounds": event_observation_dependence_null_bounds or [0.5, 2.0],
        "eventExposureDependenceNullBounds": event_exposure_dependence_null_bounds or [0.8, 1.25],
        "_class": "SccsDiagnosticThresholds"
    }


def create_sccs_analyses_specifications(
    sccs_analysis_list: list,
    exposures_outcome_list: list,
    analyses_to_exclude: Optional[list] = None,
    combine_data_fetch_across_outcomes: bool = False,
    sccs_diagnostic_thresholds: Optional[dict] = None,
    control_type: str = "outcome"
) -> dict:
    """Create full SCCS analyses specifications."""
    if sccs_diagnostic_thresholds is None:
        sccs_diagnostic_thresholds = create_sccs_diagnostic_thresholds()
    return {
        "sccsAnalysisList": sccs_analysis_list,
        "exposuresOutcomeList": exposures_outcome_list,
        "analysesToExclude": analyses_to_exclude,
        "combineDataFetchAcrossOutcomes": combine_data_fetch_across_outcomes,
        "sccsDiagnosticThresholds": sccs_diagnostic_thresholds,
        "controlType": control_type,
        "_class": "SccsAnalysesSpecifications"
    }


# =============================================================================
# PatientLevelPrediction Builder Functions
# =============================================================================

def create_study_population_settings(
    binary: bool = True,
    include_all_outcomes: bool = True,
    first_exposure_only: bool = False,
    washout_period: int = 0,
    remove_subjects_with_prior_outcome: bool = True,
    prior_outcome_lookback: int = 99999,
    require_time_at_risk: bool = True,
    min_time_at_risk: int = 364,
    risk_window_start: int = 1,
    start_anchor: str = "cohort start",
    risk_window_end: int = 365,
    end_anchor: str = "cohort start",
    restrict_tar_to_cohort_end: bool = False
) -> dict:
    """Create PLP study population settings."""
    return {
        "binary": binary,
        "includeAllOutcomes": include_all_outcomes,
        "firstExposureOnly": first_exposure_only,
        "washoutPeriod": washout_period,
        "removeSubjectsWithPriorOutcome": remove_subjects_with_prior_outcome,
        "priorOutcomeLookback": prior_outcome_lookback,
        "requireTimeAtRisk": require_time_at_risk,
        "minTimeAtRisk": min_time_at_risk,
        "riskWindowStart": risk_window_start,
        "startAnchor": start_anchor,
        "riskWindowEnd": risk_window_end,
        "endAnchor": end_anchor,
        "restrictTarToCohortEnd": restrict_tar_to_cohort_end,
        "_class": "populationSettings"
    }


def create_restrict_plp_data_settings(
    study_start_date: str = "",
    study_end_date: str = "",
    first_exposure_only: bool = False,
    washout_period: int = 0,
    sample_size: Optional[int] = None
) -> dict:
    """Create PLP data restriction settings."""
    return {
        "studyStartDate": study_start_date,
        "studyEndDate": study_end_date,
        "firstExposureOnly": first_exposure_only,
        "washoutPeriod": washout_period,
        "sampleSize": sample_size,
        "_class": "restrictPlpDataSettings"
    }


def create_preprocess_settings(
    min_fraction: float = 0.001,
    normalize: bool = True,
    remove_redundancy: bool = True
) -> dict:
    """Create PLP preprocessing settings."""
    return {
        "minFraction": min_fraction,
        "normalize": normalize,
        "removeRedundancy": remove_redundancy,
        "_class": "preprocessSettings"
    }


def create_default_split_setting(
    test_fraction: float = 0.25,
    train_fraction: float = 0.75,
    split_seed: Optional[int] = None,
    nfold: int = 3,
    type: str = "stratified"
) -> dict:
    """Create PLP split settings."""
    import random as _random
    if split_seed is None:
        split_seed = _random.randint(1, 100000)
    fun_map = {"stratified": "randomSplitter", "time": "timeSplitter", "subject": "subjectSplitter"}
    return {
        "test": test_fraction,
        "train": train_fraction,
        "seed": split_seed,
        "nfold": nfold,
        "_fun": fun_map.get(type, "randomSplitter"),
        "_class": "splitSettings"
    }


def create_sample_settings(
    type: str = "none",
    number_outcomes_to_non_outcomes: int = 1,
    sample_seed: Optional[int] = None
) -> dict:
    """Create PLP sample settings."""
    import random as _random
    if sample_seed is None:
        sample_seed = _random.randint(1, 10000)
    fun_map = {"none": "sameData", "underSample": "underSampleData", "overSample": "overSampleData"}
    return {
        "numberOutcomestoNonOutcomes": number_outcomes_to_non_outcomes,
        "sampleSeed": 1 if type == "none" else sample_seed,
        "_fun": fun_map.get(type, "sameData"),
        "_class": "sampleSettings"
    }


def create_feature_engineering_settings(type: str = "none") -> dict:
    """Create PLP feature engineering settings."""
    return {
        "_fun": "sameData" if type == "none" else type,
        "_class": "featureEngineeringSettings"
    }


def create_univariate_feature_selection(k: int = 100) -> dict:
    """Create univariate feature selection settings."""
    return {
        "k": k,
        "_fun": "univariateFeatureSelection",
        "_class": "featureEngineeringSettings"
    }


def create_random_forest_feature_selection(ntrees: int = 2000, max_depth: int = 17) -> dict:
    """Create random forest feature selection settings."""
    return {
        "ntrees": ntrees,
        "maxDepth": max_depth,
        "_fun": "randomForestFeatureSelection",
        "_class": "featureEngineeringSettings"
    }


def create_hyperparameter_settings(
    search: str = "grid",
    tuning_metric: Any = None,
    sample_size: Optional[int] = None,
    random_seed: Optional[int] = None,
    generator: Any = None
) -> dict:
    """Create PLP hyperparameter settings."""
    return {
        "search": search,
        "tuningMetric": tuning_metric,
        "sampleSize": sample_size,
        "randomSeed": random_seed,
        "generator": generator,
        "_class": "hyperparameterSettings"
    }


def create_cohort_covariate_settings(
    cohort_name: str,
    setting_id: int,
    cohort_id: int,
    cohort_database_schema: Optional[str] = None,
    cohort_table: Optional[str] = None,
    start_day: int = -30,
    end_day: int = 0,
    count: bool = False,
    age_interaction: bool = False,
    ln_age_interaction: bool = False,
    analysis_id: int = 456
) -> dict:
    """Create PLP cohort covariate settings."""
    return {
        "covariateName": cohort_name,
        "covariateId": cohort_id * 100000 + setting_id * 1000 + analysis_id,
        "cohortDatabaseSchema": cohort_database_schema,
        "cohortTable": cohort_table,
        "cohortIds": cohort_id,
        "startDay": start_day,
        "endDays": end_day,
        "count": count,
        "ageInteraction": age_interaction,
        "lnAgeInteraction": ln_age_interaction,
        "analysisId": analysis_id,
        "_fun": "PatientLevelPrediction::getCohortCovariateData",
        "_class": "covariateSettings"
    }


def create_model_design(
    target_id: Optional[int] = None,
    outcome_id: Optional[int] = None,
    restrict_plp_data_settings: Optional[dict] = None,
    population_settings: Optional[dict] = None,
    covariate_settings: Optional[dict] = None,
    feature_engineering_settings: Optional[list] = None,
    sample_settings: Optional[list] = None,
    preprocess_settings: Optional[dict] = None,
    model_settings: Optional[dict] = None,
    split_settings: Optional[dict] = None,
    hyperparameter_settings: Optional[dict] = None,
    run_covariate_summary: bool = True
) -> dict:
    """Create a PLP model design."""
    if restrict_plp_data_settings is None:
        restrict_plp_data_settings = create_restrict_plp_data_settings()
    if population_settings is None:
        population_settings = create_study_population_settings()
    if covariate_settings is None:
        covariate_settings = create_default_covariate_settings()
    if feature_engineering_settings is None:
        feature_engineering_settings = [create_feature_engineering_settings(type="none")]
    if sample_settings is None:
        sample_settings = [create_sample_settings(type="none")]
    if preprocess_settings is None:
        preprocess_settings = create_preprocess_settings()
    if split_settings is None:
        split_settings = create_default_split_setting()
    if hyperparameter_settings is None:
        hyperparameter_settings = create_hyperparameter_settings()
    return {
        "targetId": target_id,
        "outcomeId": outcome_id,
        "restrictPlpDataSettings": restrict_plp_data_settings,
        "covariateSettings": covariate_settings,
        "populationSettings": population_settings,
        "sampleSettings": sample_settings,
        "featureEngineeringSettings": feature_engineering_settings,
        "preprocessSettings": preprocess_settings,
        "modelSettings": model_settings,
        "splitSettings": split_settings,
        "hyperparameterSettings": hyperparameter_settings,
        "runCovariateSummary": run_covariate_summary,
        "_class": "modelDesign"
    }


def create_validation_design(
    target_id: int,
    outcome_id: int,
    population_settings: Optional[dict] = None,
    restrict_plp_data_settings: Optional[dict] = None,
    plp_model_list: list = None,
    recalibrate: Optional[str] = None,
    run_covariate_summary: bool = True
) -> dict:
    """Create a PLP validation design."""
    return {
        "targetId": target_id,
        "outcomeId": outcome_id,
        "populationSettings": population_settings,
        "plpModelList": plp_model_list or [],
        "restrictPlpDataSettings": restrict_plp_data_settings,
        "recalibrate": recalibrate,
        "runCovariateSummary": run_covariate_summary,
        "_class": "validationDesign"
    }


# PLP Model Settings (set_* functions)

def _make_cyclops_model_settings(model_name, model_type, cyclops_model_type,
                                  prior_type, param, seed, threads, tolerance,
                                  max_iterations, selector_type="byPid",
                                  add_intercept=True, prior_coefs=None):
    """Internal helper for Cyclops-based model settings."""
    settings = {
        "modelName": model_name, "modelType": model_type,
        "cyclopsModelType": cyclops_model_type,
        "priorfunction": "Cyclops::createPrior",
        "selectorType": selector_type, "crossValidationInPrior": True,
        "addIntercept": add_intercept, "useControl": True,
        "seed": seed, "threads": threads, "tolerance": tolerance,
        "cvRepetitions": 1, "maxIterations": max_iterations,
        "saveType": "RtoJson", "predict": "predictCyclops"
    }
    return {
        "fitFunction": "fitCyclopsModel",
        "param": param,
        "settings": settings,
        "_class": "modelSettings"
    }


def set_lasso_logistic_regression(
    variance: float = 0.01, seed: Optional[int] = None,
    include_covariate_ids: list = None, no_shrinkage: list = None,
    threads: int = -1, force_intercept: bool = False,
    upper_limit: float = 20, lower_limit: float = 0.01,
    tolerance: float = 2e-06, max_iterations: int = 3000,
    prior_coefs: Any = None
) -> dict:
    """Create settings for lasso logistic regression."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000000)
    param = {
        "priorParams": {"priorType": "laplace", "forceIntercept": force_intercept,
                        "variance": variance, "exclude": no_shrinkage or [0]},
        "includeCovariateIds": include_covariate_ids or [],
        "upperLimit": upper_limit, "lowerLimit": lower_limit,
        "priorCoefs": prior_coefs
    }
    return _make_cyclops_model_settings(
        "lassoLogisticRegression", "binary", "logistic", "laplace",
        param, seed, threads, tolerance, max_iterations
    )


def set_ridge_regression(
    variance: float = 0.01, seed: Optional[int] = None,
    include_covariate_ids: list = None, no_shrinkage: list = None,
    threads: int = -1, force_intercept: bool = False,
    upper_limit: float = 20, lower_limit: float = 0.01,
    tolerance: float = 2e-06, max_iterations: int = 3000,
    prior_coefs: Any = None
) -> dict:
    """Create settings for ridge regression."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000000)
    param = {
        "priorParams": {"priorType": "normal", "forceIntercept": force_intercept,
                        "variance": variance, "exclude": no_shrinkage or [0]},
        "includeCovariateIds": include_covariate_ids or [],
        "upperLimit": upper_limit, "lowerLimit": lower_limit,
        "priorCoefs": prior_coefs
    }
    return _make_cyclops_model_settings(
        "ridgeLogisticRegression", "binary", "logistic", "normal",
        param, seed, threads, tolerance, max_iterations
    )


def set_cox_model(
    variance: float = 0.01, seed: Optional[int] = None,
    include_covariate_ids: list = None, no_shrinkage: list = None,
    threads: int = -1, upper_limit: float = 20, lower_limit: float = 0.01,
    tolerance: float = 2e-07, max_iterations: int = 3000
) -> dict:
    """Create settings for Cox model."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000000)
    param = {
        "priorParams": {"priorType": "laplace", "variance": variance,
                        "exclude": no_shrinkage or []},
        "includeCovariateIds": include_covariate_ids or [],
        "upperLimit": upper_limit, "lowerLimit": lower_limit
    }
    return _make_cyclops_model_settings(
        "coxLasso", "survival", "cox", "laplace",
        param, seed, threads, tolerance, max_iterations,
        selector_type="byRow", add_intercept=False
    )


def set_iterative_hard_thresholding(
    K: int = 10, penalty: str = "bic", seed: Optional[int] = None,
    exclude: list = None, force_intercept: bool = False,
    fit_best_subset: bool = False, initial_ridge_variance: float = 0.1,
    tolerance: float = 1e-08, max_iterations: int = 10000,
    threshold: float = 1e-06, delta: float = 0
) -> dict:
    """Create settings for iterative hard thresholding."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000000)
    param = {
        "priorParams": {"K": K, "penalty": penalty, "exclude": exclude or [],
                        "forceIntercept": force_intercept},
        "fitBestSubset": fit_best_subset,
        "initialRidgeVariance": initial_ridge_variance,
        "tolerance": tolerance, "maxIterations": max_iterations,
        "threshold": threshold, "delta": delta
    }
    return {
        "fitFunction": "fitCyclopsModel",
        "param": param,
        "settings": {"modelName": "iterativeHardThresholding", "modelType": "binary",
                     "seed": seed, "saveType": "RtoJson", "predict": "predictCyclops"},
        "_class": "modelSettings"
    }


def _make_sklearn_model_settings(model_name, python_module, python_class, param, seed):
    """Internal helper for sklearn-based model settings."""
    return {
        "param": param,
        "settings": {
            "modelType": "binary", "seed": seed, "modelName": model_name,
            "pythonModule": python_module, "pythonClass": python_class,
            "saveType": "saveLoadSklearn", "predict": "predictSklearn"
        },
        "_class": "modelSettings"
    }


def set_gradient_boosting_machine(
    ntrees: list = None, nthread: int = 20, early_stop_round: int = 25,
    max_depth: list = None, min_child_weight: int = 1,
    learn_rate: list = None, scale_pos_weight: float = 1,
    lambda_: float = 1, alpha: float = 0,
    seed: Optional[int] = None
) -> dict:
    """Create settings for gradient boosting machine (XGBoost)."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 10000000)
    param = {
        "ntrees": ntrees or [100, 300], "nthread": nthread,
        "earlyStopRound": early_stop_round,
        "maxDepth": max_depth or [4, 6, 8],
        "minChildWeight": min_child_weight,
        "learnRate": learn_rate or [0.05, 0.1, 0.3],
        "scalePosWeight": scale_pos_weight,
        "lambda": lambda_, "alpha": alpha, "seed": [seed]
    }
    return {
        "fitFunction": "fitXgboost",
        "param": param,
        "settings": {"modelType": "binary", "seed": seed,
                     "modelName": "gradientBoostingMachine",
                     "saveType": "xgboost", "predict": "predictXgboost"},
        "_class": "modelSettings"
    }


def set_light_gbm(
    nthread: int = 20, early_stop_round: int = 25,
    num_iterations: list = None, num_leaves: list = None,
    max_depth: list = None, min_data_in_leaf: list = None,
    learning_rate: list = None, lambda_l1: list = None,
    lambda_l2: list = None, scale_pos_weight: float = 1,
    is_unbalance: bool = False, seed: Optional[int] = None
) -> dict:
    """Create settings for LightGBM."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 10000000)
    param = {
        "nthread": nthread, "earlyStopRound": early_stop_round,
        "numIterations": num_iterations or [100],
        "numLeaves": num_leaves or [31],
        "maxDepth": max_depth or [5, 10],
        "minDataInLeaf": min_data_in_leaf or [20],
        "learningRate": learning_rate or [0.05, 0.1, 0.3],
        "lambdaL1": lambda_l1 or [0], "lambdaL2": lambda_l2 or [0],
        "scalePosWeight": scale_pos_weight,
        "isUnbalance": is_unbalance, "seed": [seed]
    }
    return {
        "fitFunction": "fitLightGBM",
        "param": param,
        "settings": {"modelType": "binary", "seed": seed,
                     "modelName": "lightGBM",
                     "saveType": "lightgbm", "predict": "predictLightGBM"},
        "_class": "modelSettings"
    }


def set_ada_boost(
    n_estimators: list = None, learning_rate: list = None,
    seed: Optional[int] = None
) -> dict:
    """Create settings for AdaBoost."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 1000000)
    param = {
        "nEstimators": n_estimators or [10, 50, 200],
        "learningRate": learning_rate or [1, 0.5, 0.1],
        "seed": [seed]
    }
    return _make_sklearn_model_settings(
        "adaboost", "sklearn.ensemble", "AdaBoostClassifier", param, seed
    )


def set_decision_tree(
    criterion: list = None, splitter: list = None,
    max_depth: list = None, min_samples_split: list = None,
    min_samples_leaf: list = None, min_weight_fraction_leaf: list = None,
    max_features: list = None, max_leaf_nodes: list = None,
    min_impurity_decrease: list = None, class_weight: list = None,
    seed: Optional[int] = None
) -> dict:
    """Create settings for decision tree."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 1000000)
    param = {
        "criterion": criterion or ["gini"],
        "splitter": splitter or ["best"],
        "maxDepth": max_depth or [4, 10, None],
        "minSamplesSplit": min_samples_split or [2, 10],
        "minSamplesLeaf": min_samples_leaf or [10, 50],
        "minWeightFractionLeaf": min_weight_fraction_leaf or [0],
        "maxFeatures": max_features or [100, "sqrt", None],
        "maxLeafNodes": max_leaf_nodes or [None],
        "minImpurityDecrease": min_impurity_decrease or [1e-7],
        "classWeight": class_weight or [None],
        "seed": [seed]
    }
    return _make_sklearn_model_settings(
        "decisionTree", "sklearn.tree", "DecisionTreeClassifier", param, seed
    )


def set_mlp(
    hidden_layer_sizes: list = None, activation: list = None,
    solver: list = None, alpha: list = None,
    batch_size: list = None, learning_rate: list = None,
    learning_rate_init: list = None, power_t: list = None,
    max_iter: list = None, shuffle: list = None,
    tol: list = None, warm_start: list = None,
    momentum: list = None, nesterovs_momentum: list = None,
    early_stopping: list = None, validation_fraction: list = None,
    beta_1: list = None, beta_2: list = None,
    epsilon: list = None, n_iter_no_change: list = None,
    seed: Optional[int] = None
) -> dict:
    """Create settings for MLP (multi-layer perceptron)."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000)
    param = {
        "hiddenLayerSizes": hidden_layer_sizes or [[100], [20]],
        "activation": activation or ["relu"],
        "solver": solver or ["adam"],
        "alpha": alpha or [0.3, 0.01, 0.0001, 0.000001],
        "batchSize": batch_size or ["auto"],
        "learningRate": learning_rate or ["constant"],
        "learningRateInit": learning_rate_init or [0.001],
        "powerT": power_t or [0.5],
        "maxIter": max_iter or [200, 100],
        "shuffle": shuffle or [True],
        "tol": tol or [0.0001],
        "warmStart": warm_start or [True],
        "momentum": momentum or [0.9],
        "nesterovsMomentum": nesterovs_momentum or [True],
        "earlyStopping": early_stopping or [False],
        "validationFraction": validation_fraction or [0.1],
        "beta1": beta_1 or [0.9],
        "beta2": beta_2 or [0.999],
        "epsilon": epsilon or [1e-8],
        "nIterNoChange": n_iter_no_change or [10],
        "seed": [seed]
    }
    return _make_sklearn_model_settings(
        "mlp", "sklearn.neural_network", "MLPClassifier", param, seed
    )


def set_naive_bayes() -> dict:
    """Create settings for naive Bayes."""
    return _make_sklearn_model_settings(
        "naiveBayes", "sklearn.naive_bayes", "GaussianNB", {"none": "true"}, 0
    )


def set_random_forest(
    ntrees: list = None, criterion: list = None,
    max_depth: list = None, min_samples_split: list = None,
    min_samples_leaf: list = None, min_weight_fraction_leaf: list = None,
    mtries: list = None, max_leaf_nodes: list = None,
    min_impurity_decrease: list = None, bootstrap: list = None,
    max_samples: list = None, oob_score: list = None,
    n_jobs: list = None, class_weight: list = None,
    seed: Optional[int] = None
) -> dict:
    """Create settings for random forest."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000)
    param = {
        "ntrees": ntrees or [100, 500],
        "criterion": criterion or ["gini"],
        "maxDepth": max_depth or [4, 10, 17],
        "minSamplesSplit": min_samples_split or [2, 5],
        "minSamplesLeaf": min_samples_leaf or [1, 10],
        "minWeightFractionLeaf": min_weight_fraction_leaf or [0],
        "mtries": mtries or ["sqrt", "log2"],
        "maxLeafNodes": max_leaf_nodes or [None],
        "minImpurityDecrease": min_impurity_decrease or [0],
        "bootstrap": bootstrap or [True],
        "maxSamples": max_samples or [None, 0.9],
        "oobScore": oob_score or [False],
        "nJobs": n_jobs or [None],
        "classWeight": class_weight or [None],
        "seed": [seed]
    }
    return _make_sklearn_model_settings(
        "randomForest", "sklearn.ensemble", "RandomForestClassifier", param, seed
    )


def set_svm(
    C: list = None, kernel: list = None,
    degree: list = None, gamma: list = None,
    coef0: list = None, shrinking: list = None,
    tol: list = None, class_weight: list = None,
    cache_size: int = 500, seed: Optional[int] = None
) -> dict:
    """Create settings for SVM."""
    import random as _random
    if seed is None:
        seed = _random.randint(1, 100000)
    param = {
        "C": C or [1, 0.9, 2, 0.1],
        "kernel": kernel or ["rbf"],
        "degree": degree or [1, 3, 5],
        "gamma": gamma or ["scale", 1e-4, 3e-5, 0.001, 0.01, 0.25],
        "coef0": coef0 or [0.0],
        "shrinking": shrinking or [True],
        "tol": tol or [0.001],
        "cacheSize": [cache_size],
        "classWeight": class_weight or [None],
        "seed": [seed]
    }
    return _make_sklearn_model_settings(
        "svm", "sklearn.svm", "SVC", param, seed
    )


# =============================================================================
# EvidenceSynthesis Builder Functions
# =============================================================================

def generate_bayesian_hma_settings(
    primary_effect_prior_std: float = 1.0,
    secondary_effect_prior_std: float = 1.0,
    global_exposure_effect_prior_mean: list = None,
    global_exposure_effect_prior_std: list = None,
    primary_effect_precision_prior: list = None,
    secondary_effect_precision_prior: list = None,
    error_precision_prior: list = None,
    error_precision_start_value: float = 1.0,
    include_source_effect: bool = True,
    include_exposure_effect: bool = True,
    exposure_effect_count: int = 1,
    separate_exposure_prior: bool = False,
    chain_length: int = 1100000,
    burn_in: int = 100000,
    sub_sample_frequency: int = 100
) -> dict:
    """Create Bayesian hierarchical meta-analysis settings."""
    return {
        "primaryEffectPriorStd": primary_effect_prior_std,
        "secondaryEffectPriorStd": secondary_effect_prior_std,
        "globalExposureEffectPriorMean": global_exposure_effect_prior_mean or [0.0],
        "globalExposureEffectPriorStd": global_exposure_effect_prior_std or [2.0],
        "primaryEffectPrecisionPrior": primary_effect_precision_prior or [1.0, 1.0],
        "secondaryEffectPrecisionPrior": secondary_effect_precision_prior or [1.0, 1.0],
        "errorPrecisionPrior": error_precision_prior or [1.0, 1.0],
        "errorPrecisionStartValue": error_precision_start_value,
        "includeSourceEffect": include_source_effect,
        "includeExposureEffect": include_exposure_effect,
        "exposureEffectCount": exposure_effect_count,
        "separateExposurePrior": separate_exposure_prior,
        "chainLength": chain_length,
        "burnIn": burn_in,
        "subSampleFrequency": sub_sample_frequency,
        "_class": "BayesianHMASettings"
    }


# =============================================================================
# CohortIncidence Builder Functions
# =============================================================================

def create_incidence_design(
    cohort_defs: Optional[list] = None,
    target_defs: Optional[list] = None,
    outcome_defs: Optional[list] = None,
    tars: Optional[list] = None,
    analysis_list: Optional[list] = None,
    concept_sets: Optional[list] = None,
    subgroups: Optional[list] = None,
    strata_settings: Optional[dict] = None,
    study_window: Optional[dict] = None
) -> dict:
    """Create an incidence design for CohortIncidence."""
    design = {"_class": "IncidenceDesign"}
    if cohort_defs is not None:
        design["cohortDefs"] = cohort_defs
    if target_defs is not None:
        design["targetDefs"] = target_defs
    if outcome_defs is not None:
        design["outcomeDefs"] = outcome_defs
    if tars is not None:
        design["timeAtRiskDefs"] = tars
    if analysis_list is not None:
        design["analysisList"] = analysis_list
    if concept_sets is not None:
        design["conceptSets"] = concept_sets
    if subgroups is not None:
        design["subgroups"] = subgroups
    if strata_settings is not None:
        design["strataSettings"] = strata_settings
    if study_window is not None:
        design["studyWindow"] = study_window
    return design


def create_incidence_analysis(targets: list, outcomes: list, tars: list) -> dict:
    """Create an incidence analysis."""
    return {
        "targets": targets,
        "outcomes": outcomes,
        "tars": tars,
        "_class": "IncidenceAnalysis"
    }


def create_cohort_ref(id: int, name: str, description: Optional[str] = None) -> dict:
    """Create a cohort reference."""
    ref = {"id": id, "name": name, "_class": "CohortReference"}
    if description is not None:
        ref["description"] = description
    return ref


def create_outcome_def(
    id: int, name: Optional[str] = None,
    cohort_id: int = 0, clean_window: int = 0,
    exclude_cohort_id: Optional[int] = None
) -> dict:
    """Create an outcome definition for CohortIncidence."""
    result = {"id": id, "cohortId": cohort_id, "cleanWindow": clean_window,
              "_class": "Outcome"}
    if name is not None:
        result["name"] = name
    if exclude_cohort_id is not None:
        result["excludeCohortId"] = exclude_cohort_id
    return result


def create_time_at_risk_def(
    id: int, start_with: str = "start", start_offset: int = 0,
    end_with: str = "end", end_offset: int = 0
) -> dict:
    """Create a time-at-risk definition."""
    return {
        "id": id,
        "startWith": start_with,
        "startOffset": start_offset,
        "endWith": end_with,
        "endOffset": end_offset,
        "_class": "TimeAtRisk"
    }


def create_cohort_subgroup(
    id: int, name: str,
    description: Optional[str] = None,
    cohort_ref: Optional[dict] = None
) -> dict:
    """Create a cohort subgroup."""
    result = {"id": id, "name": name, "_class": "CohortSubgroup"}
    if description is not None:
        result["description"] = description
    if cohort_ref is not None:
        result["cohort"] = cohort_ref
    return result


def create_strata_settings(
    by_age: bool = False, by_gender: bool = False, by_year: bool = False,
    age_breaks: Optional[list] = None, age_break_list: Optional[list] = None
) -> dict:
    """Create strata settings for CohortIncidence."""
    if by_age and age_breaks is None and age_break_list is None:
        raise ValueError("When by_age=True, age_breaks or age_break_list must be provided")
    result = {"byAge": by_age, "byGender": by_gender, "byYear": by_year,
              "_class": "StrataSettings"}
    if age_breaks is not None:
        result["ageBreaks"] = age_breaks
    if age_break_list is not None:
        result["ageBreakList"] = age_break_list
    return result


def create_date_range(
    start_date: Optional[str] = None, end_date: Optional[str] = None
) -> dict:
    """Create a date range."""
    result = {"_class": "DateRange"}
    if start_date is not None:
        result["startDate"] = start_date
    if end_date is not None:
        result["endDate"] = end_date
    return result


# =============================================================================
# Characterization Builder Functions
# =============================================================================

def create_characterization_settings(
    time_to_event_settings: Optional[Union[dict, list]] = None,
    dechallenge_rechallenge_settings: Optional[Union[dict, list]] = None,
    aggregate_covariate_settings: Optional[Union[dict, list]] = None
) -> dict:
    """Create characterization settings."""
    if isinstance(time_to_event_settings, dict):
        time_to_event_settings = [time_to_event_settings]
    if isinstance(dechallenge_rechallenge_settings, dict):
        dechallenge_rechallenge_settings = [dechallenge_rechallenge_settings]
    if isinstance(aggregate_covariate_settings, dict):
        aggregate_covariate_settings = [aggregate_covariate_settings]
    return {
        "timeToEventSettings": time_to_event_settings,
        "dechallengeRechallengeSettings": dechallenge_rechallenge_settings,
        "aggregateCovariateSettings": aggregate_covariate_settings,
        "_class": "characterizationSettings"
    }


def create_dechallenge_rechallenge_settings(
    target_ids: list, outcome_ids: list,
    dechallenge_stop_interval: int = 30,
    dechallenge_evaluation_window: int = 30
) -> dict:
    """Create dechallenge-rechallenge settings."""
    return {
        "targetIds": target_ids,
        "outcomeIds": outcome_ids,
        "dechallengeStopInterval": dechallenge_stop_interval,
        "dechallengeEvaluationWindow": dechallenge_evaluation_window,
        "_class": "dechallengeRechallengeSettings"
    }


def create_time_to_event_settings(target_ids: list, outcome_ids: list) -> dict:
    """Create time-to-event settings."""
    return {
        "targetIds": target_ids,
        "outcomeIds": outcome_ids,
        "_class": "timeToEventSettings"
    }


def create_aggregate_covariate_settings(
    target_ids: list, outcome_ids: list,
    min_prior_observation: int = 0,
    outcome_washout_days: int = 0,
    risk_window_start: int = 1,
    start_anchor: str = "cohort start",
    risk_window_end: int = 365,
    end_anchor: str = "cohort start",
    covariate_settings: Optional[dict] = None,
    case_covariate_settings: Optional[dict] = None,
    case_pre_target_duration: int = 365,
    case_post_outcome_duration: int = 365,
    extract_non_case_covariates: bool = True
) -> dict:
    """Create aggregate covariate settings."""
    if covariate_settings is None:
        covariate_settings = _get_default_characterization_covariate_settings()
    if case_covariate_settings is None:
        case_covariate_settings = _get_default_case_covariate_settings()
    if isinstance(covariate_settings, dict) and "_class" in covariate_settings:
        covariate_settings = [covariate_settings]
    return {
        "targetIds": target_ids,
        "outcomeIds": outcome_ids,
        "minPriorObservation": min_prior_observation,
        "outcomeWashoutDays": outcome_washout_days,
        "riskWindowStart": risk_window_start,
        "startAnchor": start_anchor,
        "riskWindowEnd": risk_window_end,
        "endAnchor": end_anchor,
        "covariateSettings": covariate_settings,
        "caseCovariateSettings": case_covariate_settings,
        "casePreTargetDuration": case_pre_target_duration,
        "casePostOutcomeDuration": case_post_outcome_duration,
        "extractNonCaseCovariates": extract_non_case_covariates,
        "_class": "aggregateCovariateSettings"
    }


def create_during_covariate_settings(**kwargs) -> dict:
    """Create during-cohort covariate settings for Characterization.

    Accepts use* boolean flags (default False) plus concept filtering params.
    """
    _USE_FLAGS = [
        "useConditionOccurrenceDuring", "useConditionOccurrencePrimaryInpatientDuring",
        "useConditionEraDuring", "useConditionGroupEraDuring",
        "useDrugExposureDuring", "useDrugEraDuring", "useDrugGroupEraDuring",
        "useProcedureOccurrenceDuring", "useDeviceExposureDuring",
        "useMeasurementDuring", "useObservationDuring",
        "useVisitCountDuring", "useVisitConceptCountDuring",
    ]
    settings = {"temporal": False, "temporalSequence": False}
    any_use_true = False
    for flag in _USE_FLAGS:
        val = kwargs.get(flag, False)
        if val:
            settings[flag.replace("use", "", 1)] = True
            any_use_true = True
    if not any_use_true:
        raise ValueError("No covariate analysis selected. Must select at least one")
    settings["includedCovariateConceptIds"] = kwargs.get("includedCovariateConceptIds", [])
    settings["addDescendantsToInclude"] = kwargs.get("addDescendantsToInclude", False)
    settings["excludedCovariateConceptIds"] = kwargs.get("excludedCovariateConceptIds", [])
    settings["addDescendantsToExclude"] = kwargs.get("addDescendantsToExclude", False)
    settings["includedCovariateIds"] = kwargs.get("includedCovariateIds", [])
    settings["_fun"] = "Characterization::getDbDuringCovariateData"
    settings["_class"] = "covariateSettings"
    return settings


# =============================================================================
# Core Public Functions (User Story 1)
# =============================================================================

def create_empty_analysis_specifications() -> AnalysisSpecifications:
    """
    Create an empty analysis specifications object.

    Returns:
        An AnalysisSpecifications object with empty shared_resources and module_specifications.

    Example:
        >>> spec = create_empty_analysis_specifications()
        >>> print(spec.to_json())
    """
    return AnalysisSpecifications()


def add_shared_resources(
    analysis_specifications: AnalysisSpecifications,
    shared_resources: dict
) -> AnalysisSpecifications:
    """
    Add shared resources to analysis specifications.

    Args:
        analysis_specifications: The analysis specifications to modify.
        shared_resources: A shared resources dictionary.

    Returns:
        The modified analysis specifications.

    Raises:
        TypeError: If inputs are not the correct type.
    """
    if not isinstance(analysis_specifications, AnalysisSpecifications):
        raise TypeError("analysis_specifications must be an AnalysisSpecifications object")
    if not isinstance(shared_resources, dict):
        raise TypeError("shared_resources must be a dictionary")

    analysis_specifications.shared_resources.append(shared_resources)
    return analysis_specifications


def add_module_specifications(
    analysis_specifications: AnalysisSpecifications,
    module_specifications: dict
) -> AnalysisSpecifications:
    """
    Add module specifications to analysis specifications.

    Args:
        analysis_specifications: The analysis specifications to modify.
        module_specifications: A module specifications dictionary.

    Returns:
        The modified analysis specifications.

    Raises:
        TypeError: If inputs are not the correct type.
    """
    if not isinstance(analysis_specifications, AnalysisSpecifications):
        raise TypeError("analysis_specifications must be an AnalysisSpecifications object")
    if not isinstance(module_specifications, dict):
        raise TypeError("module_specifications must be a dictionary")

    analysis_specifications.module_specifications.append(module_specifications)
    return analysis_specifications


# =============================================================================
# Shared Resource Functions (User Story 2)
# =============================================================================

def create_cohort_shared_resource_specifications(
    cohort_definition_set: list[dict]
) -> dict:
    """
    Create cohort shared resource specifications.

    Args:
        cohort_definition_set: A list of dictionaries with keys:
            cohortId, cohortName, sql, json.
            Optionally: isSubset, subsetParent, subsetDefinitionId.

    Returns:
        A shared resources dictionary for cohort definitions.

    Raises:
        ValueError: If cohort_definition_set is not properly defined.

    Example:
        >>> cohorts = [
        ...     {"cohortId": 1, "cohortName": "Target", "sql": "SELECT...", "json": "{}"},
        ...     {"cohortId": 2, "cohortName": "Outcome", "sql": "SELECT...", "json": "{}"}
        ... ]
        >>> shared = create_cohort_shared_resource_specifications(cohorts)
    """
    if not _is_cohort_definition_set(cohort_definition_set):
        raise ValueError(
            "cohort_definition_set is not properly defined. "
            "Required keys: cohortId, cohortName, sql, json"
        )

    # Check for subset definitions
    has_subsets = any(
        row.get("isSubset", False) for row in cohort_definition_set
    )

    if has_subsets:
        parent_cohorts = [r for r in cohort_definition_set if not r.get("isSubset", False)]
    else:
        parent_cohorts = cohort_definition_set

    shared_resource = {
        "cohortDefinitions": _listafy(parent_cohorts),
        "_class": ("CohortDefinitionSharedResources", "SharedResources")
    }

    if has_subsets:
        subset_cohorts = [r for r in cohort_definition_set if r.get("isSubset", False)]
        subset_id_mapping = []
        for row in subset_cohorts:
            id_mapping = {
                "cohortId": row["cohortId"],
                "subsetId": row.get("subsetDefinitionId"),
                "targetCohortId": row.get("subsetParent")
            }
            subset_id_mapping.append(id_mapping)
        shared_resource["cohortSubsets"] = subset_id_mapping

    return shared_resource


def create_negative_control_outcome_cohort_shared_resource_specifications(
    negative_control_outcome_cohort_set: list[dict],
    occurrence_type: str,
    detect_on_descendants: bool
) -> dict:
    """
    Create negative control outcome cohort shared resource specifications.

    Args:
        negative_control_outcome_cohort_set: List of dicts with cohortId, cohortName, outcomeConceptId.
        occurrence_type: Either "first" or "all".
        detect_on_descendants: Whether to detect on descendant concepts.

    Returns:
        A shared resources dictionary for negative control outcomes.
    """
    return {
        "negativeControlOutcomes": {
            "negativeControlOutcomeCohortSet": negative_control_outcome_cohort_set,
            "occurrenceType": occurrence_type,
            "detectOnDescendants": detect_on_descendants
        },
        "_class": ("NegativeControlOutcomeSharedResources", "SharedResources")
    }


# =============================================================================
# Module Specification Functions (User Story 3)
# =============================================================================

def create_cohort_generator_module_specifications(
    generate_stats: bool = True
) -> dict:
    """Create CohortGenerator module specifications."""
    return {
        "module": "CohortGeneratorModule",
        "settings": {
            "generateStats": generate_stats
        },
        "_class": ("ModuleSpecifications", "CohortGeneratorModuleSpecifications")
    }


def create_cohort_diagnostics_module_specifications(
    cohort_ids: Optional[list[int]] = None,
    run_inclusion_statistics: bool = True,
    run_included_source_concepts: bool = True,
    run_orphan_concepts: bool = True,
    run_time_series: bool = False,
    run_visit_context: bool = True,
    run_breakdown_index_events: bool = True,
    run_incidence_rate: bool = True,
    run_cohort_relationship: bool = True,
    run_temporal_cohort_characterization: bool = True,
    temporal_covariate_settings: Optional[dict] = None,
    min_characterization_mean: float = 0.01,
    ir_washout_period: int = 0
) -> dict:
    """Create CohortDiagnostics module specifications."""
    if temporal_covariate_settings is None:
        temporal_covariate_settings = _get_default_temporal_covariate_settings()

    return {
        "module": "CohortDiagnosticsModule",
        "settings": {
            "cohortIds": cohort_ids,
            "runInclusionStatistics": run_inclusion_statistics,
            "runIncludedSourceConcepts": run_included_source_concepts,
            "runOrphanConcepts": run_orphan_concepts,
            "runTimeSeries": run_time_series,
            "runVisitContext": run_visit_context,
            "runBreakdownIndexEvents": run_breakdown_index_events,
            "runIncidenceRate": run_incidence_rate,
            "runCohortRelationship": run_cohort_relationship,
            "runTemporalCohortCharacterization": run_temporal_cohort_characterization,
            "temporalCovariateSettings": temporal_covariate_settings,
            "minCharacterizationMean": min_characterization_mean,
            "irWashoutPeriod": ir_washout_period
        },
        "_class": ("ModuleSpecifications", "CohortDiagnosticsModuleSpecifications")
    }


def create_cohort_incidence_module_specifications(
    ir_design: Optional[dict] = None
) -> dict:
    """Create CohortIncidence module specifications."""
    return {
        "module": "CohortIncidenceModule",
        "settings": {
            "irDesign": ir_design
        },
        "_class": ("ModuleSpecifications", "CohortIncidenceModuleSpecifications")
    }


def create_cohort_method_module_specifications(
    cm_analysis_list: list,
    target_comparator_outcomes_list: list,
    analyses_to_exclude: Optional[list] = None,
    refit_ps_for_every_outcome: bool = False,
    refit_ps_for_every_study_population: bool = True,
    cm_diagnostic_thresholds: Optional[dict] = None
) -> dict:
    """Create CohortMethod module specifications."""
    if cm_diagnostic_thresholds is None:
        cm_diagnostic_thresholds = _create_default_cm_diagnostic_thresholds()

    return {
        "module": "CohortMethodModule",
        "settings": {
            "cmAnalysisList": cm_analysis_list,
            "targetComparatorOutcomesList": target_comparator_outcomes_list,
            "analysesToExclude": analyses_to_exclude,
            "refitPsForEveryOutcome": refit_ps_for_every_outcome,
            "refitPsForEveryStudyPopulation": refit_ps_for_every_study_population,
            "cmDiagnosticThresholds": cm_diagnostic_thresholds
        },
        "_class": ("ModuleSpecifications", "CohortMethodModuleSpecifications")
    }


def create_characterization_module_specifications(
    target_ids: list[int],
    outcome_ids: list[int],
    outcome_washout_days: list[int] = None,
    min_prior_observation: int = 365,
    dechallenge_stop_interval: int = 30,
    dechallenge_evaluation_window: int = 30,
    risk_window_start: list[int] = None,
    start_anchor: list[str] = None,
    risk_window_end: list[int] = None,
    end_anchor: list[str] = None,
    min_characterization_mean: float = 0.01,
    covariate_settings: Optional[dict] = None,
    case_covariate_settings: Optional[dict] = None
) -> dict:
    """Create Characterization module specifications."""
    if outcome_washout_days is None:
        outcome_washout_days = [365]
    if risk_window_start is None:
        risk_window_start = [1, 1]
    if start_anchor is None:
        start_anchor = ["cohort start", "cohort start"]
    if risk_window_end is None:
        risk_window_end = [0, 365]
    if end_anchor is None:
        end_anchor = ["cohort end", "cohort end"]
    if covariate_settings is None:
        covariate_settings = _get_default_characterization_covariate_settings()
    if case_covariate_settings is None:
        case_covariate_settings = _get_default_case_covariate_settings()

    return {
        "module": "CharacterizationModule",
        "settings": {
            "targetIds": target_ids,
            "outcomeIds": outcome_ids,
            "outcomeWashoutDays": outcome_washout_days,
            "minPriorObservation": min_prior_observation,
            "dechallengeStopInterval": dechallenge_stop_interval,
            "dechallengeEvaluationWindow": dechallenge_evaluation_window,
            "riskWindowStart": risk_window_start,
            "startAnchor": start_anchor,
            "riskWindowEnd": risk_window_end,
            "endAnchor": end_anchor,
            "minCharacterizationMean": min_characterization_mean,
            "covariateSettings": covariate_settings,
            "caseCovariateSettings": case_covariate_settings
        },
        "_class": ("ModuleSpecifications", "CharacterizationModuleSpecifications")
    }


def create_patient_level_prediction_module_specifications(
    model_design_list: list,
    skip_diagnostics: bool = False
) -> dict:
    """Create PatientLevelPrediction module specifications."""
    return {
        "module": "PatientLevelPredictionModule",
        "settings": {
            "modelDesignList": model_design_list,
            "skipDiagnostics": skip_diagnostics
        },
        "_class": ("ModuleSpecifications", "PatientLevelPredictionModuleSpecifications")
    }


def create_patient_level_prediction_validation_module_specifications(
    validation_list: list
) -> dict:
    """Create PatientLevelPrediction Validation module specifications."""
    return {
        "module": "PatientLevelPredictionValidationModule",
        "settings": {
            "validationList": validation_list
        },
        "_class": ("ModuleSpecifications", "PatientLevelPredictionValidationModuleSpecifications")
    }


def create_self_controlled_case_series_module_specifications(
    sccs_analyses_specifications: dict
) -> dict:
    """Create SelfControlledCaseSeries module specifications."""
    return {
        "module": "SelfControlledCaseSeriesModule",
        "settings": {
            "sccsAnalysesSpecifications": sccs_analyses_specifications
        },
        "_class": ("ModuleSpecifications", "SelfControlledCaseSeriesModuleSpecifications")
    }


def create_evidence_synthesis_module_specifications(
    evidence_synthesis_analysis_list: list,
    es_diagnostic_thresholds: Optional[dict] = None
) -> dict:
    """Create EvidenceSynthesis module specifications."""
    if es_diagnostic_thresholds is None:
        es_diagnostic_thresholds = _create_default_es_diagnostic_thresholds()

    return {
        "module": "EvidenceSynthesisModule",
        "settings": {
            "evidenceSynthesisAnalysisList": evidence_synthesis_analysis_list,
            "esDiagnosticThresholds": es_diagnostic_thresholds
        },
        "_class": ("ModuleSpecifications", "EvidenceSynthesisModuleSpecifications")
    }


def create_treatment_patterns_module_specifications(
    cohorts: list[dict],
    include_treatments: Optional[list] = None,
    index_date_offset: Optional[int] = None,
    min_era_duration: int = 0,
    split_event_cohorts: Optional[list] = None,
    split_time: Optional[int] = None,
    era_collapse_size: int = 30,
    combination_window: int = 30,
    min_post_combination_duration: int = 30,
    filter_treatments: str = "First",
    max_path_length: int = 5,
    age_window: int = 5,
    min_cell_count: int = 1,
    censor_type: str = "minCellCount",
    overlap_method: str = "truncate",
    concat_targets: bool = True
) -> dict:
    """Create TreatmentPatterns module specifications."""
    return {
        "module": "TreatmentPatternsModule",
        "settings": {
            "cohorts": cohorts,
            "includeTreatments": include_treatments,
            "indexDateOffset": index_date_offset,
            "minEraDuration": min_era_duration,
            "splitEventCohorts": split_event_cohorts,
            "splitTime": split_time,
            "eraCollapseSize": era_collapse_size,
            "combinationWindow": combination_window,
            "minPostCombinationDuration": min_post_combination_duration,
            "filterTreatments": filter_treatments,
            "maxPathLength": max_path_length,
            "ageWindow": age_window,
            "minCellCount": min_cell_count,
            "censorType": censor_type,
            "overlapMethod": overlap_method,
            "concatTargets": concat_targets
        },
        "_class": ("ModuleSpecifications", "TreatmentPatternsModuleSpecifications")
    }


def create_cohort_survival_module_specifications(
    target_cohort_id: int,
    outcome_cohort_id: int,
    strata: Optional[list] = None,
    analysis_type: str = "single_event",
    competing_outcome_cohort_table: Optional[str] = None,
    competing_outcome_cohort_id: Optional[int] = None,
    outcome_date_variable: str = "cohort_start_date",
    outcome_washout: float = float('inf'),
    censor_on_cohort_exit: bool = False,
    censor_on_date: Optional[str] = None,
    follow_up_days: float = float('inf'),
    event_gap: int = 30,
    estimate_gap: int = 1,
    restricted_mean_follow_up: Optional[int] = None,
    minimum_survival_days: int = 1
) -> dict:
    """Create CohortSurvival module specifications."""
    return {
        "module": "CohortSurvivalModule",
        "settings": {
            "targetCohortId": target_cohort_id,
            "outcomeCohortId": outcome_cohort_id,
            "strata": strata,
            "analysisType": analysis_type,
            "competingOutcomeCohortTable": competing_outcome_cohort_table,
            "competingOutcomeCohortId": competing_outcome_cohort_id,
            "outcomeDateVariable": outcome_date_variable,
            "outcomeWashout": outcome_washout,
            "censorOnCohortExit": censor_on_cohort_exit,
            "censorOnDate": censor_on_date,
            "followUpDays": follow_up_days,
            "eventGap": event_gap,
            "estimateGap": estimate_gap,
            "restrictedMeanFollowUp": restricted_mean_follow_up,
            "minimumSurvivalDays": minimum_survival_days
        },
        "_class": ("ModuleSpecifications", "CohortSurvivalModuleSpecifications")
    }


# =============================================================================
# Convenience Functions
# =============================================================================

def to_json(analysis_specifications: AnalysisSpecifications, pretty: bool = True) -> str:
    """
    Serialize analysis specifications to JSON.

    Args:
        analysis_specifications: The specifications to serialize.
        pretty: Whether to format with indentation.

    Returns:
        JSON string.
    """
    return analysis_specifications.to_json(pretty=pretty)


def save_to_json(analysis_specifications: AnalysisSpecifications, filepath: str) -> None:
    """
    Save analysis specifications to a JSON file.

    Args:
        analysis_specifications: The specifications to save.
        filepath: Path to the output file.
    """
    with open(filepath, "w") as f:
        f.write(analysis_specifications.to_json(pretty=True))


# =============================================================================
# Example Usage
# =============================================================================

if __name__ == "__main__":
    # Example: Create a complete analysis specification

    # Step 1: Create empty specification
    spec = create_empty_analysis_specifications()

    # Step 2: Add cohort definitions
    cohort_definition_set = [
        {"cohortId": 1, "cohortName": "Type 2 Diabetes", "sql": "-- SQL", "json": "{}"},
        {"cohortId": 2, "cohortName": "Metformin Users", "sql": "-- SQL", "json": "{}"},
        {"cohortId": 3, "cohortName": "GI Bleed", "sql": "-- SQL", "json": "{}"}
    ]
    cohort_shared = create_cohort_shared_resource_specifications(cohort_definition_set)
    spec = add_shared_resources(spec, cohort_shared)

    # Step 3: Add modules
    spec = add_module_specifications(
        spec,
        create_cohort_generator_module_specifications(generate_stats=True)
    )
    spec = add_module_specifications(
        spec,
        create_cohort_diagnostics_module_specifications(
            run_inclusion_statistics=True,
            run_incidence_rate=True
        )
    )
    spec = add_module_specifications(
        spec,
        create_characterization_module_specifications(
            target_ids=[1, 2],
            outcome_ids=[3]
        )
    )

    # Step 4: Serialize to JSON
    print(spec.to_json())
