use anyhow::{bail, Context, Result};
use base::{get_default_permissions, CacheSetting, WorkerKind};
use deno::DenoOptionsBuilder;
use deno_facade::{generate_binary_eszip, EmitterFactory, Metadata};
use serde::Deserialize;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct BundleOptions {
  #[serde(default)]
  pub checksum: Option<String>,

  #[serde(default)]
  pub static_patterns: Vec<String>,

  #[serde(default)]
  pub no_module_cache: bool,

  #[serde(default)]
  pub timeout_sec: Option<u64>,
}

impl BundleOptions {
  pub fn get_checksum(&self) -> Result<Option<deno_facade::Checksum>> {
    use deno_facade::Checksum;
    match self.checksum.as_deref() {
      None | Some("none") | Some("") => Ok(None),
      Some("sha256") => Ok(Checksum::from_u8(1)),
      Some("xxhash3") => Ok(Checksum::from_u8(2)),
      Some(other) => bail!(
        "Invalid checksum type '{}'. Expected 'none', 'sha256', or 'xxhash3'",
        other
      ),
    }
  }
}

pub fn create_bundle_sync(
  entrypoint: &str,
  output: &str,
  options: Option<BundleOptions>,
) -> Result<String> {
  // Required before any TLS operation; rustls panics if no provider is installed.
  let _ = rustls::crypto::ring::default_provider().install_default();

  let options = options.unwrap_or_default();
  let entrypoint = entrypoint.to_string();
  let output = output.to_string();

  let entrypoint_path = PathBuf::from(&entrypoint);
  if !entrypoint_path.exists() {
    bail!("Entrypoint path does not exist: {}", entrypoint);
  }
  if !entrypoint_path.is_file() {
    bail!("Entrypoint path is not a file: {}", entrypoint);
  }
  let entrypoint_path = entrypoint_path
    .canonicalize()
    .context("Failed to canonicalize entrypoint path")?;

  let checksum = options.get_checksum()?;
  let static_patterns = options.static_patterns.clone();
  let no_module_cache = options.no_module_cache;
  let timeout_sec = options.timeout_sec;

  let handle = thread::spawn(move || -> Result<Vec<u8>> {
    let runtime = tokio::runtime::Builder::new_current_thread()
      .enable_all()
      .thread_name("trex-bundle")
      .build()
      .context("Failed to create tokio runtime")?;

    runtime.block_on(async {
      let mut emitter_factory = EmitterFactory::new();

      if no_module_cache {
        emitter_factory.set_cache_strategy(Some(CacheSetting::ReloadAll));
      }

      emitter_factory.set_permissions_options(Some(get_default_permissions(
        WorkerKind::MainWorker,
      )));

      let deno_options = DenoOptionsBuilder::new()
        .entrypoint(entrypoint_path)
        .build()
        .await
        .context("Failed to build DenoOptions")?;

      emitter_factory.set_deno_options(deno_options);

      let static_pattern_refs: Vec<&str> =
        static_patterns.iter().map(|s| s.as_str()).collect();

      let mut metadata = Metadata::default();

      #[allow(clippy::arc_with_non_send_sync)]
      let eszip_fut = generate_binary_eszip(
        &mut metadata,
        Arc::new(emitter_factory),
        None,
        checksum,
        if static_pattern_refs.is_empty() {
          None
        } else {
          Some(static_pattern_refs)
        },
      );

      let eszip = if let Some(secs) = timeout_sec {
        match tokio::time::timeout(
          std::time::Duration::from_secs(secs),
          eszip_fut,
        )
        .await
        {
          Ok(result) => result,
          Err(_) => {
            bail!("Bundle operation timed out after {} seconds", secs)
          }
        }
      } else {
        eszip_fut.await
      }?;

      Ok(eszip.into_bytes())
    })
  });

  let bytes = handle
    .join()
    .map_err(|_| anyhow::anyhow!("Bundle thread panicked"))??;

  let mut file = File::create(&output)
    .with_context(|| format!("Failed to create output file: {}", output))?;

  file
    .write_all(&bytes)
    .with_context(|| format!("Failed to write bundle to: {}", output))?;

  Ok(format!(
    "Bundle created successfully: {} ({} bytes)",
    output,
    bytes.len()
  ))
}

#[cfg(test)]
mod tests {
  use super::*;
  use tempfile::tempdir;

  // ---------- BundleOptions::get_checksum ----------

  #[test]
  fn get_checksum_none_when_unset_returns_none() {
    let opts = BundleOptions::default();
    let result = opts.get_checksum().expect("default checksum should be Ok");
    assert!(result.is_none(), "default (None) should map to no checksum");
  }

  #[test]
  fn get_checksum_explicit_none_string_returns_none() {
    let opts = BundleOptions {
      checksum: Some("none".to_string()),
      ..Default::default()
    };
    let result = opts.get_checksum().expect("'none' should be Ok");
    assert!(result.is_none(), "'none' string should map to no checksum");
  }

