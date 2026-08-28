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
// Bounds the work a pathological command can cause. A truncated key can only
// omit executables, never invent one.
const MAX_SEGMENTS = 64;

interface Token {
  value: string;
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

function collectExecutables(command: string, depth: number, out: Set<string>): void {
  for (const segment of splitSegments(command).slice(0, MAX_SEGMENTS)) {
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
    out.add(exe);
  }
}

// The SET of executables a command runs, sorted and `+`-joined — one key that
// serves both consent scoping and the escalate floor (matchesEscalate splits on
// `+`). `cd /app && rm -rf .` keys as `cd+rm`, so the floor still sees `rm`.
export function bashScopeKey(command: string): string {
  const out = new Set<string>();
  collectExecutables(command, 0, out);
  return [...out].sort().join("+");
}

export function deriveScopeKey(toolName: string, input: unknown): string {
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
