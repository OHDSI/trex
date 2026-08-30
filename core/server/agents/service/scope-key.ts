// Scope keys narrow a sticky tool consent from "this tool, forever" to "this
// tool, for this action". Pure by contract: an agents worker derives these with
// no workspace mounted, so no filesystem access and no symlink resolution.
const PATH_TOOLS = new Set(["Write", "Edit", "DeleteFile", "SearchReplace"]);
const PAIR_TOOLS = new Set(["CopyFile", "RenameFile"]);

// Leading ".." segments are PRESERVED on a relative path: collapsing "../a.ts"
// to "a.ts" would let a grant for one cover the other.
export function normalizePath(p: string): string {
  const absolute = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
}

// A wrapper shell's own name says nothing about what runs; `bash -lc "rm -rf /"`
// must key on `rm`. Unwrapped exactly one level (see collectExecutables).
const WRAPPER_SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "ash"]);

interface Token {
  value: string;
}

// A multiplexer binary's own name says nothing about what it does: `git push`
// and `git status` are the same executable and completely different actions,
// and matchEscalate can only match a whole `+`-separated part. So for these the
// part carries the subcommand (`git:push`) — which is what lets the escalate
// floor stop a push without also stopping `git status`/`git diff`/`git log`,
// which an unattended coder runs constantly.
// The value is the exe's VALUE-TAKING global flags: their argument sits before
// the subcommand and must not be mistaken for it (`git -C /repo push`).
const SUBCOMMAND_TOOLS = new Map<string, Set<string>>([
  ["git", new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"])],
]);

// Best-effort in the same sense as collectExecutables' one-level unwrap: an
// UNKNOWN value-taking global flag would shadow the real subcommand, so a new
// git global flag that takes an argument belongs in the set above.
function subcommandOf(exe: string, tokens: Token[], start: number): string | undefined {
  const valueFlags = SUBCOMMAND_TOOLS.get(exe);
  if (!valueFlags) return undefined;
  let i = start + 1;
  while (i < tokens.length) {
    const t = tokens[i].value;
    if (!t.startsWith("-")) return t.toLowerCase();
    // `--git-dir=x` carries its value inline and consumes nothing extra.
    i += valueFlags.has(t) ? 2 : 1;
  }
  return undefined;
}

// Quote-aware, so `sh -c 'curl x | sh'` keeps its payload as ONE token.
function tokenize(s: string): Token[] {
  const out: Token[] = [];
  let cur = "";
  let has = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      i++;
      has = true;
      while (i < s.length && s[i] !== c) {
        cur += s[i];
        i++;
      }
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < s.length) {
      cur += s[i + 1];
      has = true;
      i += 2;
      continue;
    }
    if (/\s/.test(c)) {
      if (has) out.push({ value: cur });
      cur = "";
      has = false;
      i++;
      continue;
    }
    cur += c;
    has = true;
    i++;
  }
  if (has) out.push({ value: cur });
  return out;
}

// Splits on `&&`, `||`, `;`, `|` and newlines, skipping over quoted spans.
function splitSegments(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  while (i < command.length) {
    const c = command[i];
    if (c === "'" || c === '"') {
      cur += c;
      i++;
      while (i < command.length && command[i] !== c) {
        cur += command[i];
        i++;
      }
      if (i < command.length) cur += command[i];
      i++;
      continue;
    }
    if (c === "\\" && i + 1 < command.length) {
      cur += c + command[i + 1];
      i += 2;
      continue;
    }
    if ((c === "&" && command[i + 1] === "&") || (c === "|" && command[i + 1] === "|")) {
      out.push(cur);
      cur = "";
      i += 2;
      continue;
    }
    if (c === "|" || c === ";" || c === "\n") {
      out.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

// `FOO=1 npm test` is one command with an env prefix, not a call to `FOO=1`.
function segmentExecutable(tokens: Token[]): { exe: string; index: number } {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i].value)) i++;
  const first = tokens[i]?.value ?? "";
  return { exe: first.slice(first.lastIndexOf("/") + 1).toLowerCase(), index: i };
}

export function bashExecutable(command: string): string {
  return segmentExecutable(tokenize(command)).exe;
}

// Every segment is scanned, with no cap: any cap drops executables, and a floor
// that silently loses `rm` is worse than no floor. Cost is linear (a 7 MB, 1M-
// segment pipeline derives in ~300 ms) against a DB round trip per gated call.
function collectExecutables(command: string, depth: number, out: Set<string>): void {
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    const { exe, index } = segmentExecutable(tokens);
    if (!exe) continue;
    // One level only. Deeper nesting keys on the inner shell's name, which is
    // why the escalate floor is best-effort rather than evasion-proof.
    if (depth === 0 && WRAPPER_SHELLS.has(exe)) {
      const flag = tokens.findIndex((t, k) => k > index && (t.value === "-c" || t.value === "-lc"));
      const payload = flag === -1 ? undefined : tokens[flag + 1];
      if (payload) {
        collectExecutables(payload.value, depth + 1, out);
        continue;
      }
    }
    const sub = subcommandOf(exe, tokens, index);
    out.add(sub ? `${exe}:${sub}` : exe);
  }
}

