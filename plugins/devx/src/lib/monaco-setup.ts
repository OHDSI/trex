import { loader } from "@monaco-editor/react";

// Self-host Monaco assets (no CDN dependency in Docker)
// Use Vite's BASE_URL which is always correct for devx's assets,
// whether running standalone or embedded via single-spa.
const devxBase = (import.meta.env.BASE_URL || "/plugins/trex/devx/").replace(/\/$/, "");
loader.config({ paths: { vs: `${devxBase}/monaco/vs` } });

// Initialize themes and TypeScript config
loader.init().then((monaco) => {
  // --- Light theme ---
  monaco.editor.defineTheme("devx-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#1e1e1e",
      "editorLineNumber.foreground": "#999999",
      "editorLineNumber.activeForeground": "#333333",
      "editor.selectionBackground": "#add6ff80",
      "editor.lineHighlightBackground": "#f5f5f5",
      "editorCursor.foreground": "#1e1e1e",
      "editorWidget.background": "#f3f3f3",
      "editorWidget.border": "#c8c8c8",
      "input.background": "#ffffff",
      "input.border": "#c8c8c8",
      "list.hoverBackground": "#e8e8e8",
      "list.activeSelectionBackground": "#d6ebff",
    },
  });

  // --- Dark theme ---
  monaco.editor.defineTheme("devx-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0a0a0b",
      "editor.foreground": "#d4d4d4",
      "editorLineNumber.foreground": "#555555",
      "editorLineNumber.activeForeground": "#cccccc",
      "editor.selectionBackground": "#264f7880",
      "editor.lineHighlightBackground": "#1a1a1d",
      "editorCursor.foreground": "#d4d4d4",
      "editorWidget.background": "#1e1e1e",
      "editorWidget.border": "#333333",
      "input.background": "#1e1e1e",
      "input.border": "#333333",
      "list.hoverBackground": "#2a2a2d",
      "list.activeSelectionBackground": "#094771",
    },
  });

  // Configure TypeScript/JSX support
  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  tsDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    esModuleInterop: true,
    allowNonTsExtensions: true,
  });
  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  const jsDefaults = monaco.languages.typescript.javascriptDefaults;
  jsDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    allowNonTsExtensions: true,
  });
  jsDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });
});

/** Map file extension to Monaco language ID */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    jsonc: "json",
    md: "markdown",
    mdx: "markdown",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    svg: "xml",
    sql: "sql",
    r: "r",
    rmd: "r",
    rproj: "ini",
    rprofile: "r",
    py: "python",
    rs: "rust",
    go: "go",
    sh: "shell",
    bash: "shell",
    dockerfile: "dockerfile",
    toml: "ini",
    env: "ini",
    gitignore: "plaintext",
  };
  // Handle filenames without extensions
  const name = filePath.split("/").pop()?.toLowerCase() || "";
  if (name === "dockerfile") return "dockerfile";
  if (name === ".env" || name.startsWith(".env.")) return "ini";
  if (name === ".rprofile") return "r";
  if (name === ".renvignore" || name === ".rscignore") return "plaintext";
  return map[ext] || "plaintext";
}
