use crate::subprocess::run_git;
use crate::validation::{validate_branch_name, validate_commit_hash, validate_remote_url, validate_workspace_path};
use serde_json::json;
use std::error::Error;

pub fn git_init(path: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    // Default to `main` so the local branch matches GitHub's default — otherwise
    // a fresh repo lands on `master` and the first push creates a mismatched branch.
    run_git(&["init", "-b", "main"], path)?;
    run_git(&["add", "-A"], path)?;
    // The initial commit happens before any per-user config can exist (the
    // devx include file is written into .git/ AFTER init), so it carries a
    // scoped fallback identity. `-c` is not used on git_commit/git_revert —
    // it outranks the repo's local config and would override the per-user
    // identity/signing include.
    match run_git(
        &[
            "-c", "user.email=devx@trex.local",
            "-c", "user.name=DevX",
            "commit", "-m", "Initial commit", "--allow-empty",
        ],
        path,
    ) {
        Ok(_) => {}
        Err(_) => {} // May fail if nothing to commit
    }
    Ok(json!({"ok": true, "message": "Git repository initialized"}).to_string())
}

/// Clone a remote repository into `dest` (which must be an empty/new directory).
pub fn git_clone(url: &str, dest: &str) -> Result<String, Box<dyn Error>> {
    validate_remote_url(url)?;
    validate_workspace_path(dest)?;
    // Run from "/" — `git clone <url> <dest>` works into an existing empty dir.
    run_git(&["clone", url, dest], "/")?;
    Ok(json!({"ok": true, "message": "Repository cloned"}).to_string())
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
    // Push the current branch by name (`HEAD` → remote ref of the same name).
    // A bare `git push <url>` fails with "no upstream branch" because a URL
    // remote can't be an upstream. Propagate errors — do NOT report success on
    // failure, or the UI silently claims a push that never happened.
    let out = run_git(&["push", remote_url, "HEAD"], path)?;
    let msg = if out.is_empty() { "Pushed".to_string() } else { out };
    Ok(json!({"ok": true, "message": msg}).to_string())
}

pub fn git_pull(path: &str, remote_url: &str) -> Result<String, Box<dyn Error>> {
    validate_workspace_path(path)?;
    validate_remote_url(remote_url)?;
    let out = run_git(&["pull", remote_url], path)?;
    let msg = if out.is_empty() { "Pulled".to_string() } else { out };
    Ok(json!({"ok": true, "message": msg}).to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subprocess::run_git;
    use std::fs;

    fn temp_repo(name: &str) -> String {
        let dir = std::env::temp_dir().join(format!("devx-git-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.to_string_lossy().to_string()
    }

    /// git_init's initial commit must carry the scoped fallback identity —
    /// there is no repo config yet at that point.
    #[test]
    fn git_init_initial_commit_uses_fallback_identity() {
        let path = temp_repo("init-fallback");
        git_init(&path).expect("git_init failed");
        let author = run_git(&["log", "-1", "--format=%an <%ae>"], &path).unwrap();
        assert_eq!(author, "DevX <devx@trex.local>");
        let _ = fs::remove_dir_all(&path);
    }

    /// After the devx include file supplies a per-user identity, git_commit
    /// must honor it — this is exactly what the removed GIT_CONFIG_* env
    /// identity used to silently override.
    #[test]
    fn git_commit_honors_repo_local_identity_include() {
        let path = temp_repo("include-identity");
        git_init(&path).expect("git_init failed");

        // What functions/git_identity.ts writes: an include file + include.path.
        fs::write(
            format!("{path}/.git/devx.gitconfig"),
            "[user]\n\tname = \"Jane Doe\"\n\temail = jane@example.com\n",
        )
        .unwrap();
        run_git(&["config", "include.path", "devx.gitconfig"], &path).unwrap();

        fs::write(format!("{path}/file.txt"), "hello").unwrap();
        git_commit(&path, "add file").expect("git_commit failed");
        let author = run_git(&["log", "-1", "--format=%an <%ae>"], &path).unwrap();
        assert_eq!(author, "Jane Doe <jane@example.com>");
        let _ = fs::remove_dir_all(&path);
    }
}
