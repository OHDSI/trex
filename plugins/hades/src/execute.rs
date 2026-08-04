use std::fs;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::thread;

use super::env;
use super::jobs::{self, JobConfig, JobStatus, JobStore};
use super::r_script::{self, RunnerConfig};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProgressEvent {
    ModuleStart(String),
    ModuleComplete(String),
    Error(String),
}

pub fn parse_strategus_line(line: &str) -> Option<ProgressEvent> {
    let trimmed = line.trim();

    if let Some(rest) = trimmed.strip_prefix("Executing module ") {
        let module = rest.split_whitespace().next().unwrap_or(rest);
        return Some(ProgressEvent::ModuleStart(module.to_string()));
    }
    if let Some(rest) = trimmed.strip_prefix("Running module ") {
        let module = rest.split_whitespace().next().unwrap_or(rest);
        return Some(ProgressEvent::ModuleStart(module.to_string()));
    }

    if let Some(rest) = trimmed.strip_prefix("Module ") {
        if rest.contains("completed") {
            let module = rest.split_whitespace().next().unwrap_or("");
            if !module.is_empty() {
                return Some(ProgressEvent::ModuleComplete(module.to_string()));
            }
        }
    }

    if trimmed.starts_with("Error") || trimmed.starts_with("FATAL") {
        return Some(ProgressEvent::Error(trimmed.to_string()));
    }

    None
}

pub fn process_log_line(job_id: &str, line: &str, store: &JobStore) {
    store.append_log(job_id, line);

    if let Some(event) = parse_strategus_line(line) {
        match event {
            ProgressEvent::ModuleStart(module) => {
                store.set_current_module(job_id, &module);
            }
            ProgressEvent::ModuleComplete(module) => {
                store.complete_module(job_id, &module);
            }
            ProgressEvent::Error(_) => {}
        }
    }
}

fn monitor_child(job_id: String, mut child: Child, store: &'static JobStore) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let jid = job_id.clone();
    let stdout_handle = stdout.map(|out| {
        thread::spawn(move || {
            let reader = BufReader::new(out);
            for line in reader.lines().flatten() {
                process_log_line(&jid, &line, store);
            }
        })
    });

    let jid = job_id.clone();
    let stderr_handle = stderr.map(|err| {
        thread::spawn(move || {
            let reader = BufReader::new(err);
            for line in reader.lines().flatten() {
                store.append_log(&jid, &format!("[stderr] {line}"));
            }
        })
    });

    if let Some(h) = stdout_handle {
        let _ = h.join();
    }
    if let Some(h) = stderr_handle {
        let _ = h.join();
    }

    match child.wait() {
        Ok(status) if status.success() => {
            store.finish_job(&job_id, JobStatus::Completed, None);
        }
        Ok(status) => {
            let code = status.code().unwrap_or(-1);
            store.finish_job(
                &job_id,
                JobStatus::Failed,
                Some(format!("R process exited with code {code}")),
            );
        }
        Err(e) => {
            store.finish_job(
                &job_id,
                JobStatus::Failed,
                Some(format!("Failed to wait for R process: {e}")),
            );
        }
    }
}

pub struct ExecuteConfig {
    pub analysis_spec_path: String,
    pub cdm_database_schema: String,
    pub work_database_schema: String,
    pub output_path: String,
    pub database_name: String,
    pub env_name: String,
    pub env_base_dir: String,
    pub pgwire_port: u16,
    pub pgwire_password: String,
    pub cohort_table_name: String,
    pub min_cell_count: u32,
}

