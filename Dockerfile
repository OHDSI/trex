# Global build args, shared across stages (redeclare with bare ARG in each stage
# that uses them). DUCKDB_* are also exported as ENV in the final image for
# introspection parity with older releases.
ARG DENO_VERSION=v2.7.14
ARG DUCKDB_VERSION=1.4.4
# NOTE: DuckDB publishes the SQLite reader as `sqlite_scanner`; there is no
# standalone `sqlite` extension at extensions.duckdb.org (the URL 404s), so it is
# intentionally NOT listed here — with fail-loud fetching it would abort the build.
ARG DUCKDB_CORE_EXTENSIONS="avro aws delta ducklake fts httpfs icu iceberg inet json mysql_scanner parquet postgres_scanner spatial sqlite_scanner vss"
ARG DUCKDB_COMMUNITY_EXTENSIONS="bigquery"
ARG DUCKDB_OPTIONAL_EXTENSIONS=""

# Stage 1: Build the trex binary
FROM debian:trixie-slim AS builder

ARG TREXSQL_VERSION=v1.4.4-trex
ARG CHDB_VERSION=v3.6.0
ARG TARGETARCH

RUN apt-get update && apt-get install -y curl unzip wget gcc libc6-dev && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.88.0
ENV PATH="/root/.cargo/bin:${PATH}"

# Download libtrexsql from GitHub release (arch-specific)
RUN mkdir -p /opt/trexsql && \
    wget -O /tmp/libtrexsql.zip \
      https://github.com/p-hoffmann/trexsql-rs/releases/download/${TREXSQL_VERSION}/libtrexsql-linux-${TARGETARCH}.zip && \
    unzip /tmp/libtrexsql.zip -d /opt/trexsql && \
    rm /tmp/libtrexsql.zip

ENV TREXSQL_LIB_DIR=/opt/trexsql
ENV TREXSQL_INCLUDE_DIR=/opt/trexsql

# Download libchdb from GitHub release (arch-specific: x86_64 / aarch64)
RUN mkdir -p /opt/chdb && \
    case "$TARGETARCH" in \
      amd64) CHDB_ARCH=x86_64 ;; \
      arm64) CHDB_ARCH=aarch64 ;; \
      *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac && \
    cd /tmp && \
    wget -O libchdb.tar.gz \
      https://github.com/chdb-io/chdb/releases/download/${CHDB_VERSION}/linux-${CHDB_ARCH}-libchdb.tar.gz && \
    tar -xzf libchdb.tar.gz && \
    mv libchdb.so /opt/chdb/ && \
    rm -f libchdb.tar.gz chdb.h

# Cache dependency build: copy manifests first, build with dummy src, then replace
COPY Cargo.toml Cargo.lock /usr/src/trexsql/
COPY plugins/pool-client /usr/src/trexsql/plugins/pool-client
WORKDIR /usr/src/trexsql
RUN mkdir src && echo "fn main() {}" > src/main.rs && echo "" > src/lib.rs && \
    cargo build --release && \
    rm -rf src target/release/trex target/release/libtrexsql_engine* \
      target/release/deps/trexsql* target/release/.fingerprint/trexsql-*

COPY src/ /usr/src/trexsql/src/
RUN cargo build --release

# Stage 2: Build web frontend
FROM node:22-trixie-slim AS web-builder
WORKDIR /build
COPY plugins/web/package.json plugins/web/package-lock.json plugins/web/tsconfig*.json plugins/web/vite.config.ts plugins/web/index.html plugins/web/components.json ./
COPY plugins/web/src/ ./src/
RUN npm install && npm run build

# Stage 3: Build notebook frontend
FROM node:22-trixie-slim AS notebook-builder
WORKDIR /build
COPY plugins/notebook/package.json plugins/notebook/package-lock.json plugins/notebook/tsconfig*.json plugins/notebook/vite.config.ts plugins/notebook/vite.config.parcel.ts plugins/notebook/index.html ./
COPY plugins/notebook/src/ ./src/
COPY plugins/notebook/public/ ./public/
RUN npm install && npm run build