  #[test]
  fn get_checksum_empty_string_returns_none() {
    let opts = BundleOptions {
      checksum: Some(String::new()),
      ..Default::default()
    };
    let result = opts.get_checksum().expect("empty string should be Ok");
    assert!(
      result.is_none(),
      "empty checksum string should map to no checksum"
    );
  }

  #[test]
  fn get_checksum_sha256_returns_some() {
    let opts = BundleOptions {
      checksum: Some("sha256".to_string()),
      ..Default::default()
    };
    let result = opts.get_checksum().expect("'sha256' should parse");
    assert!(result.is_some(), "'sha256' should yield Some(Checksum)");
  }

  #[test]
  fn get_checksum_xxhash3_returns_some() {
    let opts = BundleOptions {
      checksum: Some("xxhash3".to_string()),
      ..Default::default()
    };
    let result = opts.get_checksum().expect("'xxhash3' should parse");
    assert!(result.is_some(), "'xxhash3' should yield Some(Checksum)");
  }

  #[test]
  fn get_checksum_invalid_value_errors_with_helpful_message() {
    let opts = BundleOptions {
      checksum: Some("md5".to_string()),
      ..Default::default()
    };
    let err = opts
      .get_checksum()
      .expect_err("unknown checksum should be rejected");
    let msg = format!("{}", err);
    assert!(
      msg.contains("md5"),
      "error should mention offending value, got: {msg}"
    );
    assert!(
      msg.contains("sha256") && msg.contains("xxhash3") && msg.contains("none"),
      "error should list valid options, got: {msg}"
    );
  }

  // ---------- BundleOptions deserialization ----------

  #[test]
  fn bundle_options_deserializes_empty_object_to_defaults() {
    let opts: BundleOptions = serde_json::from_str("{}").expect("empty {} valid");
    assert!(opts.checksum.is_none());
    assert!(opts.static_patterns.is_empty());
    assert!(!opts.no_module_cache);
    assert!(opts.timeout_sec.is_none());
  }

  #[test]
  fn bundle_options_deserializes_all_fields() {
    let json = r#"{
      "checksum": "sha256",
      "static_patterns": ["**/*.txt", "data/*.json"],
      "no_module_cache": true,
      "timeout_sec": 30
    }"#;
    let opts: BundleOptions =
      serde_json::from_str(json).expect("valid JSON should parse");
    assert_eq!(opts.checksum.as_deref(), Some("sha256"));
    assert_eq!(opts.static_patterns, vec!["**/*.txt", "data/*.json"]);
    assert!(opts.no_module_cache);
    assert_eq!(opts.timeout_sec, Some(30));
  }

  #[test]
  fn bundle_options_unknown_fields_are_ignored() {
    // serde default behavior: unknown fields ignored (no #[serde(deny_unknown_fields)])
    let json = r#"{"checksum": "none", "totally_unknown_field": 42}"#;
    let opts: BundleOptions =
      serde_json::from_str(json).expect("unknown fields should be tolerated");
    assert_eq!(opts.checksum.as_deref(), Some("none"));
  }

  // ---------- create_bundle_sync entrypoint validation ----------

  #[test]
  fn create_bundle_sync_rejects_missing_entrypoint() {
    let dir = tempdir().expect("tempdir");
    let missing = dir.path().join("does_not_exist.ts");
    let out = dir.path().join("out.eszip");

    let err = create_bundle_sync(
      missing.to_str().unwrap(),
      out.to_str().unwrap(),
      None,
    )
    .expect_err("missing entrypoint must be rejected");
    let msg = format!("{}", err);
    assert!(
      msg.contains("does not exist"),
      "error should explain missing path, got: {msg}"
    );
  }

  #[test]
  fn create_bundle_sync_rejects_directory_as_entrypoint() {
    let dir = tempdir().expect("tempdir");
    // The directory itself exists but is not a file.
    let out = dir.path().join("out.eszip");

    let err = create_bundle_sync(
      dir.path().to_str().unwrap(),
      out.to_str().unwrap(),
      None,
    )
    .expect_err("directory entrypoint must be rejected");
    let msg = format!("{}", err);
    assert!(
      msg.contains("not a file"),
      "error should explain non-file path, got: {msg}"
    );
  }

  #[test]
  fn create_bundle_sync_propagates_invalid_checksum_option() {
    // The entrypoint exists and is a file, so the function progresses past
    // the path checks and then fails when get_checksum() rejects the value.
    let dir = tempdir().expect("tempdir");
    let entry = dir.path().join("entry.ts");
    std::fs::write(&entry, "export default {}\n").expect("write entry");
    let out = dir.path().join("out.eszip");

    let err = create_bundle_sync(
      entry.to_str().unwrap(),
      out.to_str().unwrap(),
      Some(BundleOptions {
        checksum: Some("bogus".to_string()),
        ..Default::default()
      }),
    )
    .expect_err("invalid checksum must surface as error");
    let msg = format!("{}", err);
    assert!(
      msg.contains("bogus") || msg.contains("Invalid checksum"),
      "error should mention bad checksum, got: {msg}"
    );
  }
}
