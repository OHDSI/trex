---
name: deploying-d2e-branch
description: Use when a d2e branch needs a live shareable demo environment — after a PR is open and its images have built, dispatch the demosetup-tunnel workflow to stand up a full d2e stack behind a public Cloudflare tunnel URL that reviewers can click.
---

# Deploying a d2e branch to a live demo environment

Stands up a **full d2e stack on a GitHub runner** and exposes it on a public
`https://<random>.trycloudflare.com` URL, so reviewers can click a link instead of
checking the branch out. Workflow: `.github/workflows/d2e-demosetup-tunnel.yml`
(repo `OHDSI/Data2Evidence`), triggered by **`repository_dispatch`**, event type
`demosetup-tunnel`.

## The hard prerequisite: images must exist first

The workflow does **not** build anything — it pulls pre-built images by tag. So you can
only deploy a branch whose **Docker Build** has already finished and pushed.

- **Draft PRs never build.** `docker-build-push.yaml`'s setup job is gated on
  `!github.event.pull_request.draft`. A draft PR produces no images and therefore cannot
  be deployed. Mark the PR **ready for review** first.
- The tag is `pr-<PR number>-<short sha>` for PR builds (`develop-<sha>` with a moving
  `develop` alias for develop pushes). Take the sha from the **head commit the build
  ran on**, not necessarily the branch tip.
- Builds take roughly **1–1.5 hours**. Plan around it — see "Handling the wait".

Confirm the tag exists before dispatching; the whole run fails late on a pull error:
```
docker manifest inspect ghcr.io/ohdsi/d2e-trex:<tag> >/dev/null && echo OK
```

## Dispatch

`repository_dispatch` always runs the workflow file **as it exists on the default
branch** (`develop`) — a change to the workflow on your own branch has no effect until
merged.

```bash
echo '{"event_type":"demosetup-tunnel","client_payload":{
        "version":"pr-1234-abc1234",
        "ref":"p-hoffmann/my-branch",
        "duration_minutes":"120"}}' \
  | gh api repos/OHDSI/Data2Evidence/dispatches --input -
```
- `version` — the **image tag** to pull (default `develop`). This is what actually
  determines the code that runs.
- `ref` — the git ref to **check out** for compose files, plugins and CLI scripts
  (default: the dispatching ref). Set both, and keep them consistent: `version` picks the
  images, `ref` picks the orchestration around them.
- `duration_minutes` — how long the tunnel stays open after setup (default `120`).
  The job's own cap is 330 minutes.

`repository_dispatch` returns **204 with no body** and no run ID. Find the run after:
```bash
gh run list --repo OHDSI/Data2Evidence --workflow d2e-demosetup-tunnel.yml --limit 1 \
  --json databaseId,status,url
```

## Getting the URL out

The tunnel URL is **not** a workflow output or artifact — it is written only to the job's
**step summary** and its logs:
```bash
gh run view <run-id> --repo OHDSI/Data2Evidence --log \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1
```

**Verified limitation: `gh run view --log` returns nothing while the run is
in-progress.** It only yields logs once the job has finished — by which point the tunnel
has already been torn down. So this command **cannot** give you the URL during the window
it is valid for. Practical consequences:
- Read the URL from the **job's live log view in the browser** (the "Start Cloudflare
  quick tunnel" step) or the run's step summary page, and post it from there.
- Automating "wait, then fetch the URL, then verify" against `--log` **does not work**.
  Don't build a watcher on it, as it will silently only ever fire after teardown.
- A **job output does not help either** — like `--log`, outputs are only readable once
  the job completes. The only thing retrievable mid-run is an **artifact**, which becomes
  downloadable as soon as its upload step finishes.
  *Pending:* Data2Evidence PR **#2915** adds exactly that — a `tunnel-url` artifact
  published right after the tunnel starts, and a `tunnel-ready` artifact published once
  the environment is actually usable. Once it is **merged to `develop`** (the workflow
  runs from the default branch, so a branch copy has no effect), the reliable automation
  becomes: poll for the `tunnel-ready` artifact, then
  `gh run download <run-id> -n tunnel-url`, then curl the public URL.

