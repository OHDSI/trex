---
name: writing-atlas3-plugins
description: Use when building, scaffolding or changing an Atlas3 / OHDSI ATLAS v3 plugin — "build an atlas plugin that…", "add a plugin to atlas", a new Atlas panel/tab/FAB/menu entry, or an Atlas plugin that has to match a Figma design. Also use when you need an Atlas3 component's real props/events or the host plugin contract: the published package ships no source or types, so this skill covers checking out OHDSI/Atlas3, reading @ohdsi/atlas-ui's actual signatures, and building the UI from the Atlas* component library rather than hand-rolled markup. Not for Data2Evidence portal apps.
---

# Writing Atlas3 plugins

An Atlas3 plugin is a **single-spa parcel** built in **`system` module format**,
dropped into the host's `public/plugins/<id>/` and declared in a JSON manifest.
`docs/plugin-development-with-atlas-ui.md` **inside the Atlas3 checkout** is the
reference for the contract, `PluginProps`, the `Atlas*` component library and
theming — **read it before implementing**. This skill is the operational
wrapper: how to check out the source, find the real contracts, scaffold, name,
build, register and verify. Run the app with **`testing-atlas3-locally`**.

**You cannot do this job from `node_modules` alone.** The published
`@ohdsi/atlas3` package sets `"files": ["dist"]` and ships **no `.d.ts` and no
source** — just a built bundle. Every component signature, prop, event and type
below exists *only* in the Atlas3 git repository. Guessing a prop name because
it sounds right is the single most common way these plugins fail. Check the
source out (step 1) and read it.

## Workflow

1. **Check out Atlas3 — always, before anything else.** Clone it if it isn't
   already present, then work *inside* it under `plugins-dev/`: the reference
   plugin's `@ohdsi/atlas-ui` and `outDir` paths are relative to that location.

   ```bash
   ATLAS3_DIR="${ATLAS3_DIR:-$HOME/code/Atlas3}"
   [ -d "$ATLAS3_DIR/.git" ] || git clone git@github.com:OHDSI/Atlas3.git "$ATLAS3_DIR"
   git -C "$ATLAS3_DIR" fetch origin --quiet
   ```

   A pre-existing checkout may be stale or on someone's feature branch — check
   `git -C "$ATLAS3_DIR" log --oneline -1` and `git status` before trusting it;
   `git pull` on `develop` if it is behind. If the SSH remote is unavailable,
   fall back to `https://github.com/OHDSI/Atlas3.git`.
2. **Read the real contracts out of that checkout** before writing a component —
   see *Finding the exact contract in source* below. For worked examples beyond
   the hello-world starter, read the shipped plugins in `OHDSI/trex-notebook`
   (see *Reference implementations*).
3. **Design first, if there is one.** A Figma link (or "match this design") →
   use **`pulling-figma-mockups`** BEFORE writing any component, then implement
   against the `.spec.json` (see *Figma → Atlas tokens* below).
4. **Scaffold by copying**, never from scratch:
   `cp -r plugins-dev/hello-world-plugin plugins-dev/<plugin-id>`, then delete
   its `package-lock.json`. You get a complete working parcel: `package.json`,
   `vite.config.mjs`, `tsconfig.json`, `tsconfig.node.json`, `src/main.ts`,
   `src/App.vue`.
5. **Rename the id consistently** (table below). A mismatch fails silently —
   the app boots, the plugin just never appears.
6. **Build the component library once**, from the Atlas3 root:
   `npm run lib:build`. `@ohdsi/atlas-ui`'s `exports` point at the gitignored
   `packages/atlas-ui/dist/`, absent in a fresh checkout; without it the plugin
   build dies on *Failed to resolve entry for package @ohdsi/atlas-ui*.
7. **Implement out of `Atlas*` components** (see *Build the UI from the Atlas
   component library* — this is the rule, not a preference). Leave `main.ts`
   alone (lifecycles + `buildVuetifyOptions()`); put your UI in `App.vue` and
   components beside it.
8. **Build:** `cd plugins-dev/<plugin-id> && npm install && npm run build`
   → `public/plugins/<plugin-id>/index.system.js`.
9. **Register** (below), then verify with **`testing-atlas3-locally`**.

## Build the UI from the Atlas component library

**Every piece of UI you render must come from an `Atlas*` component when one
exists for the job.** The point of a plugin is that it is indistinguishable
from native Atlas — an `Atlas*` component already carries the theme, the
spacing scale, the dark-mode palette, the focus/ARIA behaviour and the
Atlas-specific defaults. Hand-rolled markup gets none of that and drifts the
moment the design system moves.

The precedence, highest first:

1. **`Atlas*` component** from `@ohdsi/atlas-ui` — always, if one fits.
   `packages/atlas-ui/index.ts` is the list of what exists; check it before
   concluding there is nothing.
2. **Raw Vuetify (`v-*`)** — only for a primitive with no `Atlas*` wrapper.
   Style it with theme tokens (`--v-theme-*`, `--atlas-*`), never literal
   colors or pixel values.
