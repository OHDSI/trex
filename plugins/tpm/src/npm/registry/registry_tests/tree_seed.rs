use super::super::*;                                          // npm::registry::*
use crate::npm::test_support::{build_minimal_tarball, sha1_hex};
use serial_test::serial;

fn mocked_registry(server: &mockito::Server) -> NpmRegistry {
  NpmRegistry::with_registry_url(Some(server.url())).expect("client builds")
}

fn metadata_body(name: &str, version: &str, tarball_url: &str, shasum: &str, deps_json: &str) -> String {
  format!(
    r#"{{"name":"{name}","dist-tags":{{"latest":"{version}"}},"versions":{{"{version}":{{"version":"{version}","dependencies":{deps_json},"dist":{{"tarball":"{tarball_url}","shasum":"{shasum}"}}}}}}}}"#
  )
}

#[test]
fn get_dependency_tree_root_only_when_no_deps() {
  let mut server = mockito::Server::new();
  let body = metadata_body(
    "leaf", "1.0.0",
    &format!("{}/leaf/-/leaf-1.0.0.tgz", server.url()),
    "deadbeef", "{}",
  );
  let _m = server.mock("GET", "/leaf").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("leaf").expect("ok");
  assert_eq!(tree.len(), 1);
  assert_eq!(tree[0].package, "leaf");
  assert_eq!(tree[0].depth, 0);
  assert!(tree[0].parent.is_none());
  assert_eq!(tree[0].tree_line, "leaf 1.0.0");
}

#[test]
fn get_dependency_tree_includes_immediate_dep() {
  let mut server = mockito::Server::new();
  let root_body = metadata_body(
    "root", "1.0.0",
    &format!("{}/root/-/root-1.0.0.tgz", server.url()),
    "aaaa", r#"{"child":"1.0.0"}"#,
  );
  let child_body = metadata_body(
    "child", "1.0.0",
    &format!("{}/child/-/child-1.0.0.tgz", server.url()),
    "bbbb", "{}",
  );
  let _r = server.mock("GET", "/root").with_status(200).with_body(root_body).create();
  let _c = server.mock("GET", "/child").with_status(200).with_body(child_body).create();

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("root").expect("ok");
  assert_eq!(tree.len(), 2);
  assert_eq!(tree[0].package, "root");
  assert_eq!(tree[0].depth, 0);
  assert_eq!(tree[1].package, "child");
  assert_eq!(tree[1].depth, 1);
  assert_eq!(tree[1].parent.as_deref(), Some("root"));
}

#[test]
fn get_dependency_tree_tree_line_format_at_depth_one() {
  let mut server = mockito::Server::new();
  let root_body = metadata_body(
    "root", "1.0.0",
    &format!("{}/root/-/root-1.0.0.tgz", server.url()),
    "aaaa", r#"{"child":"1.0.0"}"#,
  );
  let child_body = metadata_body(
    "child", "1.0.0",
    &format!("{}/child/-/child-1.0.0.tgz", server.url()),
    "bbbb", "{}",
  );
  let _r = server.mock("GET", "/root").with_status(200).with_body(root_body).create();
  let _c = server.mock("GET", "/child").with_status(200).with_body(child_body).create();

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("root").expect("ok");
  let child_line = &tree[1].tree_line;
  assert!(
    child_line.contains("├── "),
    "child tree_line missing branch glyph: {:?}",
    child_line
  );
  assert!(child_line.contains("child 1.0.0"), "{}", child_line);
}

#[test]
fn get_dependency_tree_tolerates_unresolvable_dep() {
  let mut server = mockito::Server::new();
  let root_body = metadata_body(
    "root", "1.0.0",
    &format!("{}/root/-/root-1.0.0.tgz", server.url()),
    "aaaa", r#"{"ghost":"1.0.0"}"#,
  );
  let _r = server.mock("GET", "/root").with_status(200).with_body(root_body).create();
  let _ghost = server.mock("GET", "/ghost").with_status(404).create();

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("root").expect("ok");
  assert_eq!(tree.len(), 1, "ghost dep should be silently dropped, got {:?}", tree);
  assert_eq!(tree[0].package, "root");
}

#[test]
fn get_dependency_tree_dedups_revisited_dep() {
  // A depends on B and C; B depends on C; C is a leaf.
  // C should appear exactly once.
  let mut server = mockito::Server::new();
  let a = metadata_body(
    "a", "1.0.0",
    &format!("{}/a/-/a-1.0.0.tgz", server.url()),
    "aaa", r#"{"b":"1.0.0","c":"1.0.0"}"#,
  );
  let b = metadata_body(
    "b", "1.0.0",
    &format!("{}/b/-/b-1.0.0.tgz", server.url()),
    "bbb", r#"{"c":"1.0.0"}"#,
  );
  let c = metadata_body(
    "c", "1.0.0",
    &format!("{}/c/-/c-1.0.0.tgz", server.url()),
    "ccc", "{}",
  );
  let _ma = server.mock("GET", "/a").with_status(200).with_body(a).create();
  let _mb = server.mock("GET", "/b").with_status(200).with_body(b).create();
  let _mc = server.mock("GET", "/c").with_status(200).with_body(c).expect_at_least(1).create();

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("a").expect("ok");
  let c_count = tree.iter().filter(|n| n.package == "c").count();
  assert_eq!(c_count, 1, "c should appear once, tree was {:?}", tree);
}