The URL is printed at **"Start Cloudflare quick tunnel"** — early, long before the
environment is usable. The environment is only ready once **"Publish access details"**
has run and **"Keep tunnel open"** is the in-progress step. Posting the URL earlier hands
people a link that 502s.

Access: portal at `<tunnel>/d2e/portal`, login `admin` / `Updatepassword12345`.

## Handling the wait (the part that actually needs a plan)

End to end is **~1.5–2.5 h**: image build ~1–1.5 h, then setup ~40–60 min before the
tunnel window opens. Do not block on it and do not poll in a tight loop.

1. **Don't dispatch until the images are ready.** Watch the build, not the clock:
   ```bash
   gh run list --repo OHDSI/Data2Evidence --workflow "d2e Docker Build" \
     --branch <branch> --limit 1 --json status,conclusion,headSha
   ```
2. **Then dispatch and hand off to a background watcher** that polls at a ~60 s cadence
   and exits when it has something worth reporting — rather than parking the whole
   session on it. Two useful exit conditions: the run reaches a terminal state, or
   "Keep tunnel open" goes in-progress (the point at which the URL is real).
3. **Verify before you share.** `curl -s -o /dev/null -w '%{http_code}' <tunnel>/d2e/portal`
   — expect `200`/`302`. The workflow's own "Verify app is reachable" step runs with
   `--resolve` against localhost, so it can pass while the *public* tunnel is broken.
4. **Report intermediate progress.** A 2-hour silence reads as a hang. Post the run URL
   as soon as you dispatch so people can watch it themselves.
5. **The environment is ephemeral.** It dies when `duration_minutes` elapses; cancelling
   the run tears it down early. Say when it expires whenever you share the link, and use
   a short `duration_minutes` for a smoke test so a runner isn't held for hours.

## What a real run looks like (measured)

Dispatched `version=develop`, `duration_minutes=20` — run `29682644967`, **all 26 steps
succeeded**:
- Total ~40 min: **~18 min setup** (checkout → npm install → pulls → start → setupdemo →
  checkflow → restart → webapi-init), then the 20 min tunnel window, then teardown.
- `d2e-trex health: healthy`; `Setupdemo` and `Checkflow` both passed first attempt.
- `Verify app is reachable` → **`301` local and `301` via the tunnel host** (a portal
  redirect — the healthy answer, not an error).
- The tunnel stayed up the full window (no `cloudflared exited early` warning).

So budget **~20 min of setup** on top of the image build, not the 40–60 min you might
assume — the run above was warm-cache-free and still took 18.

**Not proven by that run:** whether the URL was reachable *from the public internet*. The
workflow's `Verify app is reachable` step curls with `--resolve "$TUNNEL_HOST:443:127.0.0.1"`,
i.e. it bypasses Cloudflare and hits localhost — so a `301` there is consistent with a
completely broken public tunnel. **Always curl the public URL yourself, from outside the
runner, before sharing it with anyone.**

## Failure modes worth knowing

- `concurrency: group: ${{ github.workflow }}` with **`cancel-in-progress: false`** — one
  deploy at a time, repo-wide. A second dispatch **queues** behind the first for its full
  duration rather than starting. Check for a running deploy before dispatching.
- Most steps carry `if: success() || failure()`, so the job **keeps going after a failing
  step** and can still publish a URL for a partly-broken stack. A green-ish run is not
  proof; check `setupdemo` / `checkflow` / "Wait for d2e-trex healthy" individually.
- `setupdemo` retries up to 3× and `start` 2× — a run that looks stalled may be
  mid-retry, not hung.
- If image tags were pruned or a promote job deleted the manifest, the pull fails; verify
  the tag before dispatching rather than after 40 minutes.
