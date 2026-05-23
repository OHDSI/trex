//! Test fixtures shared across `registry_tests/*` submodules.
//!
//! Gated by `#[cfg(test)]` at the `mod` declaration in `npm/mod.rs`.

use flate2::write::GzEncoder;
use flate2::Compression;
use sha1::{Digest, Sha1};
use std::io::Write;

/// Build a minimal gzipped npm-style tarball containing only `package/package.json`.
pub fn build_minimal_tarball(
  name: &str,
  version: &str,
  package_json_extra: &str,
) -> Vec<u8> {
  let body = format!(
    r#"{{"name":"{}","version":"{}"{}}}"#,
    name, version, package_json_extra
  );
  build_tarball_with_paths(&[("package/package.json", body.as_bytes())])
}

/// Build a gzipped tar archive from arbitrary `(path, bytes)` entries.
///
/// Paths containing `..` or starting with `/` bypass the `tar` crate's safe
/// `set_path` sanitizer by writing directly to the GNU header's `name` field.
/// This is intentional — these fixtures exist to exercise the consumer's
/// own unsafe-path rejection.
pub fn build_tarball_with_paths(entries: &[(&str, &[u8])]) -> Vec<u8> {
  let mut tar_buf = Vec::new();
  {
    let mut builder = tar::Builder::new(&mut tar_buf);
    for (path, data) in entries {
      let mut header = tar::Header::new_gnu();
      let unsafe_path =
        path.split('/').any(|c| c == "..") || path.starts_with('/');
      if unsafe_path {
        // Write raw bytes into the GNU header `name` field, skipping
        // `set_path`'s safety checks.
        let bytes = path.as_bytes();
        let name_field = &mut header
          .as_gnu_mut()
          .expect("gnu header")
          .name;
        assert!(
          bytes.len() < name_field.len(),
          "test fixture path too long: {}",
          path
        );
        for slot in name_field.iter_mut() {
          *slot = 0;
        }
        name_field[..bytes.len()].copy_from_slice(bytes);
      } else {
        header.set_path(path).expect("tar path");
      }
      header.set_size(data.len() as u64);
      header.set_mode(0o644);
      header.set_entry_type(tar::EntryType::Regular);
      header.set_cksum();
      builder.append(&header, *data).expect("tar append");
    }
    builder.finish().expect("tar finish");
  }
  let mut gz = GzEncoder::new(Vec::new(), Compression::default());
  gz.write_all(&tar_buf).expect("gz write");
  gz.finish().expect("gz finish")
}

/// Compute lowercase-hex sha1 of `data` — matches the npm registry shasum format.
pub fn sha1_hex(data: &[u8]) -> String {
  let mut hasher = Sha1::new();
  hasher.update(data);
  format!("{:x}", hasher.finalize())
}