3. **Your own markup** — last resort, for genuinely bespoke layout. Same token
   rule applies, and it still sits inside `AtlasPageShell`/`AtlasContainer`.

Never introduce a *third-party* UI kit or icon set into a plugin — no Element
Plus, no Bootstrap, no Tailwind. Vuetify + `@ohdsi/atlas-ui` + `mdi` icons is
the whole toolkit; a second one ships a duplicate CSS reset and visibly breaks
the shell.

If you conclude no `Atlas*` component fits, say which one you looked at and why
it did not, in your reply. That is a design-system gap worth reporting, and it
is the difference between a considered fallback and a silent one.

## Finding the exact contract in source

Read these files in the Atlas3 checkout — do not infer any of it, and do not
reach for a raw Vuetify component when an `Atlas*` wrapper exists.

| What you need | Read (paths relative to the Atlas3 checkout) |
|---|---|
| **Which components exist** — the authoritative inventory | `packages/atlas-ui/index.ts` (every export in one file) |
| **A component's exact props, events, slots, defaults** | `src/components/ui/<Name>.vue` — read its `defineProps`/`defineEmits`; charts live under `src/components/ui/charts/` |
| **Host → plugin contract** (`PluginProps`, `AuthContext`, `PluginMessageBus`) | `src/models/PluginModels.ts` — also the zod schema the manifest is validated against |
| **Theme tokens and the Vuetify options builder** | `src/ui/tokens.ts`, `src/ui/theme.ts` (`buildVuetifyOptions`), generated `src/ui/tokens.css` |
| **Chart data types and option builders** | `src/ui/chart-types.ts`, `src/ui/chart-config.ts` (`CHART_COLORS`, `multiLineChartOptions`, …) |
| **A complete working parcel** | `plugins-dev/hello-world-plugin/` |
| **The narrative guide** | `docs/plugin-development-with-atlas-ui.md` |

Fast ways to answer a concrete question, run from the checkout root:

```bash
# Is there an Atlas component for this, and what is it called?
grep -n 'export { default as Atlas' packages/atlas-ui/index.ts

# What props/events does one actually take?
sed -n '1,80p' src/components/ui/AtlasDataTable.vue

# What non-component values are exported (tokens, builders, types)?
grep -nE '^export (\{|type|const)' packages/atlas-ui/index.ts | grep -v 'default as'
```

The inventory currently spans form controls (`AtlasTextField`, `AtlasSelect`,
`AtlasAutocomplete`, `AtlasCheckbox`, `AtlasRadioGroup`, `AtlasSwitch`), layout
(`AtlasPageShell`, `AtlasContainer`, `AtlasRow`, `AtlasCol`, `AtlasCard`,
`AtlasDivider`, `AtlasSpacer`), feedback (`AtlasAlert`, `AtlasBanner`,
`AtlasSnackbar`, `AtlasDialog`, `AtlasProgressLinear`, `AtlasProgressCircular`,
`AtlasSkeleton`), navigation (`AtlasTabs`/`AtlasTab`, `AtlasMenu`, `AtlasList`/
`AtlasListItem`, `AtlasPagination`), data display (`AtlasDataTable`,
`AtlasChip`, `AtlasBadge`, `AtlasAvatar`, `AtlasTooltip`, `AtlasIcon`) and
charts (`AtlasBarChart`, `AtlasLineChart`, `AtlasPieChart`, `AtlasBoxPlotChart`,
`AtlasTreemapChart`, `AtlasSunburstChart`, `AtlasTrellisChart`,
`AtlasChartExport`). Treat that list as a hint about *where to look*, not as
truth — `packages/atlas-ui/index.ts` in the checkout you just pulled is truth.

## Reference implementations

`OHDSI/trex-notebook` ships the production Atlas3 plugins and is the best
source of worked patterns beyond the hello-world starter. Check it out the same
way (`git clone git@github.com:OHDSI/trex-notebook.git`); in a Data2Evidence
checkout it is already vendored at `plugins/atlas/trex-notebook/`.

Its **UI** plugins — `network`, `notebook-plugin`, `results-viewer`, `sibyl`,
`strategus`, `studies` (each under `plugins/`) — all depend on
`@ohdsi/atlas-ui`, build `formats: ['system']`, and are worth reading for how a
real plugin structures views, state (Pinia) and API calls. The `*-api` siblings
(`hades-api`, `metadata-api`, `network-api`) are backend plugins with no UI —
not templates for this task.

Note they depend on a **published** `"@ohdsi/atlas-ui": "^0.1.0-…"` version,
whereas a plugin developed inside the Atlas3 monorepo uses
`file:../../packages/atlas-ui`. Match whichever tree you are working in.

**Do not use `plugins/ui/apps/vue-mri-ui-lib` (the D2E patient-analytics app)
as a template.** It is a large standalone SAPUI5-era Vue app that predates this
contract: it is not a single-spa parcel, does not use `@ohdsi/atlas-ui`, and
copying it produces a plugin that neither themes nor mounts correctly.

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
