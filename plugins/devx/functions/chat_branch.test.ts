import { assertEquals } from "jsr:@std/assert";
import { disambiguateBranch, resolveChatBranch } from "./chat_branch.ts";

const CHAT = "0f556950-f1a8-47fe-84e2-c8b4ed0e3caf";

Deno.test("disambiguateBranch: untaken names pass through; collisions get a chat suffix", () => {
  assertEquals(disambiguateBranch("ohdsi-trex/topic", [], CHAT), "ohdsi-trex/topic");
  assertEquals(
    disambiguateBranch("ohdsi-trex/topic", ["ohdsi-trex/topic"], CHAT),
    "ohdsi-trex/topic-0f5569",
  );
  // `git branch` marks the current branch with a leading "* " — a name that
  // only differs by that marker is still taken.
  assertEquals(
    disambiguateBranch("ohdsi-trex/topic", ["* ohdsi-trex/topic", "develop"], CHAT),
    "ohdsi-trex/topic-0f5569",
  );
  // A chat id with no alphanumerics still yields a suffix rather than a
  // trailing hyphen.
  assertEquals(disambiguateBranch("o/t", ["o/t"], "---"), "o/t-chat");
});

/**
 * Minimal sqlFn fake. Matching is by substring on the statement because these
 * are multi-line template literals in the caller — a whitespace-exact compare
 * would silently never match and every assertion would pass vacuously.
 */
function fakeSql(handlers: Array<[RegExp, (params: unknown[]) => unknown]>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const fn = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    for (const [re, rows] of handlers) {
      if (re.test(sql)) {
        const r = rows(params);
        return { rows: Array.isArray(r) ? r : [] };
      }
    }
    return { rows: [] };
  };
  return { fn, calls };
}

Deno.test("resolveChatBranch: an already pinned branch is returned verbatim and never recomputed", async () => {
  const { fn, calls } = fakeSql([
    [/SELECT worktree_branch/, () => [{ worktree_branch: "ohdsi-trex/add-thing" }]],
  ]);
  assertEquals(
    await resolveChatBranch("u1", CHAT, "/repo", [], fn),
    "ohdsi-trex/add-thing",
  );
  // Exactly one read, no UPDATE: re-pinning on every turn is how the reuse
  // guard would start seeing its own worktree as foreign.
  assertEquals(calls.length, 1);
  assertEquals(calls.some((c) => /UPDATE devx\.chats/.test(c.sql)), false);
});

Deno.test("resolveChatBranch: first use builds <owner>/<topic> from the integration and title, then pins it", async () => {
  const { fn, calls } = fakeSql([
    [/SELECT worktree_branch/, () => [{ worktree_branch: null }]],
    [/FROM devx\.integrations/, () => [{ metadata: { username: "ohdsi-trex" } }]],
    [/SELECT title/, () => [{ title: "Add data source UI plugin" }]],
  ]);
  assertEquals(
    await resolveChatBranch("u1", CHAT, "/repo", [], fn),
    "ohdsi-trex/add-data-source-ui-plugin",
  );
  const update = calls.find((c) => /UPDATE devx\.chats/.test(c.sql));
  assertEquals(update?.params, ["ohdsi-trex/add-data-source-ui-plugin", CHAT]);
});

Deno.test("resolveChatBranch: the default chat title is not a topic — the chat id is used instead", async () => {
  const { fn } = fakeSql([
    [/SELECT worktree_branch/, () => [{ worktree_branch: null }]],
    [/FROM devx\.integrations/, () => [{ metadata: '{"username":"ohdsi-trex"}' }]],
    [/SELECT title/, () => [{ title: "New Chat" }]],
  ]);
  // Every unnamed chat would otherwise land on `ohdsi-trex/new-chat` and
  // collide with each other.
  assertEquals(
    await resolveChatBranch("u1", CHAT, "/repo", [], fn),
    `ohdsi-trex/${CHAT.slice(0, 40)}`,
  );
});

Deno.test("resolveChatBranch: without a sql handle the legacy name is used, unchanged", async () => {
  // No handle means no pin, and an unpinnable name could differ next turn —
  // a stable legacy name beats an unstable correct one for the reuse guard.
  assertEquals(await resolveChatBranch("u1", CHAT, "/repo", [], undefined), `claw/${CHAT.slice(0, 40)}`);
});

Deno.test("resolveChatBranch: a failed pin write falls back to the legacy name", async () => {
  const fn = async (sql: string) => {
    if (/SELECT worktree_branch/.test(sql)) return { rows: [{ worktree_branch: null }] };
    if (/FROM devx\.integrations/.test(sql)) return { rows: [{ metadata: { username: "ohdsi-trex" } }] };
    if (/SELECT title/.test(sql)) return { rows: [{ title: "Some topic" }] };
    if (/UPDATE devx\.chats/.test(sql)) throw new Error("column worktree_branch does not exist");
    return { rows: [] };
  };
  assertEquals(await resolveChatBranch("u1", CHAT, "/repo", [], fn), `claw/${CHAT.slice(0, 40)}`);
});

Deno.test("resolveChatBranch: a failed pin READ falls back without attempting to compute a name", async () => {
  let touchedIntegrations = false;
  const fn = async (sql: string) => {
    if (/SELECT worktree_branch/.test(sql)) throw new Error("column worktree_branch does not exist");
    if (/FROM devx\.integrations/.test(sql)) touchedIntegrations = true;
    return { rows: [] };
  };
  assertEquals(await resolveChatBranch("u1", CHAT, "/repo", [], fn), `claw/${CHAT.slice(0, 40)}`);
  assertEquals(touchedIntegrations, false);
});

Deno.test("resolveChatBranch: a computed name that collides is disambiguated before it is pinned", async () => {
  const { fn, calls } = fakeSql([
    [/SELECT worktree_branch/, () => [{ worktree_branch: null }]],
    [/FROM devx\.integrations/, () => [{ metadata: { username: "ohdsi-trex" } }]],
    [/SELECT title/, () => [{ title: "Add thing" }]],
  ]);
  const branch = await resolveChatBranch("u1", CHAT, "/repo", ["ohdsi-trex/add-thing"], fn);
  assertEquals(branch, "ohdsi-trex/add-thing-0f5569");
  assertEquals(calls.find((c) => /UPDATE devx\.chats/.test(c.sql))?.params?.[0], branch);
});
