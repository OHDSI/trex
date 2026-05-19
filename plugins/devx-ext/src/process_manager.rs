use crate::validation;
use serde_json::json;
use std::collections::{HashMap, VecDeque};
use std::error::Error;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Copy, PartialEq)]
enum Status {
    Starting,
    Running,
    Stopped,
    Error,
}

impl Status {
    fn as_str(&self) -> &'static str {
        match self {
            Status::Starting => "starting",
            Status::Running => "running",
            Status::Stopped => "stopped",
            Status::Error => "error",
        }
    }
}

struct OutputLine {
    id: u64,
    text: String,
    stream: &'static str, // "stdout" or "stderr"
    timestamp_ms: u64,
}

struct ManagedProcess {
    child: Child,
    stdin: Option<std::process::ChildStdin>,
    stdout_buf: Arc<Mutex<VecDeque<OutputLine>>>,
    stderr_buf: Arc<Mutex<VecDeque<OutputLine>>>,
    status: Arc<Mutex<Status>>,
    port: u16,
    detected_url: Arc<Mutex<Option<String>>>,
    next_line_id: Arc<Mutex<u64>>,
}

const MAX_BUFFER_LINES: usize = 1000;

type Registry = Mutex<HashMap<String, ManagedProcess>>;

fn registry() -> &'static Registry {
    static REG: OnceLock<Registry> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_id(counter: &Arc<Mutex<u64>>) -> u64 {
    let mut n = counter.lock().unwrap();
    *n += 1;
    *n
}

fn push_line(buf: &Arc<Mutex<VecDeque<OutputLine>>>, line: OutputLine) {
    let mut b = buf.lock().unwrap();
    b.push_back(line);
    while b.len() > MAX_BUFFER_LINES {
        b.pop_front();
    }
}

/// Start a long-lived process.
/// config_json: {"path": "/abs/path", "command": "npm run dev", "port": 3001}
pub fn process_start(process_id: &str, config_json: &str) -> Result<String, Box<dyn Error>> {
    let config: serde_json::Value =
        serde_json::from_str(config_json).map_err(|e| format!("Invalid config JSON: {e}"))?;

    let path = config["path"]
        .as_str()
        .ok_or("config.path required")?;
    let command = config["command"]
        .as_str()
        .ok_or("config.command required")?;
    let port = config["port"]
        .as_u64()
        .ok_or("config.port required")? as u16;

    validation::validate_workspace_path(path)?;
    let (cmd, args) = validation::validate_command(command)?;

    // Stop existing process with this ID if any
    {
        let mut reg = registry().lock().unwrap();
        if let Some(mut old) = reg.remove(process_id) {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }

    let arg_refs: Vec<&str> = args.iter().copied().collect();
    let mut child = Command::new(cmd)
        .args(&arg_refs)
        .current_dir(path)
        .env("PORT", port.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{cmd} spawn failed: {e}"))?;

    let child_stdin = child.stdin.take();

    let pid = child.id();

    let stdout_buf: Arc<Mutex<VecDeque<OutputLine>>> = Arc::new(Mutex::new(VecDeque::new()));
    let stderr_buf: Arc<Mutex<VecDeque<OutputLine>>> = Arc::new(Mutex::new(VecDeque::new()));
    let status = Arc::new(Mutex::new(Status::Starting));
    let detected_url: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let next_line_id = Arc::new(Mutex::new(0u64));

    // Spawn stdout reader thread
    if let Some(stdout) = child.stdout.take() {
        let buf = Arc::clone(&stdout_buf);
        let st = Arc::clone(&status);
        let url = Arc::clone(&detected_url);
        let nid = Arc::clone(&next_line_id);
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(text) = line else { break };
                // Detect URL or "listening on port" pattern
                if let Some(m) = text.find("http://localhost:") {
                    let rest = &text[m..];
                    let end = rest.find(|c: char| c.is_whitespace()).unwrap_or(rest.len());
                    let found_url = &rest[..end];
                    let mut u = url.lock().unwrap();
                    if u.is_none() {
                        *u = Some(found_url.to_string());
                        let mut s = st.lock().unwrap();
                        *s = Status::Running;
                    }
                } else if text.contains("listening on port") {
                    let mut s = st.lock().unwrap();
                    if *s == Status::Starting {
                        *s = Status::Running;
                    }
                }
                let id = next_id(&nid);
                push_line(&buf, OutputLine {
                    id,
                    text,
                    stream: "stdout",
                    timestamp_ms: now_ms(),
                });
            }
        });
    }

    // Spawn stderr reader thread
    if let Some(stderr) = child.stderr.take() {
        let buf = Arc::clone(&stderr_buf);
        let nid = Arc::clone(&next_line_id);
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                let Ok(text) = line else { break };
                let id = next_id(&nid);
                push_line(&buf, OutputLine {
                    id,
                    text,
                    stream: "stderr",
                    timestamp_ms: now_ms(),
                });
            }
        });
    }

    let managed = ManagedProcess {
        child,
        stdin: child_stdin,
        stdout_buf,
        stderr_buf,
        status,
        port,
        detected_url,
        next_line_id,
    };

    registry().lock().unwrap().insert(process_id.to_string(), managed);

    Ok(json!({"ok": true, "port": port, "pid": pid}).to_string())
}

