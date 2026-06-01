#!/usr/bin/env bash
# Reproduce the CI `build-arm` job locally as a native linux/arm64 build.
# Host must be arm64 (Apple Silicon) with arm64 Docker so there is no QEMU
# emulation — this matches the GitHub `ubuntu-24.04-arm` runner.
#
# Usage:
#   scripts/test-arm-build.sh <plugin> [--prebuild "<cmd run before make>"]
#
# Examples:
#   scripts/test-arm-build.sh pool
#   scripts/test-arm-build.sh chdb --prebuild "bash ./install_chdb.sh"
set -euo pipefail

PLUGIN="${1:?usage: test-arm-build.sh <plugin> [--prebuild \"<cmd>\"] [--build \"<cmd>\"]}"
shift || true
PREBUILD=""
# Default build mirrors the build-arm CI step. CMake plugins (ai/atlas/cql2elm)
# override this with --build "bash ./build.sh".
BUILD_CMD="make configure && make release"
while [ $# -gt 0 ]; do
  case "$1" in
    --prebuild) PREBUILD="${2:-}"; shift 2 ;;
    --build) BUILD_CMD="${2:-}"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMG="trex-arm-build:24.04"
PLUGDIR="plugins/${PLUGIN}"

[ -d "$REPO_ROOT/$PLUGDIR" ] || { echo "no such plugin dir: $PLUGDIR" >&2; exit 1; }

# Token for the @trex GitHub Packages registry, used by `npm install`.
GH_TOKEN_VALUE="$(gh auth token 2>/dev/null || echo "${NODE_AUTH_TOKEN:-}")"

echo "==> Building toolchain image (cached after first run)"
docker buildx build --platform linux/arm64 -t "$IMG" --load - <<'DOCKERFILE'
FROM --platform=linux/arm64 ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake ninja-build git curl ca-certificates pkg-config \
      python3 python3-venv python3-pip unzip zip libssl-dev sudo \
      clang libclang-dev \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH=/root/.cargo/bin:$PATH
DOCKERFILE

echo "==> Running native linux/arm64 build for ${PLUGIN}"
# cargo accepts the literal `default` or a number for CARGO_BUILD_JOBS (an empty
# string errors), so default to `default` when the caller didn't set a number.
docker run --rm --platform linux/arm64 \
  -v "$REPO_ROOT":/src -w "/src/${PLUGDIR}" \
  -v trex-arm-cargo-registry:/root/.cargo/registry \
  -v trex-arm-cargo-git:/root/.cargo/git \
  -e PATH=/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e NODE_AUTH_TOKEN="$GH_TOKEN_VALUE" \
  -e CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-default}" \
  -e CARGO_NET_GIT_FETCH_WITH_CLI=true \
  -e PREBUILD="$PREBUILD" \
  -e BUILD_CMD="$BUILD_CMD" \
  "$IMG" bash -euo pipefail -c '
    echo "--- arch: $(uname -m)  rustc: $(rustc --version)  node: $(node --version)"
    if [ -f package.json ]; then npm install --ignore-scripts || echo "npm install skipped"; fi
    if [ -n "${PREBUILD}" ]; then echo "--- prebuild: ${PREBUILD}"; eval "${PREBUILD}"; fi
    echo "--- build: ${BUILD_CMD}"
    eval "${BUILD_CMD}"
    # .trex lands under build/release/extension/<name>/ (make) or the plugin
    # root (build.sh moves it there).
    TREX=$(ls build/release/extension/*/*.trex ./*.trex 2>/dev/null | head -1 || true)
    if [ -z "$TREX" ]; then echo "::FAIL:: no .trex produced"; exit 1; fi
    echo "::OK:: produced $TREX"
    file "$TREX" || true
    ls -la "$TREX"
  '
