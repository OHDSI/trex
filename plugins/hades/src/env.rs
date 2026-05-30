use serde_json::Value;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};

use super::r_script::generate_renv_restore_script;

#[derive(Debug)]
pub struct RenvLockInfo {
    pub r_version: String,
    pub package_count: usize,
    pub has_strategus: bool,
}

pub fn validate_renv_lock(path: &str) -> Result<RenvLockInfo, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Cannot read renv.lock at {path}: {e}"))?;
    let parsed: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON in renv.lock: {e}"))?;
    let r_version = parsed
        .pointer("/R/Version")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let packages = parsed
        .get("Packages")
        .and_then(|v| v.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    let has_strategus = parsed
        .pointer("/Packages/Strategus")
        .is_some();
    Ok(RenvLockInfo {
        r_version,
        package_count: packages,
        has_strategus,
    })
}

pub fn validate_env_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Environment name cannot be empty".into());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Invalid environment name: {name}"));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Environment name must be alphanumeric, hyphens, or underscores: {name}"));
    }
    Ok(())
}

pub fn env_lib_path(base_dir: &str, env_name: &str) -> String {
    format!("{base_dir}/{env_name}")
}

pub fn list_environments(base_dir: &str) -> Vec<String> {
    let path = Path::new(base_dir);
    if !path.is_dir() {
        return Vec::new();
    }
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    names.push(name.to_string());
                }
            }
        }
    }
    names.sort();
    names
}

pub fn find_rscript() -> Result<String, String> {
    let candidates = ["Rscript", "/usr/bin/Rscript", "/usr/local/bin/Rscript"];
    for candidate in &candidates {
        if Command::new(candidate).arg("--version").output().is_ok() {
            return Ok(candidate.to_string());
        }
    }
    if let Ok(r_home) = std::env::var("R_HOME") {
        let path = format!("{r_home}/bin/Rscript");
        if Command::new(&path).arg("--version").output().is_ok() {
            return Ok(path);
        }
    }
    Err("Rscript not found. Install R or set R_HOME.".into())
}

pub fn setup_environment(
    rscript: &str,
    lockfile_path: &str,
    base_dir: &str,
    env_name: &str,
    log_fn: &mut dyn FnMut(&str),
) -> Result<(), String> {
    validate_env_name(env_name)?;
    validate_renv_lock(lockfile_path)?;

    let lib_path = env_lib_path(base_dir, env_name);
    let script = generate_renv_restore_script(lockfile_path, &lib_path);

    let tmp_dir = std::env::temp_dir().join(format!("hades_env_{env_name}"));
    fs::create_dir_all(&tmp_dir)
        .map_err(|e| format!("Cannot create temp dir: {e}"))?;
    let script_path = tmp_dir.join("setup.R");
    fs::write(&script_path, &script)
        .map_err(|e| format!("Cannot write setup script: {e}"))?;

    let mut child = Command::new(rscript)
        .arg(script_path.to_str().unwrap())
        .env("R_LIBS_USER", &lib_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Rscript: {e}"))?;

    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        if let Ok(line) = line {
            log_fn(&line);
        }
    }

    let status = child.wait()
        .map_err(|e| format!("Failed to wait for Rscript: {e}"))?;

    let _ = fs::remove_dir_all(&tmp_dir);

    if status.success() {
        Ok(())
    } else {
        Err(format!("renv::restore failed with exit code: {}", status))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    #[test]
    fn validate_renv_lock_accepts_valid_file() {
        let dir = TempDir::new().unwrap();
        let lock_path = dir.path().join("renv.lock");
        fs::write(&lock_path, r#"{
            "R": { "Version": "4.3.1" },
            "Packages": {
                "Strategus": { "Package": "Strategus", "Version": "1.0.0" },
                "CohortMethod": { "Package": "CohortMethod", "Version": "5.4.0" }
            }
        }"#).unwrap();
        let info = validate_renv_lock(lock_path.to_str().unwrap()).unwrap();
        assert_eq!(info.r_version, "4.3.1");
        assert_eq!(info.package_count, 2);
        assert!(info.has_strategus);
    }

    #[test]
    fn validate_renv_lock_rejects_missing_file() {
        let result = validate_renv_lock("/nonexistent/renv.lock");
        assert!(result.is_err());
    }

    #[test]
    fn validate_renv_lock_rejects_invalid_json() {
        let dir = TempDir::new().unwrap();
        let lock_path = dir.path().join("renv.lock");
        fs::write(&lock_path, "not json").unwrap();
        let result = validate_renv_lock(lock_path.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn env_lib_path_is_derived_from_base_and_name() {
        let path = env_lib_path("/data/hades-envs", "legendt2dm");
        assert_eq!(path, "/data/hades-envs/legendt2dm");
    }

    #[test]
    fn validate_env_name_rejects_path_traversal() {
        assert!(validate_env_name("../escape").is_err());
        assert!(validate_env_name("foo/bar").is_err());
        assert!(validate_env_name("").is_err());
    }

    #[test]
    fn validate_env_name_accepts_valid_names() {
        assert!(validate_env_name("legendt2dm").is_ok());
        assert!(validate_env_name("ehden-hmb").is_ok());
        assert!(validate_env_name("study_2024").is_ok());
    }

    #[test]
    fn list_envs_returns_empty_for_nonexistent_dir() {
        let envs = list_environments("/nonexistent/path");
        assert!(envs.is_empty());
    }

    #[test]
    fn list_envs_finds_subdirectories() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("study-a")).unwrap();
        fs::create_dir(dir.path().join("study-b")).unwrap();
        fs::write(dir.path().join("not-a-dir.txt"), "").unwrap();
        let envs = list_environments(dir.path().to_str().unwrap());
        assert_eq!(envs.len(), 2);
        assert!(envs.contains(&"study-a".to_string()));
        assert!(envs.contains(&"study-b".to_string()));
    }
}
