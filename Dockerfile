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

# Stage 3: Build web frontend
FROM node:22-trixie-slim AS web-builder
WORKDIR /build
COPY plugins/web/package.json plugins/web/package-lock.json plugins/web/tsconfig*.json plugins/web/vite.config.ts plugins/web/index.html plugins/web/components.json ./
COPY plugins/web/src/ ./src/
RUN npm install && npm run build

# Stage 4: Build notebook frontend
FROM node:22-trixie-slim AS notebook-builder
WORKDIR /build
COPY plugins/notebook/package.json plugins/notebook/package-lock.json plugins/notebook/tsconfig*.json plugins/notebook/vite.config.ts plugins/notebook/vite.config.parcel.ts plugins/notebook/index.html ./
COPY plugins/notebook/src/ ./src/
COPY plugins/notebook/public/ ./public/
RUN npm install && npm run build

# Stage 5: Build docs site
FROM node:22-trixie-slim AS docs-builder
WORKDIR /build
COPY plugins/docs/package.json plugins/docs/package-lock.json plugins/docs/tsconfig.json plugins/docs/docusaurus.config.ts plugins/docs/sidebars.ts ./
COPY plugins/docs/docs/ ./docs/
COPY plugins/docs/src/ ./src/
COPY plugins/docs/static/ ./static/
RUN npm install && npm run build

# Stage 5b: Build postgres-meta (TypeScript -> dist/)
FROM node:22-trixie-slim AS pg-meta-builder
WORKDIR /build
COPY plugins/pg-meta/postgres-meta/ ./
RUN npm install --ignore-scripts --no-audit --no-fund && npm run build

# Stage 5c: Build the Studio Next.js static export.
FROM node:22-trixie-slim AS studio-builder
WORKDIR /build
RUN corepack enable
COPY plugins/studio/ ./
RUN npm run build:static

# Stage 6: Runtime
FROM node:22-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl3 libgomp1 ca-certificates libvulkan1 curl git unzip && \
    rm -rf /var/lib/apt/lists/*

# Deno is required by docker/trex-init-entrypoint.sh (runs scripts/derive-secrets.ts)
# and by the runtime extension. Install to /usr/local/bin so it's on PATH for the
# trex-init compose service.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- --yes \
    && /usr/local/bin/deno --version

# Copy trex binary, libtrexsql, and libtrexsql_engine
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

# Download official trexsql extensions for offline use (arch-specific)
ARG TARGETARCH
ENV DUCKDB_VERSION=1.4.4
RUN DUCKDB_PLATFORM="linux_${TARGETARCH}" && \
    mkdir -p /usr/share/trexsql/extensions/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM} && \
    cd /usr/share/trexsql/extensions/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM} && \
    for lib in avro aws delta ducklake fts httpfs icu iceberg inet json mysql_scanner parquet postgres_scanner spatial sqlite sqlite_scanner vss; do \
        curl -sfO https://extensions.duckdb.org/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/${lib}.duckdb_extension.gz && \
        gzip -d ${lib}.duckdb_extension.gz; \
    done && \
    for lib in bigquery; do \
        curl -sfO https://community-extensions.duckdb.org/v${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/${lib}.duckdb_extension.gz && \
        gzip -d ${lib}.duckdb_extension.gz; \
    done

# Override npm extensions with CI-built ones
# Supports both flat layout (local builds) and arch-specific layout (CI multi-arch builds)
COPY extensions/ /tmp/all-extensions/
# CI stages libwebapi-native.so (the GraalVM lib the webapi.trex shim dlopens)
# into extensions/<arch>/ alongside the .trex files; copy any *.so into /usr/lib
# so the bundled webapi.trex can load it. Tolerant of its absence (local builds).
RUN if [ -d "/tmp/all-extensions/${TARGETARCH}" ]; then \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.trex /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.duckdb_extension /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/${TARGETARCH}/*.so /usr/lib/ 2>/dev/null || true; \
    else \
      cp -f /tmp/all-extensions/*.trex /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/*.duckdb_extension /usr/lib/trexsql/extensions/ 2>/dev/null || true; \
      cp -f /tmp/all-extensions/*.so /usr/lib/ 2>/dev/null || true; \
    fi && rm -rf /tmp/all-extensions && ldconfig

# Sync node_modules/@trex/*.trex with the CI-built, arch-correct extensions now
# in /usr/lib/trexsql/extensions. The published @trex npm packages bundle amd64
# .trex; the embedded WebAPI engine (libwebapi-native.so) loads extensions from
# node_modules/@trex, so on an arm64 image those stale amd64 binaries make
# webapi_start() fail with "Failed to load '…/pool.trex' … built for platform
# 'linux_amd64', but we can only load extensions built for platform 'linux_arm64'".
# Overlaying by basename keeps node_modules consistent with the image's arch.
RUN for src in /usr/lib/trexsql/extensions/*.trex; do \
      base=$(basename "$src"); \
      find /usr/src/node_modules/@trex -name "$base" -exec cp -f "$src" {} \; ; \
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
COPY plugins/studio/ ./plugins-dev/studio/
COPY --from=studio-builder /build/build_static/ ./plugins-dev/studio/build_static/
COPY plugins/storage/ ./plugins-dev/storage/
COPY plugins/pg-meta/ ./plugins-dev/pg-meta/
COPY --from=pg-meta-builder /build/dist/ ./plugins-dev/pg-meta/postgres-meta/dist/
COPY --from=pg-meta-builder /build/node_modules/ ./plugins-dev/pg-meta/postgres-meta/node_modules/

# TLS cert is generated at container start by /usr/src/entrypoint.sh
# (per-container, NOT for production — see comments in that script).
# Install openssl so the entrypoint can generate the cert when needed.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

ENV SCHEMA_DIR=/usr/src/core/schema
ENV DUCKDB_EXTENSION_DIRECTORY=/usr/share/trexsql/extensions

# Ensure config directories exist for OAuth token persistence
RUN mkdir -p /home/node/.claude /home/node/.config/gh && \
    chown -R node:node /home/node/.claude /home/node/.config/gh && \
    chown node:node /usr/src

# Install entrypoint script that generates per-container TLS cert and
# verifies TREX_ROOT_KEY is present (set by the trex-init container).
COPY docker/entrypoint.sh /usr/src/entrypoint.sh
RUN chmod 755 /usr/src/entrypoint.sh

# Derivation CLI + trex-init entrypoint. The trex-init compose service runs
# /usr/local/bin/trex-init on a shared volume to generate the root key and
# all derived per-purpose subkeys before any other service starts.
COPY scripts/ /usr/src/scripts/
COPY docker/trex-init-entrypoint.sh /usr/local/bin/trex-init
RUN chmod 755 /usr/local/bin/trex-init

EXPOSE 8001 8000
USER node
ENTRYPOINT ["/usr/src/entrypoint.sh"]
