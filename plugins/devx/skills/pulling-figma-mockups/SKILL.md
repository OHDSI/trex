---
name: pulling-figma-mockups
description: Use when the user pastes a Figma link or asks to implement/match a Figma design — pulls the relevant frames into the workspace as PNG mockups plus a design-spec JSON (exact colors, fonts, spacing) via the Figma REST API.
---

# Pulling Figma mockups

Turns Figma frames into local artifacts you can actually look at and implement
against: `figma/<frame>-<id>.png` (2x render) and `figma/<frame>-<id>.spec.json`
(distilled colors/fonts/spacing). Requires a connected Figma personal access
token (Settings → Figma); the tools tell you when it's missing — relay that to
the user, don't improvise auth.

## Workflow

1. **Find the frames.** If the pasted URL has `?node-id=…` it already points at
   a frame — skip to step 2. Otherwise run `FigmaListFrames` with the URL and
   pick the frames matching the request. Ambiguous (several plausible frames)?
   Ask the user which ones, don't pull the whole file.
2. **Pull.** `FigmaPullMockups` with the URL and the chosen `nodeIds`.
3. **Look, then implement.** Read the PNGs (they render visually) for layout
   and appearance; take exact values — hex colors, font family/size/weight,
   padding, gaps, corner radii — from the `.spec.json`, not from eyeballing
   the image.
4. **Keep it out of commits.** `figma/` is a design artifact like
   `prototypes/` — add it to `.gitignore` if it isn't there yet; never include
   it in feature commits.

## Without the Figma tools (Claude Code / plain shell)

The same two calls work with `curl` when a `FIGMA_TOKEN` env var is present
(the deployment injects it once Figma is connected):

```bash
# list pages + frames
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/files/<FILE_KEY>?depth=2"

# render frames to PNG urls (node ids like 12:345; URL form 12-345 → 12:345)
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/images/<FILE_KEY>?ids=12:345&format=png&scale=2"
# → download each images[id] URL into figma/<name>.png

# exact design values for the same nodes
curl -s -H "X-Figma-Token: $FIGMA_TOKEN" \
  "https://api.figma.com/v1/nodes/<FILE_KEY>?ids=12:345"
```

The file key is the segment after `figma.com/design/` (or `/file/`). A 403
means the token is missing/revoked — tell the user to reconnect in Settings →
Figma.
