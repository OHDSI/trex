// Owned by Stream 3.

use super::super::*;                                          // npm::registry::*
use crate::npm::test_support::{build_minimal_tarball, build_tarball_with_paths, sha1_hex};

fn mocked_registry(server: &mockito::Server) -> NpmRegistry {
  NpmRegistry::with_registry_url(Some(server.url())).expect("client builds")
}

/// Build a metadata JSON body that points at `tarball_url` and advertises
/// `shasum` as the integrity hash.
fn metadata_body(name: &str, version: &str, tarball_url: &str, shasum: &str, deps_json: &str) -> String {
  format!(
    r#"{{"name":"{name}","dist-tags":{{"latest":"{version}"}},"versions":{{"{version}":{{"version":"{version}","dependencies":{deps_json},"dist":{{"tarball":"{tarball_url}","shasum":"{shasum}"}}}}}}}}"#
  )
}

#[test]
fn install_package_writes_package_json() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_minimal_tarball("widget", "1.0.0", "");
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("widget", tmp.path().to_str().unwrap()).expect("ok");
  assert!(res.success, "expected success, got {:?}", res);
  assert_eq!(res.package, "widget");
  assert_eq!(res.version, "1.0.0");

  let pkg_json = std::path::Path::new(&res.install_path).join("package.json");
  assert!(pkg_json.exists(), "package.json missing at {}", pkg_json.display());
  let content = std::fs::read_to_string(pkg_json).unwrap();
  assert!(content.contains(r#""name":"widget""#), "{}", content);
}

#[test]
fn install_package_scoped_writes_to_scope_subdir() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_minimal_tarball("@scope/util", "1.0.0", "");
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/@scope/util/-/util-1.0.0.tgz", server.url());
  let body = metadata_body("@scope/util", "1.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/@scope/util").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/@scope/util/-/util-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("@scope/util", tmp.path().to_str().unwrap()).expect("ok");
  assert!(res.success);
  let expected = tmp.path().join("@scope").join("util");
  assert_eq!(
    std::path::Path::new(&res.install_path).canonicalize().unwrap(),
    expected.canonicalize().unwrap()
  );
}

#[test]
fn install_package_tarball_404_returns_error_response() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, "deadbeef", "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(404)
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("widget", tmp.path().to_str().unwrap()).expect("ok");
  assert!(!res.success);
  let err = res.error.expect("error string");
  assert!(err.contains("404"), "{}", err);
}

#[test]
fn install_package_bad_shasum_returns_error_response() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_minimal_tarball("widget", "1.0.0", "");
  let bogus_shasum = "0000000000000000000000000000000000000000";
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, bogus_shasum, "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("widget", tmp.path().to_str().unwrap()).expect("ok");
  assert!(!res.success);
  let err = res.error.expect("error string");
  assert!(err.contains("Integrity check failed"), "{}", err);
}

#[test]
fn install_package_rejects_tar_entry_with_parent_dir() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_tarball_with_paths(&[
    ("package/package.json", br#"{"name":"widget","version":"1.0.0"}"#),
    ("package/../evil", b"oops"),
  ]);
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let err = r
    .install_package("widget", tmp.path().to_str().unwrap())
    .expect_err("must reject");
  assert!(err.to_string().contains("unsafe path"), "{}", err);
}

#[test]
#[cfg(unix)]
fn install_package_rejects_absolute_tar_entry() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_tarball_with_paths(&[
    ("package/package.json", br#"{"name":"widget","version":"1.0.0"}"#),
    ("/etc/passwd_shadow", b"pwned"),
  ]);
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let err = r
    .install_package("widget", tmp.path().to_str().unwrap())
    .expect_err("must reject");
  assert!(err.to_string().contains("unsafe path"), "{}", err);
}

