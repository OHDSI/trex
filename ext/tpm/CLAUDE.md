# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Rust-based DuckDB extension (`tpm` - Trex Package Manager) that uses DuckDB's C Extension API. The extension provides comprehensive npm package management functionality directly from SQL, including package installation, dependency resolution, tree visualization, and more.

## Key Architecture

### Extension Entry Point

The extension uses the `#[duckdb_entrypoint_c_api()]` macro in `src/lib.rs` to define the entry point that DuckDB calls when loading the extension. The entry point registers a table function using the `VTab` trait.

### VTab Implementation

The core functionality is implemented via the `VTab` trait with three key methods:
- `bind()` - Defines the output schema and extracts parameters
- `init()` - Initializes per-query state
- `func()` - Generates the actual result data

### Dual Build Targets

The codebase supports two build targets:
1. **Native (cdylib)** - For loading into DuckDB on native platforms
2. **WASM (staticlib)** - For WebAssembly builds via `src/wasm_lib.rs`

The WASM target uses a workaround because Cargo doesn't support per-target crate-type selection.

## Dependencies

- Python 3 with venv support
- Make
- Git
- Rust toolchain (installed automatically by the build process if needed)

## Building

### Initial Setup
```bash
make configure
```
This creates a Python venv with DuckDB and the test runner, and determines the target platform.

### Development Builds
```bash
make debug
```
Produces: `build/debug/extension/tpm/tpm.duckdb_extension`

### Release Builds
```bash
make release
```
Produces: `build/release/extension/tpm/tpm.duckdb_extension`

The Makefile delegates to Cargo, then post-processes the shared library by appending a binary footer to make it loadable by DuckDB.

### WASM Build
```bash
cargo build --example tpm
```

## Testing

### Running Tests
```bash
make test_debug    # Test debug build
make test_release  # Test release build
make test          # Alias for test_debug
```

Tests use SQLLogicTest format (`.test` files in `test/sql/`) and run via the DuckDB Python client.

### Version Switching
```bash
make clean_all
DUCKDB_TEST_VERSION=v1.3.2 make configure
make debug
make test_debug
```

## Running the Extension

Load in DuckDB:
```bash
duckdb -unsigned
```

```sql
LOAD './build/debug/extension/tpm/tpm.duckdb_extension';
SELECT * FROM tpm('Jane');
```

The `-unsigned` flag is required to load local extensions.

## Custom Registry Support

All functions that query or install packages (except `tpm_list`) support custom npm registries via the `TPM_REGISTRY_URL` environment variable. This allows using registries like Verdaccio, Artifactory, GitHub Packages, or any npm-compatible registry.

**Important:** Authentication is NOT supported - only public registries or registries without authentication can be used.

**Usage:**
```bash
# Set the environment variable before starting DuckDB
export TPM_REGISTRY_URL="https://npm.my-company.com"
duckdb -unsigned

# Or set it inline
TPM_REGISTRY_URL="https://npm.my-company.com" duckdb -unsigned
```

```sql
LOAD './build/debug/extension/tpm/tpm.duckdb_extension';
-- All functions will now use the custom registry
SELECT * FROM tpm_info('my-private-package');
```

## Available Functions

### `tpm(name VARCHAR) -> VARCHAR`
Demo table function that returns a greeting message.

**Example:**
```sql
SELECT * FROM tpm('World');
-- Returns: "TPM World 📦"
```

### `tpm_info(package_name VARCHAR) -> VARCHAR`
Fetches package information from an npm registry and returns it as JSON. Uses the registry specified by `TPM_REGISTRY_URL` environment variable, or defaults to `https://registry.npmjs.org`.

**Parameters:**
- `package_name` - Name of the package to query

**Returns JSON with:**
- `name` - Package name
- `description` - Package description
- `latest_version` - Latest version from dist-tags
- `versions` - Array of all available versions
- `dist_tags` - Distribution tags (latest, next, etc.)

**Example:**
```sql
-- Get package info from default npm registry
SELECT * FROM tpm_info('lodash');

-- Parse JSON fields
SELECT
  json_extract_string(package_info, '$.name') as name,
  json_extract_string(package_info, '$.description') as description,
  json_extract_string(package_info, '$.latest_version') as latest,
  json_array_length(json_extract(package_info, '$.versions')) as version_count
FROM tpm_info('is-number');
```

