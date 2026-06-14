---
sidebar_position: 6
---

# Postgres Metadata API

The `@trex/pg-meta` plugin is a fork of [postgres-meta](https://github.com/supabase/postgres-meta)
that exposes Postgres catalog introspection as a REST API. The core server
proxies `${BASE_PATH}/pg/v1/*` to the worker, rewriting paths to
`/pg-meta-api/*` before the worker sees them.

This API powers the admin UI's table editor, schema browser, and the
`supabase gen types` command.

## Endpoint

```
${BASE_PATH}/pg/v1/*
```

With the default `BASE_PATH=/trex`, that's `/trex/pg/v1/*`.

## Authentication

Every request requires admin auth — a JWT with `trex_role = "admin"` or an
admin API key:

```
Authorization: Bearer <jwt-or-api-key>
```

## Resources

Each resource is a thin REST surface over a Postgres catalog concept. Most
resources support the same five-method shape (`list`, `retrieve`, `create`,
`update`, `delete`); some are read-only.

| Resource | Path prefix | Read-only? |
|----------|-------------|------------|
| Schemas | `/schemas` | no |
| Tables | `/tables` | no |
| Views | `/views` | yes |
| Materialized views | `/materialized-views` | yes |
| Foreign tables | `/foreign-tables` | yes |
| Columns | `/columns` | no |
| Indexes | `/indexes` | yes |
| Functions | `/functions` | no |
| Triggers | `/triggers` | no |
| Types | `/types` | no |
| Roles | `/roles` | no |
| Policies | `/policies` | no (RLS) |
| Publications | `/publications` | no |
| Extensions | `/extensions` | no |
| Table privileges | `/table-privileges` | no |
| Column privileges | `/column-privileges` | no |
| Config | `/config` | partial (read + reset) |

### Common patterns

**List**: `GET /<resource>?included_schemas=public,trexdb&excluded_schemas=…&limit=…`

```bash
curl -H "Authorization: Bearer trex_…" \
  'http://localhost:8001/trex/pg/v1/tables?included_schemas=public&limit=20'
```

**Retrieve**: `GET /<resource>/:id`

**Create**: `POST /<resource>` with a JSON body shaped like the catalog row.

**Update**: `PATCH /<resource>/:id` with the fields to change.

**Delete**: `DELETE /<resource>/:id?cascade=true`

## Direct query

```
POST /query
```

Body: `{ "query": "SELECT ..." }`. Runs an arbitrary SQL statement against
the Postgres metadata DB and returns the rows. **Admin-only**, intended for
the admin UI's SQL editor.

```bash
curl -X POST -H "Authorization: Bearer trex_…" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT current_database()"}' \
  http://localhost:8001/trex/pg/v1/query
```

## Type generation

The CLI's `gen types typescript` command does *not* hit `/pg/v1` — it uses
the management API at `/v1/projects/.../types/typescript` (see
[APIs → Edge Functions](functions)). That endpoint reads `information_schema`
directly with the same engine connection and emits a Supabase-style
`Database` type. Use `/pg/v1/query` if you need raw flexibility.

## Schema scope

By default, every list endpoint accepts `included_schemas` /
`excluded_schemas` query parameters. Without them, postgres-meta uses its
internal default (excludes Postgres system schemas).

Trex's auth schema (`trexdb`) and the auth-router internals (`auth.*`,
`storage.*`) are visible through these endpoints to admin users — be careful
when sharing API key tokens, the catalog browser surface is broad.

## Compatibility

The wire surface is upstream-compatible with `postgres-meta`. The
postgres-meta JS client (`@supabase/postgres-meta`) works against a Trex
deployment.

## Source

The fork lives at `plugins/pg-meta/postgres-meta` (a git submodule of
[`p-hoffmann/postgres-meta`](https://github.com/p-hoffmann/postgres-meta)).

## Next steps

- [APIs → GraphQL](graphql) — for typed access to the same catalog via
  PostGraphile.
- [APIs → REST](functions#management-api-supabase-cli-compatible) — for the
  Supabase-CLI-compatible management surface (different shape, same data).
- [Concepts → Auth Model](../concepts/auth-model) — the auth model these
  endpoints sit behind.