# Stage 4: Build docs site
FROM node:22-trixie-slim AS docs-builder
WORKDIR /build
COPY plugins/docs/package.json plugins/docs/package-lock.json plugins/docs/tsconfig.json plugins/docs/docusaurus.config.ts plugins/docs/sidebars.ts ./
COPY plugins/docs/docs/ ./docs/
COPY plugins/docs/src/ ./src/
COPY plugins/docs/static/ ./static/
RUN npm install && npm run build

# Stage 5: Build postgres-meta (TypeScript -> dist/)
FROM node:22-trixie-slim AS pg-meta-builder
WORKDIR /build
COPY plugins/pg-meta/postgres-meta/ ./
# Prune dev deps after the build: only dist/ + production deps ship in the
# runtime image (typescript/vitest/etc. are ~150MB of dead weight otherwise).
RUN npm install --ignore-scripts --no-audit --no-fund && npm run build && \
    npm prune --omit=dev --ignore-scripts --no-audit --no-fund

# Stage 6: Build the Studio Next.js static export.
FROM node:22-trixie-slim AS studio-builder
WORKDIR /build
RUN corepack enable
COPY plugins/studio/ ./
RUN npm run build:static

# Stage 7: Assembler — builds the complete runtime file tree (/usr/src,
# /usr/lib/trexsql, /usr/share/trexsql, /home/node/.duckdb, /home/node/.cache).
# Everything here is scratch space: intermediate layer weight (COPY+rm dances,
# npm caches, overwritten files) never reaches the final image, which imports
# the assembled trees with a handful of COPY --from=assembler layers.
FROM node:22-trixie-slim AS assembler