**Error Handling:**
If a package is not found or there's a network error, the function returns a JSON object with an `error` field:
```sql
SELECT * FROM tpm_info('non-existent-package');
-- Returns: {"error":"Package not found: non-existent-package","package":"non-existent-package"}
```

### `tpm_resolve(package_spec VARCHAR) -> VARCHAR`
Resolves a package specification to a specific version and returns metadata including the tarball URL and dependencies. Uses the registry specified by `TPM_REGISTRY_URL` environment variable, or defaults to `https://registry.npmjs.org`.

**Parameters:**
- `package_spec` - Package specification (see format below)

**Package Spec Format:**
- `package_name` - Resolves to latest version
- `package_name@version` - Resolves to specific version (e.g., `chalk@4.1.2`)
- `package_name@^version` - Resolves using caret semver range (e.g., `is-number@^7.0.0`)
- `package_name@~version` - Resolves using tilde semver range (e.g., `chalk@~4.1.0`)
- `package_name@>version`, `package_name@<version` - Resolves using comparison operators

**Returns JSON with:**
- `package` - Package name
- `resolved_version` - Resolved version number
- `tarball_url` - Download URL for the package tarball
- `dependencies` - Object mapping dependency names to version ranges
- `shasum` - SHA-1 hash for integrity verification

**Example:**
```sql
-- Resolve to latest version
SELECT * FROM tpm_resolve('lodash');

-- Resolve specific version
SELECT * FROM tpm_resolve('chalk@4.1.2');

-- Parse resolution details
SELECT
  json_extract_string(resolve_info, '$.package') as package,
  json_extract_string(resolve_info, '$.resolved_version') as version,
  json_extract_string(resolve_info, '$.tarball_url') as tarball,
  json_extract(resolve_info, '$.dependencies') as deps
FROM tpm_resolve('chalk@4.1.2');
```

### `tpm_install(package_spec VARCHAR, install_dir VARCHAR) -> VARCHAR`
Downloads and extracts an npm package to a specified directory. Uses the registry specified by `TPM_REGISTRY_URL` environment variable, or defaults to `https://registry.npmjs.org`.

**Parameters:**
- `package_spec` - Package specification (same format as `tpm_resolve`)
- `install_dir` - Directory path where package should be installed

**Returns JSON with:**
- `package` - Package name
- `version` - Installed version
- `install_path` - Full path to installed package
- `success` - Boolean indicating success
- `error` - Error message (if success is false)

**Example:**
```sql
-- Install a specific package version
SELECT * FROM tpm_install('is-number@7.0.0', '/tmp/npm_cache');

-- Parse installation result
SELECT
  json_extract_string(install_result, '$.package') as package,
  json_extract_string(install_result, '$.version') as version,
  json_extract_string(install_result, '$.install_path') as path,
  json_extract_string(install_result, '$.success') as success
FROM tpm_install('lodash', '/tmp/npm_cache');

-- Verify installation by reading package.json
SELECT * FROM read_json_auto('/tmp/npm_cache/lodash/4.17.21/package.json');
```

**Notes:**
- Package is extracted to `{install_dir}/{package_name}/{version}/`
- Tarball extraction strips the `package/` prefix from npm tarballs
- Creates directories automatically if they don't exist
- **Integrity verification**: Downloads are verified using SHA-1 checksums from npm registry

### `tpm_install_with_deps(package_spec VARCHAR, install_dir VARCHAR) -> VARCHAR`
Downloads and extracts an npm package along with all its dependencies recursively. Uses the registry specified by `TPM_REGISTRY_URL` environment variable, or defaults to `https://registry.npmjs.org`.

**Parameters:**
- `package_spec` - Package specification (same format as `tpm_resolve`)
- `install_dir` - Directory path where packages should be installed

**Returns:** Multiple rows, one JSON object per installed package with:
- `package` - Package name
- `version` - Installed version
- `install_path` - Full path to installed package
- `success` - Boolean indicating success
- `error` - Error message (if success is false)

**Example:**
```sql
-- Install chalk with all its dependencies
SELECT
  json_extract_string(install_results, '$.package') as package,
  json_extract_string(install_results, '$.version') as version,
  json_extract_string(install_results, '$.success') as success,
  json_extract_string(install_results, '$.install_path') as path
FROM tpm_install_with_deps('chalk@4.1.2', '/tmp/npm_packages');

-- Result shows chalk plus all dependencies:
-- chalk@4.1.2, ansi-styles@4.3.0, supports-color@7.2.0,
-- has-flag@4.0.0, color-convert@2.0.1, color-name@1.1.4

-- Verify specific dependency was installed
SELECT * FROM read_json_auto('/tmp/npm_packages/ansi-styles/4.3.0/package.json');
```