#[test]
fn get_dependency_tree_respects_depth_cap() {
  // Chain: p0 -> p1 -> p2 -> p3 -> p4 -> p5 -> p6 -> p7
  // The function caps recursion at depth < 5 (so p5 is enqueued but not p6).
  // Concretely: depths 0..=5 should appear, nothing past 5.
  let mut server = mockito::Server::new();
  for i in 0..=7 {
    let next = if i < 7 {
      format!(r#"{{"p{}":"1.0.0"}}"#, i + 1)
    } else {
      "{}".to_string()
    };
    let body = metadata_body(
      &format!("p{}", i),
      "1.0.0",
      &format!("{}/p{}/-/p{}-1.0.0.tgz", server.url(), i, i),
      "deadbeef",
      &next,
    );
    server.mock("GET", format!("/p{}", i).as_str()).with_status(200).with_body(body).expect_at_least(0).create();
  }

  let r = mocked_registry(&server);
  let tree = r.get_dependency_tree("p0").expect("ok");
  let max_depth = tree.iter().map(|n| n.depth).max().unwrap_or(0);
  assert!(max_depth <= 5, "expected depth cap 5, got {}: {:?}", max_depth, tree);
  assert!(max_depth >= 1, "tree was too shallow: {:?}", tree);
}

#[test]
#[serial]
fn seed_packages_returns_empty_when_env_unset() {
  std::env::remove_var("PLUGINS_SEED");
  let tmp = tempfile::tempdir().expect("tempdir");
  let r = NpmRegistry::new().expect("client builds");
  let out = r.seed_packages(tmp.path().to_str().unwrap()).expect("ok");
  assert!(out.is_empty(), "expected empty, got {:?}", out);
}

#[test]
#[serial]
fn seed_packages_returns_error_on_invalid_json() {
  std::env::set_var("PLUGINS_SEED", "not-json");
  let tmp = tempfile::tempdir().expect("tempdir");
  let r = NpmRegistry::new().expect("client builds");
  let err = r.seed_packages(tmp.path().to_str().unwrap()).expect_err("must error");
  std::env::remove_var("PLUGINS_SEED");
  assert!(err.to_string().contains("Invalid PLUGINS_SEED"), "{}", err);
}

#[test]
#[serial]
fn seed_packages_skips_already_installed_without_update() {
  let tmp = tempfile::tempdir().expect("tempdir");
  // Pre-create an "installed" foo so seed should skip it.
  let foo = tmp.path().join("foo");
  std::fs::create_dir_all(&foo).unwrap();
  std::fs::write(foo.join("package.json"), r#"{"name":"foo","version":"1.0.0"}"#).unwrap();

  std::env::set_var("PLUGINS_SEED", r#"["foo"]"#);
  std::env::remove_var("PLUGINS_SEED_UPDATE");
  std::env::set_var("PLUGINS_API_VERSION", "latest");

  // No mockito server is started — if seed tried to install, the live network
  // call would either hit npm or fail to connect; either way it would NOT
  // produce skipped=true. Skipped=true proves the install path was not taken.
  let r = NpmRegistry::new().expect("client builds");
  let out = r.seed_packages(tmp.path().to_str().unwrap()).expect("ok");

  std::env::remove_var("PLUGINS_SEED");
  std::env::remove_var("PLUGINS_API_VERSION");

  assert_eq!(out.len(), 1);
  assert!(out[0].skipped, "expected skipped=true, got {:?}", out[0]);
  assert!(out[0].success);
}

#[test]
#[serial]
fn seed_packages_reinstalls_when_update_true() {
  let tmp = tempfile::tempdir().expect("tempdir");
  let foo = tmp.path().join("foo");
  std::fs::create_dir_all(&foo).unwrap();
  std::fs::write(foo.join("package.json"), r#"{"name":"foo","version":"0.0.1"}"#).unwrap();

  let mut server = mockito::Server::new();
  let tarball = build_minimal_tarball("foo", "1.0.0", "");
  let shasum = sha1_hex(&tarball);
  let tarball_url = format!("{}/foo/-/foo-1.0.0.tgz", server.url());
  let body = metadata_body("foo", "1.0.0", &tarball_url, &shasum, "{}");
  let _m = server.mock("GET", "/foo").with_status(200).with_body(body).expect_at_least(1).create();
  let _t = server.mock("GET", "/foo/-/foo-1.0.0.tgz").with_status(200).with_body(tarball).expect_at_least(1).create();

  std::env::set_var("PLUGINS_SEED", r#"["foo"]"#);
  std::env::set_var("PLUGINS_SEED_UPDATE", "true");
  std::env::set_var("PLUGINS_API_VERSION", "latest");
  std::env::set_var("TPM_REGISTRY_URL", server.url());

  // NpmRegistry::seed_packages uses the registry already on `self`, so we
  // construct one against the mock server directly. TPM_REGISTRY_URL is set
  // so that the *recursive* call into install_package — which builds a fresh
  // registry in some code paths — also points at the mock.
  let r = NpmRegistry::with_registry_url(Some(server.url())).expect("client builds");
  let out = r.seed_packages(tmp.path().to_str().unwrap()).expect("ok");

  std::env::remove_var("PLUGINS_SEED");
  std::env::remove_var("PLUGINS_SEED_UPDATE");
  std::env::remove_var("PLUGINS_API_VERSION");
  std::env::remove_var("TPM_REGISTRY_URL");

  assert_eq!(out.len(), 1);
  assert!(!out[0].skipped, "expected skipped=false, got {:?}", out[0]);
  assert!(out[0].success, "expected success=true, got {:?}", out[0]);
  assert_eq!(out[0].version, "1.0.0");
}
