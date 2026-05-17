use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub type NpmResult<T> = Result<T, NpmError>;

#[derive(Debug)]
pub enum NpmError {
  Network(String),
  PackageNotFound(String),
  InvalidPackageName(String),
  Serialization(String),
  Other(String),
}

impl std::fmt::Display for NpmError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      NpmError::Network(msg) => write!(f, "Network error: {}", msg),
      NpmError::PackageNotFound(pkg) => write!(f, "Package not found: {}", pkg),
      NpmError::InvalidPackageName(name) => {
        write!(f, "Invalid package name: {}", name)
      }
      NpmError::Serialization(msg) => write!(f, "Serialization error: {}", msg),
      NpmError::Other(msg) => write!(f, "Error: {}", msg),
    }
  }
}

impl std::error::Error for NpmError {}

impl From<reqwest::Error> for NpmError {
  fn from(err: reqwest::Error) -> Self {
    NpmError::Network(err.to_string())
  }
}

impl From<serde_json::Error> for NpmError {
  fn from(err: serde_json::Error) -> Self {
    NpmError::Serialization(err.to_string())
  }
}

#[derive(Debug, Deserialize)]
pub struct NpmPackageMetadata {
  pub name: String,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(rename = "dist-tags")]
  pub dist_tags: HashMap<String, String>,
  pub versions: HashMap<String, NpmVersionMetadata>,
}

#[derive(Debug, Deserialize)]
pub struct NpmVersionMetadata {
  pub version: String,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub dependencies: HashMap<String, String>,
  #[serde(rename = "devDependencies", default)]
  pub dev_dependencies: HashMap<String, String>,
  #[serde(default)]
  pub dist: Option<DistInfo>,
}

#[derive(Debug, Serialize)]
pub struct PackageInfoResponse {
  pub name: String,
  pub description: Option<String>,
  pub latest_version: Option<String>,
  pub versions: Vec<String>,
  pub dist_tags: HashMap<String, String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct DistInfo {
  pub tarball: String,
  pub shasum: String,
  #[serde(default)]
  pub integrity: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NpmVersionMetadataExt {
  pub version: String,
  #[serde(default)]
  pub description: Option<String>,
  #[serde(default)]
  pub dependencies: HashMap<String, String>,
  #[serde(rename = "devDependencies", default)]
  pub dev_dependencies: HashMap<String, String>,
  pub dist: DistInfo,
}

#[derive(Debug, Serialize)]
pub struct ResolveResponse {
  pub package: String,
  pub resolved_version: String,
  pub tarball_url: String,
  pub dependencies: HashMap<String, String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub shasum: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InstallResponse {
  pub package: String,
  pub version: String,
  pub install_path: String,
  pub success: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DependencyNode {
  pub package: String,
  pub version: String,
  pub depth: usize,
  pub parent: Option<String>,
  #[serde(skip_serializing_if = "HashMap::is_empty")]
  pub dependencies: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct DependencyTreeResponse {
  pub package: String,
  pub version: String,
  pub depth: usize,
  pub parent: Option<String>,
  pub tree_line: String,
}

#[derive(Debug, Serialize)]
pub struct ListResponse {
  pub package: String,
  pub version: String,
  pub install_path: String,
}

#[derive(Debug, Serialize)]
pub struct SeedResponse {
  pub package: String,
  pub version: String,
  pub success: bool,
  pub skipped: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DeleteResponse {
  pub package: String,
  pub deleted: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn npm_error_display_includes_variant_context() {
    let net = NpmError::Network("boom".to_string()).to_string();
    assert!(net.contains("Network"), "{}", net);
    assert!(net.contains("boom"), "{}", net);

    let nf = NpmError::PackageNotFound("lodash".to_string()).to_string();
    assert!(nf.contains("Package not found"), "{}", nf);
    assert!(nf.contains("lodash"), "{}", nf);
  }

  #[test]
  fn reqwest_error_converts_to_network_variant() {
    // The blocking client returns a reqwest::Error for an unparseable URL.
    let err = reqwest::blocking::Client::new()
      .get("not-a-valid-url")
      .send()
      .unwrap_err();
    let converted: NpmError = err.into();
    match converted {
      NpmError::Network(_) => {}
      other => panic!("expected Network, got {:?}", other),
    }
  }

  #[test]
  fn serde_json_error_converts_to_serialization_variant() {
    let err = serde_json::from_str::<NpmPackageMetadata>("not json").unwrap_err();
    let converted: NpmError = err.into();
    match converted {
      NpmError::Serialization(_) => {}
      other => panic!("expected Serialization, got {:?}", other),
    }
  }

  #[test]
  fn npm_package_metadata_parses_minimal_registry_payload() {
    // A trimmed-down shape mirroring what registry.npmjs.org returns: name,
    // dist-tags, versions[<v>] with dist.tarball + dist.shasum.
    let payload = r#"{
      "name": "lodash",
      "description": "Utility library",
      "dist-tags": { "latest": "4.17.21" },
      "versions": {
        "4.17.21": {
          "version": "4.17.21",
          "description": "Utility library",
          "dependencies": {},
          "dist": {
            "tarball": "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
            "shasum": "679591c564c3bffaae8454cf0b3df370c3d6911c"
          }
        }
      }
    }"#;

    let parsed: NpmPackageMetadata = serde_json::from_str(payload).unwrap();
    assert_eq!(parsed.name, "lodash");
    assert_eq!(
      parsed.dist_tags.get("latest").map(String::as_str),
      Some("4.17.21")
    );
    let ver = parsed.versions.get("4.17.21").expect("version present");
    let dist = ver.dist.as_ref().expect("dist present");
    assert_eq!(dist.shasum, "679591c564c3bffaae8454cf0b3df370c3d6911c");
    assert!(dist.tarball.ends_with("lodash-4.17.21.tgz"));
    // `integrity` is optional and absent here:
    assert!(dist.integrity.is_none());
  }

  #[test]
  fn npm_version_metadata_defaults_when_fields_missing() {
    // dependencies / dev_dependencies / description / dist all default.
    let parsed: NpmVersionMetadata =
      serde_json::from_str(r#"{"version":"1.0.0"}"#).unwrap();
    assert_eq!(parsed.version, "1.0.0");
    assert!(parsed.description.is_none());
    assert!(parsed.dependencies.is_empty());
    assert!(parsed.dev_dependencies.is_empty());
    assert!(parsed.dist.is_none());
  }
}
