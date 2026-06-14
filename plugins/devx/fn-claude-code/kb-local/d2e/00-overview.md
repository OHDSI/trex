# D2E Platform Overview

> Reference summary distilled from the d2e-docs ("blue book"), 2026-06-14, for the
> devx agent. Use when developing or reasoning about Data2Evidence (d2e) features in
> trex. This is a high-level digest, not authoritative source — verify specifics
> against the live d2e codebase when it matters. See the sibling files for detail:
> `01-architecture`, `02-services`, `03-frontend`, `04-integrations`, `05-security-operations`.

## What D2E Is
**Data2Evidence (D2E)** is an open-source, microservices healthcare data analytics platform built on the **OMOP Common Data Model (CDM)** and the broader **OHDSI** ecosystem. It lets researchers and analysts query, filter, aggregate, and export observational health data across multiple database backends, integrating four capabilities into one backend: OHDSI analytical tools, AI-assisted features, FHIR interoperability, and workflow orchestration. Deployable on-premises or in the cloud. (Note: many service names carry a legacy `alp-` prefix from the platform's former name, Analytics Lifecycle Platform — no functional meaning.)

## Core Philosophy
D2E is "an organism, not a catalogue of parts," held together by four decisions:
1. **One runtime (Trex)** hosts every cloud function.
2. **A plugin system** defines what those functions are — behavior is configuration, not core code.
3. **A layered request pipeline** imposes consistent authn/authz/routing on every request.
4. **A credential model** keeps each tenant's data separate without trusting the network (per-study isolation, mTLS).

## High-Level Architecture
Request path: **Browser → Caddy (TLS termination, path routing) → Trex (API gateway + runtime) → cloud functions / proxied external services → PostgreSQL / Redis / object storage.**

- **Trex** — Deno/TypeScript server on a Rust foundation (Hono HTTP framework, ESZIP bundling). Hosts cloud functions as isolated Deno worker isolates and proxies external services. Ports: 33000 (HTTPS external), 33001 (HTTP internal), 5433 (Postgres wire protocol via DuckDB pgwire).
- **Persistence:** PostgreSQL 15 (primary relational, 15+ schemas), Redis (cache/sessions), Supabase Storage/MinIO (files/objects). **TrexSQL** (DuckDB-backed) is the analytical caching layer for non-HANA datasets and the pgwire interface.

## Major Subsystems
1. **Query Engine (analytics core):** Analytics Service (API front door, orchestration, exports), Query Generation Service (the SQL compiler: IFR→FAST→AST→SQL pipeline, dialect-independent), CDW Config Service (logical-to-physical CDM mapping via `@PATIENT`-style placeholders), PA Config Service (UI config), Bookmark Service (saved filter/cohort definitions).
2. **Platform services:** User Management (authorization plane), Dataset Service (dataset lifecycle), Portal Service (metadata system-of-record), D2E WebAPI (OHDSI-compatible interface), Terminology & Concept Mapping (vocabulary), Job Plugins (Prefect gateway), AI Services.
3. **Frontend (d2e-ui):** micro-frontend SPA — React portal shell hosting React and Vue modules (Patient Analytics is Vue).
4. **Integrations:** FHIR R4 (server + gateway), Jupyter Enterprise Gateway (notebook kernels), Prefect 3.x (25 ETL/analysis flows), DICOM (Orthanc), OHDSI tools (Atlas, Strategus, White Rabbit, Perseus, Achilles, DQD).
5. **Security/Ops:** Logto OIDC + Microsoft Entra ID SSO; RSA-encrypted credentials; mTLS internal; Docker Compose deployment.

## Supported Databases
SAP HANA, PostgreSQL, DuckDB/TrexSQL, with Google BigQuery via the TrexSQL caching layer. Database-agnostic via the placeholder system + multi-dialect SQL generation.

## Key Constraints
Strict dependency-ordered startup (PostgreSQL → Logto → Trex → Supabase → Prefect → Enterprise Gateways). Four Docker networks isolate traffic (`alp` service mesh, `data` data plane, two `enterprise-gateway` networks for researcher R/W vs viewer read-only). Doc inconsistency: "37+" vs "15" cloud functions reflects different counting (worker routes vs logical services).

## Cross-cutting facts worth remembering when developing d2e
- The **IFR→FAST→AST→SQL** query pipeline (dialect decisions deferred to a final renderer).
- The **Trex plugin-manifest model**: `functions` / `ui` / `flow` / `core` plugin types, with five manifest sections (`init`, `api`, `roles`, `scopes`, `env`).
- The `alp-` legacy prefix on service names.
- **fnmap in-process IPC** vs **SERVICE_ROUTES HTTP** for inter-service calls.
- **Per-study RSA credential isolation** (private key only in Trex).
- The deliberate **React + Vue polyglot** frontend.
