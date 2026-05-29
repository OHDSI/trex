// @ts-nocheck - Deno edge function
import type { AppTemplate } from "../templates.ts";

export const template: AppTemplate = {
  id: "vue-vite",
  name: "Vue (Vite)",
  description: "Vue 3 + Vite + TypeScript",
  tech_stack: "vue",
  dev_command: "npm run dev",
  install_command: "npm install",
  build_command: "npm run build",
  files: {
    "AI_RULES.md": `# Tech Stack
- You are building a Vue 3 application with Vite.
- Use TypeScript with \`<script setup lang="ts">\` syntax.
- Always put source code in the src folder.
- Put components into src/components/
- The main component is src/App.vue
- UPDATE App.vue to import and include new components. OTHERWISE, the user can NOT see any components!
- Use scoped styles or a CSS framework for styling.

Available packages and libraries:
- Vue 3 Composition API is available.
`,
    "package.json": `{
"name": "my-vue-app",
"private": true,
"version": "0.0.0",
"type": "module",
"scripts": {
  "dev": "vite",
  "build": "vue-tsc -b && vite build",
  "preview": "vite preview"
},
"dependencies": {
  "vue": "^3.5.13"
},
"devDependencies": {
  "@vitejs/plugin-vue": "^5.2.1",
  "typescript": "~5.6.2",
  "vite": "^6.0.1",
  "vue-tsc": "^2.1.10"
}
}`,
    "vite.config.ts": `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
plugins: [vue()],
})`,
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
  "isolatedModules": true,
  "moduleDetection": "force",
  "noEmit": true,
  "jsx": "preserve",
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
},
"include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
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
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true
},
"include": ["vite.config.ts"]
}`,
    "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vue App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`,
    "src/main.ts": `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')`,
    "src/App.vue": `<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
<div class="app">
  <h1>Vue 3 + Vite</h1>
  <div class="card">
    <button type="button" @click="count++">count is {{ count }}</button>
    <p>Edit <code>src/App.vue</code> and save to test HMR</p>
  </div>
</div>
</template>

<style scoped>
.app {
max-width: 1280px;
margin: 0 auto;
padding: 2rem;
text-align: center;
}
.card {
padding: 2em;
}
button {
border-radius: 8px;
border: 1px solid transparent;
padding: 0.6em 1.2em;
font-size: 1em;
font-weight: 500;
font-family: inherit;
background-color: #1a1a1a;
color: #fff;
cursor: pointer;
transition: border-color 0.25s;
}
button:hover {
border-color: #646cff;
}
</style>`,
    "src/style.css": `body {
margin: 0;
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
-webkit-font-smoothing: antialiased;
min-height: 100vh;
}`,
    "src/vite-env.d.ts": `/// <reference types="vite/client" />`,
  },
};
