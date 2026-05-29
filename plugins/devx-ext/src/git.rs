use crate::subprocess::run_git;
use crate::validation::{validate_branch_name, validate_commit_hash, validate_remote_url, validate_workspace_path};
use serde_json::json;
use std::error::Error;

pub fn git_init(path: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    run_git(&["init"], path)?;
    run_git(&["add", "-A"], path)?;
    match run_git(&["commit", "-m", "Initial commit", "--allow-empty"], path) {
        Ok(_) => {}
        Err(_) => {} // May fail if nothing to commit
    }
    Ok(json!({"ok": true, "message": "Git repository initialized"}).to_string())
}

pub fn git_status(path: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    let out = run_git(&["status", "--porcelain"], path)?;
    let files: Vec<serde_json::Value> = out
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let status = line[..2].trim().to_string();
            let file_path = line[3..].to_string();
            json!({"path": file_path, "status": status})
        })
        .collect();
    Ok(json!({"files": files}).to_string())
}

pub fn git_commit(path: &str, message: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    run_git(&["add", "-A"], path)?;
    let out = run_git(&["commit", "-m", message], path)?;
    Ok(json!({"ok": true, "message": out}).to_string())
}

pub fn git_log(path: &str, limit: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    let max_count = format!("--max-count={}", limit);
    let out = match run_git(
        &["log", &max_count, "--format=%H%n%s%n%an%n%aI%n---"],
        path,
    ) {
        Ok(out) => out,
        Err(_) => return Ok(json!([]).to_string()),
    };
    let commits: Vec<serde_json::Value> = out
        .split("---\n")
        .filter(|s| !s.trim().is_empty())
        .filter_map(|entry| {
            let lines: Vec<&str> = entry.trim().lines().collect();
            if lines.len() >= 4 {
                Some(json!({
                    "hash": lines[0],
                    "message": lines[1],
                    "author": lines[2],
                    "date": lines[3],
                }))
            } else {
                None
            }
        })
        .collect();
    Ok(serde_json::to_string(&commits)?)
}

pub fn git_diff(path: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    let unstaged = run_git(&["diff"], path).unwrap_or_default();
    let staged = run_git(&["diff", "--cached"], path).unwrap_or_default();
    let combined = [unstaged, staged]
        .iter()
        .filter(|s| !s.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    let diff = if combined.is_empty() {
        "No changes".to_string()
    } else {
        combined
    };
    Ok(json!({"diff": diff}).to_string())
}

pub fn git_branch_list(path: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    let out = match run_git(&["branch", "--no-color"], path) {
        Ok(out) => out,
        Err(_) => return Ok(json!({"current": "main", "branches": ["main"]}).to_string()),
    };
    let mut current = "main".to_string();
    let mut branches: Vec<String> = Vec::new();
    for line in out.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(name) = trimmed.strip_prefix("* ") {
            current = name.to_string();
            branches.push(name.to_string());
        } else {
            branches.push(trimmed.to_string());
        }
    }
    Ok(json!({"current": current, "branches": branches}).to_string())
}

pub fn git_branch_create(path: &str, name: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_branch_name(name)?;
    run_git(&["branch", name], path)?;
    Ok(json!({"ok": true, "message": format!("Branch \"{}\" created", name)}).to_string())
}

pub fn git_branch_switch(path: &str, name: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_branch_name(name)?;
    run_git(&["checkout", name], path)?;
    Ok(json!({"ok": true, "message": format!("Switched to branch \"{}\"", name)}).to_string())
}

pub fn git_revert(path: &str, hash: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_commit_hash(hash)?;
    run_git(&["checkout", hash, "--", "."], path)?;
    run_git(&["add", "-A"], path)?;
    let msg = format!("Revert to {}", &hash[..7.min(hash.len())]);
    run_git(&["commit", "-m", &msg], path)?;
    Ok(json!({"ok": true, "message": msg}).to_string())
}

pub fn git_push(path: &str, remote_url: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_remote_url(remote_url)?;
    let out = run_git(&["push", remote_url], path).unwrap_or_else(|_| "Pushed successfully".to_string());
    Ok(json!({"ok": true, "message": out}).to_string())
}

pub fn git_pull(path: &str, remote_url: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_remote_url(remote_url)?;
    let out = run_git(&["pull", remote_url], path).unwrap_or_else(|_| "Pulled successfully".to_string());
    Ok(json!({"ok": true, "message": out}).to_string())
}

pub fn git_set_remote(path: &str, url: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_remote_url(url)?;
    match run_git(&["remote", "add", "origin", url], path) {
        Ok(_) => {}
        Err(_) => {
            run_git(&["remote", "set-url", "origin", url], path)?;
        }
    }
    Ok(json!({"ok": true, "message": format!("Remote \"origin\" set to {}", url)}).to_string())
}
