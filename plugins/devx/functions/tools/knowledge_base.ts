// @ts-nocheck - Deno edge function
/**
 * Knowledge base tools — clone and explore OHDSI reference repositories.
 * The KB is separate from the app workspace; repos live under /tmp/devx-kb/.
 */

import type { ToolDefinition } from "./types.ts";
import { EXCLUDED_DIRS, EXCLUDED_FILES } from "./path_safety.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { join, relative, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

// ── Supported repositories ──────────────────────────────────────────

const SUPPORTED_REPOS: Record<string, string> = {
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

/** Repos organized by category for discovery */
const REPO_CATEGORIES: Record<string, { description: string; repos: Record<string, string> }> = {
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

const KB_BASE_DIR = "/tmp/devx-kb";

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

// ── Helpers ─────────────────────────────────────────────────────────

function validateRepo(repo: string): string {
  const url = SUPPORTED_REPOS[repo];
  if (!url) {
    throw new Error(
      `Unknown repo "${repo}". Use kb_list_repos to see all available repositories.`,
    );
  }
  return url;
}

function getKbPath(repo: string): string {
  validateRepo(repo);
  return join(KB_BASE_DIR, repo);
}

async function ensureKbExists(repo: string): Promise<string> {
  const kbPath = getKbPath(repo);
  try {
    const stat = await Deno.stat(kbPath);
    if (!stat.isDirectory) throw new Error("Not a directory");
  } catch {
    throw new Error(
      `Knowledge base "${repo}" is not initialized. Call kb_init with repo: "${repo}" first.`,
    );
  }
  return kbPath;
}

/** Safe path join within KB repo — prevents directory traversal */
function safeKbJoin(kbPath: string, ...paths: string[]): string {
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

// ── kb_list_repos ───────────────────────────────────────────────────

export const kbListReposTool: ToolDefinition<{ category?: string }> = {
  name: "KBListRepos",
  description:
    "List available OHDSI knowledge base repositories organized by category. " +
    "Call without arguments to see all categories and repos. " +
    "Pass a category to see only repos in that category. " +
    "Categories: atlas, data2evidence, orchestration, estimation, prediction, characterization, cohorts, quality, infrastructure, studies, reference.",
  parameters: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional category filter (atlas, data2evidence, orchestration, estimation, prediction, characterization, cohorts, quality, infrastructure, studies, reference)",
      },
    },
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const lines: string[] = [];

    const categories = args.category
      ? { [args.category]: REPO_CATEGORIES[args.category] }
      : REPO_CATEGORIES;

    if (args.category && !REPO_CATEGORIES[args.category]) {
      return `Unknown category "${args.category}". Available: ${Object.keys(REPO_CATEGORIES).join(", ")}`;
    }

    for (const [catId, cat] of Object.entries(categories)) {
      lines.push(`## ${catId} — ${cat.description}`);
      for (const [repoId, desc] of Object.entries(cat.repos)) {
        // Check if initialized
        let status = "";
        try {
          await Deno.stat(join(KB_BASE_DIR, repoId));
          status = " [initialized]";
        } catch { /* not cloned */ }
        lines.push(`  ${repoId}${status} — ${desc}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  },
};

// ── kb_init ─────────────────────────────────────────────────────────

export const kbInitTool: ToolDefinition<{ repo: string }> = {
  name: "KBInit",
  description:
    "Initialize a knowledge base by cloning an OHDSI reference repository. " +
    "Supported: atlas, webapi, hades, strategus, data2evidence, and all HADES packages " +
    "(patient-level-prediction, cohort-method, characterization, achilles, cohort-diagnostics, " +
    "feature-extraction, database-connector, sql-render, cohort-generator, etc.). " +
    "Skips if already cloned.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
    },
    required: ["repo"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) {
    return `Clone OHDSI/${args.repo} knowledge base`;
  },

  async execute(args) {
    const url = validateRepo(args.repo);
    const kbPath = join(KB_BASE_DIR, args.repo);

    // Check if already cloned
    try {
      const stat = await Deno.stat(kbPath);
      if (stat.isDirectory) {
        return `Knowledge base "${args.repo}" is already initialized at ${kbPath}`;
      }
    } catch {
      // Not cloned yet — proceed
    }

    // Ensure base directory exists
    await Deno.mkdir(KB_BASE_DIR, { recursive: true });

    // Clone with depth 1 for speed
    const result = JSON.parse(
      await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(KB_BASE_DIR)}', 'git clone --depth 1 ${escapeSql(url)} ${escapeSql(args.repo)}')`,
      ),
    );

    if (!result.ok) {
      throw new Error(`Failed to clone ${url}: ${result.output || "Unknown error"}`);
    }

    return `Successfully cloned OHDSI/${args.repo} to ${kbPath}`;
  },
};

// ── kb_update ───────────────────────────────────────────────────────

export const kbUpdateTool: ToolDefinition<{ repo: string }> = {
  name: "KBUpdate",
  description:
    "Update a knowledge base repository to the latest version by running git pull. " +
    "The repo must be initialized first with kb_init.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
    },
    required: ["repo"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) {
    return `Update OHDSI/${args.repo} knowledge base (git pull)`;
  },

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);

    const result = JSON.parse(
      await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(kbPath)}', 'git pull')`,
      ),
    );

    if (!result.ok) {
      throw new Error(`Failed to update ${args.repo}: ${result.output || "Unknown error"}`);
    }

    return `Updated OHDSI/${args.repo}: ${result.output || "Already up to date"}`;
  },
};