#[test]
fn install_package_strips_package_prefix() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_tarball_with_paths(&[
    ("package/package.json", br#"{"name":"widget","version":"1.0.0"}"#),
    ("package/lib/index.js", b"module.exports = 1;\n"),
  ]);
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/widget/-/widget-1.0.0.tgz", server.url());
  let body = metadata_body("widget", "1.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/widget").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/widget/-/widget-1.0.0.tgz")
    .with_status(200)
    .with_body(tarball)
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("widget", tmp.path().to_str().unwrap()).expect("ok");
  assert!(res.success);
  let index = std::path::Path::new(&res.install_path).join("lib").join("index.js");
  assert!(index.exists(), "{} missing", index.display());
}

#[test]
fn install_package_with_deps_installs_root_and_dependency() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();

  let root_tarball = build_minimal_tarball("root", "1.0.0", "");
  let root_shasum = sha1_hex(&root_tarball);
  let root_tarball_url = format!("{}/root/-/root-1.0.0.tgz", server.url());
  let root_body = metadata_body(
    "root",
    "1.0.0",
    &root_tarball_url,
    &root_shasum,
    r#"{"dep":"1.0.0"}"#,
  );

  let dep_tarball = build_minimal_tarball("dep", "1.0.0", "");
  let dep_shasum = sha1_hex(&dep_tarball);
  let dep_tarball_url = format!("{}/dep/-/dep-1.0.0.tgz", server.url());
  let dep_body = metadata_body("dep", "1.0.0", &dep_tarball_url, &dep_shasum, "{}");

  let _m_root = server.mock("GET", "/root").with_status(200).with_body(root_body).expect_at_least(1).create();
  let _t_root = server
    .mock("GET", "/root/-/root-1.0.0.tgz")
    .with_status(200)
    .with_body(root_tarball)
    .create();
  let _m_dep = server.mock("GET", "/dep").with_status(200).with_body(dep_body).expect_at_least(1).create();
  let _t_dep = server
    .mock("GET", "/dep/-/dep-1.0.0.tgz")
    .with_status(200)
    .with_body(dep_tarball)
    .create();

  let r = mocked_registry(&server);
  let results = r
    .install_package_with_deps("root", tmp.path().to_str().unwrap())
    .expect("ok");

  let names: Vec<_> = results.iter().map(|x| (x.package.clone(), x.success)).collect();
  assert!(names.iter().any(|(p, s)| p == "root" && *s), "root: {:?}", names);
  assert!(names.iter().any(|(p, s)| p == "dep" && *s), "dep: {:?}", names);
}

#[test]
fn install_package_with_deps_dedups_repeated_dependency() {
  // root depends on dep twice (impossible in real package.json but the LIFO
  // stack inside install_package_with_deps must still not install dep twice).
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();

  let root_tarball = build_minimal_tarball("root", "1.0.0", "");
  let root_shasum = sha1_hex(&root_tarball);
  let root_tarball_url = format!("{}/root/-/root-1.0.0.tgz", server.url());
  // Two distinct keys mapping to the same package: simulate via two deps
  // both pointing at "dep". HashMap collapses them, so this exercises the
  // `installed` set rather than the input shape — but it still proves the
  // result vector has exactly one `dep` entry.
  let root_body = metadata_body(
    "root", "1.0.0", &root_tarball_url, &root_shasum,
    r#"{"dep":"1.0.0"}"#,
  );

  let dep_tarball = build_minimal_tarball("dep", "1.0.0", "");
  let dep_shasum = sha1_hex(&dep_tarball);
  let dep_tarball_url = format!("{}/dep/-/dep-1.0.0.tgz", server.url());
  // dep transitively depends on itself (loop).
  let dep_body = metadata_body(
    "dep", "1.0.0", &dep_tarball_url, &dep_shasum,
    r#"{"dep":"1.0.0"}"#,
  );

  let _m_root = server.mock("GET", "/root").with_status(200).with_body(root_body).create();
  let _t_root = server.mock("GET", "/root/-/root-1.0.0.tgz").with_status(200).with_body(root_tarball).create();
  let _m_dep = server.mock("GET", "/dep").with_status(200).with_body(dep_body).expect_at_least(1).create();
  // Tighten to expect(1): a dedup regression would attempt a second tarball
  // fetch, and mockito would fail the assertion at server drop.
  let _t_dep = server.mock("GET", "/dep/-/dep-1.0.0.tgz").with_status(200).with_body(dep_tarball).expect(1).create();

  let r = mocked_registry(&server);
  let results = r
    .install_package_with_deps("root", tmp.path().to_str().unwrap())
    .expect("ok");

  let dep_count = results.iter().filter(|x| x.package == "dep" && x.success).count();
  assert_eq!(dep_count, 1, "dep installed more than once: {:?}", results);
}