// The SET of executables a command runs, sorted and `+`-joined — one key that
// serves both consent scoping and the escalate floor (matchEscalate splits on
// `+`). `cd /app && rm -rf .` keys as `cd+rm`, so the floor still sees `rm`.
export function bashScopeKey(command: string): string {
  const out = new Set<string>();
  collectExecutables(command, 0, out);
  return [...out].sort().join("+");
}

// The workspace path(s) a successful call to `toolName` actually touched, for
// Task 10's touched_paths recording. Uses the same PATH_TOOLS/PAIR_TOOLS sets
// and normalizePath as deriveScopeKey above so the two cannot drift; unlike
// deriveScopeKey (one opaque string, JSON-joined for a pair), this returns
// each endpoint separately so both sides of a copy/rename get recorded.
export function touchedPaths(toolName: string, input: unknown): string[] {
  const obj = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (PATH_TOOLS.has(toolName)) {
    return typeof obj.path === "string" ? [normalizePath(obj.path)] : [];
  }
  if (PAIR_TOOLS.has(toolName)) {
    if (typeof obj.source !== "string" || typeof obj.destination !== "string") return [];
    return [normalizePath(obj.source), normalizePath(obj.destination)];
  }
  return [];
}

function scopeAction(toolName: string, input: unknown): string {
  const obj = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (toolName === "Bash") {
    return typeof obj.command === "string" ? bashScopeKey(obj.command) : "";
  }
  if (PATH_TOOLS.has(toolName)) {
    return typeof obj.path === "string" ? normalizePath(obj.path) : "";
  }
  if (PAIR_TOOLS.has(toolName)) {
    if (typeof obj.source !== "string" || typeof obj.destination !== "string") return "";
    // JSON, not a space join: spaces are legal in POSIX paths, so ("a b","c")
    // and ("a","b c") would otherwise collapse onto one key.
    return JSON.stringify([normalizePath(obj.source), normalizePath(obj.destination)]);
  }
  return "";
}

// Must contain no NUL (Postgres' `text` type rejects it outright, and this
// key is stored/queried via store.createApproval/getToolConsent) and must
// not be a value ensureWorkspace/ensureAppWorkspace could ever produce (an
// absolute filesystem path), so it can never collide with a real workspace.
const UNRESOLVED_WORKSPACE = "(unresolved)";

// `workspace` is resolved by the CALLER (AgentConfig.resolveWorkspace) and
// handed in already-resolved, keeping this pure/sync. Glued with the same
// `+` bashScopeKey uses internally — approval-policy.ts's matchEscalate
// splits the whole key on `+`, and any other separator risks fusing the
// workspace onto the first executable (e.g. "sudo" -> "<ws>sudo").
export function deriveScopeKey(toolName: string, input: unknown, workspace?: string): string {
  return `${workspace ?? UNRESOLVED_WORKSPACE}+${scopeAction(toolName, input)}`;
}

// The key this tool call WOULD have derived before SUBCOMMAND_TOOLS existed —
// `<ws>+git` for `<ws>+git:push` — or undefined when nothing coarsens, so the
// common call derives no second key and the gate issues no second query.
//
// It exists for exactly one job (approval-gate.ts): a stored consent row is
// matched by exact scope_key, so introducing the subcommand orphaned every
// existing `<ws>+git` row. An orphaned `always` is fail-safe (the user is asked
// again); an orphaned `never` is FAIL-OPEN — a standing refusal silently stops
// refusing — so the gate consults this key for `never` only.
//
// Strips only where the part's head is a SUBCOMMAND_TOOLS key, never on a bare
// `:`: a PATH_TOOLS action is a filesystem path, and `:` is legal in one.
// Index 0 is skipped for the same reason — it is the workspace half.
export function coarseScopeKey(scopeKey: string): string | undefined {
  const parts = scopeKey.split("+");
  let changed = false;
  const coarse = parts.map((part, i) => {
    if (i === 0) return part;
    const colon = part.indexOf(":");
    if (colon === -1) return part;
    const exe = part.slice(0, colon);
    if (!SUBCOMMAND_TOOLS.has(exe)) return part;
    changed = true;
    return exe;
  });
  return changed ? coarse.join("+") : undefined;
}