ARG TARGETARCH
ARG DENO_VERSION
ARG DUCKDB_VERSION
ARG DUCKDB_CORE_EXTENSIONS
ARG DUCKDB_COMMUNITY_EXTENSIONS
ARG DUCKDB_OPTIONAL_EXTENSIONS

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip && \
    rm -rf /var/lib/apt/lists/*

# Deno is needed at assembly time (postgrest dep pre-warm) and mirrors the
# runtime environment `trex bundle` runs under.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --yes "${DENO_VERSION}" \
    && /usr/local/bin/deno --version

# trex + its libraries so `trex bundle` (and extension loading during it) works
# exactly as it did when bundling ran in the runtime stage.
COPY --from=builder /usr/src/trexsql/target/release/trex /usr/bin/
COPY --from=builder /opt/trexsql/libtrexsql.so /usr/lib/
COPY --from=builder /opt/chdb/ /usr/lib/
COPY --from=builder /usr/src/trexsql/target/release/libtrexsql_engine.so /usr/lib/
RUN ldconfig

WORKDIR /usr/src

# Install extensions via npm
COPY package.json package-lock.json .npmrc ./
# Runtime deno.json without the parent workspace declaration — Deno v2.7+
# rejects bootstrapping config files inside the workspace tree that aren't
# declared members, which breaks every function-worker plugin loaded from
# /usr/src/plugins-dev. The repo-root deno.json keeps the workspace key for
# local dev/CI builds; only the runtime image strips it.
RUN echo '{"nodeModulesDir":"auto"}' > deno.json
# Sources for `file:` deps in package.json — these aren't published to the registry.
# Removed after install; real loading goes via node_modules/@trex and plugins-dev/.
COPY plugins/pg-meta/ /usr/src/plugins/pg-meta/
COPY plugins/studio/ /usr/src/plugins/studio/
COPY --from=studio-builder /build/build_static/ /usr/src/plugins/studio/build_static/
RUN npm install && rm -rf /usr/src/plugins/pg-meta /usr/src/plugins/studio

# Collect extension files from node_modules into extensions dir
RUN mkdir -p /usr/lib/trexsql/extensions && \
    find node_modules/@trex -name "*.trex" -exec cp {} /usr/lib/trexsql/extensions/ \; && \
    find node_modules/@trex -name "*.duckdb_extension" -exec cp {} /usr/lib/trexsql/extensions/ \;

# Download official DuckDB extensions for offline use (arch-specific). buildx runs
# this once per target platform, so it guarantees BOTH linux_amd64 and linux_arm64
# images carry the full set. Each download is verified: a missing extension for the
# target arch FAILS the build (no silent gaps), so we never ship an image where
# `LOAD <ext>` blows up at runtime. To deliberately skip an extension that has no
# build for an arch, move it to DUCKDB_OPTIONAL_EXTENSIONS.
RUN set -eu; \
    DUCKDB_PLATFORM="linux_${TARGETARCH}"; \
    DEST="/usr/share/trexsql/extensions/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM}"; \
    mkdir -p "$DEST"; \
    fetch() { \
      url="$1/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/$2.duckdb_extension.gz"; \
      echo "  - $2 (${DUCKDB_PLATFORM})"; \
      curl -fsSL -o "${DEST}/$2.duckdb_extension.gz" "$url" \
        || { echo "ERROR: extension '$2' not available for ${DUCKDB_PLATFORM}: $url" >&2; return 1; }; \
      gzip -df "${DEST}/$2.duckdb_extension.gz"; \
    }; \
    missing=""; \
    echo "Fetching DuckDB core extensions:"; \
    for lib in ${DUCKDB_CORE_EXTENSIONS}; do fetch https://extensions.duckdb.org "$lib" || missing="${missing} ${lib}"; done; \
    echo "Fetching DuckDB community extensions:"; \
    for lib in ${DUCKDB_COMMUNITY_EXTENSIONS}; do fetch https://community-extensions.duckdb.org "$lib" || missing="${missing} ${lib}"; done; \
    for lib in ${DUCKDB_OPTIONAL_EXTENSIONS}; do fetch https://extensions.duckdb.org "$lib" || echo "WARN: optional '$lib' missing for ${DUCKDB_PLATFORM}, skipping"; done; \
    if [ -n "${missing}" ]; then echo "FATAL: required DuckDB extensions missing for ${DUCKDB_PLATFORM}:${missing}" >&2; exit 1; fi; \
    # Seed DuckDB's default per-user lookup path so `LOAD <ext>` resolves even when a
    # worker connection doesn't pick up DUCKDB_EXTENSION_DIRECTORY. A symlink instead
    # of a copy: the two paths used to carry byte-identical duplicates (~745MB).
    HOME_EXT_PARENT="/home/node/.duckdb/extensions/v${DUCKDB_VERSION}"; \
    mkdir -p "$HOME_EXT_PARENT"; \
    ln -sfn "$DEST" "${HOME_EXT_PARENT}/${DUCKDB_PLATFORM}"; \
    echo "DuckDB extensions present for ${DUCKDB_PLATFORM}:"; ls -1 "$DEST"

# Override npm extensions with CI-built ones
# Supports both flat layout (local builds) and arch-specific layout (CI multi-arch builds)
COPY extensions/ /tmp/all-extensions/
# CI stages libwebapi-native.so (the GraalVM lib the webapi.trex shim dlopens)
# into extensions/<arch>/ alongside the .trex files; copy any *.so into /usr/lib
# so the bundled webapi.trex can load it, and stage a second copy in /opt/ci-libs
# for the final image to import. Tolerant of its absence (local builds).
RUN mkdir -p /opt/ci-libs && \
    if [ -d "/tmp/all-extensions/${TARGETARCH}" ]; then \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.trex /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.duckdb_extension /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.so /usr/lib/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.so /opt/ci-libs/ 2>/dev/null || true; \
    else \
      cp -f /tmp/all-extensions/*.trex /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/*.duckdb_extension /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/*.so /usr/lib/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/*.so /opt/ci-libs/ 2>/dev/null || true; \
    fi && rm -rf /tmp/all-extensions && ldconfig

# Sync node_modules/@trex extension binaries with the CI-built, arch-correct
# ones now in /usr/lib/trexsql/extensions. The published @trex npm packages
# bundle amd64 .trex; the embedded WebAPI engine (libwebapi-native.so) loads
# extensions from node_modules, so on an arm64 image those stale amd64 binaries
# make webapi_start() fail with "Failed to load '…/pool.trex' … built for
# platform 'linux_amd64', but we can only load extensions built for platform
# 'linux_arm64'". Symlinks (not copies) keep node_modules consistent with the
# image's arch AND deduplicate ~430MB of extension binaries. Direction matters:
# /usr/lib/trexsql/extensions must hold the real files — trex's extension
# loader canonicalizes paths and skips anything resolving outside its dir.
RUN for src in /usr/lib/trexsql/extensions/*.trex /usr/lib/trexsql/extensions/*.duckdb_extension; do \
      [ -f "$src" ] || continue; \
      base=$(basename "$src"); \
      find /usr/src/node_modules/@trex -name "$base" -type f -exec ln -sf "$src" {} \; ; \
    done

# Create plugins directory and symlink @trex npm packages for plugin scanner
RUN mkdir -p ./plugins && \
    ln -sf $(pwd)/node_modules/@trex ./plugins/@trex

# Copy core package manifests first and install dependencies (cache-friendly)
COPY core/server/package.json core/server/package-lock.json ./core/server/
COPY core/event/package.json core/event/package-lock.json ./core/event/
RUN cd /usr/src/core/server && npm install --omit=dev && \
    cd /usr/src/core/event && npm install --omit=dev

# Copy remaining core source
COPY core/ ./core/

# Pre-bundle the core Deno workers into eszips so cold starts skip TS transpile.
# Runs in-image via trexas; needs network for remote imports. Loaded through
# main_service_path/event_worker_path in docker-compose.yml.
RUN trex bundle ./core/server/index.ts ./core/server/index.eszip \
 && trex bundle ./core/event/index.ts  ./core/event/index.eszip

# Vendored gbrain for the `memory` plugin type: the memory worker stages
# vendor/gbrain/src/ plus the sibling package.json from disk at mount time
# (core/server/memory/gbrain-worker/mount.ts:resolveGbrainSrcDir) — without
# them every memory plugin mount fails with "cannot locate vendor/gbrain/src".
# Only src/ + package.json are runtime inputs; tests/docs/CHANGELOG stay out.
COPY vendor/gbrain/src/ ./vendor/gbrain/src/
COPY vendor/gbrain/package.json ./vendor/gbrain/package.json

# Copy functions
COPY functions/ ./functions/

# Create plugins/runtime workspace member stub (referenced by deno.json workspace)
RUN mkdir -p ./plugins/runtime && echo '{"nodeModulesDir":"auto"}' > ./plugins/runtime/deno.json

# Copy dev plugins (use pre-built dist from builder stages)
COPY plugins/web/ ./plugins-dev/web/
COPY --from=web-builder /build/dist/ ./plugins-dev/web/dist/
COPY plugins/notebook/ ./plugins-dev/notebook/
COPY --from=notebook-builder /build/dist/ ./plugins-dev/notebook/dist/
COPY plugins/docs/ ./plugins-dev/docs/
COPY --from=docs-builder /build/build/ ./plugins-dev/docs/build/
# Studio at runtime is a proxy function + the static export: only the plugin
# manifest, functions/, the /studio-fallback page, and build_static/ are used
# (matches the npm `files` whitelist). The supabase-studio submodule source
# (~790MB) is build-input only and must NOT be copied here.
COPY plugins/studio/package.json plugins/studio/deno.json ./plugins-dev/studio/
COPY plugins/studio/functions/ ./plugins-dev/studio/functions/
COPY plugins/studio/build/ ./plugins-dev/studio/build/
COPY --from=studio-builder /build/build_static/ ./plugins-dev/studio/build_static/
COPY plugins/storage/ ./plugins-dev/storage/
COPY plugins/postgrest/ ./plugins-dev/postgrest/
# Pre-warm the postgrest worker's npm deps (pg/jose are npm: specifiers in
# functions/deno.json — the worker runtime stages the source WITHOUT
# node_modules, so bare/byonm resolution is not an option) into the node
# user's DENO_DIR so the first REST request needs no registry access.
RUN DENO_DIR=/home/node/.cache/deno deno cache --config plugins-dev/postgrest/functions/deno.json plugins-dev/postgrest/functions/index.ts
COPY plugins/pg-meta/ ./plugins-dev/pg-meta/
COPY --from=pg-meta-builder /build/dist/ ./plugins-dev/pg-meta/postgres-meta/dist/
COPY --from=pg-meta-builder /build/node_modules/ ./plugins-dev/pg-meta/postgres-meta/node_modules/
# claw agent plugin (Discord facilitator driving the Code agent): loaded from
# plugins-dev like storage/postgrest — not published to npm, no build step.
# Dormant unless its DISCORD_*/CLAW_* env is configured at runtime.
COPY plugins/claw/ ./plugins-dev/claw/

