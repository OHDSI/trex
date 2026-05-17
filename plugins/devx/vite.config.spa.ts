import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/devx";

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/spa.tsx"),
      formats: ["es"],
      fileName: () => "devx-spa.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    // No CSS import in spa.tsx, so no CSS will be emitted or injected.
    // The host loads devx-spa.css (copied from the main build) via <link>.
    rollupOptions: {},
  },
});
