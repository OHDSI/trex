use crate::validation::strip_credentials;
use std::error::Error;
use std::process::Command;

const ALLOWED_EXACT: &[&str] = &[
    "PATH", "HOME", "SHELL", "USER", "LOGNAME", "TERM", "TZ", "TMPDIR", "LANG",
    "PWD", "SSH_AUTH_SOCK", "DENO_DIR", "CARGO_HOME", "RUSTUP_HOME",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
];
const ALLOWED_PREFIX: &[&str] = &["LC_", "NODE_", "npm_config_", "NPM_CONFIG_", "YARN_", "PNPM_"];

/// Filter a parent environment down to what a workspace command legitimately
/// needs. Allowlist, not denylist: a newly added secret must not become
/// reachable by default just because nobody remembered to deny it.
pub fn filtered_env<I>(parent: I, extra: Option<&str>) -> Vec<(String, String)>
where
    I: IntoIterator<Item = (String, String)>,
{
    let extras: Vec<&str> = extra
        .map(|s| s.split(',').map(str::trim).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();
    parent
        .into_iter()
        .filter(|(k, _)| {
            ALLOWED_EXACT.contains(&k.as_str())
                || ALLOWED_PREFIX.iter().any(|p| k.starts_with(p))
                || extras.contains(&k.as_str())
        })
        .collect()
}

/// Run a git command in the given working directory.
pub fn run_git(args: &[&str], cwd: &str) -> Result<String, Box<dyn Error>> {
    let extra = std::env::var("DEVX_CHILD_ENV_EXTRA").ok();
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        // env_clear THEN allowlist THEN the explicit GIT_* below — reversing
        // this order wipes the GIT_CONFIG_* set just below it too.
        .env_clear()
        .envs(filtered_env(std::env::vars(), extra.as_deref()))
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
    let extra = std::env::var("DEVX_CHILD_ENV_EXTRA").ok();
    let output = Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .env_clear()
        .envs(filtered_env(std::env::vars(), extra.as_deref()))
        .output()
        .map_err(|e| format!("{cmd} spawn failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);

    Ok((output.status.success(), code, stdout, stderr))
}

#[cfg(test)]
mod tests {
    use super::filtered_env;

    fn env_of(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn names(out: &[(String, String)]) -> Vec<&str> {
        out.iter().map(|(k, _)| k.as_str()).collect()
    }

    #[test]
    fn keeps_what_a_build_needs() {
        let out = filtered_env(env_of(&[
            ("PATH", "/usr/bin"), ("HOME", "/root"), ("NODE_ENV", "production"),
            ("npm_config_registry", "https://r.example"), ("LC_ALL", "C"),
            ("HTTPS_PROXY", "http://p:8080"), ("SSH_AUTH_SOCK", "/tmp/agent"),
        ]), None);
        let mut got = names(&out); got.sort();
        assert_eq!(got, vec!["HOME", "HTTPS_PROXY", "LC_ALL", "NODE_ENV", "PATH",
                             "SSH_AUTH_SOCK", "npm_config_registry"]);
    }

    #[test]
    fn drops_every_secret() {
        let out = filtered_env(env_of(&[
            ("PATH", "/usr/bin"),
            ("ANTHROPIC_API_KEY", "sk-x"), ("DATABASE_URL", "postgres://x"),
            ("LOGTO__CLIENT_SECRET", "s"), ("DISCORD_TOKEN", "t"),
            ("CLAW_CODE_USER_ID", "u"), ("AWS_SECRET_ACCESS_KEY", "k"),
        ]), None);
        assert_eq!(names(&out), vec!["PATH"]);
    }

    #[test]
    fn extra_admits_exactly_what_it_names() {
        let out = filtered_env(env_of(&[
            ("PATH", "/usr/bin"), ("FOO", "1"), ("BAR", "2"), ("BAZ", "3"),
        ]), Some("FOO,BAR"));
        let mut got = names(&out); got.sort();
        assert_eq!(got, vec!["BAR", "FOO", "PATH"]);
    }

    // GIT_* is deliberately NOT allowlisted: GIT_CONFIG_* outranks .git/config
    // and would override the per-user identity and SSH signing that
    // git_identity.ts installs there.
    #[test]
    fn git_config_env_is_not_inherited() {
        let out = filtered_env(env_of(&[
            ("PATH", "/usr/bin"), ("GIT_CONFIG_COUNT", "1"), ("GIT_AUTHOR_NAME", "x"),
        ]), None);
        assert_eq!(names(&out), vec!["PATH"]);
    }
}
