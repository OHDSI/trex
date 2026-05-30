use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

pub const LOG_BUFFER_SIZE: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobStatus::Running => "RUNNING",
            JobStatus::Completed => "COMPLETED",
            JobStatus::Failed => "FAILED",
            JobStatus::Cancelled => "CANCELLED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct JobConfig {
    pub analysis_spec_path: String,
    pub cdm_database_schema: String,
    pub work_database_schema: String,
    pub output_path: String,
    pub database_name: String,
    pub env_name: String,
}

#[derive(Debug, Clone)]
pub struct StudyJob {
    pub job_id: String,
    pub pid: Option<u32>,
    pub status: JobStatus,
    pub current_module: String,
    pub modules_completed: Vec<String>,
    pub start_time: Instant,
    pub end_time: Option<Instant>,
    pub error_message: Option<String>,
    pub log_tail: Vec<String>,
    pub config: JobConfig,
}

pub struct JobStore {
    pub(crate) jobs: Mutex<HashMap<String, StudyJob>>,
}

static GLOBAL_STORE: OnceLock<JobStore> = OnceLock::new();

pub fn global_store() -> &'static JobStore {
    GLOBAL_STORE.get_or_init(|| JobStore {
        jobs: Mutex::new(HashMap::new()),
    })
}

impl JobStore {
    pub fn create_job(&self, config: JobConfig) -> String {
        let job_id = uuid::Uuid::new_v4().to_string();
        let job = StudyJob {
            job_id: job_id.clone(),
            pid: None,
            status: JobStatus::Running,
            current_module: String::new(),
            modules_completed: Vec::new(),
            start_time: Instant::now(),
            end_time: None,
            error_message: None,
            log_tail: Vec::new(),
            config,
        };
        self.jobs.lock().unwrap().insert(job_id.clone(), job);
        job_id
    }

    pub fn get_job(&self, job_id: &str) -> Option<StudyJob> {
        self.jobs.lock().unwrap().get(job_id).cloned()
    }

    pub fn list_jobs(&self) -> Vec<StudyJob> {
        self.jobs.lock().unwrap().values().cloned().collect()
    }

    pub fn set_pid(&self, job_id: &str, pid: u32) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            job.pid = Some(pid);
        }
    }

    pub fn set_current_module(&self, job_id: &str, module: &str) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            job.current_module = module.to_string();
        }
    }

    pub fn complete_module(&self, job_id: &str, module: &str) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            job.modules_completed.push(module.to_string());
            if job.current_module == module {
                job.current_module = String::new();
            }
        }
    }

    pub fn finish_job(&self, job_id: &str, status: JobStatus, error: Option<String>) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            job.status = status;
            job.end_time = Some(Instant::now());
            job.error_message = error;
        }
    }

    pub fn append_log(&self, job_id: &str, line: &str) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            job.log_tail.push(line.to_string());
            if job.log_tail.len() > LOG_BUFFER_SIZE {
                let drain_count = job.log_tail.len() - LOG_BUFFER_SIZE;
                job.log_tail.drain(..drain_count);
            }
        }
    }

    pub fn cancel_job(&self, job_id: &str) -> bool {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(job_id) {
            if job.status == JobStatus::Running {
                job.status = JobStatus::Cancelled;
                job.end_time = Some(Instant::now());
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> &'static JobStore {
        let store = JobStore {
            jobs: Mutex::new(HashMap::new()),
        };
        Box::leak(Box::new(store))
    }

    fn test_config(name: &str) -> JobConfig {
        JobConfig {
            analysis_spec_path: format!("/tmp/{name}.json"),
            cdm_database_schema: "cdm".into(),
            work_database_schema: "work".into(),
            output_path: "/tmp/results".into(),
            database_name: name.into(),
            env_name: "default".into(),
        }
    }

    #[test]
    fn create_and_get_job() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.status, JobStatus::Running);
        assert_eq!(job.config.database_name, "test_db");
        assert!(job.modules_completed.is_empty());
    }

    #[test]
    fn update_module_progress() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        store.set_current_module(&job_id, "CohortGeneratorModule");
        store.complete_module(&job_id, "CohortGeneratorModule");
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.modules_completed, vec!["CohortGeneratorModule"]);
        assert_eq!(job.current_module, "");
    }

    #[test]
    fn finish_job() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        store.finish_job(&job_id, JobStatus::Completed, None);
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.status, JobStatus::Completed);
        assert!(job.end_time.is_some());
    }

    #[test]
    fn fail_job_with_error() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        store.finish_job(&job_id, JobStatus::Failed, Some("R process exited with code 1".into()));
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.status, JobStatus::Failed);
        assert_eq!(job.error_message.as_deref(), Some("R process exited with code 1"));
    }

    #[test]
    fn append_log_lines() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        for i in 0..150 {
            store.append_log(&job_id, &format!("line {i}"));
        }
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.log_tail.len(), LOG_BUFFER_SIZE);
        assert_eq!(job.log_tail[0], "line 50");
    }

    #[test]
    fn list_all_jobs() {
        let store = test_store();
        store.create_job(test_config("db_a"));
        store.create_job(test_config("db_b"));
        let jobs = store.list_jobs();
        assert_eq!(jobs.len(), 2);
    }

    #[test]
    fn cancel_job_sets_status() {
        let store = test_store();
        let job_id = store.create_job(test_config("test_db"));
        store.set_pid(&job_id, 12345);
        let cancelled = store.cancel_job(&job_id);
        assert!(cancelled);
        let job = store.get_job(&job_id).unwrap();
        assert_eq!(job.status, JobStatus::Cancelled);
    }

    #[test]
    fn cancel_nonexistent_job_returns_false() {
        let store = test_store();
        assert!(!store.cancel_job("nonexistent"));
    }
}
