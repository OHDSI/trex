// @ts-nocheck - Deno edge function
import { encryptToken, decryptToken } from "../crypto.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import {
  resolveTarget,
  deployFunction,
  executeMigration,
  ensureBucket,
  uploadToStorage,
  getApiKeys,
  collectFunctions,
  collectMigrations,
  collectDistFiles,
} from "./supabase_client.ts";

export async function handleSupabaseRoutes(path, method, req, userId, sql, corsHeaders) {
  // ── Supabase Integration Management ───────────────────────────────

  // GET /integrations/supabase/status
  if (path.endsWith("/integrations/supabase/status") && method === "GET") {
    const result = await sql(
      `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = 'supabase' LIMIT 1`,
      [userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ connected: false }, { headers: corsHeaders });
    }
    return Response.json({ connected: true, ...(result.rows[0].metadata || {}) }, { headers: corsHeaders });
  }

  // POST /integrations/supabase/connect — store encrypted access token
  if (path.endsWith("/integrations/supabase/connect") && method === "POST") {
    const body = await req.json();
    const { access_token } = body;
    if (!access_token) {
      return Response.json({ error: "access_token required" }, { status: 400, headers: corsHeaders });
    }

    // Validate token by listing projects
    const testRes = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!testRes.ok) {
      return Response.json({ error: "Invalid access token" }, { status: 400, headers: corsHeaders });
    }

    const { ciphertext, iv } = await encryptToken(access_token);
    await sql(
      `INSERT INTO devx.integrations (user_id, provider, name, encrypted_token, token_iv, metadata)
       VALUES ($1, 'supabase', 'default', $2, $3, '{}')
       ON CONFLICT (user_id, provider, name) DO UPDATE SET
         encrypted_token = $2, token_iv = $3, updated_at = NOW()`,
      [userId, ciphertext, iv],
    );

    return Response.json({ connected: true }, { headers: corsHeaders });
  }

  // DELETE /integrations/supabase
  if (path.endsWith("/integrations/supabase") && method === "DELETE") {
    await sql(`DELETE FROM devx.integrations WHERE user_id = $1 AND provider = 'supabase'`, [userId]);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /integrations/supabase/projects — list available projects
  if (path.endsWith("/integrations/supabase/projects") && method === "GET") {
    const tokenResult = await sql(
      `SELECT encrypted_token, token_iv FROM devx.integrations WHERE user_id = $1 AND provider = 'supabase' LIMIT 1`,
      [userId],
    );
    if (tokenResult.rows.length === 0) {
      return Response.json({ error: "Supabase not connected" }, { status: 400, headers: corsHeaders });
    }

    const token = await decryptToken(tokenResult.rows[0].encrypted_token, tokenResult.rows[0].token_iv);
    const res = await fetch("https://api.supabase.com/v1/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return Response.json({ error: "Failed to list projects" }, { status: 502, headers: corsHeaders });
    }
    const projects = await res.json();
    const simplified = projects.map((p) => ({
      id: p.id,
      name: p.name,
      region: p.region,
      status: p.status,
    }));
    return Response.json(simplified, { headers: corsHeaders });
  }

  // ── Per-App Supabase Config ────────────────────────────────────────

  // GET /apps/:id/supabase/config
  const configGetMatch = path.match(/\/apps\/([^/]+)\/supabase\/config$/);
  if (configGetMatch && method === "GET") {
    const appId = configGetMatch[1];
    const result = await sql(
      `SELECT supabase_target, supabase_project_id FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json({
      target: result.rows[0].supabase_target || "local",
      project_id: result.rows[0].supabase_project_id || null,
    }, { headers: corsHeaders });
  }

  // POST /apps/:id/supabase/config
  const configPostMatch = path.match(/\/apps\/([^/]+)\/supabase\/config$/);
  if (configPostMatch && method === "POST") {
    const appId = configPostMatch[1];
    const body = await req.json();
    const { target, project_id } = body;

    if (!target || !["local", "cloud"].includes(target)) {
      return Response.json({ error: "target must be 'local' or 'cloud'" }, { status: 400, headers: corsHeaders });
    }

    await sql(
      `UPDATE devx.apps SET supabase_target = $1, supabase_project_id = $2 WHERE id = $3 AND user_id = $4`,
      [target, project_id || null, appId, userId],
    );
    return Response.json({ target, project_id: project_id || null }, { headers: corsHeaders });
  }

  // ── Deploy ─────────────────────────────────────────────────────────

  // POST /apps/:id/deploy — main deploy endpoint (SSE stream)
  const deployMatch = path.match(/\/apps\/([^/]+)\/deploy$/);
  if (deployMatch && method === "POST") {
    const appId = deployMatch[1];
    const appCheck = await sql(
      `SELECT id, name, path, build_command FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const app = appCheck.rows[0];
    const appPath = getAppWorkspacePath(userId, appId);

    // Create deployment record
    const deployResult = await sql(
      `INSERT INTO devx.deployments (app_id, user_id, target, status, steps)
       VALUES ($1, $2, COALESCE((SELECT supabase_target FROM devx.apps WHERE id = $1), 'local'), 'running', '[]')
       RETURNING id, target`,
      [appId, userId],
    );
    const deploymentId = deployResult.rows[0].id;

    // Return SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const steps: any[] = [];
        const updateStep = (name: string, status: string, message?: string) => {
          const existing = steps.find((s) => s.name === name);
          if (existing) {
            existing.status = status;
            if (message) existing.message = message;
          } else {
            steps.push({ name, status, message });
          }
          send({ type: "deploy_step", step: name, status, message });
        };

        try {
          // Step 1: Resolve target
          updateStep("resolve", "running", "Resolving deployment target...");
          let target;
          try {
            target = await resolveTarget(sql, userId, appId, req);
            updateStep("resolve", "success", `Target: ${target.type} (${target.projectRef})`);
          } catch (err) {
            updateStep("resolve", "failed", err.message);
            throw err;
          }

          // Step 2: Edge functions
          updateStep("edge_functions", "running", "Scanning for edge functions...");
          const functions = await collectFunctions(appPath);
          if (functions.length === 0) {
            updateStep("edge_functions", "skipped", "No edge functions found");
          } else {
            updateStep("edge_functions", "running", `Deploying ${functions.length} function(s)...`);
            for (const fn of functions) {
              try {
                await deployFunction(target, fn.slug, fn.sourceCode, fn.importMap);
                send({ type: "deploy_log", message: `Deployed function: ${fn.slug}` });
              } catch (err) {
                updateStep("edge_functions", "failed", `Failed to deploy "${fn.slug}": ${err.message}`);
                throw err;
              }
            }
            updateStep("edge_functions", "success", `Deployed ${functions.length} function(s)`);
          }

          // Step 3: Database migrations
          updateStep("migrations", "running", "Scanning for migrations...");
          const migrations = await collectMigrations(appPath);
          if (migrations.length === 0) {
            updateStep("migrations", "skipped", "No migrations found");
          } else {
            updateStep("migrations", "running", `Running ${migrations.length} migration(s)...`);
            for (const migration of migrations) {
              try {
                await executeMigration(target, migration.content, target.type === "local" ? sql : undefined);
                send({ type: "deploy_log", message: `Applied: ${migration.name}` });
              } catch (err) {
                updateStep("migrations", "failed", `Migration "${migration.name}" failed: ${err.message}`);
                throw err;
              }
            }
            updateStep("migrations", "success", `Applied ${migrations.length} migration(s)`);
          }

          // Step 4: Build static site
          const buildCommand = app.build_command;
          if (buildCommand) {
            updateStep("build", "running", `Running: ${buildCommand}`);
            try {
              const result = JSON.parse(await duckdb(
                `SELECT * FROM trex_devx_run_command('${escapeSql(appPath)}', '${escapeSql(buildCommand)}')`
              ));
              if (!result.ok) {
                updateStep("build", "failed", `Build failed: ${result.output || "Unknown error"}`);
                throw new Error("Build failed");
              }
              updateStep("build", "success", "Build completed");
            } catch (err) {
              if (err.message === "Build failed") throw err;
              updateStep("build", "failed", err.message);
              throw err;
            }
          } else {
            updateStep("build", "skipped", "No build command configured");
          }

          // Step 5: Upload dist to storage
          const distDir = join(appPath, "dist");
          let distExists = false;
          try {
            const stat = await Deno.stat(distDir);
            distExists = stat.isDirectory;
          } catch { /* no dist */ }

          if (distExists && buildCommand) {
            updateStep("upload", "running", "Uploading to storage...");
            try {
              const bucketName = `app-${appId.replace(/[^a-zA-Z0-9-]/g, "-")}`;
              await ensureBucket(target, bucketName, true);

              const files = await collectDistFiles(distDir);
              let uploaded = 0;
              for (const file of files) {
                await uploadToStorage(target, bucketName, file.path, file.content, file.contentType);
                uploaded++;
                if (uploaded % 10 === 0) {
                  send({ type: "deploy_log", message: `Uploaded ${uploaded}/${files.length} files...` });
                }
              }
              updateStep("upload", "success", `Uploaded ${files.length} file(s) to bucket "${bucketName}"`);
            } catch (err) {
              updateStep("upload", "failed", err.message);
              throw err;
            }
          } else {
            updateStep("upload", "skipped", "No dist directory to upload");
          }

          // Step 6: Generate client config
          updateStep("config", "running", "Generating client config...");
          try {
            const keys = await getApiKeys(target);
            const envContent = [
              `VITE_SUPABASE_URL=${target.supabaseUrl}`,
              `VITE_SUPABASE_ANON_KEY=${keys.anonKey}`,
              `# Generated by DevX deploy on ${new Date().toISOString()}`,
            ].join("\n");
            await Deno.writeTextFile(join(appPath, ".env.local"), envContent);
            updateStep("config", "success", "Wrote .env.local with Supabase config");
          } catch (err) {
            updateStep("config", "failed", err.message);
            throw err;
          }

          // Record success
          await sql(
            `UPDATE devx.deployments SET status = 'success', steps = $1, completed_at = NOW() WHERE id = $2`,
            [JSON.stringify(steps), deploymentId],
          );
          send({ type: "deploy_done", status: "success", deployment_id: deploymentId, steps });

        } catch (err) {
          // Record failure
          await sql(
            `UPDATE devx.deployments SET status = 'failed', steps = $1, error = $2, completed_at = NOW() WHERE id = $3`,
            [JSON.stringify(steps), err.message, deploymentId],
          );
          send({ type: "deploy_done", status: "failed", error: err.message, deployment_id: deploymentId, steps });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ── Deployment History ─────────────────────────────────────────────

  // GET /apps/:id/deployments
  const deploymentsMatch = path.match(/\/apps\/([^/]+)\/deployments$/);
  if (deploymentsMatch && method === "GET") {
    const appId = deploymentsMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const result = await sql(
      `SELECT id, target, target_project_id, status, steps, error, created_at, completed_at
       FROM devx.deployments WHERE app_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [appId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  return null;
}
