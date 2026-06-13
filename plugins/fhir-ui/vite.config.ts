import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/fhir-ui";

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@atlas-ui": fileURLToPath(new URL("./vendor/atlas-ui/atlas-ui.js", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    server: { deps: { inline: ["vuetify"] } },
  },
});
