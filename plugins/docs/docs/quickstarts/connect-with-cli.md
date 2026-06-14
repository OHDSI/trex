---
sidebar_position: 4
---

# Connect with the CLI

This walkthrough installs the `trex` CLI, authenticates against a running Trex
deployment, and deploys a function. It assumes [Quickstart: Deploy](deploy) is
running.

## 1. Install the CLI

```bash
npm install -g trex
trex --version
```

The postinstall script downloads a platform-specific binary from the matching
GitHub release. Alternatively, build from source. The CLI lives in a git
submodule, so initialize it first:

```bash
git submodule update --init plugins/cli
cd plugins/cli
go build -o trex
./trex --version
```

The Trex CLI is a fork of the Supabase CLI, so the upstream `supabase` binary
also works against a Trex server. See [CLI](../cli) for the compatibility
matrix.

## 2. Login

The CLI authenticates with a personal access token issued through an
ECDH-sealed device-code flow:

```bash
trex login --use-api http://localhost:8001
```

This opens your browser to the Trex admin UI. Approve the request — the
browser POSTs to `/api/cli/sessions`, the server seals an `sbp_…` token with
the CLI's public key, and the CLI fetches and decrypts it from
`/platform/cli/login/:session_id`.

The token is stored in `~/.config/trex/access-token` (or the upstream Supabase
location if you're using the Supabase CLI).

For non-interactive setups:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...   # generate via web UI → API Keys
```

## 3. Link a project

Trex exposes a synthetic project (`ref = trexsqldefaultlocall`):

```bash
trex link --project-ref trexsqldefaultlocall \
          --use-api http://localhost:8001
```

This populates `supabase/config.toml` with the Trex endpoint URLs and pulls
down the current auth / database / storage / PostgREST configuration.

The directory is named `supabase/` (not `trex/`) so the upstream Supabase CLI
can operate on the same project without re-running `init` — see [CLI →
Compatibility Notes](../cli#compatibility-notes).

## 4. Deploy a function

Create a function locally:

```bash
trex functions new hello-world
# Creates supabase/functions/hello-world/index.ts
```

Edit `supabase/functions/hello-world/index.ts`:

```typescript
Deno.serve(async (_req) => {
  return Response.json({ message: "Hello from the CLI!" });
});
```

Deploy it:

```bash
trex functions deploy hello-world
```

The CLI bundles the function with esbuild + ESZIP, streams the bundle to
`POST /v1/projects/.../functions?slug=hello-world`, and the server stores it
at `FUNCTIONS_DIR/hello-world/esbuild.esz`. See
[APIs → Edge Functions](../apis/functions) for the management API surface.

Invoke it:

```bash
trex functions invoke hello-world
# {"message":"Hello from the CLI!"}
```

Or directly:

```bash
curl http://localhost:8001/trex/functions/v1/hello-world
```

## 5. Manage secrets

Function workers receive every entry in `trexdb.secret` as an env var. Set
them with the CLI:

```bash
trex secrets set SLACK_TOKEN=xoxb-… STRIPE_KEY=sk_test_…
trex secrets list   # name + hash, no plaintext
```

Update the function to read the secret:

```typescript
Deno.serve((_req) => {
  const slack = Deno.env.get("SLACK_TOKEN");
  return Response.json({ hasSlackToken: Boolean(slack) });
});
```

Re-deploy:

```bash
trex functions deploy hello-world
```

The secret cache invalidates on every `secrets set` / `secrets unset`, so the
new value is picked up within ~30 seconds.

## 6. Generate TypeScript types

The CLI can introspect Postgres and emit a typed `Database` for use in
clients:

```bash
trex gen types typescript --schema public,trex > database.types.ts
```

This calls `GET /v1/projects/.../types/typescript`, which inspects
`information_schema` and builds a Supabase-style type definition.

## What just happened

The CLI hit the Supabase-CLI-compatible management API surface that Trex
implements. Every command you ran maps to one of the routes documented under
[APIs → Edge Functions & Management API](../apis/functions). Internally the
server pulled metadata from the Postgres metadata DB, dispatched function
deployments to disk, and routed type-generation through `information_schema`
queries.

## Next steps

- **All commands**: [CLI](../cli).
- **Edge function reference**: [APIs → Edge Functions](../apis/functions).
- **Auth context inside a function**: [Concepts → Auth Model](../concepts/auth-model).
- **Bundle locally**: `trex functions deploy --no-verify-jwt` skips JWT checks
  for development.
