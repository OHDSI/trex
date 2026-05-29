extern crate duckdb;
extern crate duckdb_loadable_macros;
extern crate libduckdb_sys;

#[path = "jobs.rs"]
mod jobs;
#[path = "r_script.rs"]
mod r_script;
#[path = "env.rs"]
mod env;
#[path = "execute.rs"]
mod execute;

use duckdb::{
    core::{DataChunkHandle, Inserter, LogicalTypeHandle, LogicalTypeId},
    vtab::{BindInfo, InitInfo, TableFunctionInfo, VTab},
    vscalar::{ScalarFunctionSignature, VScalar},
    Connection, Result,
};
use duckdb_loadable_macros::duckdb_entrypoint_c_api;
use std::{
    error::Error,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
};

// ---------------------------------------------------------------------------
// Scalar: hades_setup_env(lockfile_path, env_name, base_dir) -> VARCHAR
// ---------------------------------------------------------------------------

struct HadesSetupEnvScalar;

impl VScalar for HadesSetupEnvScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn duckdb::vtab::arrow::WritableVector,
    ) -> Result<(), Box<dyn Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let v0 = input.flat_vector(0);
        let v1 = input.flat_vector(1);
        let v2 = input.flat_vector(2);
        let s0 = v0.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s1 = v1.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s2 = v2.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let lockfile_path = duckdb::types::DuckString::new(&mut { s0[0] }).as_str().to_string();
        let env_name = duckdb::types::DuckString::new(&mut { s1[0] }).as_str().to_string();
        let base_dir = duckdb::types::DuckString::new(&mut { s2[0] }).as_str().to_string();

        let response = match setup_env_impl(&lockfile_path, &env_name, &base_dir) {
            Ok(json) => json,
            Err(e) => format!(r#"{{"status":"error","error":"{}"}}"#, escape_json(&e)),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

fn setup_env_impl(lockfile_path: &str, env_name: &str, base_dir: &str) -> Result<String, String> {
    let rscript = env::find_rscript()?;
    let info = env::validate_renv_lock(lockfile_path)?;

    env::setup_environment(&rscript, lockfile_path, base_dir, env_name, &mut |_| {})?;

    Ok(format!(
        r#"{{"status":"ok","env_name":"{}","packages":{},"r_version":"{}"}}"#,
        escape_json(env_name),
        info.package_count,
        escape_json(&info.r_version),
    ))
}

// ---------------------------------------------------------------------------
// Scalar: hades_execute(spec_path, cdm_schema, work_schema, output_path,
//                       db_name, env_name, env_base_dir) -> VARCHAR
// ---------------------------------------------------------------------------

struct HadesExecuteScalar;

impl VScalar for HadesExecuteScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn duckdb::vtab::arrow::WritableVector,
    ) -> Result<(), Box<dyn Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let v0 = input.flat_vector(0);
        let v1 = input.flat_vector(1);
        let v2 = input.flat_vector(2);
        let v3 = input.flat_vector(3);
        let v4 = input.flat_vector(4);
        let v5 = input.flat_vector(5);
        let v6 = input.flat_vector(6);
        let s0 = v0.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s1 = v1.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s2 = v2.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s3 = v3.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s4 = v4.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s5 = v5.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let s6 = v6.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());

        let spec_path = duckdb::types::DuckString::new(&mut { s0[0] }).as_str().to_string();
        let cdm_schema = duckdb::types::DuckString::new(&mut { s1[0] }).as_str().to_string();
        let work_schema = duckdb::types::DuckString::new(&mut { s2[0] }).as_str().to_string();
        let output_path = duckdb::types::DuckString::new(&mut { s3[0] }).as_str().to_string();
        let db_name = duckdb::types::DuckString::new(&mut { s4[0] }).as_str().to_string();
        let env_name = duckdb::types::DuckString::new(&mut { s5[0] }).as_str().to_string();
        let env_base_dir = duckdb::types::DuckString::new(&mut { s6[0] }).as_str().to_string();

        let response = match execute_impl(
            &spec_path,
            &cdm_schema,
            &work_schema,
            &output_path,
            &db_name,
            &env_name,
            &env_base_dir,
        ) {
            Ok(json) => json,
            Err(e) => format!(r#"{{"status":"error","error":"{}"}}"#, escape_json(&e)),
        };

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
                LogicalTypeId::Varchar.into(),
            ],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

