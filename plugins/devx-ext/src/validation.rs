use std::error::Error;
use std::path::Path;

/// Validate a workspace path — reject traversal, null bytes, and symlinks.
pub fn validate_workspace_path(path: &str) -> Result<(), Box<dyn Error>> {
    if path.is_empty() {
        return Err("Path cannot be empty".into());
    }
    if path.contains('\0') {
        return Err("Path contains null bytes".into());
    }
    if path.contains("..") {
        return Err("Path traversal not allowed".into());
    }

    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("Path must be absolute".into());
    }

    // Check symlink — only if path exists
    if p.exists() && p.read_link().is_ok() {
        return Err("Symlinks not allowed".into());
    }

    Ok(())
}

/// Validate a git branch name.
pub fn validate_branch_name(name: &str) -> Result<(), Box<dyn Error>> {
    if name.is_empty() {
        return Err("Branch name cannot be empty".into());
    }
    let re = regex_lite(name);
    if !re {
        return Err(format!("Invalid branch name: \"{}\"", name).into());
    }
    if name.contains("..") || name == "HEAD" || name.ends_with(".lock") {
        return Err(format!("Invalid branch name: \"{}\"", name).into());
    }
    Ok(())
}

fn regex_lite(name: &str) -> bool {
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '_' || c == '.' || c == '-')
}

/// Validate a commit hash.
pub fn validate_commit_hash(hash: &str) -> Result<(), Box<dyn Error>> {
    if hash.len() < 7 || hash.len() > 40 {
        return Err(format!("Invalid commit hash: \"{}\"", hash).into());
    }
    if !hash.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) {
        return Err(format!("Invalid commit hash: \"{}\"", hash).into());
    }
    Ok(())
}

/// Validate a remote URL — only allow https://.
pub fn validate_remote_url(url: &str) -> Result<(), Box<dyn Error>> {
    if !url.starts_with("https://") {
        return Err("Only https:// remote URLs are allowed".into());
    }
    Ok(())
}

/// Validate a command against the allowlist.
pub fn validate_command(command: &str) -> Result<(&str, Vec<&str>), Box<dyn Error>> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Command cannot be empty".into());
    }
    let allowed = ["npm", "npx", "yarn", "pnpm", "node", "deno", "bun", "echo", "git", "mkdir", "sh", "cat", "cp"];
    let cmd = parts[0];
    if !allowed.contains(&cmd) {
        return Err(format!(
            "Command \"{}\" not allowed. Allowed: {}",
            cmd,
            allowed.join(", ")
        )
        .into());
    }
    Ok((cmd, parts[1..].to_vec()))
}

/// Strip credentials from error messages (https://user:token@host → https://host).
pub fn strip_credentials(msg: &str) -> String {
    let mut result = msg.to_string();
    while let Some(start) = result.find("https://") {
        let rest = &result[start + 8..];
        if let Some(at_pos) = rest.find('@') {
            // Only strip if @ comes before the next space/newline
            let end_pos = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
            if at_pos < end_pos {
                let after_at = &rest[at_pos + 1..];
                let replacement = format!("https://{}", after_at.split_whitespace().next().unwrap_or(""));
                let original = &result[start..start + 8 + end_pos.min(rest.len())];
                let original_owned = original.to_string();
                result = result.replacen(&original_owned, &replacement, 1);
                continue;
            }
        }
        break;
    }
    result
}
