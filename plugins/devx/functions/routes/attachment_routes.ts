// @ts-nocheck - Deno edge function
import { ensureAppWorkspace } from "../tools/workspace.ts";

export async function handleAttachmentRoutes(path, method, req, userId, sql, corsHeaders) {
  // POST /chats/:id/attachments — upload file
  const uploadMatch = path.match(/\/chats\/([^/]+)\/attachments$/);
  if (uploadMatch && method === "POST") {
    const chatId = uploadMatch[1];
    const chatCheck = await sql(
      `SELECT id, app_id FROM devx.chats WHERE id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (chatCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "multipart/form-data required" }, { status: 400, headers: corsHeaders });
    }

    try {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return Response.json({ error: "file field required" }, { status: 400, headers: corsHeaders });
      }

      // Size limit: 10MB
      if (file.size > 10 * 1024 * 1024) {
        return Response.json({ error: "File too large (max 10MB)" }, { status: 413, headers: corsHeaders });
      }

      // Sanitize filename: strip path separators and traversal
      const safeName = file.name.replace(/[/\\]/g, "_").replace(/\.\./g, "_").replace(/[^\w.\-]/g, "_") || "file";

      // Determine storage path
      const appId = chatCheck.rows[0].app_id;
      const wsPath = appId
        ? await ensureAppWorkspace(userId, appId)
        : `/tmp/devx-workspaces/${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const attachId = crypto.randomUUID();
      const attachDir = `${wsPath}/_attachments/${attachId}`;
      await Deno.mkdir(attachDir, { recursive: true });

      const storagePath = `${attachDir}/${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await Deno.writeFile(storagePath, bytes);

      // We need a message_id. For now, store with a placeholder — the frontend
      // will associate it when the message is sent.
      const result = await sql(
        `INSERT INTO devx.attachments (message_id, chat_id, filename, content_type, size_bytes, storage_path)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         RETURNING id, filename, content_type, size_bytes`,
        [chatId, file.name, file.type || "application/octet-stream", bytes.length, storagePath],
      );

      return Response.json(result.rows[0], { headers: corsHeaders });
    } catch (err) {
      return Response.json({ error: `Upload failed: ${err.message}` }, { status: 500, headers: corsHeaders });
    }
  }

  // GET /attachments/:id — serve file
  const serveMatch = path.match(/\/attachments\/([^/]+)$/);
  if (serveMatch && method === "GET") {
    const attachId = serveMatch[1];
    const result = await sql(
      `SELECT a.storage_path, a.content_type, a.filename
       FROM devx.attachments a
       JOIN devx.chats c ON a.chat_id = c.id
       WHERE a.id = $1 AND c.user_id = $2`,
      [attachId, userId],
    );
    if (result.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const { storage_path, content_type, filename } = result.rows[0];
    try {
      const fileBytes = await Deno.readFile(storage_path);
      return new Response(fileBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": content_type,
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        },
      });
    } catch {
      return Response.json({ error: "File not found on disk" }, { status: 404, headers: corsHeaders });
    }
  }

  return null;
}
