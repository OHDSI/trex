/**
 * In-process MCP server exposing the OHDSI knowledge base to the Claude Code SDK.
 * Mirrors the Deno-side `functions/tools/knowledge_base.ts` tools so the
 * ccode provider gets the same capabilities as our Vercel-SDK path.
 *
 * Repos live under /tmp/devx-kb/, shared with the Deno side — if the user
 * clones via one path and searches via the other, it works.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const KB_BASE_DIR = "/tmp/devx-kb";

const SUPPORTED_REPOS = {
  // Core
  "data2evidence": "https://github.com/OHDSI/Data2Evidence.git",
  "atlas": "https://github.com/OHDSI/Atlas.git",
  "webapi": "https://github.com/OHDSI/WebAPI.git",
  "hades": "https://github.com/OHDSI/HADES.git",
  "strategus": "https://github.com/OHDSI/Strategus.git",
  // Population-level Estimation
  "cohort-method": "https://github.com/OHDSI/CohortMethod.git",
  "self-controlled-case-series": "https://github.com/OHDSI/SelfControlledCaseSeries.git",
  "self-controlled-cohort": "https://github.com/OHDSI/SelfControlledCohort.git",
  "evidence-synthesis": "https://github.com/OHDSI/EvidenceSynthesis.git",
  // Patient-level Prediction
  "patient-level-prediction": "https://github.com/OHDSI/PatientLevelPrediction.git",
  "deep-patient-level-prediction": "https://github.com/OHDSI/DeepPatientLevelPrediction.git",
  "ensemble-patient-level-prediction": "https://github.com/OHDSI/EnsemblePatientLevelPrediction.git",
  // Characterization
  "characterization": "https://github.com/OHDSI/Characterization.git",
  "cohort-incidence": "https://github.com/OHDSI/CohortIncidence.git",
  "treatment-patterns": "https://github.com/OHDSI/TreatmentPatterns.git",
  // Cohort Construction & Evaluation
  "capr": "https://github.com/OHDSI/Capr.git",
  "circe-r": "https://github.com/OHDSI/CirceR.git",
  "cohort-generator": "https://github.com/OHDSI/CohortGenerator.git",
  "phenotype-library": "https://github.com/OHDSI/PhenotypeLibrary.git",
  "cohort-diagnostics": "https://github.com/OHDSI/CohortDiagnostics.git",
  "phevaluator": "https://github.com/OHDSI/PheValuator.git",
  "cohort-explorer": "https://github.com/OHDSI/CohortExplorer.git",
  "keeper": "https://github.com/OHDSI/Keeper.git",
  // Evidence Quality
  "achilles": "https://github.com/OHDSI/Achilles.git",
  "data-quality-dashboard": "https://github.com/OHDSI/DataQualityDashboard.git",
  "empirical-calibration": "https://github.com/OHDSI/EmpiricalCalibration.git",
  "method-evaluation": "https://github.com/OHDSI/MethodEvaluation.git",
  // Supporting Packages
  "andromeda": "https://github.com/OHDSI/Andromeda.git",
  "cyclops": "https://github.com/OHDSI/Cyclops.git",
  "database-connector": "https://github.com/OHDSI/DatabaseConnector.git",
  "eunomia": "https://github.com/OHDSI/Eunomia.git",
  "feature-extraction": "https://github.com/OHDSI/FeatureExtraction.git",
  "ohdsi-shiny-modules": "https://github.com/OHDSI/OhdsiShinyModules.git",
  "parallel-logger": "https://github.com/OHDSI/ParallelLogger.git",
  "result-model-manager": "https://github.com/OHDSI/ResultModelManager.git",
  "rohdsi-webapi": "https://github.com/OHDSI/ROhdsiWebApi.git",
  "sql-render": "https://github.com/OHDSI/SqlRender.git",
  // Study Templates & Examples
  "strategus-study-template": "https://github.com/ohdsi-studies/StrategusStudyRepoTemplate.git",
  "tutorial-strategus-study": "https://github.com/ohdsi-studies/TutorialStrategusStudy.git",
  "ehden-hmb": "https://github.com/ohdsi-studies/ehden-hmb.git",
  "legendt2dm": "https://github.com/ohdsi-studies/LegendT2dm.git",
  "reward": "https://github.com/ohdsi-studies/Reward.git",
  // Reference
  "book-of-ohdsi-2nd": "https://github.com/OHDSI/BookOfOhdsi-2ndEdition.git",
};

const REPO_CATEGORIES = {
  "atlas": {
    description: "OHDSI Atlas platform and backend",
    repos: {
      "atlas": "Web-based OHDSI analysis platform (Vue 3 + Vuetify)",
      "webapi": "Backend REST API for Atlas (Java/Spring Boot)",
      "rohdsi-webapi": "R client for OHDSI WebAPI",
    },
  },
  "data2evidence": {
    description: "Data-to-Evidence analytics platform",
    repos: {
      "data2evidence": "D2E portal — full-stack analytics platform",
    },
  },
  "orchestration": {
    description: "Analytics orchestration and execution",
    repos: {
      "hades": "HADES meta-package — index of all R analytics packages",
      "strategus": "Coordinates and executes analytics using HADES packages",
    },
  },
  "estimation": {
    description: "Population-level effect estimation",
    repos: {
      "cohort-method": "New-user cohort studies with propensity score matching",
      "self-controlled-case-series": "Self-Controlled Case Series analysis",
      "self-controlled-cohort": "Self-controlled cohort design",
      "evidence-synthesis": "Combining causal effect estimates across data sites",
    },
  },
  "prediction": {
    description: "Patient-level prediction and machine learning",
    repos: {
      "patient-level-prediction": "Build and evaluate predictive models (ML algorithms)",
      "deep-patient-level-prediction": "Deep learning for patient-level prediction",
      "ensemble-patient-level-prediction": "Ensemble predictive models",
    },
  },
  "characterization": {
    description: "Cohort characterization and treatment analysis",
    repos: {
      "characterization": "Characterization of target and outcome cohorts",
      "cohort-incidence": "Compute incidence rates and proportions",
      "treatment-patterns": "Analyze treatment patterns in a study population",
    },
  },
  "cohorts": {
    description: "Cohort construction, evaluation, and phenotyping",
    repos: {
      "capr": "Develop cohort definitions programmatically in R",
      "circe-r": "R wrapper for Circe cohort definition library",
      "cohort-generator": "Instantiate cohorts in a database",
      "phenotype-library": "Collection of pre-defined community cohorts",
      "cohort-diagnostics": "Diagnostics to evaluate cohort definitions",
      "phevaluator": "Semi-automated cohort evaluation (sensitivity/specificity)",
      "cohort-explorer": "Visual exploration of individual patient data in cohorts",
      "keeper": "Knowledge-Enhanced Electronic Profile Review",
    },
  },
  "quality": {
    description: "Data quality and evidence quality assessment",
    repos: {
      "achilles": "Descriptive statistics on an OMOP CDM database",
      "data-quality-dashboard": "Expose and evaluate observational data quality",
      "empirical-calibration": "Calibrate analyses using negative controls",
      "method-evaluation": "Evaluate method performance with real data",
    },
  },
  "infrastructure": {
    description: "Supporting packages for database, computation, and utilities",
    repos: {
      "database-connector": "Connect to a wide range of database platforms",
      "sql-render": "Generate SQL for various SQL dialects",
      "feature-extraction": "Extract large feature sets for cohorts",
      "cyclops": "Regularized logistic, Poisson and Cox regression",
      "andromeda": "Store and manipulate very large data objects locally",
      "eunomia": "Standard CDM dataset for testing and demos",
      "parallel-logger": "Parallel computation with logging",
      "result-model-manager": "Data migrations for result models",
      "ohdsi-shiny-modules": "Shiny modules for result visualization",
    },
  },
  "studies": {
    description: "Strategus study design templates and reference implementations",
    repos: {
      "strategus-study-template": "Official Strategus study repo template with standard file structure",
      "tutorial-strategus-study": "Annotated Strategus tutorial study — canonical reference for network-study coordinator vs site workflow",
      "ehden-hmb": "EHDEN Heavy Menstrual Bleeding — CohortMethod estimation example",
      "legendt2dm": "LEGEND-T2DM — Large-scale multi-database estimation study",
      "reward": "REWARD — Characterization and incidence study example",
    },
  },
  "reference": {
    description: "OHDSI reference documentation and textbooks",
    repos: {
      "book-of-ohdsi-2nd": "The Book of OHDSI (2nd Edition) — comprehensive methodology reference",
    },
  },
};

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
  "__pycache__", ".cache", ".turbo", ".nuxt", "coverage",
]);
const EXCLUDED_FILES = new Set([
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb",
]);
const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".vue", ".svelte", ".astro",
  ".html", ".css", ".scss", ".less",
  ".json", ".yaml", ".yml", ".toml",
  ".md", ".mdx", ".sql", ".sh", ".bash",
  ".r", ".R", ".Rmd",
]);

function validateRepo(repo) {
  const url = SUPPORTED_REPOS[repo];
  if (!url) throw new Error(`Unknown repo "${repo}". Use KBListRepos to see all available repositories.`);
  return url;
}

async function ensureKbExists(repo) {
  validateRepo(repo);
  const kbPath = join(KB_BASE_DIR, repo);
  try {
    const stat = await fs.stat(kbPath);
    if (!stat.isDirectory()) throw new Error("Not a directory");
  } catch {
    throw new Error(`Knowledge base "${repo}" is not initialized. Call KBInit with repo: "${repo}" first.`);
  }
  return kbPath;
}

function safeKbJoin(kbPath, ...paths) {
  for (const p of paths) {
    if (!p || p.trim() === "") throw new Error("Empty path segment not allowed");
    if (/^[/\\]/.test(p) || /^~/.test(p) || /^[a-zA-Z]:/.test(p)) {
      throw new Error(`Absolute or special paths not allowed: "${p}"`);
    }
  }
  const resolvedBase = resolve(kbPath);
  const joined = resolve(join(kbPath, ...paths));
  const rel = relative(resolvedBase, joined);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path traversal detected: "${paths.join("/")}"`);
  }
  return joined;
}

const textResult = (text) => ({ content: [{ type: "text", text }] });

// ── Tools ──────────────────────────────────────────────────────────

const kbListRepos = tool(
  "KBListRepos",
  "List available OHDSI knowledge base repositories organized by category. " +
    "Call without arguments to see all categories. Pass a category to filter. " +
    "Categories: atlas, data2evidence, orchestration, estimation, prediction, " +
    "characterization, cohorts, quality, infrastructure, studies, reference.",
  { category: z.string().optional() },
  async (args) => {
    const lines = [];
    if (args.category && !REPO_CATEGORIES[args.category]) {
      return textResult(`Unknown category "${args.category}". Available: ${Object.keys(REPO_CATEGORIES).join(", ")}`);
    }
    const categories = args.category ? { [args.category]: REPO_CATEGORIES[args.category] } : REPO_CATEGORIES;
    for (const [catId, cat] of Object.entries(categories)) {
      lines.push(`## ${catId} — ${cat.description}`);
      for (const [repoId, desc] of Object.entries(cat.repos)) {
        let status = "";
        try {
          await fs.stat(join(KB_BASE_DIR, repoId));
          status = " [initialized]";
        } catch { /* not cloned */ }
        lines.push(`  ${repoId}${status} — ${desc}`);
      }
      lines.push("");
    }
    return textResult(lines.join("\n"));
  },
);

