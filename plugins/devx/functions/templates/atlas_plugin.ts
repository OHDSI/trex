// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "atlas-plugin",
  name: "Atlas Plugin",
  description: "OHDSI Atlas single-spa plugin with Vue 3 + Vuetify 3 + WebAPI",
  tech_stack: "atlas-vue",
  dev_command: "npm run dev",
  install_command: "npm install",
  build_command: "npm run build",
  files: {
    "AI_RULES.md": `# Atlas Plugin — Tech Stack & Design System

## Design References
- See \`ATLAS_DESIGN_SYSTEM.md\` for visual patterns, component styling, and Atlas-specific conventions
- See \`MATERIAL_DESIGN_GUIDELINES.md\` for UI patterns not covered by Atlas (dialogs, forms, loading, etc.)
- See \`WEBAPI_API_REFERENCE.md\` for all available REST API endpoints


## Tech Stack
- Vue 3.4 + Vuetify 3.5 + Vite + TypeScript (\`<script setup lang="ts">\`)
- Pinia for state management, Vue Router 4 for navigation
- single-spa-vue for plugin lifecycle (production entry: src/lifecycles.ts)
- @mdi/font for Material Design Icons (use via Vuetify: \`mdi-{icon-name}\`)
- Font: Roboto (Vuetify default — no custom import needed)

## Project Structure
- \`src/views/\` — page components (HomeView.vue, etc.)
- \`src/components/\` — reusable components
- \`src/stores/\` — Pinia stores
- \`src/composables/\` — composition functions (usePluginProps, useWebApi)
- \`src/router/\` — Vue Router config
- \`src/plugins/vuetify.ts\` — Vuetify theme (DO NOT modify colors)
- UPDATE \`src/views/HomeView.vue\` or add new views. The App.vue routes to views via router.

## Atlas Theme Colors (MUST use exactly these)
- primary: \`#1f425a\` (dark blue — Atlas brand)
- secondary: \`#424242\`
- accent: \`#2d5f7f\` (lighter blue)
- error: \`#FF5252\`, info: \`#2196F3\`, success: \`#4CAF50\`, warning: \`#FB8C00\`
- orange: \`#eb6622\` (accent for CTAs and highlights)
- background: \`#f2f0f1\` (light grey — ALL page backgrounds)
- surface: \`#FFFFFF\` (cards, dialogs)

## Vuetify Component Defaults (already configured in vuetify.ts)
- VBtn: flat variant, primary color
- VCard: elevated variant, elevation 2
- VTextField / VSelect / VAutocomplete: outlined variant, comfortable density

## Page Layout Pattern (MUST follow for every page)
\`\`\`vue
<template>
<div class="page-wrapper">
  <div class="page-card">
    <v-container fluid class="pa-0">
      <!-- page content here -->
    </v-container>
  </div>
</div>
</template>

<style scoped>
.page-wrapper {
min-height: 100%;
background: rgb(var(--v-theme-background));
padding: 32px;
display: flex;
flex-direction: column;
}
.page-card {
background: #fff;
border-radius: 18px;
padding: 30px;
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
flex: 1;
}
</style>
\`\`\`

## Plugin Props (available via usePluginProps composable)
- \`getToken()\` — returns JWT for Authorization header
- \`username\` — current user
- \`datasetId\` — selected dataset/source key
- \`messageBus\` — host communication (send, request, subscribe)
- \`locale\` — user language

## API Calls (IMPORTANT)
- NO backend — use WebAPI REST endpoints directly
- See \`WEBAPI_API_REFERENCE.md\` for ALL available endpoints
- Use the \`useWebApi()\` composable for all API calls — it handles base URL and auth
- WebAPI URL is configurable via \`VITE_WEBAPI_URL\` in \`.env\` (default: http://localhost:8080/WebAPI)
- In dev mode, Vite proxies /WebAPI requests to avoid CORS
- Auth: \`Authorization: Bearer \${await getToken()}\` (handled by useWebApi)

## Common Icons (Material Design)
mdi-plus, mdi-magnify, mdi-delete, mdi-pencil, mdi-information-outline,
mdi-account-multiple, mdi-content-copy, mdi-download, mdi-upload,
mdi-filter, mdi-sort, mdi-refresh, mdi-chevron-right, mdi-close
`,
    "ATLAS_DESIGN_SYSTEM.md": `# Atlas Design System

Visual patterns and component styling conventions extracted from Atlas3 source code.
All values verified against the real Atlas3 codebase.

---

## 1. Font

Vuetify uses **Roboto** by default — no custom font import needed.

## 2. Color Usage Guidelines

Use the Atlas theme colors consistently. Here is when to use each:

| Color | Hex | Usage |
|-------|-----|-------|
| primary | \`#1f425a\` | Headings, nav links, data values, primary buttons, page text |
| accent | \`#2d5f7f\` | Hover states, secondary headings, link hover color |
| orange | \`#eb6622\` | CTA buttons, highlight borders, attention-drawing elements |
| Material Blue | \`#1976d2\` | Interactive hover borders, count highlights, progress bars |
| secondary text | \`#666\` | Labels, meta info, secondary descriptions |
| tertiary text | \`#999\` | Subtle labels, separators, patient count labels |
| border grey | \`#e0e0e0\` | Borders, dividers, inactive tile borders |
| background | \`#f2f0f1\` | Page backgrounds (via theme) |
| surface | \`#FFFFFF\` | Cards, dialogs, navbar |

**Tonal variants**: Use Vuetify \`variant="tonal"\` with semantic colors for status chips and alerts (e.g., \`<v-chip color="success" variant="tonal">\`).

## 3. Typography

Font: Roboto (Vuetify default)

| Level | Size | Weight | Usage |
|-------|------|--------|-------|
| h1 / display | 4rem | 300 | Landing page titles only, letter-spacing 0.2em |
| h2 / section title | 1.5rem | 600 | Section headings, color: primary |
| h3 | 1.1rem | 500 | Sub-section headings |
| Body | 16px | 400 | Default text, line-height 1.6 |
| Body small | 0.875rem (14px) | 400 | Secondary text, table cells |
| Caption | 0.75rem (12px) | 400 | Meta labels, source keys, color: #666 |

Use Vuetify text classes: \`text-h5\`, \`text-body-1\`, \`text-body-2\`, \`text-caption\`, \`font-weight-bold\`, \`text-medium-emphasis\`.

## 4. Spacing

- Page outer padding: **32px**
- Card internal padding: **30px**
- Section gaps: **16px**
- Form field gaps: **8px–12px**
- Always use **multiples of 8px**
- Vuetify spacing classes: \`pa-3\` (12px), \`pa-4\` (16px), \`mb-2\` (8px), \`mb-4\` (16px), \`ga-2\` (8px gap), \`ga-4\` (16px gap)

## 5. Border Radius

- Page cards / containers: **18px**
- Buttons: **4px**
- Data source tiles: **4px**
- Small components (chips, badges): **3–4px**
- Nav active underline: **0.5rem 0.5rem 0 0** (top corners only)

## 6. Borders & Dividers

- Standard divider: \`1px solid #e0e0e0\`
- Tile border (idle): \`1px solid #e0e0e0\`
- Tile border (hover): \`border-color: #1976d2\`
- Tile border (complete): \`border-color: #4caf50\`
- Outlined button border: \`2px solid\`
- Tile header separator: \`border-bottom: 1px solid #e0e0e0\`

## 7. Shadows & Elevation

| Element | Shadow |
|---------|--------|
| Page cards | \`0 2px 4px rgba(0, 0, 0, 0.08)\` |
| NavBar | \`0 2px 8px rgba(0, 0, 0, 0.1)\` |
| Card hover | \`0 4px 8px rgba(0, 0, 0, 0.1)\` |
| Tile hover | \`0 2px 4px rgba(0, 0, 0, 0.1)\` |

Vuetify elevation: prefer **0–4**. Cards default to elevation 2. Event cards use elevation 1, hover to 4.

## 8. Hover & Interaction States

- **Card hover**: elevation 1 → 4, transition \`all 0.3s ease\`
- **Tile hover**: border-color changes to \`#1976d2\`, adds subtle shadow
- **Complete tile hover**: background \`#f1f8e9\` (light green)
- **Link hover**: color changes to accent, transition \`0.15s ease-in-out\`
- **Outline button hover**: fills with primary color, text turns white
- **Secondary button hover**: fills with orange, text turns white
- All transitions: \`all 0.2s ease-in-out\` (buttons), \`all 0.3s ease\` (cards)

## 9. Status Colors & Indicators

| Status | Color | Background | Icon |
|--------|-------|------------|------|
| Complete | \`#4caf50\` (success) | \`#f1f8e9\` | — |
| Running / Generating | primary | — | \`v-progress-circular\` size=20 width=2 |
| Error / Failed | \`#FF5252\` (error) | — | \`mdi-alert-circle\` |
| Idle | — | — | — |
| Cache ready | success | tonal | — |
| Cache building | info | tonal | — |
| Cache stale | warning | tonal | \`mdi-clock-alert\` |

Use \`<v-chip color="..." variant="tonal" size="x-small">\` for status indicators.

## 10. NavBar & Navigation Patterns

- Height: **56px**, white background, shadow \`0 2px 8px rgba(0, 0, 0, 0.1)\`
- Nav links: font-size **16px**, padding **18px 12px**, color: primary, font-weight 400
- Nav link hover: color changes to accent, transition 0.15s
- Responsive: on 960–1279px, nav links shrink to 14px with 8px horizontal padding
- Active indicator: bottom underline bar — height **0.5rem**, primary color, border-radius **0.5rem 0.5rem 0 0**, font-weight 500
- Hide nav links below **960px** (use Vuetify \`d-none d-md-flex\`)
- Logo area: left-aligned, 52px height, with cursor pointer

## 11. Buttons

| Type | Style | Hover |
|------|-------|-------|
| Primary | \`variant="flat" color="primary"\` (Vuetify default) | Built-in Vuetify hover |
| Outline | \`border: 2px solid primary\`, transparent bg, primary text | Fills with primary, white text |
| Secondary / CTA | \`border: 2px solid orange\`, white bg, primary text | Fills with orange, white text |
| Text | \`variant="text"\` | Subtle background |
| Icon | \`variant="text" size="small"\` | Subtle background |

- Min-width for landing buttons: **180px**
- Button padding: **0.75rem 1.5rem**, font-weight 500, font-size 16px
- Border-radius: **4px**
- Transition: \`all 0.2s ease-in-out\`

## 12. Data Tables

- Use \`<v-data-table>\` with \`density="comfortable"\` and \`:elevation="0"\`
- Search bar: \`<v-text-field>\` outlined, max-width 400px, \`prepend-inner-icon="mdi-magnify"\`, hide-details
- Loading: \`<v-skeleton-loader type="table-row@10" />\`
- Empty: \`<v-alert type="info" variant="tonal">No data available</v-alert>\`

## 13. Atlas Component Patterns

### Data Source Tiles
- Border: \`1px solid #e0e0e0\`, border-radius 4px
- Hover: border-color \`#1976d2\`, shadow \`0 2px 4px rgba(0, 0, 0, 0.1)\`
- Complete state: border-color \`#4caf50\`, cursor pointer, hover bg \`#f1f8e9\`
- Header: source name (0.875rem, weight 500, primary color) + source key (0.75rem, #666)
- Header separator: \`border-bottom: 1px solid #e0e0e0\`, padding-bottom 8px
- Grid: use Vuetify grid with cols 12/6/4/3 for responsive layout

### Patient Count Bar
- Background: \`linear-gradient(to right, #f8f9fa, #ffffff)\`
- Border-bottom: \`1px solid #e0e0e0\`, padding 12px 24px
- Count number: font-size **20px**, weight 600, color \`#1976d2\`
- Count label: font-size **12px**, color \`#999\`
- Separator: font-size 16px, color \`#999\`
- Total count: font-size 16px, weight 500, color \`#666\`
- Progress bar: \`<v-progress-linear>\` height 8, rounded

### Event Cards
- Elevation 1, transition \`all 0.3s ease\`
- Hover: shadow \`0 4px 8px rgba(0, 0, 0, 0.1)\`
- Header: icon (small) + title (text-subtitle-1) + caption (text-caption, text-medium-emphasis)
- Summary chips: \`<v-chip size="small" color="primary" variant="tonal">\` with icons
- Expanded section: \`<v-expand-transition>\` with divider separator
- Action buttons inside: \`variant="outlined" size="small"\` with prepend-icon

## 14. Card Patterns

- Title: mdi icon (18px, primary color) + text
- Description: truncated with \`<v-tooltip>\`
- Meta info: 2-column rows (ID, author, created, updated)
- Tags: \`<v-chip>\` with custom colors
- Actions: icon buttons (\`size="small"\`, \`variant="text"\`)

## 15. Responsive Breakpoints & Grid

Vuetify breakpoints:
| Name | Range |
|------|-------|
| xs | < 600px |
| sm | 600–959px |
| md | 960–1263px |
| lg | 1264–1903px |
| xl | ≥ 1904px |

Grid patterns:
- Landing page: \`grid-template-columns: 1fr 400px\` → single column on small screens
- Data source tiles: Vuetify grid cols 12/6/4/3 (1/2/3/4 columns)
- Max content width: 940px (landing), 1400px (count bar)
- Use Vuetify display classes: \`d-none d-md-flex\`, \`d-sm-none\`
`,
    "MATERIAL_DESIGN_GUIDELINES.md": `# Material Design Guidelines

Gap-fill for UI patterns that Atlas does not explicitly define.
Follow these Material Design conventions for consistency with the Vuetify framework.

---

## 1. Dialogs

- Small dialogs: \`max-width="560"\`
- Medium dialogs: \`max-width="800"\`
- Internal padding: **24px** (\`pa-6\`)
- Title: font-size 20px (text-h6), font-weight 500
- Actions: right-aligned, 8px gap between buttons
- Use \`persistent\` prop for destructive or important actions
- Destructive confirm: secondary button "Cancel" + error-colored "Delete"

\`\`\`vue
<v-dialog max-width="560">
<v-card>
  <v-card-title class="text-h6">{{ t('myPlugin.dialog.title', 'Dialog Title') }}</v-card-title>
  <v-card-text>{{ t('myPlugin.dialog.message', 'Content here') }}</v-card-text>
  <v-card-actions class="justify-end ga-2 pa-4">
    <v-btn variant="text" @click="close">{{ t('common.cancel', 'Cancel') }}</v-btn>
    <v-btn color="primary" @click="confirm">{{ t('common.confirm', 'Confirm') }}</v-btn>
  </v-card-actions>
</v-card>
</v-dialog>
\`\`\`

## 2. Snackbar / Toast Notifications

- Position: bottom center (\`location="bottom"\`)
- Duration: **4 seconds** for info, **8 seconds** for errors
- Single action button (e.g., "Dismiss", "Undo")
- Use semantic colors: success, error, info, warning

\`\`\`vue
<v-snackbar v-model="snackbar" :timeout="4000" color="success" location="bottom">
{{ message }}
<template #actions>
  <v-btn variant="text" @click="snackbar = false">{{ t('common.close', 'Close') }}</v-btn>
</template>
</v-snackbar>
\`\`\`

## 3. Empty States

- Centered layout with icon + title + subtitle + optional action
- Icon: size **48px**, color **#999**
- Title: text-h6, font-weight 500
- Subtitle: text-body-2, color #666
- Action: primary button below subtitle

\`\`\`vue
<div class="d-flex flex-column align-center justify-center pa-12 text-center">
<v-icon size="48" color="grey">mdi-database-off</v-icon>
<h3 class="text-h6 mt-4">{{ t('myPlugin.empty.title', 'No Data Found') }}</h3>
<p class="text-body-2 mt-2" style="color: #666">
  {{ t('myPlugin.empty.subtitle', 'There are no items matching your criteria.') }}
</p>
<v-btn class="mt-4" prepend-icon="mdi-plus">{{ t('myPlugin.actions.createNew', 'Create New') }}</v-btn>
</div>
\`\`\`

## 4. Loading States

| Context | Component | Props |
|---------|-----------|-------|
| Table loading | \`<v-skeleton-loader>\` | \`type="table-row@10"\` |
| Card loading | \`<v-skeleton-loader>\` | \`type="card"\` |
| Inline action | \`<v-progress-circular>\` | \`size="20" width="2" indeterminate\` |
| Full page | \`<v-progress-circular>\` | \`size="48" indeterminate\`, centered |
| List loading | \`<v-skeleton-loader>\` | \`type="list-item-two-line@5"\` |

Full page loading pattern:
\`\`\`vue
<div class="d-flex align-center justify-center" style="min-height: 200px">
<v-progress-circular size="48" indeterminate color="primary" />
</div>
\`\`\`

## 5. Form Patterns

- Labels: above inputs (Vuetify outlined variant, already configured as default)
- Field spacing: **16px** between fields (\`mb-4\` class)
- Helper text: use Vuetify \`hint\` prop with \`persistent-hint\`
- Validation: use Vuetify \`rules\` prop for inline validation
- Actions: right-aligned, Cancel (text variant) + Submit (primary flat)
- Group related fields in sections with \`text-subtitle-2\` headings and \`mb-6\` spacing

\`\`\`vue
<v-form @submit.prevent="handleSubmit">
<v-text-field v-model="name" :label="tv('myPlugin.form.name', 'Name')" :rules="[v => !!v || tv('common.required', 'Required')]" class="mb-4" />
<v-text-field v-model="description" :label="tv('myPlugin.form.description', 'Description')" :hint="tv('common.optional', 'Optional')" persistent-hint class="mb-4" />
<div class="d-flex justify-end ga-2 mt-6">
  <v-btn variant="text" @click="cancel">{{ t('common.cancel', 'Cancel') }}</v-btn>
  <v-btn type="submit" :loading="saving">{{ t('common.save', 'Save') }}</v-btn>
</div>
</v-form>
\`\`\`

## 6. Chip Patterns

| Use Case | Variant | Size | Props |
|----------|---------|------|-------|
| Status indicators | tonal | small | \`color="success/error/warning"\` |
| Filters (removable) | outlined | default | \`closable\` |
| Category tags | tonal | small | \`color="primary/accent"\` |
| Counts / badges | tonal | x-small | with icon |

## 7. Transitions & Motion

| Type | Duration | Easing | Example |
|------|----------|--------|---------|
| Simple (hover, color) | 0.15–0.2s | ease-in-out | Link hover, button hover |
| Medium (expand, slide) | 0.3s | ease | Card expand, panel open |
| Complex (multi-step) | Use Vuetify built-in | — | \`<v-expand-transition>\`, \`<v-fade-transition>\` |

Prefer Vuetify built-in transitions:
- \`<v-expand-transition>\` for collapsible content
- \`<v-fade-transition>\` for appearance/disappearance
- \`<v-slide-y-transition>\` for vertical entry
- \`<v-scale-transition>\` for dialogs and FABs

## 8. Accessibility

- Text contrast: **4.5:1** minimum (WCAG AA)
- Large text (18px+ or 14px+ bold): **3:1** minimum
- Icon-only buttons: always add \`aria-label\`
- Keyboard navigation: do NOT override Vuetify's built-in focus rings
- Form inputs: always provide \`label\` prop (even if visually hidden)
- Use semantic HTML: headings in order, lists for navigation
- Disabled states: use Vuetify \`disabled\` prop (handles aria automatically)
`,
    "WEBAPI_API_REFERENCE.md": `# WebAPI REST API Reference

Base URL: Configured via \`VITE_WEBAPI_URL\` (default: \`http://localhost:8080/WebAPI\`)
Auth: \`Authorization: Bearer <JWT>\` header on all requests (handled by useWebApi composable)

---

## Cohort Definitions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/cohortdefinition\` | List all cohort definitions |
| POST | \`/cohortdefinition\` | Create new cohort definition |
| GET | \`/cohortdefinition/{id}\` | Get cohort by ID |
| PUT | \`/cohortdefinition/{id}\` | Update cohort |
| DELETE | \`/cohortdefinition/{id}\` | Delete cohort |
| GET | \`/cohortdefinition/{id}/generate/{sourceKey}\` | Generate cohort for source |
| GET | \`/cohortdefinition/{id}/report/{sourceKey}\` | Get generation report |
| POST | \`/cohortdefinition/sql\` | Generate SQL from cohort JSON |
| GET | \`/cohortdefinition/{id}/copy\` | Copy cohort definition |
| GET | \`/cohortdefinition/{id}/info\` | Get cohort metadata |

## Concept Sets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/conceptset\` | List all concept sets |
| POST | \`/conceptset\` | Create concept set |
| GET | \`/conceptset/{id}\` | Get concept set by ID |
| PUT | \`/conceptset/{id}\` | Update concept set |
| DELETE | \`/conceptset/{id}\` | Delete concept set |
| GET | \`/conceptset/{id}/items\` | Get concept set items |
| PUT | \`/conceptset/{id}/items\` | Update items |
| GET | \`/conceptset/{id}/expression\` | Get expression |

## Vocabulary Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | \`/vocabulary/{sourceKey}/search\` | Search concepts (body: {QUERY, DOMAIN_ID[], ...}) |
| GET | \`/vocabulary/{sourceKey}/concept/{id}\` | Get concept details |
| GET | \`/vocabulary/{sourceKey}/concept/{id}/related\` | Get related concepts |
| GET | \`/vocabulary/{sourceKey}/concept/{id}/descendants\` | Get descendants |
| GET | \`/vocabulary/{sourceKey}/domains\` | List available domains |
| GET | \`/vocabulary/{sourceKey}/vocabularies\` | List vocabularies |
| POST | \`/vocabulary/{sourceKey}/resolveConceptSetExpression\` | Resolve expression |
| POST | \`/vocabulary/{sourceKey}/lookup/identifiers\` | Lookup by concept IDs |

## Data Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/source/sources\` | List all data sources |
| GET | \`/source/{key}\` | Get source by key |
| GET | \`/source/details/{sourceId}\` | Get source details |
| GET | \`/source/connection/{key}\` | Test connection |

## CDM Results & Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/cdmresults/{sourceKey}/dashboard\` | Dashboard summary |
| GET | \`/cdmresults/{sourceKey}/person\` | Person/patient statistics |
| GET | \`/cdmresults/{sourceKey}/datadensity\` | Data density report |
| GET | \`/cdmresults/{sourceKey}/death\` | Mortality statistics |
| GET | \`/cdmresults/{sourceKey}/observationPeriod\` | Observation periods |
| GET | \`/cdmresults/{sourceKey}/{domain}/\` | Domain treemap |
| GET | \`/cdmresults/{sourceKey}/{domain}/{conceptId}\` | Concept drilldown |
| POST | \`/cdmresults/{sourceKey}/conceptRecordCount\` | Record counts |

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/user/me\` | Get current user info |
| GET | \`/user/refresh\` | Refresh JWT token |
| GET | \`/user/logout\` | Logout |
| GET | \`/user/login/db\` | Database login |

## Common Patterns

- **sourceKey**: String identifier for a data source (e.g. "OHDSI-CDMV5")
- **Pagination**: Most list endpoints support query params for paging
- **Content-Type**: Always \`application/json\`
- **Errors**: HTTP status codes with JSON body \`{ "message": "..." }\`
`,
    ".env": `VITE_WEBAPI_URL=http://localhost:8080/WebAPI
`,
    "package.json": `{
"name": "@trex/__APP_ID__",
"private": true,
"version": "0.0.0",
"type": "module",
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
},
"dependencies": {
  "vue": "^3.4.0",
  "vuetify": "^3.5.0",
  "@mdi/font": "^7.4.47",
  "vue-router": "^4.2.0",
  "pinia": "^2.1.0",
  "single-spa-vue": "^3.0.1"
},
"devDependencies": {
  "@vitejs/plugin-vue": "^5.2.1",
  "vite-plugin-vuetify": "^2.0.4",
  "vite-plugin-css-injected-by-js": "^3.5.2",
  "typescript": "~5.6.2",
  "vite": "^6.0.1",
  "vue-tsc": "^2.1.10"
},
"trex": {
  "ui": {
    "routes": [
      {
        "path": "/app",
        "dir": "dist",
        "spa": true
      }
    ]
  }
}
}`,
    "vite.config.ts": `import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig(({ command, mode }) => {
const env = loadEnv(mode, process.cwd(), '');
const webapiUrl = env.VITE_WEBAPI_URL || 'http://localhost:8080/WebAPI';

// Parse the URL to extract origin and path for proxy configuration
let proxyTarget = 'http://localhost:8080';
let proxyRewrite: Record<string, string> = {};
try {
  const parsed = new URL(webapiUrl);
  proxyTarget = parsed.origin;
  const remotePath = parsed.pathname.replace(/\\/$/, '');
  if (remotePath && remotePath !== '/WebAPI') {
    proxyRewrite = { '^/WebAPI': remotePath };
  }
} catch { /* use defaults */ }

return {
plugins: [vue(), vuetify({ autoImport: true }), cssInjectedByJsPlugin()],
resolve: {
  alias: { '@': '/src' },
},
server: {
  proxy: {
    '/WebAPI': {
      target: proxyTarget,
      changeOrigin: true,
      ...(Object.keys(proxyRewrite).length > 0 ? { rewrite: (path) => {
        for (const [from, to] of Object.entries(proxyRewrite)) {
          path = path.replace(new RegExp(from), to);
        }
        return path;
      }} : {}),
    },
  },
},
build: command === 'build' ? {
  lib: {
    entry: 'src/lifecycles.ts',
    formats: ['system'],
    fileName: () => 'app.js',
  },
  rollupOptions: {
    external: ['vue', 'vue-router', 'pinia'],
  },
  cssCodeSplit: false,
} : undefined,
};
});`,
    "tsconfig.json": `{
"files": [],
"references": [
  { "path": "./tsconfig.app.json" },
  { "path": "./tsconfig.node.json" }
]
}`,
    "tsconfig.app.json": `{
"compilerOptions": {
  "target": "ES2020",
  "useDefineForClassFields": true,
  "module": "ESNext",
  "lib": ["ES2020", "DOM", "DOM.Iterable"],
  "skipLibCheck": true,
  "moduleResolution": "bundler",
  "allowImportingTsExtensions": true,
  "resolveJsonModule": true,
  "isolatedModules": true,
  "moduleDetection": "force",
  "noEmit": true,
  "jsx": "preserve",
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "paths": { "@/*": ["./src/*"] }
},
"include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue", "src/**/*.json"]
}`,
    "tsconfig.node.json": `{
"compilerOptions": {
  "target": "ES2022",
  "lib": ["ES2023"],
  "module": "ESNext",
  "skipLibCheck": true,
  "moduleResolution": "bundler",
  "allowImportingTsExtensions": true,
  "isolatedModules": true,
  "moduleDetection": "force",
  "noEmit": true,
  "strict": true
},
"include": ["vite.config.ts"]
}`,
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Atlas Plugin</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`,
    "src/plugins/vuetify.ts": `import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';

export default createVuetify({
theme: {
  defaultTheme: 'atlas',
  themes: {
    atlas: {
      dark: false,
      colors: {
        primary: '#1f425a',
        secondary: '#424242',
        accent: '#2d5f7f',
        error: '#FF5252',
        info: '#2196F3',
        success: '#4CAF50',
        warning: '#FB8C00',
        orange: '#eb6622',
        background: '#f2f0f1',
        surface: '#FFFFFF',
      },
    },
  },
},
defaults: {
  VBtn: { variant: 'flat', color: 'primary' },
  VCard: { variant: 'elevated', elevation: 2 },
  VTextField: { variant: 'outlined', density: 'comfortable' },
  VSelect: { variant: 'outlined', density: 'comfortable' },
  VAutocomplete: { variant: 'outlined', density: 'comfortable' },
},
});`,
    "src/router/index.ts": `import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';

const router = createRouter({
history: createWebHashHistory(),
routes: [
  { path: '/', name: 'home', component: HomeView },
],
});

export default router;`,
    "src/composables/usePluginProps.ts": `import { inject, ref } from 'vue';

export interface PluginProps {
getToken: () => Promise<string>;
username: string;
datasetId: string;
messageBus?: any;
locale?: string;
}

const PLUGIN_PROPS_KEY = Symbol('pluginProps');

export function providePluginProps(props: PluginProps) {
return { key: PLUGIN_PROPS_KEY, value: props };
}

export function usePluginProps(): PluginProps {
const props = inject<PluginProps>(PLUGIN_PROPS_KEY);
if (props) return props;

// Dev mode fallback
return {
  getToken: async () => 'dev-token',
  username: 'developer',
  datasetId: 'OHDSI-CDMV5',
  locale: 'en',
};
}`,
    "src/stores/locale.ts": `import { defineStore } from 'pinia';
import { useWebApi } from '@/composables/useWebApi';
import fallbackTranslations from '@/locales/en.json';

export type Translations = Record<string, unknown>;

interface TranslationCache {
translations: Translations;
cachedAt: number;
}

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export const useLocaleStore = defineStore('locale', {
state: () => ({
  locale: 'en' as string,
  translations: {} as Translations,
  loading: false,
  initialized: false,
  translationCache: new Map<string, TranslationCache>(),
}),

actions: {
  async initialize(locale?: string): Promise<void> {
    // Load bundled English fallback immediately
    this.translations = fallbackTranslations as Translations;

    // Cache the fallback
    this.translationCache.set('en', {
      translations: this.translations,
      cachedAt: Date.now(),
    });

    const targetLocale = locale || 'en';

    // Try to fetch from WebAPI (backend is the source of truth)
    await this.fetchTranslations(targetLocale);
    this.locale = targetLocale;
    this.initialized = true;
  },

  async fetchTranslations(locale: string): Promise<void> {
    // Check memory cache first
    const cached = this.translationCache.get(locale);
    if (cached && Date.now() - cached.cachedAt < CACHE_MAX_AGE) {
      this.translations = cached.translations;
      return;
    }

    this.loading = true;
    try {
      const { webApiFetch } = useWebApi();
      const data = await webApiFetch<Translations>(\`/i18n?lang=\${locale}\`);
      this.translations = data;
      this.translationCache.set(locale, {
        translations: data,
        cachedAt: Date.now(),
      });
    } catch {
      // Backend unavailable — keep using fallback translations
      console.warn(\`[i18n] Could not fetch translations for "\${locale}", using fallback\`);
    } finally {
      this.loading = false;
    }
  },

  async changeLocale(locale: string): Promise<void> {
    await this.fetchTranslations(locale);
    this.locale = locale;
  },
},
});`,
    "src/locales/en.json": `{
"common": {
  "add": "Add",
  "cancel": "Cancel",
  "close": "Close",
  "copy": "Copy",
  "create": "Create",
  "delete": "Delete",
  "description": "Description",
  "download": "Download",
  "export": "Export",
  "failed": "Failed",
  "import": "Import",
  "loading": "Loading...",
  "noData": "No data",
  "optional": "Optional",
  "patients": "Patients",
  "preview": "Preview",
  "refresh": "Refresh",
  "required": "Required",
  "retry": "Retry",
  "save": "Save",
  "search": "Search",
  "confirm": "Confirm"
},
"datatable": {
  "emptyTable": "No data available",
  "search": "Search...",
  "noMatchingRecords": "No matching records found"
}
}`,
    "src/composables/useI18n.ts": `import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { useLocaleStore } from '@/stores/locale';

export type TranslationParams = Record<string, string | number>;

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
const keys = path.split('.');
let value: unknown = obj;
for (const key of keys) {
  if (value === undefined || value === null) return undefined;
  value = (value as Record<string, unknown>)[key];
}
return typeof value === 'string' ? value : undefined;
}

function interpolate(template: string, params: TranslationParams): string {
return template.replace(/\\{(\\w+)\\}/g, (match, key) => {
  return params[key] !== undefined ? String(params[key]) : match;
});
}

function resolve(
store: ReturnType<typeof useLocaleStore>,
key: string,
defaultValueOrParams?: string | TranslationParams,
params?: TranslationParams,
): string {
let defaultValue = '';
let tParams: TranslationParams | undefined;

if (typeof defaultValueOrParams === 'object') {
  tParams = defaultValueOrParams;
} else if (typeof defaultValueOrParams === 'string') {
  defaultValue = defaultValueOrParams;
  tParams = params;
}

// Lookup in current translations (backend source or fallback)
let translation = getNestedValue(store.translations, key);

// Fallback to English cache if current locale differs
if (!translation && store.locale !== 'en') {
  const enCache = store.translationCache.get('en');
  if (enCache) {
    translation = getNestedValue(enCache.translations, key);
  }
}

// Fallback to provided default value, then to key itself
if (!translation) {
  translation = defaultValue || key;
}

return tParams ? interpolate(translation, tParams) : translation;
}

/**
 * i18n composable — translations are fetched from the WebAPI backend.
 * The bundled en.json provides a fallback when the backend is unavailable.
 *
 * Fallback chain: backend translations → English cache → default value → key
 */
export function useI18n() {
const store = useLocaleStore();

/** Reactive translation (ComputedRef) — use in templates: {{ t('key', 'Default') }} */
const t = (
  key: string,
  defaultValueOrParams?: string | TranslationParams,
  params?: TranslationParams,
): ComputedRef<string> => computed(() => resolve(store, key, defaultValueOrParams, params));

/** Non-reactive translation (string) — use in v-bind, props, function args */
const tv = (
  key: string,
  defaultValueOrParams?: string | TranslationParams,
  params?: TranslationParams,
): string => resolve(store, key, defaultValueOrParams, params);

return {
  t,
  tv,
  locale: computed(() => store.locale),
  loading: computed(() => store.loading),
  changeLocale: (locale: string) => store.changeLocale(locale),
};
}`,
    "src/composables/useWebApi.ts": `import { usePluginProps } from './usePluginProps';

// In dev mode, always use the proxy path — Vite proxies /WebAPI to the real server.
// In production (single-spa), use the full URL from env or plugin config.
const WEBAPI_BASE = import.meta.env.DEV ? '/WebAPI' : (import.meta.env.VITE_WEBAPI_URL || '/WebAPI');

export function useWebApi() {
const { getToken } = usePluginProps();

async function webApiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  // Ensure no double slashes between base and path
  const url = \`\${WEBAPI_BASE.replace(/\\/$/, '')}\${path.startsWith('/') ? path : '/' + path}\`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${token}\`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(\`WebAPI error \${res.status}: \${body}\`);
  }
  return res.json();
}

return { webApiFetch, baseUrl: WEBAPI_BASE };
}`,
    "src/lifecycles.ts": `import singleSpaVue from 'single-spa-vue';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import vuetify from './plugins/vuetify';
import router from './router';
import App from './App.vue';
import { providePluginProps } from './composables/usePluginProps';
import { useLocaleStore } from './stores/locale';

const vueLifecycles = singleSpaVue({
createApp,
appOptions: {
  render() {
    return h(App);
  },
},
handleInstance(app, props) {
  app.use(vuetify);
  app.use(createPinia());
  app.use(router);

  const pluginProps = providePluginProps({
    getToken: props.getToken || (async () => ''),
    username: props.username || '',
    datasetId: props.datasetId || '',
    messageBus: props.messageBus,
    locale: props.locale || 'en',
  });
  app.provide(pluginProps.key, pluginProps.value);

  // Initialize i18n — fetches translations from backend, falls back to bundled en.json
  const localeStore = useLocaleStore();
  localeStore.initialize(props.locale || 'en');
},
});

export const bootstrap = vueLifecycles.bootstrap;
export const mount = vueLifecycles.mount;
export const unmount = vueLifecycles.unmount;`,
    "src/main.ts": `import { createApp } from 'vue';
import { createPinia } from 'pinia';
import vuetify from './plugins/vuetify';
import router from './router';
import App from './App.vue';
import { providePluginProps } from './composables/usePluginProps';
import { useLocaleStore } from './stores/locale';

const app = createApp(App);
app.use(vuetify);
app.use(createPinia());
app.use(router);

// Provide mock plugin props for dev mode
const mockProps = providePluginProps({
getToken: async () => 'dev-token',
username: 'developer',
datasetId: 'OHDSI-CDMV5',
locale: 'en',
});
app.provide(mockProps.key, mockProps.value);

// Initialize i18n — fetches translations from backend, falls back to bundled en.json
const localeStore = useLocaleStore();
localeStore.initialize('en');

app.mount('#app');`,
    "src/App.vue": `<script setup lang="ts">
import { computed } from 'vue';
import AtlasShell from '@/components/AtlasShell.vue';

// AtlasShell is only shown in dev mode (standalone).
// In production (single-spa), the Atlas host provides the shell.
const isDev = computed(() => import.meta.env.DEV);
</script>

<template>
<v-app>
  <AtlasShell v-if="isDev" />
  <v-main style="background: rgb(var(--v-theme-background))">
    <router-view />
  </v-main>
</v-app>
</template>`,
    "src/components/AtlasShell.vue": `<script setup lang="ts">
/**
 * Dev-only Atlas host shell — mimics the Atlas3 NavBar for preview.
 * Uses plain HTML to avoid Vuetify v-app-bar scope warnings in dev mode.
 * This component is NOT included in the production single-spa build.
 */
const navItems = ['Data Sources', 'Concept Sets', 'Cohorts'];
const webapiUrl = import.meta.env.VITE_WEBAPI_URL || 'http://localhost:8080/WebAPI';
</script>

<template>
<header class="atlas-shell-nav">
  <div class="atlas-shell-nav__left">
    <span class="atlas-shell-nav__logo">ATLAS</span>
    <span class="atlas-shell-nav__badge">DEV PREVIEW</span>
  </div>
  <nav class="atlas-shell-nav__links">
    <a
      v-for="item in navItems"
      :key="item"
      href="#"
      class="atlas-shell-nav__link"
      @click.prevent
    >
      {{ item }}
    </a>
  </nav>
  <div class="atlas-shell-nav__right">
    <span class="atlas-shell-nav__api">{{ webapiUrl }}</span>
  </div>
</header>
</template>

<style scoped>
.atlas-shell-nav {
width: 100%;
height: 56px;
background-color: #ffffff;
box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
display: flex;
align-items: center;
padding: 0 1rem;
position: sticky;
top: 0;
z-index: 1000;
}
.atlas-shell-nav__left {
display: flex;
align-items: center;
gap: 0.75rem;
}
.atlas-shell-nav__logo {
font-size: 1.5rem;
font-weight: 300;
letter-spacing: 0.2em;
color: rgb(var(--v-theme-primary));
}
.atlas-shell-nav__badge {
font-size: 0.625rem;
padding: 2px 6px;
border: 1px solid rgb(var(--v-theme-accent));
border-radius: 4px;
color: rgb(var(--v-theme-accent));
}
.atlas-shell-nav__links {
display: flex;
align-items: center;
gap: 0.5rem;
margin-left: 1.5rem;
}
.atlas-shell-nav__link {
padding: 18px 12px;
color: rgb(var(--v-theme-primary));
font-size: 14px;
text-decoration: none;
transition: color 0.15s ease-in-out;
}
.atlas-shell-nav__link:hover {
color: rgb(var(--v-theme-accent));
}
.atlas-shell-nav__right {
margin-left: auto;
display: flex;
align-items: center;
}
.atlas-shell-nav__api {
font-size: 0.75rem;
color: rgb(var(--v-theme-info));
background: rgba(var(--v-theme-info), 0.08);
padding: 4px 8px;
border-radius: 4px;
}
@media (max-width: 959px) {
.atlas-shell-nav__links { display: none; }
}
</style>`,
    "src/views/HomeView.vue": `<script setup lang="ts">
import { ref } from 'vue';

const items = ref([
{ id: 1, name: 'Example Cohort', author: 'developer', created: '2024-01-15' },
{ id: 2, name: 'Drug Exposure Analysis', author: 'developer', created: '2024-02-20' },
{ id: 3, name: 'Condition Occurrence', author: 'admin', created: '2024-03-10' },
]);

const headers = [
{ title: 'ID', key: 'id', width: '80px' },
{ title: 'Name', key: 'name' },
{ title: 'Author', key: 'author' },
{ title: 'Created', key: 'created' },
];
</script>

<template>
<div class="page-wrapper">
  <div class="page-card">
    <v-container fluid class="pa-0">
      <h2 class="text-h5 font-weight-bold mb-2" style="color: rgb(var(--v-theme-primary))">
        Atlas Plugin
      </h2>
      <p class="text-body-1 mb-6" style="color: rgb(var(--v-theme-primary)); line-height: 1.6">
        This is your Atlas plugin. Edit this view or add new views to build your feature.
      </p>

      <div class="d-flex ga-4 mb-6">
        <v-btn prepend-icon="mdi-plus">New Item</v-btn>
        <v-btn variant="outlined" style="border-width: 2px; border-color: rgb(var(--v-theme-orange)); color: rgb(var(--v-theme-secondary))">
          Import
        </v-btn>
      </div>

      <v-text-field
        placeholder="Search..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        class="mb-4"
        style="max-width: 400px"
        hide-details
      />

      <v-data-table
        :headers="headers"
        :items="items"
        density="comfortable"
        :elevation="0"
      >
        <template #no-data>
          <v-alert type="info" variant="tonal" class="ma-4">
            No data available
          </v-alert>
        </template>
      </v-data-table>
    </v-container>
  </div>
</div>
</template>

<style scoped>
.page-wrapper {
min-height: 100%;
background: rgb(var(--v-theme-background));
padding: 32px;
display: flex;
flex-direction: column;
}
.page-card {
background: #fff;
border-radius: 18px;
padding: 30px;
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
flex: 1;
}
</style>`,
    "src/vite-env.d.ts": `/// <reference types="vite/client" />

interface ImportMetaEnv {
readonly VITE_WEBAPI_URL: string;
}

interface ImportMeta {
readonly env: ImportMetaEnv;
}`,
  },
};
