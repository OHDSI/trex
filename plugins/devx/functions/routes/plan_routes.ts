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
  // plans/specs the agent has written to docs/devx/plans and docs/devx/specs)
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
      const [plans, specs] = await Promise.all([
        readFilePlans(wsPath, "docs/devx/plans", "plan"),
        readFilePlans(wsPath, "docs/devx/specs", "spec"),
      ]);
      filePlans = [...plans, ...specs];
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
      return Response.json(
        { error: "Filesystem plans can't be executed — use Implement in chat instead" },
        { status: 400, headers: corsHeaders },
      );
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
