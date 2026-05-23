use super::super::*;                                          // npm::registry::*
use crate::npm::types::NpmError;

fn mocked_registry(server: &mockito::Server) -> NpmRegistry {
  NpmRegistry::with_registry_url(Some(server.url())).expect("client builds")
}

#[test]
fn get_package_info_happy_path() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "lodash",
    "description": "Utility library",
    "dist-tags": {"latest": "4.17.21"},
    "versions": {
      "4.17.20": {"version":"4.17.20"},
      "4.17.21": {"version":"4.17.21","description":"Utility library"}
    }
  }"#;
  let _m = server
    .mock("GET", "/lodash")
    .with_status(200)
    .with_body(body)
    .create();

  let r = mocked_registry(&server);
  let info = r.get_package_info("lodash").expect("ok");
  assert_eq!(info.name, "lodash");
  assert_eq!(info.latest_version.as_deref(), Some("4.17.21"));
  assert_eq!(info.versions, vec!["4.17.20".to_string(), "4.17.21".to_string()]);
  assert_eq!(info.description.as_deref(), Some("Utility library"));
}

#[test]
fn get_package_info_404_maps_to_not_found() {
  let mut server = mockito::Server::new();
  let _m = server.mock("GET", "/ghost").with_status(404).create();

  let r = mocked_registry(&server);
  match r.get_package_info("ghost") {
    Err(NpmError::PackageNotFound(name)) => {
      assert_eq!(name, "ghost");
    }
    other => panic!("expected PackageNotFound, got {:?}", other),
  }
}

#[test]
fn get_package_info_500_maps_to_network() {
  let mut server = mockito::Server::new();
  let _m = server.mock("GET", "/boom").with_status(500).create();

  let r = mocked_registry(&server);
  match r.get_package_info("boom") {
    Err(NpmError::Network(msg)) => {
      assert!(msg.contains("500"), "msg should mention status: {}", msg);
    }
    other => panic!("expected Network, got {:?}", other),
  }
}

#[test]
fn get_package_info_malformed_json() {
  let mut server = mockito::Server::new();
  let _m = server
    .mock("GET", "/garbled")
    .with_status(200)
    .with_body("{ this is not valid json")
    .create();

  let r = mocked_registry(&server);
  match r.get_package_info("garbled") {
    Err(NpmError::Serialization(_)) => {}
    other => panic!("expected Serialization, got {:?}", other),
  }
}

#[test]
fn get_package_info_description_falls_back_to_top_level() {
  // Top-level description present; latest version has no description field.
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "pkg",
    "description": "Top-level desc",
    "dist-tags": {"latest": "1.0.0"},
    "versions": {"1.0.0": {"version":"1.0.0"}}
  }"#;
  let _m = server.mock("GET", "/pkg").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let info = r.get_package_info("pkg").expect("ok");
  assert_eq!(info.description.as_deref(), Some("Top-level desc"));
}

#[test]
fn resolve_package_exact_version() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "is-number",
    "dist-tags": {"latest": "8.0.0"},
    "versions": {
      "6.0.0": {"version":"6.0.0","dist":{"tarball":"http://t/6","shasum":"a"}},
      "7.0.0": {"version":"7.0.0","dist":{"tarball":"http://t/7","shasum":"b"}},
      "8.0.0": {"version":"8.0.0","dist":{"tarball":"http://t/8","shasum":"c"}}
    }
  }"#;
  let _m = server.mock("GET", "/is-number").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let res = r.resolve_package("is-number@7.0.0").expect("ok");
  assert_eq!(res.resolved_version, "7.0.0");
  assert_eq!(res.tarball_url, "http://t/7");
  assert_eq!(res.shasum.as_deref(), Some("b"));
}

#[test]
fn resolve_package_latest_uses_dist_tag() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "2.0.0"},
    "versions": {
      "1.0.0": {"version":"1.0.0","dist":{"tarball":"http://t/1","shasum":"a"}},
      "2.0.0": {"version":"2.0.0","dist":{"tarball":"http://t/2","shasum":"b"}}
    }
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let res = r.resolve_package("p").expect("ok");
  assert_eq!(res.resolved_version, "2.0.0");
}

#[test]
fn resolve_package_caret_picks_highest_match() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "8.0.0"},
    "versions": {
      "7.0.0": {"version":"7.0.0","dist":{"tarball":"http://t/7.0.0","shasum":"a"}},
      "7.1.2": {"version":"7.1.2","dist":{"tarball":"http://t/7.1.2","shasum":"b"}},
      "8.0.0": {"version":"8.0.0","dist":{"tarball":"http://t/8.0.0","shasum":"c"}}
    }
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let res = r.resolve_package("p@^7.0.0").expect("ok");
  assert_eq!(res.resolved_version, "7.1.2");
}

#[test]
fn resolve_package_tilde_picks_highest_match() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "7.1.0"},
    "versions": {
      "7.0.0": {"version":"7.0.0","dist":{"tarball":"http://t/7.0.0","shasum":"a"}},
      "7.0.5": {"version":"7.0.5","dist":{"tarball":"http://t/7.0.5","shasum":"b"}},
      "7.1.0": {"version":"7.1.0","dist":{"tarball":"http://t/7.1.0","shasum":"c"}}
    }
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let res = r.resolve_package("p@~7.0.0").expect("ok");
  assert_eq!(res.resolved_version, "7.0.5");
}

#[test]
fn resolve_package_no_matching_version() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "1.0.0"},
    "versions": {
      "1.0.0": {"version":"1.0.0","dist":{"tarball":"http://t/1","shasum":"a"}}
    }
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let err = r.resolve_package("p@^9.0.0").expect_err("no match");
  assert!(err.to_string().contains("^9.0.0"), "{}", err);
}

#[test]
fn resolve_package_missing_dist() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "1.0.0"},
    "versions": { "1.0.0": {"version":"1.0.0"} }
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let err = r.resolve_package("p@1.0.0").expect_err("no dist");
  assert!(err.to_string().contains("No dist information"), "{}", err);
}

#[test]
fn resolve_package_invalid_semver_syntax() {
  let mut server = mockito::Server::new();
  let body = r#"{
    "name": "p",
    "dist-tags": {"latest": "1.0.0"},
    "versions": {"1.0.0": {"version":"1.0.0","dist":{"tarball":"http://t/1","shasum":"a"}}}
  }"#;
  let _m = server.mock("GET", "/p").with_status(200).with_body(body).create();

  let r = mocked_registry(&server);
  let err = r.resolve_package("p@^not-a-version").expect_err("invalid req");
  assert!(
    err.to_string().contains("Invalid semver requirement"),
    "{}",
    err
  );
}
