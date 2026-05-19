#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
JAVA_DIR="$PROJECT_DIR/java"
LIB_DIR="$PROJECT_DIR/lib"
JAR_FILE="$LIB_DIR/trexsql.jar"

mkdir -p "$LIB_DIR"

if [[ -f "$JAR_FILE" ]]; then
    echo "JAR already exists: $JAR_FILE"
    exit 0
fi

if [[ ! -d "$JAVA_DIR" ]]; then
    echo "Error: java/ directory not found at $JAVA_DIR"
    exit 1
fi

if ! command -v lein &> /dev/null; then
    echo "Error: Leiningen is required to build trexsql.jar"
    echo "Install from: https://leiningen.org/"
    exit 1
fi

# Native libraries must live in resources/ so JNA can load them off the classpath.
RESOURCE_DIR="$JAVA_DIR/resources/linux-x86-64"
REPO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"
NATIVE_LIB="$REPO_ROOT/target/release/libtrexsql_engine.so"

if [[ -f "$RESOURCE_DIR/libtrexsql_engine.so" ]]; then
    echo "Native libraries already in resources (placed by CI)"
elif [[ -f "$NATIVE_LIB" ]]; then
    mkdir -p "$RESOURCE_DIR"
    cp "$NATIVE_LIB" "$RESOURCE_DIR/"
    echo "Bundled: $NATIVE_LIB"
    # libtrexsql.so is the sole NEEDED dep of libtrexsql_engine.so (SONAME libtrexsql.so).
    for TREXSQL_LIB in /usr/local/lib/libtrexsql.so /usr/lib/libtrexsql.so; do
        if [[ -f "$TREXSQL_LIB" ]]; then
            cp "$TREXSQL_LIB" "$RESOURCE_DIR/libtrexsql.so"
            echo "Bundled: $TREXSQL_LIB -> libtrexsql.so"
            break
        fi
    done
else
    echo "Error: libtrexsql_engine.so not found"
    echo "Build it first with: cargo build --release"
    exit 1
fi

echo "Building trexsql.jar from source..."
cd "$JAVA_DIR"
lein uberjar

STANDALONE_JAR=$(ls target/trexsql-*-standalone.jar 2>/dev/null | head -1)
if [[ -n "$STANDALONE_JAR" ]]; then
    cp "$STANDALONE_JAR" "$JAR_FILE"
    echo "Built: $JAR_FILE"
    ls -lh "$JAR_FILE"
else
    echo "Error: Build succeeded but standalone JAR not found"
    exit 1
fi