const kbInit = tool(
  "KBInit",
  "Clone an OHDSI reference repository into the local knowledge base. " +
    "Supports the full OHDSI ecosystem — Strategus, HADES packages, Atlas/WebAPI, " +
    "study templates (ehden-hmb, legendt2dm, reward), the Book of OHDSI, and more. " +
    "Skips if already cloned. Use KBListRepos to see all available repos.",
  { repo: z.string() },
  async (args) => {
    const url = validateRepo(args.repo);
    const kbPath = join(KB_BASE_DIR, args.repo);
    try {
      const stat = await fs.stat(kbPath);
      if (stat.isDirectory()) return textResult(`Knowledge base "${args.repo}" is already initialized at ${kbPath}`);
    } catch { /* not cloned yet */ }
    await fs.mkdir(KB_BASE_DIR, { recursive: true });
    try {
      await execAsync(`git clone --depth 1 ${url} ${args.repo}`, { cwd: KB_BASE_DIR, maxBuffer: 50 * 1024 * 1024 });
    } catch (err) {
      throw new Error(`Failed to clone ${url}: ${err.stderr || err.message}`);
    }
    return textResult(`Successfully cloned OHDSI/${args.repo} to ${kbPath}`);
  },
);

const kbUpdate = tool(
  "KBUpdate",
  "Update a knowledge base repository to the latest version (git pull).",
  { repo: z.string() },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    try {
      const { stdout } = await execAsync("git pull", { cwd: kbPath, maxBuffer: 50 * 1024 * 1024 });
      return textResult(`Updated OHDSI/${args.repo}: ${stdout || "Already up to date"}`);
    } catch (err) {
      throw new Error(`Failed to update ${args.repo}: ${err.stderr || err.message}`);
    }
  },
);

