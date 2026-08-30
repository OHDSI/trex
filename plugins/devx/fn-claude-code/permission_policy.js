import fs from "node:fs";
import path from "node:path";

// The policy tier for the coder's SDK session.
//
// eve gates every sidecar tool call through `canUseTool` (server.js's
// canUseTool -> the devx side's answerPermissionRequest -> eve's approval
// gate). Per @anthropic-ai/claude-agent-sdk@0.3.214's own types, that callback
// is reached ONLY on the `ask` outcome: allow rules, deny rules and PreToolUse
// hooks all resolve first (sdk.d.ts:4111 — "PreToolUse hook denies bypass
// canUseTool" — and the SDK's own shadowing warning, "Allow rules from
// settings files can also shadow the callback").
//
// `settingSources: ["user"]` is what lets the SDK discover the devx skills
// materialized into ~/.claude/skills, so it has to stay — but it also loads
// ~/.claude/settings.json, a file on a mounted volume that the coder itself
// can write with an ordinary Write or `echo`. Three keys in that file each
// route around the gate, persistently and across container restarts:
//
//   1. permissions.allow       (sdk.d.ts:4980) — shadows the callback
//   2. permissions.defaultMode (sdk.d.ts:4993) — 'bypassPermissions'
//                                                auto-approves every call
//   3. hooks.PreToolUse        (sdk.d.ts:5094) — a hook returning
//                                                permissionDecision 'allow'
//
// managedSettings is the SDK's policy tier, supplied in-process by the
// spawning parent (sdk.d.ts:1849-1862) and filtered restrictive-only. The
// coder cannot write it. Each lock below closes exactly one of the three and
// they are NOT interchangeable: the restrictive-only filter covers the
// permissions ARRAYS, not hooks, which need their own key.
export const MANAGED_PERMISSION_POLICY = Object.freeze({
  permissions: Object.freeze({
    // Closes (2). 'default' is the ask-first mode; the explicit disable makes
    // bypassPermissions unreachable even if something else selects it.
    defaultMode: "default",
    disableBypassPermissionsMode: "disable",
  }),
  // Closes (1): "only permission rules (allow/deny/ask) from managed settings
  // are respected. User, project, local, and CLI argument permission rules are
  // ignored" (sdk.d.ts:5359). We declare none, so every user-tier rule is
  // ignored and every call falls through to the ask path.
  allowManagedPermissionRulesOnly: true,
  // Closes (3): "only hooks from managed settings run. User, project, and
  // local hooks are ignored" (sdk.d.ts:5349). We declare none, so no
  // settings-file hook runs. devx's own PreToolUse/Stop hooks are unaffected —
  // those are devx's (functions/skills/hooks.ts), not the SDK's.
  allowManagedHooksOnly: true,
});

// Stamped onto every query's options. Deliberately not merged with anything
// read from disk: the point of this tier is that no tool call can reach it.
export function applyPermissionPolicy(opts) {
  return { ...opts, managedSettings: MANAGED_PERMISSION_POLICY };
}

export function claudeSettingsPath(home) {
  return path.join(home || process.env.HOME || "/home/node", ".claude", "settings.json");
}

// Repo policy: the coder's commits and PRs must NOT carry any tool co-author
// trailer or generated-by footer. The agent SDK adds those by default;
// settingSources:["user"] makes it read the user settings dir, so setting
// includeCoAuthoredBy=false there suppresses both the commit trailer and the
// PR footer.
//
// This read-modify-writes the same file the coder can write and preserves every
// key it does not recognise — a hostile permissions block included. That is
// deliberately NOT the security boundary; MANAGED_PERMISSION_POLICY is,
// because it lives in process memory.
export function disableCoderAttribution(home) {
  try {
    const file = claudeSettingsPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let settings = {};
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch { /* none yet */ }
    if (settings.includeCoAuthoredBy !== false) {
      settings.includeCoAuthoredBy = false;
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));
      console.log("[coder-server] disabled commit/PR co-author attribution");
    }
  } catch (err) {
    console.warn("[claude-code-server] could not disable co-authored-by:", err?.message || err);
  }
}
