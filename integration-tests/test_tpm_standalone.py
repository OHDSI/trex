"""Plugin standalone tests.

Verifies that the plugin extension can load and execute npm package manager
functions: info, resolve, tree, install, and list.
"""



def test_tpm_hello(node_factory):
    """trex_plugin() returns greeting string."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute("SELECT * FROM trex_plugin('Sam')")
    assert len(result) == 1
    assert result[0][0] == "TPM Sam \U0001f4e6"


def test_tpm_info_package(node_factory):
    """trex_plugin_info() returns JSON with correct package name."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(package_info, '$.name') "
        "FROM trex_plugin_info('is-number')"
    )
    assert len(result) == 1
    assert result[0][0] == "is-number"


def test_tpm_info_scoped(node_factory):
    """trex_plugin_info() works with scoped packages."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(package_info, '$.name') "
        "FROM trex_plugin_info('@types/node')"
    )
    assert len(result) == 1
    assert result[0][0] == "@types/node"


def test_tpm_info_nonexistent(node_factory):
    """trex_plugin_info() returns error JSON for non-existent packages."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(package_info, '$.error') "
        "FROM trex_plugin_info('this-package-does-not-exist-xyz123')"
    )
    assert len(result) == 1
    assert result[0][0].startswith("Package not found")


def test_tpm_resolve_exact(node_factory):
    """trex_plugin_resolve() resolves exact version."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(resolve_info, '$.resolved_version') "
        "FROM trex_plugin_resolve('is-number@7.0.0')"
    )
    assert len(result) == 1
    assert result[0][0] == "7.0.0"


def test_tpm_resolve_semver(node_factory):
    """trex_plugin_resolve() resolves caret semver range."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(resolve_info, '$.resolved_version') "
        "FROM trex_plugin_resolve('is-number@^7.0.0')"
    )
    assert len(result) == 1
    assert result[0][0] == "7.0.0"


def test_tpm_resolve_tarball(node_factory):
    """trex_plugin_resolve() returns a tarball URL."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(resolve_info, '$.tarball_url') "
        "FROM trex_plugin_resolve('is-number')"
    )
    assert len(result) == 1
    assert result[0][0].startswith("https://registry.npmjs.org/")


def test_tpm_tree(node_factory):
    """trex_plugin_tree() returns rows with package name in tree output."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(tree_info, '$.package') "
        "FROM trex_plugin_tree('is-number@7.0.0') LIMIT 1"
    )
    assert len(result) == 1
    assert result[0][0] == "is-number"


def test_tpm_install(node_factory, tmp_path):
    """trex_plugin_install() installs a package and returns success JSON."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")

    result = node.execute(
        f"SELECT json_extract_string(install_results, '$.package'), "
        f"json_extract_string(install_results, '$.version'), "
        f"json_extract_string(install_results, '$.success') "
        f"FROM trex_plugin_install('is-number@7.0.0', '{install_dir}')"
    )
    assert len(result) == 1
    assert result[0][0] == "is-number"
    assert result[0][1] == "7.0.0"
    assert result[0][2] == "true"


def test_tpm_install_with_deps(node_factory, tmp_path):
    """trex_plugin_install_with_deps installs root + transitive deps."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")
    result = node.execute(
        f"SELECT json_extract_string(install_results, '$.package') "
        f"FROM trex_plugin_install_with_deps('chalk@4.1.0', '{install_dir}')"
    )
    pkgs = {row[0] for row in result}
    assert "chalk" in pkgs, f"expected chalk in {pkgs}"
    assert len(pkgs) > 1, f"expected > 1 package, got {pkgs}"


def test_tpm_list_after_install(node_factory, tmp_path):
    """trex_plugin_list reports a freshly installed package."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")
    node.execute(
        f"SELECT * FROM trex_plugin_install('is-number@7.0.0', '{install_dir}')"
    )
    result = node.execute(
        f"SELECT json_extract_string(list_info, '$.package') "
        f"FROM trex_plugin_list('{install_dir}') "
        f"WHERE json_extract_string(list_info, '$.package') = 'is-number'"
    )
    assert len(result) == 1
    assert result[0][0] == "is-number"


def test_tpm_delete_after_install(node_factory, tmp_path):
    """trex_plugin_delete removes a previously installed package."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")
    node.execute(
        f"SELECT * FROM trex_plugin_install('is-number@7.0.0', '{install_dir}')"
    )
    result = node.execute(
        f"SELECT json_extract_string(delete_results, '$.deleted') "
        f"FROM trex_plugin_delete('is-number', '{install_dir}')"
    )
    assert len(result) == 1
    assert result[0][0] == "true"


def test_tpm_delete_nonexistent_emits_error_json(node_factory, tmp_path):
    """trex_plugin_delete returns deleted=false and an error string when missing."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")
    install_dir_path = tmp_path / "node_modules"
    install_dir_path.mkdir()  # exists but empty
    result = node.execute(
        f"SELECT "
        f"json_extract_string(delete_results, '$.deleted'), "
        f"json_extract_string(delete_results, '$.error') "
        f"FROM trex_plugin_delete('ghost-pkg', '{install_dir}')"
    )
    assert len(result) == 1
    assert result[0][0] == "false"
    assert result[0][1] and "not found" in result[0][1].lower()


def test_tpm_resolve_no_match_emits_error_json(node_factory):
    """Unsatisfiable semver request returns error JSON, not a panic."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract_string(resolve_info, '$.error') "
        "FROM trex_plugin_resolve('is-number@^99.99.99')"
    )
    assert len(result) == 1
    assert result[0][0] and "no version matching" in result[0][0].lower()


def test_tpm_info_versions_present_and_sorted(node_factory):
    """trex_plugin_info.versions is a sorted, non-empty list."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT package_info FROM trex_plugin_info('is-number')"
    )
    import json
    info = json.loads(result[0][0])
    versions = info["versions"]
    assert versions, "versions should not be empty"
    assert versions == sorted(versions), "versions should be sorted ascending"


def test_tpm_tree_depth_zero_for_root(node_factory):
    """trex_plugin_tree reports depth=0 on the root row."""
    node = node_factory(load_tpm=True, load_db=False)
    result = node.execute(
        "SELECT json_extract(tree_info, '$.depth')::INTEGER "
        "FROM trex_plugin_tree('is-number@7.0.0') LIMIT 1"
    )
    assert len(result) == 1
    assert result[0][0] == 0


def test_tpm_install_invalid_name_surfaces_as_error_row(node_factory, tmp_path):
    """Path-traversal package names must not panic — they surface as error JSON."""
    node = node_factory(load_tpm=True, load_db=False)
    install_dir = str(tmp_path / "node_modules")
    # The registry will respond 404 (no such package), but the bind+validate
    # layer should never construct a path that escapes install_dir.
    result = node.execute(
        f"SELECT json_extract_string(install_results, '$.error') "
        f"FROM trex_plugin_install('../escape', '{install_dir}')"
    )
    assert len(result) == 1
    assert result[0][0], "expected non-null error string"