**Notes:**
- Recursively resolves and installs all dependencies
- Uses semver to resolve version ranges in dependencies
- Verifies integrity of each package using SHA-1 checksums
- Limits recursion depth to 10 levels to prevent infinite loops
- Skips already-installed packages (by name, not version)
- Each package is installed to `{install_dir}/{package_name}/{version}/`

### `tpm_tree(package_spec VARCHAR) -> VARCHAR`
Visualizes the dependency tree for a package without installing it. Uses the registry specified by `TPM_REGISTRY_URL` environment variable, or defaults to `https://registry.npmjs.org`.

**Parameters:**
- `package_spec` - Package specification (same format as `tpm_resolve`)

**Returns:** Multiple rows with JSON objects containing:
- `package` - Package name
- `version` - Version number
- `depth` - Depth in dependency tree (0 = root)
- `parent` - Parent package name (null for root)
- `tree_line` - Formatted tree visualization line

**Example:**
```sql
-- Visualize chalk's dependency tree
SELECT
  json_extract_string(tree_info, '$.tree_line') as tree
FROM tpm_tree('chalk@4.1.2');

-- Output:
-- chalk 4.1.2
-- ├── supports-color 7.2.0
-- ├── ansi-styles 4.3.0
--   ├── has-flag 4.0.0
--   ├── color-convert 2.0.1
--     ├── color-name 1.1.4

-- Query specific information
SELECT
  json_extract_string(tree_info, '$.package') as package,
  json_extract_string(tree_info, '$.version') as version,
  json_extract_string(tree_info, '$.depth') as depth
FROM tpm_tree('lodash');
```

**Notes:**
- Depth limit of 5 levels for visualization
- Uses breadth-first traversal
- Deduplicates packages (shows each package only once)
- Does not install packages, only queries metadata

### `tpm_list(install_dir VARCHAR) -> VARCHAR`
Lists all npm packages installed in a directory.

**Parameters:**
- `install_dir` - Directory path to scan for installed packages

**Returns:** Multiple rows with JSON objects containing:
- `package` - Package name
- `version` - Installed version
- `install_path` - Full path to the package

**Example:**
```sql
-- List all installed packages
SELECT
  json_extract_string(list_info, '$.package') as package,
  json_extract_string(list_info, '$.version') as version
FROM tpm_list('/tmp/npm_packages')
ORDER BY package;

-- Find specific package versions
SELECT
  json_extract_string(list_info, '$.package') as package,
  json_extract_string(list_info, '$.version') as version,
  json_extract_string(list_info, '$.install_path') as path
FROM tpm_list('/tmp/npm_packages')
WHERE json_extract_string(list_info, '$.package') = 'chalk';

-- Count installed packages
SELECT COUNT(*) as package_count
FROM tpm_list('/tmp/npm_packages');
```

**Notes:**
- Scans directory structure for package.json files
- Returns empty result if directory doesn't exist
- Sorted by package name then version
- Works with packages installed by any npm tool

## Configuration

### Makefile Settings
- `EXTENSION_NAME=tpm` - Extension name
- `USE_UNSTABLE_C_API=1` - Required because duckdb-rs uses unstable C API
- `TARGET_DUCKDB_VERSION=v1.4.0` - Target DuckDB version

### Cargo.toml
- `crate-type = ["cdylib"]` for native builds
- `crate-type = ["staticlib"]` for WASM example target
- LTO and stripping enabled in release profile
- NPM functionality dependencies:
  - `reqwest` (blocking) - HTTP client for npm registry API
  - `semver` - Semantic version parsing and range resolution
  - `sha1` - Integrity verification of downloaded packages
  - `serde`/`serde_json` - JSON serialization
  - `flate2`/`tar` - Tarball extraction

## CI/CD

Uses DuckDB's extension-ci-tools workflow (`.github/workflows/MainDistributionPipeline.yml`):
- Triggered on push to `main`, PRs, and manual workflow dispatch
- Builds for multiple platforms (excludes WASM and musl variants)
- Requires `rust` and `python3` toolchains

## Clean Up

```bash
make clean      # Remove build artifacts and Rust targets
make clean_all  # Also remove configure artifacts (venv, platform detection)
```

## Known Issues

- On Windows with Python 3.11, extensions may fail to load with "The specified module could not be found". Use Python 3.12 instead.