const kbRead = tool(
  "KBRead",
  "Read a file from a knowledge base repository. Optionally specify a line range (1-indexed).",
  {
    repo: z.string(),
    path: z.string(),
    start_line: z.number().optional(),
    end_line: z.number().optional(),
  },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    const fullPath = safeKbJoin(kbPath, args.path);
    const content = await fs.readFile(fullPath, "utf8");
    if (args.start_line || args.end_line) {
      const lines = content.split("\n");
      const start = Math.max(1, args.start_line || 1);
      const end = Math.min(lines.length, args.end_line || lines.length);
      return textResult(
        lines.slice(start - 1, end).map((line, i) => `${start + i}: ${line}`).join("\n"),
      );
    }
    return textResult(content);
  },
);

async function walkDir(dir, { onFile, shouldStop }) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldStop && shouldStop()) return;
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, { onFile, shouldStop });
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.has(entry.name)) continue;
      await onFile(fullPath, entry);
    }
  }
}

const kbSearch = tool(
  "KBSearch",
  "Search file contents in a knowledge base repo using a regex pattern. " +
    "Returns matching lines with file path and line numbers.",
  {
    repo: z.string(),
    pattern: z.string(),
    path: z.string().optional(),
    include_glob: z.string().optional(),
    max_results: z.number().optional(),
  },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    const searchDir = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const maxResults = args.max_results ?? 50;
    let regex;
    try { regex = new RegExp(args.pattern, "g"); }
    catch { throw new Error(`Invalid regex pattern: "${args.pattern}"`); }

    let extensions = null;
    if (args.include_glob) {
      const extMatch = args.include_glob.match(/\*\.(\{[^}]+\}|[a-zA-Z0-9]+)/);
      if (extMatch) {
        const raw = extMatch[1];
        extensions = raw.startsWith("{")
          ? new Set(raw.slice(1, -1).split(",").map((e) => `.${e.trim()}`))
          : new Set([`.${raw}`]);
      }
    }

    const matches = [];
    await walkDir(searchDir, {
      shouldStop: () => matches.length >= maxResults,
      onFile: async (fullPath, entry) => {
        if (matches.length >= maxResults) return;
        if (extensions) {
          const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop()}` : "";
          if (!extensions.has(ext)) return;
        }
        let content;
        try { content = await fs.readFile(fullPath, "utf8"); } catch { return; }
        const lines = content.split("\n");
        const relPath = relative(kbPath, fullPath);
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          regex.lastIndex = 0;
          if (regex.test(lines[i])) matches.push(`${relPath}:${i + 1}: ${lines[i]}`);
        }
      },
    });

    if (matches.length === 0) return textResult(`No matches found for pattern: ${args.pattern}`);
    const suffix = matches.length >= maxResults ? `\n\n(results truncated at ${maxResults})` : "";
    return textResult(matches.join("\n") + suffix);
  },
);

const kbListFiles = tool(
  "KBListFiles",
  "List files and directories in a knowledge base repository. " +
    "Excludes node_modules, .git, dist, etc. by default.",
  {
    repo: z.string(),
    path: z.string().optional(),
    recursive: z.boolean().optional(),
  },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    const dirPath = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const recursive = args.recursive ?? false;
    const entries = [];

    async function walk(dir) {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of items) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        const rel = relative(kbPath, fullPath);
        entries.push(entry.isDirectory() ? `${rel}/` : rel);
        if (recursive && entry.isDirectory()) await walk(fullPath);
      }
    }
    await walk(dirPath);
    entries.sort();
    return textResult(entries.length === 0 ? "Directory is empty." : entries.join("\n"));
  },
);

const kbOverview = tool(
  "KBOverview",
  "Get a quick overview of a knowledge base repository: top-level structure, " +
    "file counts by extension, and total file count.",
  { repo: z.string() },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    const extCounts = {};
    let totalFiles = 0;
    let totalDirs = 0;

    const topLevel = [];
    for (const entry of await fs.readdir(kbPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
      topLevel.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
    }
    topLevel.sort();

    async function walk(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          totalDirs++;
          await walk(fullPath);
        } else if (entry.isFile()) {
          totalFiles++;
          const ext = entry.name.includes(".")
            ? `.${entry.name.split(".").pop().toLowerCase()}`
            : "(no ext)";
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        }
      }
    }
    await walk(kbPath);

    const lines = [
      `# ${args.repo} (OHDSI/${args.repo})`,
      "",
      "## Top-level structure",
      ...topLevel.map((e) => `  ${e}`),
      "",
      `## Stats: ${totalFiles} files, ${totalDirs} directories`,
      "",
      "## Files by extension",
      ...Object.entries(extCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([ext, count]) => `  ${ext}: ${count}`),
    ];
    return textResult(lines.join("\n"));
  },
);

