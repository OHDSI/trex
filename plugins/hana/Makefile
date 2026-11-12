.PHONY: clean clean_all

PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# V2 C API extension (hana_scan_init_c_api_v2). The V2 API has no stable surface,
# so DuckDB only loads C_STRUCT_UNSTABLE builds pinned to its exact version.
USE_UNSTABLE_C_API=1
CAPI_VERSION=2

# Extension configuration
EXTENSION_NAME=hana_scan
MINIMUM_DUCKDB_VERSION=v2.0.0
TARGET_DUCKDB_VERSION=v2.0.0
DUCKDB_TEST_VERSION=v2.0.0

all: configure debug

# Include makefiles from DuckDB
include ../extension-ci-tools/makefiles/c_api_extensions/base.Makefile
include ../extension-ci-tools/makefiles/c_api_extensions/rust.Makefile

configure: venv platform extension_version

debug: build_extension_library_debug build_extension_with_metadata_debug
release: build_extension_library_release build_extension_with_metadata_release

test: test_debug
test_debug: test_extension_debug
test_release: test_extension_release

clean: clean_build clean_rust
clean_all: clean_configure clean

# ---- Coverage (cargo-llvm-cov) ----

.PHONY: coverage coverage_html debug_coverage

coverage:
	@command -v cargo-llvm-cov >/dev/null 2>&1 || cargo install cargo-llvm-cov --locked
	@mkdir -p build/coverage
	cargo llvm-cov --lcov --output-path build/coverage/lcov.info

coverage_html:
	@command -v cargo-llvm-cov >/dev/null 2>&1 || cargo install cargo-llvm-cov --locked
	@mkdir -p build/coverage
	cargo llvm-cov --html --output-dir build/coverage/html

debug_coverage:
	RUSTFLAGS="-C instrument-coverage" $(MAKE) debug
