use super::super::*;                                          // npm::registry::* (incl. private items)
use crate::npm::test_support::{build_minimal_tarball, sha1_hex};

#[test]
fn verify_integrity_accepts_matching_shasum() {
  let data = b"hello world";
  let shasum = sha1_hex(data);
  let r = NpmRegistry::new().expect("client builds");
  assert!(r.verify_integrity(data, &shasum).is_ok());
}

#[test]
fn verify_integrity_rejects_mismatch() {
  let r = NpmRegistry::new().expect("client builds");
  let bad = "0000000000000000000000000000000000000000";
  let err = r
    .verify_integrity(b"hello world", bad)
    .expect_err("must reject");
  let msg = err.to_string();
  assert!(msg.contains("Integrity check failed"), "{}", msg);
  assert!(msg.contains(bad), "expected bad sum in msg: {}", msg);
}

#[test]
#[cfg(unix)]
fn assert_path_contained_rejects_symlink_escape() {
  use std::os::unix::fs::symlink;
  let tmp = tempfile::tempdir().expect("tempdir");
  let root = tmp.path().join("root");
  let outside = tmp.path().join("outside");
  std::fs::create_dir_all(&root).unwrap();
  std::fs::create_dir_all(&outside).unwrap();

  let link = root.join("escape");
  symlink(&outside, &link).expect("symlink");

  let res = assert_path_contained(&root, &link);
  assert!(res.is_err(), "symlink escape was accepted: {:?}", res);
}

#[test]
fn validate_package_name_boundary_length() {
  assert!(validate_package_name(&"a".repeat(214)).is_ok());
  assert!(validate_package_name(&"a".repeat(215)).is_err());
  assert!(validate_package_name(&"a".repeat(251)).is_err());
}

#[test]
fn test_support_minimal_tarball_round_trips() {
  use flate2::read::GzDecoder;
  use std::io::Read;

  let bytes =
    build_minimal_tarball("widget", "1.2.3", r#","main":"index.js""#);
  let decoder = GzDecoder::new(&bytes[..]);
  let mut archive = tar::Archive::new(decoder);
  let mut found = false;
  for entry in archive.entries().expect("entries") {
    let mut entry = entry.expect("entry");
    let path = entry.path().expect("path").into_owned();
    if path == std::path::Path::new("package/package.json") {
      let mut s = String::new();
      entry.read_to_string(&mut s).expect("read");
      assert!(s.contains(r#""name":"widget""#), "{}", s);
      assert!(s.contains(r#""version":"1.2.3""#), "{}", s);
      assert!(s.contains(r#""main":"index.js""#), "{}", s);
      found = true;
    }
  }
  assert!(found, "package.json not found in tarball");
}
