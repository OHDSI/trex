# D2E Integrations

> Distilled from d2e-docs part 3 (integrations), 2026-06-14. See `00-overview` for context.

Three primary integrations — FHIR, Jupyter, Prefect — plus DICOM, Supabase Storage, and Logto.

## FHIR Services (HL7 R4)
Two logical components behind shared Trex auth:
- **FHIR Server** (read) — external systems query D2E clinical data via FHIR REST; translates FHIR-Search → SQL (often via Query Generation Service), formats results as FHIR resources.
- **FHIR Gateway** (write) — external systems push FHIR resources; gateway maps to internal structures including OMOP CDM.

**FHIR↔OMOP mapping (lossy both ways):** `Patient`→`person`, `Condition`→`condition_occurrence`, `Observation`→`measurement`/`observation`. Every coded value (SNOMED/ICD-10/LOINC) is translated by the **Terminology Service**. **SMART-on-FHIR is NOT supported** (FHIR clients expecting it need an OIDC adaptation layer). **Gotchas:** silent translation drift — unresolved codes fall back to a default mapping producing clinically-wrong-but-valid records (a periodic Prefect flow reconciles the unmapped-code log against new vocab); `$everything` on a large patient can time out. Genomics (FHIR `MolecularSequence` ↔ Genomic CDM) is in development.

## Jupyter Notebooks (Enterprise Gateway)
Two gateway instances — **researcher (R/W)** and **viewer (read-only)** — on separate Docker networks (`enterprise-gateway` vs `enterprise-gateway-viewer`); network separation enforces access at the Docker level. Kernels spawn as Docker containers from R image `r_ohdsi_docker`.

**WebSocket auth:** browser opens `/jupyter/` upgrade → Caddy subrequests Trex UserMgmtAPI with the `authtoken` cookie → validates token + dataset-scoped role → only then proxies to the gateway. Session expiry disconnects the user; the kernel survives until idle-culled.

**Kernel lifecycle:** launch timeout 60s, idle cull 3600s, one active kernel per user. R packages persist in the shared `r-libs` volume (shared across all kernels on a gateway). Pre-installed OHDSI packages: DatabaseConnector, SqlRender, CohortGenerator, FeatureExtraction, Achilles, DataQualityDashboard, Strategus. **Data access:** PG Wire (:5433) to query TrexSQL cache via DBI/RPostgres (most common, sub-second), or HTTP REST with the session token. Template notebooks copied to user workspace on first access.

## Prefect (Workflow Orchestration)
**Server v3.6.10, Python 3.12**, REST API at `/d2e/api` :41120, state in PostgreSQL (asyncpg), 5000-record/query limit. Anything >a few seconds runs as a flow, gated by **Job Plugins Service** (translates ops → deployment runs; frontend polls Job Plugins for status).

**Worker:** Docker work pool (`docker-pool`), container-per-flow, default 16 GB memory / 64 GB swap, attached to the `data` network for **direct DB access bypassing Trex** (Trex volume mounted for TrexSQL cache; host Docker socket mounted to spawn sibling containers). Deployments registered at init by `alp-dataflow-gen-init` (JSON Schema = validation + UI generation).

**25 flows in 6 categories.** Shared infra solves DB abstraction (PostgreSQL/HANA/BigQuery/TrexSQL via a dialect factory), Python↔R bridge (in-process R interpreter, Pandas↔data.frame), and resilience (failure hooks drop partial schemas on error). Highlights:
- **Data model:** OMOP CDM creation (DDL via OHDSI CommonDataModel R package, 3-schema layout), Liquibase versioning, HANA demo loading.
- **Loading/transform (8):** CSV (chunked, COPY for PG; silently drops unknown columns), FHIR loading, FHIR→OMOP (Java microservice + Git structure maps), MIMIC-IV (DuckDB staging, 54 scripts), dynamic JSON-DAG ETL (Dask-distributed), DICOM ETL, NLP entity extraction (spaCy BC5CDR + Med7, threshold 0.75), questionnaire.
- **Quality (3):** Achilles (3000+ analyses, powers Terminology usage stats), DQD (table/field/concept checks), White Rabbit (Java GUI under virtual framebuffer → Excel).
- **Caching/search (3):** TrexSQL cache creation (DuckDB attaches remote DBs, builds FTS indices, atomic temp-file rename), FHIR schema caching, semantic embeddings (Supabase/gte-small 384-dim, HNSW cosine index).
- **Cohort/analysis (5):** Cohort Generation (OHDSI CohortGenerator), Phenotype Library, Strategus orchestration (20+ HADES modules; modes: full / direct-R / cleanup / import), artifact sharing, patient loyalty scoring (Lasso regression).
- **Application (1):** Shiny Live deployment (compiles R/Python Shiny → static assets → Trex proxy).

## Other
- **DICOM:** optional `dicom` profile adds Orthanc; metadata in a `medical_imaging` schema keyed to OMOP person/visit; `person_to_patient_mapping` bridges IDs. Platform doesn't interpret images.
- **Supabase Storage:** S3-compatible, RLS-authenticated, behind Trex (per-dataset authz, not raw S3 IAM).
- **Logto:** treated as an integration (own DB, admin console); User Management is the bridge.
- **Cross-integration failure pattern (gotcha):** the platform degrades by feature, not by user — monitor each integration's health independently rather than via one platform health check.