pub fn execute_study(cfg: ExecuteConfig) -> Result<String, String> {
    let rscript = env::find_rscript()?;

    env::validate_env_name(&cfg.env_name)?;
    let lib_path = env::env_lib_path(&cfg.env_base_dir, &cfg.env_name);

    if !std::path::Path::new(&lib_path).is_dir() {
        return Err(format!(
            "R environment '{}' not found at {lib_path}. Run trex_hades_setup_env first.",
            cfg.env_name
        ));
    }

    let runner_script = r_script::generate_strategus_runner(&RunnerConfig {
        analysis_spec_path: cfg.analysis_spec_path.clone(),
        cdm_database_schema: cfg.cdm_database_schema.clone(),
        work_database_schema: cfg.work_database_schema.clone(),
        output_path: cfg.output_path.clone(),
        database_name: cfg.database_name.clone(),
        pgwire_port: cfg.pgwire_port,
        pgwire_password: cfg.pgwire_password,
        cohort_table_name: cfg.cohort_table_name.clone(),
        min_cell_count: cfg.min_cell_count,
    });

    let store = jobs::global_store();
    let job_id = store.create_job(JobConfig {
        analysis_spec_path: cfg.analysis_spec_path,
        cdm_database_schema: cfg.cdm_database_schema,
        work_database_schema: cfg.work_database_schema,
        output_path: cfg.output_path,
        database_name: cfg.database_name.clone(),
        env_name: cfg.env_name.clone(),
    });

    let tmp_dir = std::env::temp_dir().join(format!("hades_{job_id}"));
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Cannot create temp dir: {e}"))?;
    let script_path = tmp_dir.join("StrategusCodeToRun.R");
    fs::write(&script_path, &runner_script)
        .map_err(|e| format!("Cannot write runner script: {e}"))?;

    let child = Command::new(&rscript)
        .arg(script_path.to_str().unwrap())
        .env("R_LIBS_USER", &lib_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            store.finish_job(&job_id, JobStatus::Failed, Some(format!("Failed to spawn Rscript: {e}")));
            format!("Failed to spawn Rscript: {e}")
        })?;

    store.set_pid(&job_id, child.id());

    let jid = job_id.clone();
    thread::spawn(move || {
        monitor_child(jid, child, store);
        let _ = fs::remove_dir_all(&tmp_dir);
    });

    Ok(job_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::jobs;

    #[test]
    fn parse_module_start() {
        let result = parse_strategus_line("Executing module CohortGeneratorModule");
        assert_eq!(result, Some(ProgressEvent::ModuleStart("CohortGeneratorModule".into())));
    }

    #[test]
    fn parse_module_start_with_running_prefix() {
        let result = parse_strategus_line("Running module CohortMethodModule version 5.4.0");
        assert_eq!(result, Some(ProgressEvent::ModuleStart("CohortMethodModule".into())));
    }

    #[test]
    fn parse_module_complete() {
        let result = parse_strategus_line("Module CohortGeneratorModule completed successfully");
        assert_eq!(result, Some(ProgressEvent::ModuleComplete("CohortGeneratorModule".into())));
    }

    #[test]
    fn parse_module_complete_with_time() {
        let result = parse_strategus_line("Module CohortMethodModule completed in 45.2 secs");
        assert_eq!(result, Some(ProgressEvent::ModuleComplete("CohortMethodModule".into())));
    }

    #[test]
    fn parse_error_line() {
        let result = parse_strategus_line("Error in Strategus::execute: connection refused");
        assert_eq!(result, Some(ProgressEvent::Error("Error in Strategus::execute: connection refused".into())));
    }

    #[test]
    fn parse_irrelevant_line() {
        let result = parse_strategus_line("Loading required package: dplyr");
        assert_eq!(result, None);
    }

    #[test]
    fn monitor_updates_job_store() {
        let store = jobs::global_store();
        let job_id = store.create_job(jobs::JobConfig {
            analysis_spec_path: "/tmp/spec.json".into(),
            cdm_database_schema: "cdm".into(),
            work_database_schema: "work".into(),
            output_path: "/tmp/results".into(),
            database_name: "test".into(),
            env_name: "default".into(),
        });

        let lines = vec![
            "Loading required package: dplyr",
            "Executing module CohortGeneratorModule",
            "Generating cohorts...",
            "Module CohortGeneratorModule completed successfully",
            "Executing module CohortMethodModule",
        ];

        for line in &lines {
            process_log_line(&job_id, line, store);
        }

        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.current_module, "CohortMethodModule");
        assert_eq!(job.modules_completed, vec!["CohortGeneratorModule"]);
        assert_eq!(job.log_tail.len(), 5);
    }
}
