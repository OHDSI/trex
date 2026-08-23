---
name: writing-atlas3-plugins
description: Use when building, scaffolding or changing an Atlas3 / OHDSI ATLAS v3 plugin — "build an atlas plugin that…", "add a plugin to atlas", a new Atlas panel/tab/FAB/menu entry, or an Atlas plugin that has to match a Figma design. Not for Data2Evidence portal apps.
---

# Writing Atlas3 plugins

An Atlas3 plugin is a **single-spa parcel** built in **`system` module format**,
dropped into the host's `public/plugins/<id>/` and declared in a JSON manifest.
`/home/ph/code/Atlas3/docs/plugin-development-with-atlas-ui.md` is the reference
for the contract, `PluginProps`, the `Atlas*` component library and theming —
**read it before implementing**. This skill is the operational wrapper: how to
scaffold, name, build, register and verify. Run the app with
**`testing-atlas3-locally`**.

## Workflow

1. **Design first, if there is one.** A Figma link (or "match this design") →
   use **`pulling-figma-mockups`** BEFORE writing any component, then implement
   against the `.spec.json` (see *Figma → Atlas tokens* below).
2. **Locate Atlas3.** `/home/ph/code/Atlas3` locally, otherwise clone
   `OHDSI/Atlas3`. Work *inside* it, under `plugins-dev/` — the reference
   plugin's `@ohdsi/atlas-ui` and `outDir` paths are relative to that location.
3. **Scaffold by copying**, never from scratch:
   `cp -r plugins-dev/hello-world-plugin plugins-dev/<plugin-id>`, then delete
   its `package-lock.json`. You get a complete working parcel: `package.json`,
   `vite.config.mjs`, `tsconfig.json`, `tsconfig.node.json`, `src/main.ts`,
   `src/App.vue`.
4. **Rename the id consistently** (table below). A mismatch fails silently —
   the app boots, the plugin just never appears.
5. **Build the component library once**, from the Atlas3 root:
   `npm run lib:build`. `@ohdsi/atlas-ui`'s `exports` point at the gitignored
   `packages/atlas-ui/dist/`, absent in a fresh checkout; without it the plugin
   build dies on *Failed to resolve entry for package @ohdsi/atlas-ui*.
6. **Implement.** Leave `main.ts` alone (lifecycles + `buildVuetifyOptions()`);
   put your UI in `App.vue` and components beside it.
7. **Build:** `cd plugins-dev/<plugin-id> && npm install && npm run build`
   → `public/plugins/<plugin-id>/index.system.js`.
8. **Register** (below), then verify with **`testing-atlas3-locally`**.

## The id appears in five places — all must agree

| Where | Value |
|---|---|
| `plugins-dev/<plugin-id>/` | the directory you copied into |
| `package.json` → `name` | `<plugin-id>` (cosmetic, keep it consistent) |
| `vite.config.mjs` → `build.outDir` | `../../public/plugins/<plugin-id>` |
| manifest → `plugins[].id` | `<plugin-id>` — must match `/^[a-z0-9-_]+$/` |
| manifest → `entryPoint` | `<plugin-id>/index.system.js` |

`entryPoint` is resolved as `<BASE_URL>/plugins/<entryPoint>`, so it is relative
to `public/plugins/`. `fileName: 'index'` + `formats: ['system']` is what
produces `index.system.js` — leave both alone.

## Registration

The manifest the running app fetches is **`public/config/plugins.json`**
(`PluginConfigService` requests `<BASE_URL>/config/plugins.json`).
`src/config/plugins.json` is a committed duplicate — edit both, keep them
identical. `src/config/plugins.example.json` documents the `settings` block.

Add one object to `plugins[]` with `id`, `name`, `version`, `entryPoint`,
`menuItems` (required, may be `[]`), and optionally `mountPoints`, `fabMounts`,
`metadata`. It is zod-validated (`src/models/PluginModels.ts`) — a failing
entry rejects the whole manifest, so match these rules:

- **`menuItems[].route` must start with `/plugins/<plugin-id>/`**
  (`validatePluginRoute`); routes are hash-based, so the URL is
  `#/plugins/<plugin-id>/…`.
- **`mountPoints[].surface`** ∈ `datasource-sidebar`, `analysis-tabs`,
  `admin-tabs`, `account-menu`. `main-nav` is in the surface enum but a
  `.refine` **rejects it for mountPoints** — contribute top-level navigation via
  `menuItems` instead.
- `mountPoints[].id` must match `/^[a-z0-9-_]+$/`; `mountPoints[].path` must be
  relative — no leading `/`, no `..`, no URL scheme.
- `fabMounts[]` needs `id`, `label`, `icon` (mdi name); `position` ∈
  `bottom-right` | `bottom-left` | `top-right` | `top-left`.

Copy the `hello-world-plugin` entry already in the manifest as a template.

## Figma → Atlas tokens

`pulling-figma-mockups` gives you `figma/<frame>.png` (look at it for layout)
and `figma/<frame>.spec.json` (exact hex, font, spacing, radii). Atlas plugins
must **not** hardcode those hex values — that breaks dark mode, because
`buildVuetifyOptions()` ships light *and* dark palettes behind the same tokens.
Map by **role**, not by nearest hex:

| Figma role in the spec | Use |
|---|---|
| brand / CTA / accent fill | `rgb(var(--v-theme-primary))` |
| page or card background | `rgb(var(--v-theme-surface))`, `--v-theme-background` |
| body text | `rgb(var(--v-theme-on-surface))` |
| secondary / muted text | `rgb(var(--v-theme-on-surface-variant))` |
| borders, dividers | `var(--atlas-color-outline)` |
| error / success / warning / info | `--v-theme-error` \| `-success` \| `-warning` \| `-info` |
| padding, gaps | nearest `--atlas-spacing-xs\|sm\|md\|lg\|xl` |
| corner radius | nearest `--atlas-radius-sm\|md\|lg\|xl` |

Take **literally** from the spec: layout, widths, element order, font
size/weight, icon choice. Take **by role** from the table: every color.

A genuine mismatch — a color carrying meaning no Atlas role covers — is a
question, not a licence to paste the hex. In the devx UI, ask. **In a chat
channel there is no ask tool**: pick the nearest token, ship it, and say in your
reply which Figma color you re-mapped and why. Never silently hardcode.

## Channel-mode defaults (no ask tool)

Driven from a chat channel you cannot block on a question. Choose and state:

- Several plausible Figma frames → take the one whose name best matches the
  request; name it in your reply.
- No mount surface given → a `menuItems` entry with route
  `/plugins/<plugin-id>/` (top-level nav, the only way to reach `main-nav`).
- No id given → kebab-case it from the request, e.g. "cohort heatmap" →
  `cohort-heatmap-plugin`.

## Gotchas

- `public/plugins/` is **gitignored** — commit the `plugins-dev/` source and the
  manifest entry, never the built bundle.
- Never call `createVuetify()` with your own colors or ship a second theme.
  `buildVuetifyOptions()` with no argument is the correct call.
- `single-spa-vue` also exposes `update`; export it like the reference plugin
  does if the host may re-render your parcel with new props.
