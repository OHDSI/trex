---
name: screenshotting-mockups
description: Use to turn feature mockups (prototypes/<screen>/index.html, written by the brainstorming skill's visual companion) into PNG screenshots — e.g. when the mockups must travel outside the Preview panel (claw posts them to Discord). Playwright over file://, no dev server, no build, no login.
---

# Screenshotting mockups

Mockups written by the brainstorming skill's visual companion
(`visual-companion.md`) live at `prototypes/<screen-name>/index.html` in the
app workspace, one screen per design question. Inside devx they preview via the
Preview panel's **Prototypes** dropdown — but that panel is only visible to the
devx user. When the mockups need to reach anyone else (a Discord channel via
claw's `postScreenshots`, a PR, a report), capture them as PNGs with this skill.

If the mockups don't exist yet, create them first per the brainstorming skill
(one self-contained screen per option/question) — this skill only captures.

## Why this is the easy case

Each prototype is a **self-contained static HTML document** (the frame template
inlines all CSS/JS). So unlike `testing-d2e-ui` there is no build, no served
route, no Logto login, no TCP proxy — Playwright navigates the file directly:

```
file://<workspace>/prototypes/<screen-name>/index.html
```

## Capture

Same Playwright conventions as `testing-d2e-ui`: playwright resolves from
`/usr/src/node_modules` (run the script from `/usr/src`), chromium at
`/usr/lib/playwright-browsers/chromium-1217/chrome-linux64/chrome`, and
`args: ["--no-sandbox"]`.

```js
// run from /usr/src:  node shoot-mockups.mjs <workspace-abs-path>
import { chromium } from "playwright";
import { readdirSync, mkdirSync } from "node:fs";

const ws = process.argv[2];
const browser = await chromium.launch({
  executablePath: "/usr/lib/playwright-browsers/chromium-1217/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
// The frame template themes via prefers-color-scheme — pin one scheme so a
// batch of shots is uniform (light reads best inline in Discord).
const page = await browser.newPage({ colorScheme: "light", viewport: { width: 1280, height: 800 } });
mkdirSync(`${ws}/trex/screenshots`, { recursive: true });
for (const screen of readdirSync(`${ws}/prototypes`)) {
  await page.goto(`file://${ws}/prototypes/${screen}/index.html`);
  await page.screenshot({ path: `${ws}/trex/screenshots/mockup-${screen}.png`, fullPage: true });
}
await browser.close();
```

- Save into **`trex/screenshots/`**, named `mockup-<screen-name>.png` — that is
  the workspace-relative location claw's `postScreenshots` reads from.
- `fullPage: true` — option grids are usually taller than one viewport.
- Capture only the screens relevant to the current question, not every
  historical `-v2`/`-v3` iteration, unless asked for a before/after.

## Report

End your reply with the screen names and their workspace-relative paths, e.g.

```
mockups: sidebar-layout -> trex/screenshots/mockup-sidebar-layout.png
         toolbar-layout -> trex/screenshots/mockup-toolbar-layout.png
```

so the caller (claw, or a human) can relay them without guessing paths. The
PNGs and `prototypes/` are design artifacts, not implementation — keep them out
of feature commits (`.gitignore` them if the repo doesn't already).
