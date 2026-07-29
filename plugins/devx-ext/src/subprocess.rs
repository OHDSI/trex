use crate::validation::strip_credentials;
use std::error::Error;
use std::process::Command;

/// Run a git command in the given working directory.
pub fn run_git(args: &[&str], cwd: &str) -> Result<String, Box<dyn Error>> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        // Mark all directories as safe to avoid "dubious ownership" errors
        // in container environments where git may run as a different user.
        // Identity (user.name/email) deliberately NOT injected here: GIT_CONFIG_*
        // env outranks .git/config, and per-user identity + SSH signing live in
        // the repo's devx-written include file (functions/git_identity.ts).
        // Callers that commit before that file can exist (git_init) pass a
        // scoped `-c` fallback identity instead.
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "safe.directory")
        .env("GIT_CONFIG_VALUE_0", "*")
        .output()
        .map_err(|e| format!("git spawn failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let raw = if stderr.is_empty() { &stdout } else { &stderr };
        let safe_err = strip_credentials(raw);
        // Name the subcommand, skipping any leading `-c key=val` config pairs.
        let subcommand = {
            let mut it = args.iter();
            let mut sub = args.first().copied().unwrap_or("?");
            while let Some(a) = it.next() {
                if *a == "-c" {
                    it.next(); // skip the key=val
                } else {
                    sub = a;
                    break;
                }
            }
            sub
        };
        return Err(format!("git {} failed: {}", subcommand, safe_err).into());
    }

    Ok(stdout.trim().to_string())
}

/// Run an allowlisted command in the given working directory.
/// Returns (success, exit_code, stdout, stderr).
pub fn run_command(cmd: &str, args: &[&str], cwd: &str) -> Result<(bool, i32, String, String), Box<dyn Error>> {
    let output = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("{cmd} spawn failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);

    Ok((output.status.success(), code, stdout, stderr))
}