#[test]
fn install_package_with_deps_continues_after_dependency_failure() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();

  let root_tarball = build_minimal_tarball("root", "1.0.0", "");
  let root_shasum = sha1_hex(&root_tarball);
  let root_tarball_url = format!("{}/root/-/root-1.0.0.tgz", server.url());
  let root_body = metadata_body(
    "root", "1.0.0", &root_tarball_url, &root_shasum,
    r#"{"baddep":"1.0.0"}"#,
  );

  let dep_tarball_url = format!("{}/baddep/-/baddep-1.0.0.tgz", server.url());
  let dep_body = metadata_body("baddep", "1.0.0", &dep_tarball_url, "deadbeef", "{}");

  let _m_root = server.mock("GET", "/root").with_status(200).with_body(root_body).create();
  let _t_root = server.mock("GET", "/root/-/root-1.0.0.tgz").with_status(200).with_body(root_tarball).create();
  let _m_dep = server.mock("GET", "/baddep").with_status(200).with_body(dep_body).create();
  let _t_dep = server.mock("GET", "/baddep/-/baddep-1.0.0.tgz").with_status(404).create();

  let r = mocked_registry(&server);
  let results = r
    .install_package_with_deps("root", tmp.path().to_str().unwrap())
    .expect("ok");

  let root_ok = results.iter().any(|x| x.package == "root" && x.success);
  let dep_failed = results.iter().any(|x| x.package == "baddep" && !x.success);
  assert!(root_ok, "root should have succeeded: {:?}", results);
  assert!(dep_failed, "baddep should have failed: {:?}", results);
}

#[test]
fn install_package_retains_verified_tarball_with_sha256() {
  use sha2::{Digest as _, Sha256};

  let tmp = tempfile::tempdir().expect("tempdir");
  let mut server = mockito::Server::new();
  let tarball = build_minimal_tarball("@scope/flowpkg", "2.0.0", "");
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/@scope/flowpkg/-/flowpkg-2.0.0.tgz", server.url());
  let body = metadata_body("@scope/flowpkg", "2.0.0", &tarball_url, &shasum, "{}");

  let _meta = server.mock("GET", "/@scope/flowpkg").with_status(200).with_body(body).create();
  let _tgz = server
    .mock("GET", "/@scope/flowpkg/-/flowpkg-2.0.0.tgz")
    .with_status(200)
    .with_body(tarball.clone())
    .create();

  let r = mocked_registry(&server);
  let res = r.install_package("@scope/flowpkg", tmp.path().to_str().unwrap()).expect("ok");
  assert!(res.success, "expected success, got {:?}", res);

  let retained = tmp.path().join(".tarballs/@scope__flowpkg-2.0.0.tgz");
  assert!(retained.exists(), "retained tarball missing at {}", retained.display());
  assert_eq!(std::fs::read(&retained).unwrap(), tarball, "retained bytes differ");

  let mut hasher = Sha256::new();
  hasher.update(&tarball);
  let expected = format!("{:x}", hasher.finalize());
  let sidecar = std::fs::read_to_string(
    tmp.path().join(".tarballs/@scope__flowpkg-2.0.0.tgz.sha256"),
  )
  .expect("sha256 sidecar");
  assert_eq!(sidecar, expected, "sha256 sidecar mismatch");
}