// ── kb_read ─────────────────────────────────────────────────────────

export const kbReadTool: ToolDefinition<{
  repo: string;
  path: string;
  start_line?: number;
  end_line?: number;
}> = {
  name: "KBRead",
  description:
    "Read a file from a knowledge base repository. Optionally specify a line range (1-indexed).",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
      path: { type: "string", description: "Relative path within the repo" },
      start_line: { type: "number", description: "First line to include (1-indexed)" },
      end_line: { type: "number", description: "Last line to include (1-indexed)" },
    },
    required: ["repo", "path"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);
    const fullPath = safeKbJoin(kbPath, args.path);
    const content = await Deno.readTextFile(fullPath);

    if (args.start_line || args.end_line) {
      const lines = content.split("\n");
      const start = Math.max(1, args.start_line || 1);
      const end = Math.min(lines.length, args.end_line || lines.length);
      return lines
        .slice(start - 1, end)
        .map((line, i) => `${start + i}: ${line}`)
        .join("\n");
    }

    return content;
  },
};

// ── kb_search ───────────────────────────────────────────────────────

export const kbSearchTool: ToolDefinition<{
  repo: string;
  pattern: string;
  path?: string;
  include_glob?: string;
  max_results?: number;
}> = {
  name: "KBSearch",
  description:
    "Search file contents in a knowledge base repo with a regex pattern. " +
    "Returns matching lines with file path and line numbers.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Relative directory to search in (default: repo root)" },
      include_glob: { type: "string", description: "File extension filter, e.g. '*.ts' or '*.{ts,tsx}'" },
      max_results: { type: "number", description: "Maximum matching lines (default: 50)" },
    },
    required: ["repo", "pattern"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);
    const searchDir = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const maxResults = args.max_results ?? 50;

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern, "g");
    } catch {
      throw new Error(`Invalid regex pattern: "${args.pattern}"`);
    }

    // Parse include glob
    let extensions: Set<string> | null = null;
    if (args.include_glob) {
      const extMatch = args.include_glob.match(/\*\.(\{[^}]+\}|[a-zA-Z0-9]+)/);
      if (extMatch) {
        const raw = extMatch[1];
        if (raw.startsWith("{")) {
          extensions = new Set(raw.slice(1, -1).split(",").map((e) => `.${e.trim()}`));
        } else {
          extensions = new Set([`.${raw}`]);
        }
      }
    }

    const matches: string[] = [];

    async function walk(dir: string) {
      if (matches.length >= maxResults) return;
      for await (const entry of Deno.readDir(dir)) {
        if (matches.length >= maxResults) return;
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          if (EXCLUDED_FILES.has(entry.name)) continue;
          if (extensions) {
            const ext = entry.name.includes(".") ? `.${entry.name.split(".").pop()}` : "";
            if (!extensions.has(ext)) continue;
          }
          try {
            const content = await Deno.readTextFile(fullPath);
            const lines = content.split("\n");
            const relPath = relative(kbPath, fullPath);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;
              regex.lastIndex = 0;
              if (regex.test(lines[i])) {
                matches.push(`${relPath}:${i + 1}: ${lines[i]}`);
              }
            }
          } catch { /* skip binary */ }
        }
      }
    }

    await walk(searchDir);

    if (matches.length === 0) {
      return `No matches found for pattern: ${args.pattern}`;
    }
    const suffix = matches.length >= maxResults ? `\n\n(results truncated at ${maxResults})` : "";
    return matches.join("\n") + suffix;
  },
};

// ── kb_list_files ───────────────────────────────────────────────────

export const kbListFilesTool: ToolDefinition<{
  repo: string;
  path?: string;
  recursive?: boolean;
}> = {
  name: "KBListFiles",
  description:
    "List files and directories in a knowledge base repository. " +
    "Excludes node_modules, .git, dist, etc. by default.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
      path: { type: "string", description: "Relative directory path (default: repo root)" },
      recursive: { type: "boolean", description: "List files recursively (default: false)" },
    },
    required: ["repo"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);
    const dirPath = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const recursive = args.recursive ?? false;
    const entries: string[] = [];

    async function walk(dir: string) {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        const rel = relative(kbPath, fullPath);
        entries.push(entry.isDirectory ? `${rel}/` : rel);

        if (recursive && entry.isDirectory) {
          await walk(fullPath);
        }
      }
    }

    await walk(dirPath);
    entries.sort();

    if (entries.length === 0) return "Directory is empty.";
    return entries.join("\n");
  },
};

