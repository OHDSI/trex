import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/aithon";

// Optional same-origin proxy to a real fhir + cql2elm backend (avoids browser CORS).
// Set VITE_FHIR_PROXY_TARGET=http://<host>:<port> and VITE_FHIR_BASE_URL=/fhir-live to
// run CQL (and all FHIR calls) end-to-end against a running stack.
const proxyTarget = process.env.VITE_FHIR_PROXY_TARGET;

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [vue(), vuetify({ autoImport: true })],
  server: proxyTarget
    ? {
        proxy: {
          "/fhir-live": {
            target: proxyTarget,
            changeOrigin: true,
            rewrite: (p) => p.replace(/^\/fhir-live/, ""),
          },
        },
      }
    : undefined,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@atlas-ui": fileURLToPath(new URL("./vendor/atlas-ui/atlas-ui.js", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    server: { deps: { inline: ["vuetify"] } },
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
  },
});
