.PHONY: all configure clean clean_all debug release test test_debug test_release

PROJ_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# Configuration of extension for C API
EXTENSION_NAME=ai
EXTENSION_LIB_FILENAME=lib$(EXTENSION_NAME).so
# DuckDB 2.0 loads stable-V1 (C_STRUCT, capi < 2) extensions via <name>_init_c_api;
# ai's API use was verified by LOAD on 2.0.
USE_UNSTABLE_C_API=0
TARGET_DUCKDB_VERSION=v1.5.6
DUCKDB_TEST_VERSION=v2.0.0

# Main targets
all: configure release

# Include the base C API makefile and then the C/C++ specific one
include ../extension-ci-tools/makefiles/c_api_extensions/base.Makefile
include ../extension-ci-tools/makefiles/c_api_extensions/c_cpp.Makefile

# Configuration step
configure: venv platform extension_version

# Build targets
debug: build_extension_library_debug build_extension_with_metadata_debug
release: build_extension_library_release build_extension_with_metadata_release

# Test targets
test: test_debug
test_debug: test_extension_debug
test_release: test_extension_release

# Clean targets
clean: clean_build clean_cmake
clean_all: clean clean_configure