# Entrypoint + derivation CLI scripts live under /usr/src so the final stage
# imports them with the same COPY as the rest of the tree.
COPY docker/entrypoint.sh /usr/src/entrypoint.sh
COPY scripts/ /usr/src/scripts/
RUN chmod 755 /usr/src/entrypoint.sh

# Stage 8: Runtime ("prod" target — lean image without dev tooling or devx;
# not published by CI, but kept as a build option: docker build --target prod .)
FROM node:22-trixie-slim AS prod

ARG DENO_VERSION
ARG DUCKDB_VERSION
ARG DUCKDB_CORE_EXTENSIONS
ARG DUCKDB_COMMUNITY_EXTENSIONS
ARG DUCKDB_OPTIONAL_EXTENSIONS

# openssl: used by /usr/src/entrypoint.sh to generate the per-container TLS cert.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl3 libgomp1 ca-certificates libvulkan1 curl git unzip openssl && \
    rm -rf /var/lib/apt/lists/*

# Deno is required by docker/trex-init-entrypoint.sh (runs scripts/derive-secrets.ts)
# and by the runtime extension. Install to /usr/local/bin so it's on PATH for the
# trex-init compose service. Pinned (see global ARG): leaving it unpinned pulls
# whatever is latest at build time (e.g. 2.8.x), which is not what the runtime is
# validated against; the workspace-config behaviour targets the 2.7 line.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --yes "${DENO_VERSION}" \
    && /usr/local/bin/deno --version

# Copy trex binary, libtrexsql, libtrexsql_engine, and any CI-staged native libs
# (e.g. libwebapi-native.so, dlopen'd by the webapi.trex shim).
COPY --from=builder /usr/src/trexsql/target/release/trex /usr/bin/
COPY --from=builder /opt/trexsql/libtrexsql.so /usr/lib/
COPY --from=builder /opt/chdb/ /usr/lib/
COPY --from=builder /usr/src/trexsql/target/release/libtrexsql_engine.so /usr/lib/
COPY --from=assembler /opt/ci-libs/ /usr/lib/
COPY --from=assembler /usr/lib/trexsql/ /usr/lib/trexsql/
RUN ldconfig

# Official DuckDB extensions (offline LOAD). node-owned so DuckDB can still
# install additional extensions through the /home/node/.duckdb symlink into
# this tree (the per-user path was node-writable before the dedup, too).
COPY --from=assembler --chown=node:node /usr/share/trexsql/ /usr/share/trexsql/
COPY --from=assembler --chown=node:node /home/node/.duckdb/ /home/node/.duckdb/
# Pre-warmed postgrest worker deps (DENO_DIR of the node user).
COPY --from=assembler --chown=node:node /home/node/.cache/deno/ /home/node/.cache/deno/

WORKDIR /usr/src

# The complete assembled application tree, imported in a single layer.
COPY --from=assembler /usr/src/ /usr/src/

ENV SCHEMA_DIR=/usr/src/core/schema
ENV DUCKDB_EXTENSION_DIRECTORY=/usr/share/trexsql/extensions
ENV DUCKDB_VERSION="${DUCKDB_VERSION}"
ENV DUCKDB_CORE_EXTENSIONS="${DUCKDB_CORE_EXTENSIONS}"
ENV DUCKDB_COMMUNITY_EXTENSIONS="${DUCKDB_COMMUNITY_EXTENSIONS}"
ENV DUCKDB_OPTIONAL_EXTENSIONS="${DUCKDB_OPTIONAL_EXTENSIONS}"

# Ensure config directories exist for OAuth token persistence
RUN mkdir -p /home/node/.claude /home/node/.config/gh && \
    chown -R node:node /home/node/.claude /home/node/.config/gh && \
    chown node:node /usr/src

# Derivation CLI + trex-init entrypoint. The trex-init compose service runs
# /usr/local/bin/trex-init on a shared volume to generate the root key and
# all derived per-purpose subkeys before any other service starts.
COPY docker/trex-init-entrypoint.sh /usr/local/bin/trex-init
RUN chmod 755 /usr/local/bin/trex-init

EXPOSE 8001 8000

USER node

# Entrypoint script generates a per-container TLS cert (NOT for production —
# see comments in that script) and verifies TREX_ROOT_KEY is present (set by
# the trex-init container).
ENTRYPOINT ["/usr/src/entrypoint.sh"]

# Stage 9: Build the devx_ext DuckDB extension for the target arch.
# extension-ci-tools is a git submodule (the Makefile includes ../extension-ci-tools):
#   git submodule update --init plugins/extension-ci-tools
# DEVX_EXT_VERSION must be a real version (the git sha in CI): the extension
# build's metadata step runs `git describe`, which fails inside the build
# context (no .git) and would otherwise bake the error string into the
# extension's ABI metadata, making it unloadable.
FROM rust:1.88-bookworm AS devx-ext-builder
ARG DEVX_EXT_VERSION=dev
WORKDIR /work/plugins/devx-ext
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv make pkg-config libssl-dev git && \
    rm -rf /var/lib/apt/lists/*
COPY plugins/extension-ci-tools/ /work/plugins/extension-ci-tools/
COPY plugins/devx-ext/ /work/plugins/devx-ext/
RUN make configure EXTENSION_VERSION="${DEVX_EXT_VERSION}" && \
    make release   EXTENSION_VERSION="${DEVX_EXT_VERSION}" && \
    test -f build/release/devx_ext.trex

# Stage 10: Build the devx plugin (SPA dist + fn-* runtime deps)
FROM node:22-trixie-slim AS devx-builder
WORKDIR /work
COPY plugins/devx/ /work/
# Bundle the trex Docusaurus docs as a local knowledge-base source so the agent
# can query them via the kb MCP server's `trex-docs` source — no clone, no
# network at runtime. Source of truth stays in plugins/docs; this is a
# build-time snapshot. (The `d2e` local source is authored in-repo under
# fn-claude-code/kb-local/d2e and ships via the COPY above.)
COPY plugins/docs/docs/ /work/fn-claude-code/kb-local/trex-docs/
# Build the SPA, then install runtime deps for the two agent sidecar servers.
RUN npm ci && \
    npm run build && \
    (cd fn-claude-code && npm install --omit=dev) && \
    (cd fn-copilot && npm install --omit=dev) && \
    # Root node_modules are build-only (vite/tsc); the runtime uses dist/ + the
    # Deno functions, so drop them to keep the image small.
    rm -rf node_modules

# Stage 11: Full image (DEFAULT — last stage). prod + dev tooling + the devx
# payload in gated folders that entrypoint.sh only exposes when
# TREX_DX_ENABLED=true. This is the only image CI publishes.
FROM prod AS full
USER root
WORKDIR /usr/src

ARG TARGETARCH
ARG SHINYLIVE_VERSION=0.10.7
ARG GH_VERSION=2.65.0
# Shinylive (the ~770MB analytics dashboard runtime) is opt-in: it is skipped
# unless the image is built with --build-arg INSTALL_SHINYLIVE=true.
ARG INSTALL_SHINYLIVE=false

# --- Dev tooling (formerly Dockerfile.dev) ---
# Shinylive — analytics dashboard runtime (opt-in via INSTALL_SHINYLIVE=true)
RUN if [ "${INSTALL_SHINYLIVE}" = "true" ]; then \
      curl -sLO https://github.com/posit-dev/shinylive/releases/download/v${SHINYLIVE_VERSION}/shinylive-${SHINYLIVE_VERSION}.tar.gz && \
      tar -xzf shinylive-${SHINYLIVE_VERSION}.tar.gz && \
      mv shinylive-${SHINYLIVE_VERSION} shinylive && \
      rm shinylive-${SHINYLIVE_VERSION}.tar.gz && \
      chown -R node:node /usr/src/shinylive; \
    else \
      echo "INSTALL_SHINYLIVE!=true — skipping shinylive install"; \
    fi

# Playwright + headless Chromium for QA / design-review tools
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/lib/playwright-browsers
ENV NODE_PATH=/usr/lib/node_modules
RUN npm install -g playwright@latest && \
    npx playwright install --with-deps chromium && \
    rm -rf /tmp/* /root/.cache/ms-playwright-*

# Claude Code CLI for subscription-based AI usage
RUN npm install -g @anthropic-ai/claude-code

# GitHub CLI for subscription-based AI usage / gh copilot
RUN curl -fsSL https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${TARGETARCH}.deb -o /tmp/gh.deb && \
    dpkg -i /tmp/gh.deb && rm /tmp/gh.deb

# --- d2e flow tooling (formerly Dockerfile.dx) ---
# corepack (yarn/pnpm) + bun for the d2e-ui monorepo; python3 + uv + prefect
# to run d2e flows. The d2e-ui sub-app recipe installs with `bun install`
# (plugins/devx/functions/d2e/recipes.ts), so bun must be on PATH for DevX to
# start a UI microfrontend dev server. NOTE: fully RUNNING flows also requires
# adding python/uv/prefect to the devx_ext validate_command allowlist
# (plugins/devx-ext/src/validation.rs) — until then flows are context-only.
RUN corepack enable
RUN npm install -g bun
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip pipx && \
    rm -rf /var/lib/apt/lists/*
RUN pipx install uv && \
    (uv tool install prefect || pip3 install --break-system-packages prefect)

# --- Gated devx payload ---
# Outside the default PLUGINS_DEV_PATH / EXTENSION_DIR scan paths; only
# entrypoint.sh's TREX_DX_ENABLED=true gate exposes these dirs.
COPY --from=devx-builder --chown=node:node /work/ /usr/src/plugins-dx/devx/
COPY --from=devx-ext-builder /work/plugins/devx-ext/build/release/devx_ext.trex \
     /usr/lib/trexsql/extensions-dx/devx_ext.trex

# entrypoint.sh copies the gated devx_ext into the primary extensions dir when
# TREX_DX_ENABLED=true (see the DevX gate there for why it can't be appended to
# EXTENSION_DIR). That copy runs as the container user, so the dir must be
# writable by node — the non-root user this image runs as.
RUN chown node:node /usr/lib/trexsql/extensions

USER node
ENTRYPOINT ["/usr/src/entrypoint.sh"]
