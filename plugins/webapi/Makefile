.PHONY: clean clean_all

PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

EXTENSION_NAME=webapi

# Set to 1 to enable Unstable API (binaries will only work on TARGET_DUCKDB_VERSION, forwards compatibility will be broken)
# Note: currently extension-template-rs requires this, as duckdb-rs relies on unstable C API functionality
USE_UNSTABLE_C_API=1

# Target DuckDB version
TARGET_DUCKDB_VERSION=v1.4.4

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

# ---- Coverage (cargo-llvm-cov, see docs/superpowers/specs/2026-05-17-test-infrastructure-and-coverage-design.md) ----

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

# ---- WebAPI GraalVM native shared library (libwebapi-native.so, embeds trexsql) ----
# Heavy build (GraalVM + ephemeral Postgres + ~16 GB RAM); intended for Docker/CI.
.PHONY: webapi-native-lib gen-graalvm-config

webapi-native-lib:
	bash $(PROJ_DIR)build-native-lib.sh

# Capture runtime-only native-image config (dynamic proxies etc.) by running
# WebAPI on a JVM under the tracing agent; merges into graalvm-config/ for review.
gen-graalvm-config:
	bash $(PROJ_DIR)gen-graalvm-config.sh
