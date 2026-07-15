// @ts-nocheck - Deno edge function
import { resolveQuestionnaire } from "../tools/plan_tools.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";

// Scan a directory inside the app workspace for *.md files and turn each into
// a read-only "virtual plan" record. Used to surface markdown plans/specs the
// agent writes from the writing-plans / brainstorming skills.
async function readFilePlans(wsPath, subdir, kind) {
  const dir = `${wsPath}/${subdir}`;
  const out = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const filePath = `${dir}/${entry.name}`;
      try {
        const stat = await Deno.stat(filePath);
        const content = await Deno.readTextFile(filePath);
        out.push({
          id: `file:${kind}:${entry.name}`,
          chat_id: "",
          content,
          status: "draft",
          created_at: (stat.birthtime || stat.mtime || new Date()).toISOString(),
          updated_at: (stat.mtime || new Date()).toISOString(),
          chat_title: `${kind === "spec" ? "Spec" : "Plan"}: ${entry.name.replace(/\.md$/, "")}`,
          source: "file",
        });
      } catch { /* unreadable file — skip */ }
    }
  } catch { /* dir doesn't exist — fine */ }
  return out;
}

export async function handlePlanRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /chats/:id/plan — fetch current plan
  const planGetMatch = path.match(/\/chats\/([^/]+)\/plan$/);
  if (planGetMatch && method === "GET") {
    const chatId = planGetMatch[1];
    const chatCheck = await sql(`SELECT id FROM devx.chats WHERE id = $1 AND user_id = $2`, [chatId, userId]);
    if (chatCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const result = await sql(
      `SELECT id, chat_id, content, status, created_at, updated_at FROM devx.plans WHERE chat_id = $1`,
      [chatId],
    );
    if (result.rows.length === 0) {
      return Response.json(null, { headers: corsHeaders });
    }
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // POST /chats/:id/plan/answer — resolve pending questionnaire via DB
  const answerMatch = path.match(/\/chats\/([^/]+)\/plan\/answer$/);
  if (answerMatch && method === "POST") {
    const body = await req.json();
    const { requestId, answers } = body;
    if (!requestId || !answers) {
      return Response.json({ error: "requestId and answers required" }, { status: 400, headers: corsHeaders });
    }
    const resolved = await resolveQuestionnaire(requestId, answers, userId, sql);
    if (!resolved) {
      return Response.json({ error: "Questionnaire not found or expired" }, { status: 404, headers: corsHeaders });
    }
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /apps/:id/plans — list all plans for an app (DB plans + filesystem
  // plans/specs the agent has written to trex/plans and trex/specs, plus the
  // legacy docs/devx/{plans,specs} location)
  const appPlansMatch = path.match(/\/apps\/([^/]+)\/plans$/);
  if (appPlansMatch && method === "GET") {
    const appId = appPlansMatch[1];

    const appCheck = await sql(
      `SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );

    const dbResult = await sql(
      `SELECT p.id, p.chat_id, p.content, p.status, p.created_at, p.updated_at, c.title as chat_title
       FROM devx.plans p
       JOIN devx.chats c ON c.id = p.chat_id
       WHERE c.app_id = $1 AND c.user_id = $2
       ORDER BY p.updated_at DESC`,
      [appId, userId],
    );
    const dbPlans = dbResult.rows.map((r) => ({ ...r, source: "db" }));

    let filePlans = [];
    if (appCheck.rows.length > 0) {
      const wsPath = getAppWorkspacePath(userId, appId);
      // Read from the current trex/ location first, then the legacy docs/devx/
      // location for backward compatibility with older projects.
      const [plans, specs, legacyPlans, legacySpecs] = await Promise.all([
        readFilePlans(wsPath, "trex/plans", "plan"),
        readFilePlans(wsPath, "trex/specs", "spec"),
        readFilePlans(wsPath, "docs/devx/plans", "plan"),
        readFilePlans(wsPath, "docs/devx/specs", "spec"),
      ]);
      // Dedup by id (file:<kind>:<name>) so a file present in both the new and
      // legacy location surfaces once, preferring the trex/ copy. Also drop any
      // file whose content mirrors a DB plan — the WritePlan tool persists to
      // both devx.plans and trex/specs/, and we don't want it listed twice.
      const seen = new Set();
      const dbContents = new Set(dbPlans.map((p) => (p.content || "").trim()));
      filePlans = [...plans, ...specs, ...legacyPlans, ...legacySpecs].filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        if (dbContents.has((p.content || "").trim())) return false;
        return true;
      });
    }

    const combined = [...dbPlans, ...filePlans].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
    return Response.json(combined, { headers: corsHeaders });
  }

  // PATCH /plans/:id/status — update plan status
  const statusMatch = path.match(/\/plans\/([^/]+)\/status$/);
  if (statusMatch && method === "PATCH") {
    const planId = statusMatch[1];
    if (planId.startsWith("file:")) {
      return Response.json(
        { error: "Filesystem plans/specs are read-only — edit the markdown file instead" },
        { status: 400, headers: corsHeaders },
      );
    }
    const body = await req.json();
    const { status } = body;
    if (!status || !["draft", "accepted", "rejected", "implemented"].includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `UPDATE devx.plans SET status = $1, updated_at = NOW()
       WHERE id = $2 AND chat_id IN (SELECT id FROM devx.chats WHERE user_id = $3)
       RETURNING id, status`,
      [status, planId, userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // POST /plans/:id/execute — start an agent-driven run that implements the plan
  // via the subagent-driven-development skill. Creates a subagent_runs row; the
  // UI's agent-run poll auto-starts it through POST /agent-runs/:id/start.
  const execMatch = path.match(/\/plans\/([^/]+)\/execute$/);
  if (execMatch && method === "POST") {
    const planId = execMatch[1];
    if (planId.startsWith("file:")) {
      // File-backed plans have no DB row. The client passes { appId } so we can
      // read the markdown from the app workspace and anchor an agent run to it.
      // (subagent_runs.parent_chat_id is NOT NULL, so reuse or create a chat.)
      const body = await req.json().catch(() => ({}));
      const appId = body?.appId;
      if (!appId) {
        return Response.json(
          { error: "appId required to run a filesystem plan" },
          { status: 400, headers: corsHeaders },
        );
      }
      const appChk = await sql(
        `SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`,
        [appId, userId],
      );
      if (appChk.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      // id shape: file:<kind>:<name>
      const fileName = planId.split(":").slice(2).join(":");
      const wsPath = getAppWorkspacePath(userId, appId);
      let fileContent = "";
      for (const sub of ["trex/plans", "trex/specs", "docs/devx/plans", "docs/devx/specs"]) {
        try {
          fileContent = await Deno.readTextFile(`${wsPath}/${sub}/${fileName}`);
          break;
        } catch { /* try next location */ }
      }
      if (!fileContent) {
        return Response.json({ error: "Plan file not found" }, { status: 404, headers: corsHeaders });
      }
      const chatSel = await sql(
        `SELECT id FROM devx.chats WHERE app_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT 1`,
        [appId, userId],
      );
      let fileChatId = chatSel.rows[0]?.id;
      if (!fileChatId) {
        const newChat = await sql(
          `INSERT INTO devx.chats (app_id, user_id, title) VALUES ($1, $2, $3) RETURNING id`,
          [appId, userId, `Plan: ${fileName.replace(/\.md$/, "")}`],
        );
        fileChatId = newChat.rows[0].id;
      }
      const fileRun = await sql(
        `INSERT INTO devx.subagent_runs
           (parent_chat_id, agent_name, task, user_id, app_id, skill_name, run_kind, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'agent', 'running')
         RETURNING id`,
        [fileChatId, "Plan executor", fileContent, userId, appId, "subagent-driven-development"],
      );
      return Response.json({ runId: fileRun.rows[0].id }, { headers: corsHeaders });
    }
    // Load the plan + its chat/app, scoped to the user.
    const planRes = await sql(
      `SELECT p.id, p.content, p.chat_id, c.app_id
       FROM devx.plans p
       JOIN devx.chats c ON c.id = p.chat_id
       WHERE p.id = $1 AND c.user_id = $2`,
      [planId, userId],
    );
    if (planRes.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const plan = planRes.rows[0];
    // Mark the plan accepted (idempotent) so the lifecycle reflects execution start.
    await sql(
      `UPDATE devx.plans SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND status NOT IN ('implemented')`,
      [planId],
    );
    const runRes = await sql(
      `INSERT INTO devx.subagent_runs
         (parent_chat_id, agent_name, task, user_id, app_id, skill_name, run_kind, plan_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'agent', $7, 'running')
       RETURNING id`,
      [
        plan.chat_id,
        "Plan executor",
        plan.content,
        userId,
        plan.app_id,
        "subagent-driven-development",
        planId,
      ],
    );
    return Response.json({ runId: runRes.rows[0].id }, { headers: corsHeaders });
  }

  return null;
}