/// Stop a managed process.
pub fn process_stop(process_id: &str, _unused: &str) -> Result<String, Box<dyn Error>> {
    let mut reg = registry().lock().unwrap();
    if let Some(mut proc) = reg.remove(process_id) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
        Ok(json!({"ok": true}).to_string())
    } else {
        Ok(json!({"ok": true, "message": "no such process"}).to_string())
    }
}

/// Get status of a managed process.
pub fn process_status(process_id: &str, _unused: &str) -> Result<String, Box<dyn Error>> {
    // Critical section kept O(1): try_wait + clone Arc handles + read Copy fields,
    // then drop the global Registry lock before allocating the JSON response.
    // Holding the global lock through allocations serializes every other devx
    // process_* SQL call and can stall the DB worker pool under polling load.
    let (status_snapshot, port, url, pid) = {
        let mut reg = registry().lock().unwrap();
        match reg.get_mut(process_id) {
            Some(proc) => {
                if let Ok(Some(_)) = proc.child.try_wait() {
                    let mut s = proc.status.lock().unwrap();
                    if *s != Status::Stopped {
                        *s = Status::Stopped;
                    }
                }
                let status_snapshot = *proc.status.lock().unwrap();
                let url = proc.detected_url.lock().unwrap().clone();
                (status_snapshot, proc.port, url, proc.child.id())
            }
            None => {
                return Ok(
                    json!({"status": "stopped", "port": null, "url": null, "pid": null})
                        .to_string(),
                );
            }
        }
    };

    Ok(json!({
        "status": status_snapshot.as_str(),
        "port": port,
        "url": url,
        "pid": pid,
    })
    .to_string())
}

/// Get output lines since a given line ID. Returns lines from both stdout and stderr merged by ID.
pub fn process_output(process_id: &str, since_line_id: &str) -> Result<String, Box<dyn Error>> {
    let since: u64 = since_line_id.parse().unwrap_or(0);

    // Clone the per-process buffer handles under the global Registry lock, then
    // drop it before iterating. Previously this function iterated up to 1000
    // buffered lines and JSON-serialized each one while the global lock was
    // held, serializing every concurrent process_* poll and stalling DB workers.
    let (stdout_buf, stderr_buf) = {
        let reg = registry().lock().unwrap();
        match reg.get(process_id) {
            Some(proc) => (Arc::clone(&proc.stdout_buf), Arc::clone(&proc.stderr_buf)),
            None => return Ok(json!({"lines": [], "last_id": since}).to_string()),
        }
    };

    let mut lines = Vec::new();
    {
        let buf = stdout_buf.lock().unwrap();
        for ol in buf.iter() {
            if ol.id > since {
                lines.push(json!({
                    "id": ol.id,
                    "type": ol.stream,
                    "text": ol.text,
                    "ts": ol.timestamp_ms,
                }));
            }
        }
    }
    {
        let buf = stderr_buf.lock().unwrap();
        for ol in buf.iter() {
            if ol.id > since {
                lines.push(json!({
                    "id": ol.id,
                    "type": ol.stream,
                    "text": ol.text,
                    "ts": ol.timestamp_ms,
                }));
            }
        }
    }

    lines.sort_by_key(|l| l["id"].as_u64().unwrap_or(0));
    let last_id = lines.last().and_then(|l| l["id"].as_u64()).unwrap_or(since);
    Ok(json!({"lines": lines, "last_id": last_id}).to_string())
}

