use assert_cmd::Command;

#[test]
fn cli_help_succeeds() {
    Command::cargo_bin("pgt")
        .unwrap()
        .arg("--help")
        .assert()
        .success();
}

#[test]
fn cli_version_succeeds() {
    Command::cargo_bin("pgt")
        .unwrap()
        .arg("--version")
        .assert()
        .success();
}

#[test]
fn cli_invalid_dialect_exits_nonzero() {
    // The binary exits with code 1 for an unknown dialect.
    // We pipe empty stdin so the interactive loop exits immediately on EOF.
    Command::cargo_bin("pgt")
        .unwrap()
        .args(["--dialect", "no_such_dialect"])
        .write_stdin("")
        .assert()
        .failure();
}

#[test]
fn cli_quiet_flag_accepted() {
    // With --quiet and EOF on stdin the binary should exit cleanly.
    Command::cargo_bin("pgt")
        .unwrap()
        .args(["--quiet"])
        .write_stdin("")
        .assert()
        .success();
}