fn execute_impl(
    spec_path: &str,
    cdm_schema: &str,
    work_schema: &str,
    output_path: &str,
    db_name: &str,
    env_name: &str,
    env_base_dir: &str,
) -> Result<String, String> {
    let pgwire_port: u16 = std::env::var("TREX_PGWIRE_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5433);
    let pgwire_password = std::env::var("TREX_SQL_PASSWORD").unwrap_or_default();

    let cfg = execute::ExecuteConfig {
        analysis_spec_path: spec_path.to_string(),
        cdm_database_schema: cdm_schema.to_string(),
        work_database_schema: work_schema.to_string(),
        output_path: output_path.to_string(),
        database_name: db_name.to_string(),
        env_name: env_name.to_string(),
        env_base_dir: env_base_dir.to_string(),
        pgwire_port,
        pgwire_password,
        cohort_table_name: "hades_cohort".to_string(),
        min_cell_count: 5,
    };

    let job_id = execute::execute_study(cfg)?;

    let store = jobs::global_store();
    let pid = store
        .get_job(&job_id)
        .and_then(|j| j.pid)
        .map(|p| p.to_string())
        .unwrap_or_default();

    Ok(format!(
        r#"{{"job_id":"{}","pid":"{}","status":"RUNNING"}}"#,
        escape_json(&job_id),
        pid,
    ))
}

// ---------------------------------------------------------------------------
// Scalar: hades_cancel(job_id) -> VARCHAR
// ---------------------------------------------------------------------------

struct HadesCancelScalar;

impl VScalar for HadesCancelScalar {
    type State = ();

    unsafe fn invoke(
        _state: &Self::State,
        input: &mut DataChunkHandle,
        output: &mut dyn duckdb::vtab::arrow::WritableVector,
    ) -> Result<(), Box<dyn Error>> {
        if input.len() == 0 {
            return Err("No input provided".into());
        }

        let v0 = input.flat_vector(0);
        let s0 = v0.as_slice_with_len::<libduckdb_sys::duckdb_string_t>(input.len());
        let job_id = duckdb::types::DuckString::new(&mut { s0[0] }).as_str().to_string();

        let response = cancel_impl(&job_id);

        let flat = output.flat_vector();
        flat.insert(0, &response);
        Ok(())
    }

    fn signatures() -> Vec<ScalarFunctionSignature> {
        vec![ScalarFunctionSignature::exact(
            vec![LogicalTypeId::Varchar.into()],
            LogicalTypeId::Varchar.into(),
        )]
    }
}

fn cancel_impl(job_id: &str) -> String {
    let store = jobs::global_store();

    // Try to get the PID before cancelling, so we can send SIGTERM.
    let pid = store.get_job(job_id).and_then(|j| {
        if j.status == jobs::JobStatus::Running {
            j.pid
        } else {
            None
        }
    });

    if let Some(pid) = pid {
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    if store.cancel_job(job_id) {
        format!(r#"{{"status":"cancelled","job_id":"{}"}}"#, escape_json(job_id))
    } else {
        format!(
            r#"{{"status":"not_found_or_not_running","job_id":"{}"}}"#,
            escape_json(job_id),
        )
    }
}

// ---------------------------------------------------------------------------
// Table: hades_status(job_id) -> one row
// ---------------------------------------------------------------------------

struct HadesStatusTable;

#[repr(C)]
struct HadesStatusBindData {
    job: Option<jobs::StudyJob>,
}

#[repr(C)]
struct HadesStatusInitData {
    done: AtomicBool,
}

impl VTab for HadesStatusTable {
    type InitData = HadesStatusInitData;
    type BindData = HadesStatusBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("job_id", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("pid", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("current_module", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("modules_completed", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("elapsed_ms", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("error_message", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("env_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("database_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("log_tail", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let job_id = bind.get_parameter(0).to_string();
        let store = jobs::global_store();
        let job = store.get_job(&job_id);

        Ok(HadesStatusBindData { job })
    }

    fn init(_: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        Ok(HadesStatusInitData {
            done: AtomicBool::new(false),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let bind_data = func.get_bind_data();

        if init_data.done.swap(true, Ordering::Relaxed) {
            output.set_len(0);
            return Ok(());
        }

        let job = match &bind_data.job {
            Some(j) => j,
            None => {
                output.set_len(0);
                return Ok(());
            }
        };

        let elapsed = job
            .end_time
            .unwrap_or_else(std::time::Instant::now)
            .duration_since(job.start_time)
            .as_millis()
            .to_string();
        let pid_str = job.pid.map(|p| p.to_string()).unwrap_or_default();
        let modules_completed = job.modules_completed.join(",");
        let error_message = job.error_message.clone().unwrap_or_default();
        let log_tail = job.log_tail.join("\n");

        let col_job_id = output.flat_vector(0);
        col_job_id.insert(0, job.job_id.as_str());
        let col_status = output.flat_vector(1);
        col_status.insert(0, job.status.as_str());
        let col_pid = output.flat_vector(2);
        col_pid.insert(0, pid_str.as_str());
        let col_current_module = output.flat_vector(3);
        col_current_module.insert(0, job.current_module.as_str());
        let col_modules_completed = output.flat_vector(4);
        col_modules_completed.insert(0, modules_completed.as_str());
        let col_elapsed = output.flat_vector(5);
        col_elapsed.insert(0, elapsed.as_str());
        let col_error = output.flat_vector(6);
        col_error.insert(0, error_message.as_str());
        let col_env = output.flat_vector(7);
        col_env.insert(0, job.config.env_name.as_str());
        let col_db = output.flat_vector(8);
        col_db.insert(0, job.config.database_name.as_str());
        let col_log = output.flat_vector(9);
        col_log.insert(0, log_tail.as_str());

        output.set_len(1);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
    }
}

// ---------------------------------------------------------------------------
// Table: hades_jobs() -> N rows
// ---------------------------------------------------------------------------

struct HadesJobsTable;

#[repr(C)]
struct HadesJobsBindData {
    jobs: Vec<jobs::StudyJob>,
}

#[repr(C)]
struct HadesJobsInitData {
    pos: AtomicUsize,
}

impl VTab for HadesJobsTable {
    type InitData = HadesJobsInitData;
    type BindData = HadesJobsBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("job_id", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("status", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("pid", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("current_module", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("modules_completed", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("elapsed_ms", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("error_message", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("env_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("database_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let store = jobs::global_store();
        let jobs = store.list_jobs();

        Ok(HadesJobsBindData { jobs })
    }

    fn init(_: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        Ok(HadesJobsInitData {
            pos: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let bind_data = func.get_bind_data();

        let pos = init_data.pos.load(Ordering::Relaxed);
        if pos >= bind_data.jobs.len() {
            output.set_len(0);
            return Ok(());
        }

        // Emit rows in batches of up to 2048
        let batch_end = std::cmp::min(pos + 2048, bind_data.jobs.len());
        let batch_size = batch_end - pos;

        let col_job_id = output.flat_vector(0);
        let col_status = output.flat_vector(1);
        let col_pid = output.flat_vector(2);
        let col_current_module = output.flat_vector(3);
        let col_modules_completed = output.flat_vector(4);
        let col_elapsed = output.flat_vector(5);
        let col_error = output.flat_vector(6);
        let col_env = output.flat_vector(7);
        let col_db = output.flat_vector(8);

        for i in 0..batch_size {
            let job = &bind_data.jobs[pos + i];
            let elapsed = job
                .end_time
                .unwrap_or_else(std::time::Instant::now)
                .duration_since(job.start_time)
                .as_millis()
                .to_string();
            let pid_str = job.pid.map(|p| p.to_string()).unwrap_or_default();
            let modules_completed = job.modules_completed.join(",");
            let error_message = job.error_message.clone().unwrap_or_default();

            col_job_id.insert(i, job.job_id.as_str());
            col_status.insert(i, job.status.as_str());
            col_pid.insert(i, pid_str.as_str());
            col_current_module.insert(i, job.current_module.as_str());
            col_modules_completed.insert(i, modules_completed.as_str());
            col_elapsed.insert(i, elapsed.as_str());
            col_error.insert(i, error_message.as_str());
            col_env.insert(i, job.config.env_name.as_str());
            col_db.insert(i, job.config.database_name.as_str());
        }

        output.set_len(batch_size);
        init_data.pos.store(batch_end, Ordering::Relaxed);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        None
    }
}

// ---------------------------------------------------------------------------
// Table: hades_envs(base_dir) -> N rows
// ---------------------------------------------------------------------------

struct HadesEnvsTable;

#[repr(C)]
struct HadesEnvsBindData {
    envs: Vec<(String, String)>, // (env_name, path)
}

#[repr(C)]
struct HadesEnvsInitData {
    pos: AtomicUsize,
}

impl VTab for HadesEnvsTable {
    type InitData = HadesEnvsInitData;
    type BindData = HadesEnvsBindData;

    fn bind(bind: &BindInfo) -> Result<Self::BindData, Box<dyn Error>> {
        bind.add_result_column("env_name", LogicalTypeHandle::from(LogicalTypeId::Varchar));
        bind.add_result_column("path", LogicalTypeHandle::from(LogicalTypeId::Varchar));

        let base_dir = bind.get_parameter(0).to_string();
        let names = env::list_environments(&base_dir);
        let envs: Vec<(String, String)> = names
            .into_iter()
            .map(|name| {
                let path = env::env_lib_path(&base_dir, &name);
                (name, path)
            })
            .collect();

        Ok(HadesEnvsBindData { envs })
    }

    fn init(_: &InitInfo) -> Result<Self::InitData, Box<dyn Error>> {
        Ok(HadesEnvsInitData {
            pos: AtomicUsize::new(0),
        })
    }

    fn func(
        func: &TableFunctionInfo<Self>,
        output: &mut DataChunkHandle,
    ) -> Result<(), Box<dyn Error>> {
        let init_data = func.get_init_data();
        let bind_data = func.get_bind_data();

        let pos = init_data.pos.load(Ordering::Relaxed);
        if pos >= bind_data.envs.len() {
            output.set_len(0);
            return Ok(());
        }

        let batch_end = std::cmp::min(pos + 2048, bind_data.envs.len());
        let batch_size = batch_end - pos;

        let col_name = output.flat_vector(0);
        let col_path = output.flat_vector(1);

        for i in 0..batch_size {
            let (ref name, ref path) = bind_data.envs[pos + i];
            col_name.insert(i, name.as_str());
            col_path.insert(i, path.as_str());
        }

        output.set_len(batch_size);
        init_data.pos.store(batch_end, Ordering::Relaxed);
        Ok(())
    }

    fn parameters() -> Option<Vec<LogicalTypeHandle>> {
        Some(vec![LogicalTypeHandle::from(LogicalTypeId::Varchar)])
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

#[duckdb_entrypoint_c_api(ext_name = "hades")]
pub unsafe fn extension_entrypoint(con: Connection) -> Result<(), Box<dyn Error>> {
    con.register_scalar_function::<HadesSetupEnvScalar>("hades_setup_env")
        .expect("Failed to register hades_setup_env");
    con.register_scalar_function::<HadesExecuteScalar>("hades_execute")
        .expect("Failed to register hades_execute");
    con.register_scalar_function::<HadesCancelScalar>("hades_cancel")
        .expect("Failed to register hades_cancel");

    con.register_table_function::<HadesStatusTable>("hades_status")
        .expect("Failed to register hades_status");
    con.register_table_function::<HadesJobsTable>("hades_jobs")
        .expect("Failed to register hades_jobs");
    con.register_table_function::<HadesEnvsTable>("hades_envs")
        .expect("Failed to register hades_envs");

    Ok(())
}