/// Write input to a managed process's stdin.
pub fn process_input(process_id: &str, input_text: &str) -> Result<String, Box<dyn Error>> {
    use std::io::Write;
    let mut reg = registry().lock().unwrap();
    if let Some(proc) = reg.get_mut(process_id) {
        if let Some(ref mut stdin) = proc.stdin {
            stdin
                .write_all(input_text.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {e}"))?;
            stdin
                .write_all(b"\n")
                .map_err(|e| format!("Failed to write newline: {e}"))?;
            stdin.flush().map_err(|e| format!("Failed to flush stdin: {e}"))?;
            Ok(json!({"ok": true}).to_string())
        } else {
            Err("Process stdin not available".into())
        }
    } else {
        Err(format!("Process not found: {process_id}").into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::{Duration, Instant};

    fn start_chatty_process(process_id: &str, port: u16) {
        let config = json!({
            "path": "/tmp",
            "command": "sh -c yes",
            "port": port,
        })
        .to_string();
        process_start(process_id, &config).expect("process_start failed");
    }

    fn cleanup(process_id: &str) {
        let _ = process_stop(process_id, "");
    }

    /// Concurrent polls of two distinct managed processes must not serialize
    /// through the global Registry mutex. Before the fix, `process_output`
    /// held the Registry lock while iterating up to ~1000 buffered stdout
    /// lines and JSON-serializing each one, so polls on process B blocked on
    /// the slow buffer walk for process A — exactly the failure mode that
    /// stalled the DB worker pool and made every HTTP route time out.
    #[test]
    fn process_output_does_not_serialize_across_processes() {
        let a = "test-contention-a";
        let b = "test-contention-b";
        start_chatty_process(a, 19911);
        start_chatty_process(b, 19912);

        // Let stdout readers fill the per-process buffers.
        thread::sleep(Duration::from_millis(500));

        const POLLS_PER_THREAD: usize = 200;
        const THREADS_PER_PROCESS: usize = 8;

        let start = Instant::now();
        let mut handles = Vec::new();
        for _ in 0..THREADS_PER_PROCESS {
            let id = a.to_string();
            handles.push(thread::spawn(move || {
                for _ in 0..POLLS_PER_THREAD {
                    let _ = process_output(&id, "0").unwrap();
                    let _ = process_status(&id, "").unwrap();
                }
            }));
            let id = b.to_string();
            handles.push(thread::spawn(move || {
                for _ in 0..POLLS_PER_THREAD {
                    let _ = process_output(&id, "0").unwrap();
                    let _ = process_status(&id, "").unwrap();
                }
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let elapsed = start.elapsed();

        cleanup(a);
        cleanup(b);

        // 8 threads/process × 2 processes × 200 iterations × 2 calls = 6400 calls.
        // Measured against the original code (Registry mutex held during O(buffer)
        // JSON serialization): ~2.4s. Measured against the current fixed code
        // (O(1) critical section, per-process buffer locks): ~0.3s. The 1s
        // bound flags any regression that puts slow work back under the global
        // Registry lock.
        assert!(
            elapsed < Duration::from_secs(1),
            "concurrent polling took {:?}; likely serializing on the global Registry lock",
            elapsed
        );
        eprintln!("concurrent poll test elapsed = {:?}", elapsed);
    }
}
