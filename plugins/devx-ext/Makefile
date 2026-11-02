.PHONY: clean clean_all

PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

EXTENSION_NAME=devx_ext

# DuckDB 2.0 loads stable-V1 (C_STRUCT, capi < 2) extensions via <name>_init_c_api;
# devx-ext's API use was verified by LOAD on 2.0.
USE_UNSTABLE_C_API=0

# Target DuckDB version
TARGET_DUCKDB_VERSION=v1.5.6
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