const SYMBOL_PATTERN = new RegExp(
  [
    String.raw`^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+`,
    String.raw`^\s*(?:export\s+)?(?:default\s+)?class\s+\w+`,
    String.raw`^\s*(?:export\s+)?interface\s+\w+`,
    String.raw`^\s*(?:export\s+)?type\s+\w+\s*[=<]`,
    String.raw`^\s*(?:export\s+)?(?:const|let|var)\s+\w+`,
    String.raw`^\s*(?:async\s+)?def\s+\w+`,
    String.raw`^\s*class\s+\w+`,
    String.raw`^\s*\w+\s*<-\s*function`,
    String.raw`^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE)\s+`,
    String.raw`^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+\w+`,
  ].join("|"),
  "i",
);

const kbFindSymbols = tool(
  "KBFindSymbols",
  "Search for function, class, type, and interface definitions in a knowledge base repo. " +
    "More targeted than KBSearch for navigating code.",
  {
    repo: z.string(),
    query: z.string(),
    path: z.string().optional(),
    max_results: z.number().optional(),
  },
  async (args) => {
    const kbPath = await ensureKbExists(args.repo);
    const searchDir = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const maxResults = args.max_results ?? 30;
    const queryLower = args.query.toLowerCase();
    const matches = [];

    await walkDir(searchDir, {
      shouldStop: () => matches.length >= maxResults,
      onFile: async (fullPath, entry) => {
        if (matches.length >= maxResults) return;
        const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop().toLowerCase()}` : "";
        if (!CODE_EXTENSIONS.has(ext)) return;
        let content;
        try { content = await fs.readFile(fullPath, "utf8"); } catch { return; }
        const lines = content.split("\n");
        const relPath = relative(kbPath, fullPath);
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          const line = lines[i];
          if (SYMBOL_PATTERN.test(line) && line.toLowerCase().includes(queryLower)) {
            matches.push(`${relPath}:${i + 1}: ${line.trimStart()}`);
          }
        }
      },
    });

    if (matches.length === 0) return textResult(`No symbol definitions found matching: "${args.query}"`);
    const suffix = matches.length >= maxResults ? `\n\n(results truncated at ${maxResults})` : "";
    return textResult(matches.join("\n") + suffix);
  },
);

export const kbMcpServer = createSdkMcpServer({
  name: "kb",
  version: "0.1.0",
  tools: [kbListRepos, kbInit, kbUpdate, kbRead, kbSearch, kbListFiles, kbOverview, kbFindSymbols],
});
