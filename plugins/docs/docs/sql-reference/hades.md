---
sidebar_position: 15
---

# hades — OHDSI HADES R Analytics

The `hades` extension runs [OHDSI HADES](https://ohdsi.github.io/Hades/)
(Health Analytics Data-to-Evidence Suite) analyses against Trex. HADES is a
set of R packages for observational research on OMOP CDM data. This extension
sets up isolated R environments (via `renv`), then runs HADES/Strategus study
specifications as background jobs, exposing the analytical data to R over the
pgwire protocol.

Each analysis runs asynchronously: `trex_hades_execute` launches a job and returns
immediately with a job id; you poll `trex_hades_status` / `trex_hades_jobs` to track
progress.

## Setup

R analyses run in named, reproducible environments restored from an `renv.lock`
file. Create one before executing a study:

```sql
SELECT trex_hades_setup_env('/studies/my-study/renv.lock', 'my-study', '/opt/hades-envs');
```

## Functions

### `trex_hades_setup_env(lockfile_path, env_name, base_dir)`

Restore an R package environment from an `renv.lock` file so studies can run
against a pinned set of HADES packages.

| Parameter | Type | Description |
|-----------|------|-------------|
| lockfile_path | VARCHAR | Path to an `renv.lock`. |
| env_name | VARCHAR | Name for the environment. |
| base_dir | VARCHAR | Root directory where environments are created. |

**Returns:** VARCHAR — JSON: `{"status":"ok","env_name":...,"packages":N,"r_version":...}` or `{"status":"error","error":...}`.

```sql
SELECT trex_hades_setup_env('/studies/my-study/renv.lock', 'my-study', '/opt/hades-envs');
```

### `trex_hades_execute(spec_path, cdm_schema, work_schema, output_path, db_name, env_name, env_base_dir)`

Launch a Strategus study specification as an asynchronous background job.

| Parameter | Type | Description |
|-----------|------|-------------|
| spec_path | VARCHAR | Path to the analysis specification. |
| cdm_schema | VARCHAR | OMOP CDM schema. |
| work_schema | VARCHAR | Work / scratch schema. |
| output_path | VARCHAR | Where results are written. |
| db_name | VARCHAR | Database name. |
| env_name | VARCHAR | R environment to run in (from `trex_hades_setup_env`). |
| env_base_dir | VARCHAR | Root directory of environments. |

**Returns:** VARCHAR — JSON: `{"job_id":...,"pid":...,"status":"RUNNING"}` (or an error). The job connects back to Trex over pgwire (`TREX_PGWIRE_PORT`, default 5433, with `TREX_SQL_PASSWORD`); results use cohort table `hades_cohort` and a minimum cell count of 5.

```sql
SELECT trex_hades_execute(
  '/studies/my-study/spec.json',
  'cdm', 'scratch', '/studies/my-study/output',
  'omop', 'my-study', '/opt/hades-envs'
);
```

### `trex_hades_cancel(job_id)`

Cancel a running job (sends SIGTERM to its process).

| Parameter | Type | Description |
|-----------|------|-------------|
| job_id | VARCHAR | Job id returned by `trex_hades_execute`. |

**Returns:** VARCHAR — JSON: `{"status":"cancelled","job_id":...}` or `{"status":"not_found_or_not_running","job_id":...}`.

```sql
SELECT trex_hades_cancel('job-abc-123');
```

### `trex_hades_status(job_id)`

Detailed status for a single job, including a tail of its log.

| Parameter | Type | Description |
|-----------|------|-------------|
| job_id | VARCHAR | Job id. |

**Returns:** TABLE — one row (or none):

| Column | Description |
|--------|-------------|
| job_id | Job identifier. |
| status | Job status. |
| pid | Process id. |
| current_module | Module currently running. |
| modules_completed | Modules completed so far. |
| elapsed_ms | Elapsed time. |
| error_message | Error, if any. |
| env_name | R environment used. |
| database_name | Target database. |
| log_tail | Tail of the job log. |

```sql
SELECT * FROM trex_hades_status('job-abc-123');
```

### `trex_hades_jobs()`

List all known jobs (same columns as `trex_hades_status`, without `log_tail`).

**Returns:** TABLE — one row per job.

```sql
SELECT * FROM trex_hades_jobs();
```

### `trex_hades_envs(base_dir)`

List the R environments found under a base directory.

| Parameter | Type | Description |
|-----------|------|-------------|
| base_dir | VARCHAR | Root directory of environments. |

**Returns:** TABLE(env_name VARCHAR, path VARCHAR).

```sql
SELECT * FROM trex_hades_envs('/opt/hades-envs');
```

## Operational notes

- **R must be installed.** The extension runs `Rscript` from the restored
  environment; set `R_HOME` if R is not on the default path.
- **Jobs are asynchronous and process-based.** Each `trex_hades_execute` spawns a
  separate process. Track them with `trex_hades_jobs` / `trex_hades_status` and stop them
  with `trex_hades_cancel`.
- **Connectivity.** Study R code reaches the data over pgwire — ensure the
  pgwire server is running and `TREX_PGWIRE_PORT` / `TREX_SQL_PASSWORD` match.

## Next steps

- [SQL Reference → webapi](webapi) — the OHDSI WebAPI / ATLAS backend.
- [SQL Reference → atlas](atlas) — cohort definition to SQL.
- [Tutorial: Clinical analytics](../tutorials/clinical-analytics) — end-to-end
  OHDSI workflow.
