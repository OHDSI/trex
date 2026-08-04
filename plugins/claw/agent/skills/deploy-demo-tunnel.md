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
   the tunnel run pulls those images and fails otherwise. Cheap precheck:
   `docker manifest inspect ghcr.io/ohdsi/d2e-trex:<tag> >/dev/null && echo OK`
   (fails in seconds instead of ~20 minutes into the run).
3. **A DRAFT PR cannot be deployed at all.** `docker-build-push.yaml`'s setup job is
   gated on `!github.event.pull_request.draft`, so a draft PR builds **no images** and
   there is no tag to deploy. Mark it ready for review first — and say so in the channel
   rather than silently failing. Builds then take ~1–1.5 h.
4. **Only one deploy runs at a time.** The workflow's `concurrency` group is repo-wide
   with `cancel-in-progress: false`, so a second dispatch **queues** behind the first for
   its full duration instead of starting. Check for a running deploy first:
   `gh run list --repo OHDSI/Data2Evidence --workflow d2e-demosetup-tunnel.yml --limit 3`
5. `repository_dispatch` always runs the workflow file **as it exists on the default
   branch** (`develop`). Editing the workflow on a branch has no effect until merged.

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

## Getting the URL — use the artifacts, not the log

**`gh run view --log` returns nothing while the run is in-progress**, and job outputs are
likewise only readable once the job finishes — by which point the tunnel is torn down.
Anything built on either silently only ever fires after teardown. Use the **artifacts**
(they are downloadable as soon as their upload step completes):

```bash
RUN=$(gh run list --repo OHDSI/Data2Evidence --workflow d2e-demosetup-tunnel.yml \
        --limit 1 --json databaseId --jq '.[0].databaseId')

# URL artifact — available ~2 min in, long before anything serves.
gh run download "$RUN" --repo OHDSI/Data2Evidence -n tunnel-url -D ./art
URL=$(tr -d '\r\n' < ./art/tunnel-url.txt)

# Poll until the readiness artifact appears (~21 min in) — only THEN is it usable.
gh api repos/OHDSI/Data2Evidence/actions/runs/$RUN/artifacts \
  --jq '.artifacts[].name' | grep -qw tunnel-ready

curl -sL -o /dev/null -w '%{http_code}\n' "$URL/d2e/portal"   # expect 301 -> 200
```

**Measured** (run `29684827895`, `version=develop`): `tunnel-url` downloadable at
**+2 min**, but probing it then gave **HTTP 502** — routable, nothing behind it yet.
`tunnel-ready` appeared at **+21 min**, and the public URL answered **301 → 200** with
`<title>Data2Evidence</title>` first try. Total setup ~21 min, not the 30–50 previously
assumed. **Never post the URL when it first appears** — wait for `tunnel-ready`, or the
channel gets a link that 502s for twenty minutes.

**Verify the PUBLIC url yourself before posting it.** The workflow's own
`Verify app is reachable` step curls with `--resolve "$TUNNEL_HOST:443:127.0.0.1"`, which
bypasses Cloudflare and hits localhost, and it ends in `|| echo "App not reachable"` — so
it goes **green even when the public tunnel is broken**. Its tick is not evidence.

Most steps carry `if: success() || failure()`, so the job keeps going after a failing step
and can publish a URL for a partly-broken stack. If something looks off, check
`Setupdemo`, `Checkflow` and `Wait for d2e-trex healthy` individually rather than trusting
the overall green.

## Reporting back

Post to the channel: portal at `<tunnel-url>/d2e/portal`, login `admin` /
`Updatepassword12345`, and when it expires. Warn that the instance is public
(unguessable URL, well-known demo credentials) — demo data only. Cancelling the workflow
run tears the environment down early; use a short `duration_minutes` for a smoke test so
a runner is not held for hours.

**Don't block the channel for the ~1.5–2.5 h end to end.** Post the run link as soon as
you dispatch so people can watch it themselves, carry on with the conversation, and come
back with the URL once `tunnel-ready` lands. One interim note if it drags; if the deploy
fails, say so with the failing step rather than quietly dropping it.