// ── kb_overview ─────────────────────────────────────────────────────

export const kbOverviewTool: ToolDefinition<{ repo: string }> = {
  name: "KBOverview",
  description:
    "Get a quick overview of a knowledge base repository: top-level directory structure, " +
    "file counts by extension, and total file count. Useful for orientation.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
    },
    required: ["repo"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);
    const extCounts: Record<string, number> = {};
    let totalFiles = 0;
    let totalDirs = 0;

    // Collect top-level entries
    const topLevel: string[] = [];
    for await (const entry of Deno.readDir(kbPath)) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;
      topLevel.push(entry.isDirectory ? `${entry.name}/` : entry.name);
    }
    topLevel.sort();

    // Walk for stats
    async function walk(dir: string) {
      for await (const entry of Deno.readDir(dir)) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          totalDirs++;
          await walk(fullPath);
        } else if (entry.isFile) {
          totalFiles++;
          const ext = entry.name.includes(".")
            ? `.${entry.name.split(".").pop()?.toLowerCase()}`
            : "(no ext)";
          extCounts[ext] = (extCounts[ext] || 0) + 1;
        }
      }
    }

    await walk(kbPath);

    // Format output
    const lines: string[] = [
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

    return lines.join("\n");
  },
};

// ── kb_find_symbols ─────────────────────────────────────────────────

const SYMBOL_PATTERN = new RegExp(
  [
    // JS/TS: function, class, interface, type, const/let/var exports
    String.raw`^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+`,
    String.raw`^\s*(?:export\s+)?(?:default\s+)?class\s+\w+`,
    String.raw`^\s*(?:export\s+)?interface\s+\w+`,
    String.raw`^\s*(?:export\s+)?type\s+\w+\s*[=<]`,
    String.raw`^\s*(?:export\s+)?(?:const|let|var)\s+\w+`,
    // Python: def, class
    String.raw`^\s*(?:async\s+)?def\s+\w+`,
    String.raw`^\s*class\s+\w+`,
    // R: function assignment
    String.raw`^\s*\w+\s*<-\s*function`,
    // SQL: CREATE TABLE/VIEW/FUNCTION
    String.raw`^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE)\s+`,
    // Java/Kotlin: public/private/protected class/interface
    String.raw`^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:abstract\s+)?(?:class|interface|enum)\s+\w+`,
  ].join("|"),
  "i",
);

export const kbFindSymbolsTool: ToolDefinition<{
  repo: string;
  query: string;
  path?: string;
  max_results?: number;
}> = {
  name: "KBFindSymbols",
  description:
    "Search for function, class, type, and interface definitions in a knowledge base repo. " +
    "Finds symbol definitions matching the query string. More targeted than kb_search for navigating code.",
  parameters: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "Repository ID (e.g. atlas, webapi, patient-level-prediction, cohort-method, achilles). Use kb_list_repos to see all available.",
      },
      query: { type: "string", description: "Symbol name or substring to search for" },
      path: { type: "string", description: "Relative directory to search in (default: repo root)" },
      max_results: { type: "number", description: "Maximum results (default: 30)" },
    },
    required: ["repo", "query"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args) {
    const kbPath = await ensureKbExists(args.repo);
    const searchDir = args.path ? safeKbJoin(kbPath, args.path) : kbPath;
    const maxResults = args.max_results ?? 30;
    const queryLower = args.query.toLowerCase();
    const matches: string[] = [];

    async function walk(dir: string) {
      if (matches.length >= maxResults) return;
      for await (const entry of Deno.readDir(dir)) {
        if (matches.length >= maxResults) return;
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          if (EXCLUDED_FILES.has(entry.name)) continue;
          const ext = entry.name.includes(".")
            ? `.${entry.name.split(".").pop()?.toLowerCase()}`
            : "";
          if (!CODE_EXTENSIONS.has(ext)) continue;

          try {
            const content = await Deno.readTextFile(fullPath);
            const lines = content.split("\n");
            const relPath = relative(kbPath, fullPath);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;
              const line = lines[i];
              // Must be a symbol definition AND contain the query
              if (
                SYMBOL_PATTERN.test(line) &&
                line.toLowerCase().includes(queryLower)
              ) {
                matches.push(`${relPath}:${i + 1}: ${line.trimStart()}`);
              }
            }
          } catch { /* skip binary */ }
        }
      }
    }

    await walk(searchDir);

    if (matches.length === 0) {
      return `No symbol definitions found matching: "${args.query}"`;
    }
    const suffix = matches.length >= maxResults ? `\n\n(results truncated at ${maxResults})` : "";
    return matches.join("\n") + suffix;
  },
};
