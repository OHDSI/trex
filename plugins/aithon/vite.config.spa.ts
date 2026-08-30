import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/aithon";

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@atlas-ui": path.resolve(__dirname, "./vendor/atlas-ui/atlas-ui.js"),
    },
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: { entry: path.resolve(__dirname, "src/spa.ts"), formats: ["es"], fileName: () => "aithon-spa.js" },
    outDir: "dist",
    emptyOutDir: false, // preserve main-build dist/assets/ between the two build passes
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
