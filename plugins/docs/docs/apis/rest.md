---
sidebar_position: 1
---

# REST API

Trex exposes a PostgREST-compatible REST data API over your Postgres schemas.
It is a from-scratch TypeScript/Deno reimplementation of PostgREST (tracking
the v12.2.3 feature set), served **in-process** by the `@trex/postgrest`
plugin — no separate PostgREST container.

This is the primary data-plane API: every table, view, and function in an
exposed schema becomes an HTTP endpoint. The `@supabase/supabase-js` client
(`.from(...)`, `.rpc(...)`) works against it unmodified.

## Endpoint

```
${BASE_PATH}/rest/v1/*
```

With the default `BASE_PATH=/trex`, that's `/trex/rest/v1/*`. The core server
rewrites this to the plugin's internal mount and streams the response back
(CSV and binary bodies are preserved). If the plugin isn't loaded the route
returns `503`.

## Authentication

Requests authenticate with a JWT, same as the rest of the platform
(see [APIs → Auth](auth)):

```
Authorization: Bearer <jwt>
```

`supabase-js` sends both an `apikey` header and an `Authorization` header; when
`Authorization` is absent, Trex promotes the `apikey` value to the Bearer token
(anon and service keys are themselves JWTs, so they verify the same way).

The role model mirrors PostgREST:

- No token → the request runs as the anonymous role (`PGRST_DB_ANON_ROLE`,
  default `anon`). If no anon role is configured, the request is rejected.
- A token's role comes from the `role` claim (`PGRST_JWT_ROLE_CLAIM_KEY`). A
  non-anon role marks the request authenticated.
- The connection pool connects as the `authenticator` role and impersonates the
  request role per transaction (`SET LOCAL role`), so your row-level security
  policies apply. The full JWT claims are available in-SQL as
  `request.jwt.claims`.

## Supported operations

| Method | Path | Description |
|--------|------|-------------|
| GET / HEAD | `/rest/v1/:table` | Read rows from a table or view. |
| POST | `/rest/v1/:table` | Insert (or upsert with `Prefer: resolution=merge-duplicates`). |
| PATCH | `/rest/v1/:table` | Update rows matching the filter. |
| PUT | `/rest/v1/:table` | Upsert a single row by primary key. |
| DELETE | `/rest/v1/:table` | Delete rows matching the filter. |
| GET / HEAD / POST | `/rest/v1/rpc/:fn` | Call a stored function. |
| GET / HEAD | `/rest/v1/` | Generated OpenAPI spec for the exposed schema. |
| OPTIONS | any | Allow-header info; CORS preflight. |

### Query features

- **Filtering**: `eq, neq, gt, gte, lt, lte, like, ilike, match, imatch, in, is,
  isdistinct, cs, cd, ov, sl, sr, nxr, nxl, adj`, plus full-text search
  (`fts, plfts, phfts, wfts`), `any`/`all` quantifiers, and `and`/`or`/`not`
  logic trees.
- **Column projection & embedding**: `select=id,name,related(...)` with resource
  embedding across foreign keys (join hints and join types supported).
- **Ordering**: `order=col.desc.nullslast`.
- **Pagination**: `limit`/`offset` query params or an HTTP `Range` header;
  responses carry `Content-Range`. Cap results with `PGRST_DB_MAX_ROWS`.
- **`Prefer` header**: `return=representation`, `resolution=merge-duplicates`,
  `count=exact`, `missing=default`, `handling=`, `timezone=`, and more.
- **Media types**: JSON, CSV, and binary output via content negotiation.

:::note Off by default
Aggregate functions (`PGRST_DB_AGGREGATES_ENABLED`) and `EXPLAIN` plan output
(`PGRST_DB_PLAN_ENABLED`) are disabled by default. `/rpc/:fn` accepts only
GET, HEAD, and POST. Features newer than PostgREST v12.2.3 are not present.
:::

## Examples

```bash
# Filter + embed + order + paginate
curl "https://<host>/trex/rest/v1/projects?select=id,name,tasks(id,done)&done=eq.true&order=name.asc&limit=20" \
  -H "apikey: <ANON_JWT>"

# Insert and return the created row
curl -X POST "https://<host>/trex/rest/v1/projects" \
  -H "apikey: <SERVICE_JWT>" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"name":"New"}'

# Upsert (merge on conflict)
curl -X POST "https://<host>/trex/rest/v1/projects?on_conflict=id" \
  -H "apikey: <SERVICE_JWT>" \
  -H "Prefer: resolution=merge-duplicates" \
  -H "Content-Type: application/json" \
  -d '{"id":1,"name":"Up"}'

# Call a stored function
curl -X POST "https://<host>/trex/rest/v1/rpc/my_function" \
  -H "apikey: <ANON_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"arg":"value"}'
```

With `supabase-js`, point the client at `https://<host>/trex` and use the query
builder as usual:

```js
const { data } = await supabase
  .from("projects")
  .select("id,name,tasks(id,done)")
  .eq("done", true)
  .order("name")
  .limit(20);
```

## Configuration

The REST API reads its configuration from `PGRST_*` environment variables (and
from `trexdb.setting` rows that override them). The most common:

| Variable | Default | Description |
|----------|---------|-------------|
| `PGRST_DB_URI` | (required) | Postgres connection string. |
| `PGRST_DB_SCHEMAS` | `public` | Comma-separated exposed schemas; the first is the default. |
| `PGRST_DB_ANON_ROLE` | `anon` | Role for unauthenticated requests. |
| `PGRST_JWT_SECRET` | — | JWT secret / JWK / JWKS for verification. |
| `PGRST_JWT_ROLE_CLAIM_KEY` | `.role` | JSPath to the role claim. |
| `PGRST_DB_MAX_ROWS` | — | Max rows per response. |
| `PGRST_DB_PRE_REQUEST` | `public.postgrest_pre_request` | Pre-request hook function. |
| `PGRST_DB_POOL` | `10` | Postgres pool size. |
| `PGRST_DB_AGGREGATES_ENABLED` | `false` | Enable aggregate functions. |

See [Deployment → Environment](../deployment/environment) for the full list.

## Next steps

- [APIs → Auth](auth) — the JWT and role model RLS runs on.
- [APIs → Realtime](realtime) — subscribe to changes on the same tables.
- [APIs → pg-meta](pg-meta) — inspect and manage the schema behind this API.
