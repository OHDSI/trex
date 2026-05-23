//! Test suite for `npm::registry`. Each thematic submodule is owned by one
//! parallel work stream.

use super::*;

mod foundation;
mod info;
mod install;
mod tree_seed;

// ---- URL builder / constructor ----

#[test]
fn registry_url_default() {
  let r = NpmRegistry::new().expect("client builds");
  assert_eq!(r.registry_url(), "https://registry.npmjs.org");
}

#[test]
fn registry_url_honours_override() {
  let custom = "https://example.test/registry".to_string();
  let r = NpmRegistry::with_registry_url(Some(custom.clone()))
    .expect("client builds");
  assert_eq!(r.registry_url(), custom);
}

// ---- Package name validation ----

#[test]
fn is_valid_npm_segment_accepts_plain_names() {
  assert!(is_valid_npm_segment("lodash"));
  assert!(is_valid_npm_segment("foo-bar"));
  assert!(is_valid_npm_segment("a.b_c-1"));
}

#[test]
fn is_valid_npm_segment_rejects_garbage() {
  assert!(!is_valid_npm_segment(""), "empty");
  assert!(!is_valid_npm_segment(".hidden"), "leading dot");
  assert!(!is_valid_npm_segment("_private"), "leading underscore");
  assert!(!is_valid_npm_segment("has space"), "whitespace");
  assert!(!is_valid_npm_segment("has/slash"), "slash");
  assert!(
    !is_valid_npm_segment(&"a".repeat(215)),
    "above 214-char limit"
  );
}

#[test]
fn validate_package_name_accepts_plain_and_scoped() {
  assert!(validate_package_name("lodash").is_ok());
  assert!(validate_package_name("@scope/pkg").is_ok());
}

#[test]
fn validate_package_name_rejects_traversal_and_nuls() {
  assert!(validate_package_name("../etc/passwd").is_err());
  assert!(validate_package_name("foo\\bar").is_err());
  assert!(validate_package_name("foo\0bar").is_err());
  assert!(validate_package_name("").is_err());
  assert!(validate_package_name("@scope/foo/bar").is_err());
  assert!(validate_package_name("foo/bar").is_err());
}

// ---- Path containment ----

#[test]
fn assert_path_contained_accepts_child_under_root() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let root = tmp.path();
  let child = root.join("subdir").join("file.tgz");
  assert!(assert_path_contained(root, &child).is_ok());
}

#[test]
fn assert_path_contained_rejects_escape() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let root = tmp.path().join("install");
  std::fs::create_dir_all(&root).unwrap();
  let outside = tmp.path().join("not-install").join("evil");
  let res = assert_path_contained(&root, &outside);
  assert!(res.is_err(), "expected containment failure, got {:?}", res);
}

// ---- list_installed_packages on a synthesized fs layout ----

#[test]
fn list_installed_packages_reads_plain_and_scoped() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let base = tmp.path();

  let plain = base.join("lodash");
  std::fs::create_dir_all(&plain).unwrap();
  std::fs::write(
    plain.join("package.json"),
    r#"{"name":"lodash","version":"4.17.21"}"#,
  )
  .unwrap();

  let scoped = base.join("@scope").join("util");
  std::fs::create_dir_all(&scoped).unwrap();
  std::fs::write(
    scoped.join("package.json"),
    r#"{"name":"@scope/util","version":"1.2.3"}"#,
  )
  .unwrap();

  std::fs::create_dir_all(base.join("orphan")).unwrap();

  let results =
    NpmRegistry::list_installed_packages(base.to_str().unwrap()).unwrap();
  let pairs: Vec<(String, String)> = results
    .into_iter()
    .map(|r| (r.package, r.version))
    .collect();
  assert!(pairs.contains(&("lodash".to_string(), "4.17.21".to_string())));
  assert!(pairs.contains(&("@scope/util".to_string(), "1.2.3".to_string())));
  assert_eq!(pairs.len(), 2);
}

#[test]
fn list_installed_packages_on_missing_dir_returns_empty() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let missing = tmp.path().join("does-not-exist");
  let results =
    NpmRegistry::list_installed_packages(missing.to_str().unwrap()).unwrap();
  assert!(results.is_empty());
}

// ---- delete_package ----

#[test]
fn delete_package_rejects_invalid_name() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let res =
    NpmRegistry::delete_package("../escape", tmp.path().to_str().unwrap());
  assert!(res.is_err());
}

#[test]
fn delete_package_removes_existing_plain_package() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let base = tmp.path();
  let pkg = base.join("widget");
  std::fs::create_dir_all(&pkg).unwrap();
  std::fs::write(pkg.join("package.json"), r#"{"name":"widget"}"#).unwrap();

  let res =
    NpmRegistry::delete_package("widget", base.to_str().unwrap()).unwrap();
  assert!(res.deleted);
  assert!(!pkg.exists());
}

#[test]
fn delete_package_missing_returns_not_deleted() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let res =
    NpmRegistry::delete_package("ghost", tmp.path().to_str().unwrap())
      .unwrap();
  assert!(!res.deleted);
  assert!(res.error.is_some());
}
