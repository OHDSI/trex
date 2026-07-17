---
description: Use when a teammate asks for a live demo, preview, or test environment of a d2e PR or branch — spins up the full d2e stack in CI and exposes it through a temporary public tunnel URL.
---

# Deploy a d2e demo tunnel

Data2Evidence (`OHDSI/d2e`) has a workflow that starts the full stack with demo
data (setupdemo incl. DQD, checkflow) on a CI runner and exposes the portal
through a Cloudflare quick tunnel. It is triggered ONLY via
`repository_dispatch` with `event_type: demosetup-tunnel`; the dispatching
token needs `contents: write` on `OHDSI/d2e`.

## Preconditions

1. **Pick the image tag (`version`).**
   - PR that touched `services/**` or `plugins/**`: use the PR's CI images,
     tagged `pr-<PR#>-<sha7>` where `<sha7>` is the FIRST 7 CHARACTERS of the
     PR head commit sha (e.g. `pr-2909-4f4d418`). Do not use
     `git rev-parse --short` from a clone — it can emit more digits. These
     tags exist only if the PR's "d2e Docker Build" workflow succeeded, and
     are deleted ~24h after the last build by a nightly sweep — a new push to
     the PR recreates them. Verify before dispatching:
     `gh api /orgs/ohdsi/packages/container/d2e-trex/versions?per_page=100 --jq '.[].metadata.container.tags[]' | grep <tag>`
   - Anything else (or tag already swept): use `develop`.
2. **Dispatch only after the PR's "d2e Docker Build" run has succeeded** —
   the tunnel run pulls those images and fails otherwise.

## Trigger

```bash
gh api repos/OHDSI/d2e/dispatches -f event_type=demosetup-tunnel \
  -F 'client_payload[ref]=<branch>' \
  -F 'client_payload[version]=<tag>' \
  -F 'client_payload[duration_minutes]=120'
```

All payload fields are optional: `ref` defaults to the default branch,
`version` to `develop`, `duration_minutes` to 120. `ref` only selects the
compose/config checkout — the code under test comes from the images.

## Result

Setup takes ~30–50 minutes, then the environment stays up for
`duration_minutes`. Find the run and the tunnel URL:

```bash
gh run list --repo OHDSI/d2e --workflow=d2e-demosetup-tunnel.yml --limit 1
gh run view <run-id> --repo OHDSI/d2e --log 2>/dev/null | grep -m1 -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

Post back to the channel: portal at `<tunnel-url>/d2e/portal`, login `admin` /
`Updatepassword12345`, plus when it expires. Warn that the instance is public
(unguessable URL, well-known demo credentials) — demo data only. Cancelling
the workflow run tears the environment down early.
