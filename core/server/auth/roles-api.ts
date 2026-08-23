// Assigning an application role was reachable only through the MCP tools, which
// a service cannot call. These are the same two operations over HTTP.
//
// Application roles are not the system role: `user.role` is admin/user and gates
// trex's own admin features, while these are named roles a deployment defines
// and a plugin or RLS policy can check.

import { Router } from "express";
import express from "express";
import { pool } from "../db.ts";
import { verifyAccessToken } from "./jwt.ts";
import { apiLimiter } from "../middleware/rate-limit.ts";

export const rolesRouter = Router();

export function parseRoleAssignment(body: unknown): { userId: string; role: string } | null {
  if (!body || typeof body !== "object") return null;
  const { userId, role } = body as Record<string, unknown>;
  if (typeof userId !== "string" || typeof role !== "string") return null;
  const trimmedUser = userId.trim();
  const trimmedRole = role.trim();
  if (!trimmedUser || !trimmedRole) return null;
  return { userId: trimmedUser, role: trimmedRole };
}

async function requireAdmin(req: express.Request, res: express.Response): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  const claims = await verifyAccessToken(header.slice(7));
  if (!claims) {
    res.status(401).json({ error: "not_authenticated" });
    return false;
  }
  if (claims.app_metadata?.trex_role !== "admin" && claims.role !== "service_role") {
    res.status(403).json({ error: "forbidden", error_description: "Admin access required" });
    return false;
  }
  return true;
}

rolesRouter.post("/assign", apiLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseRoleAssignment(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    // Created on demand: the caller owns the naming, and requiring a separate
    // create call first would just be a round trip that can fail halfway.
    const role = await pool.query<{ id: string }>(
      `INSERT INTO trexdb.role (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET "updatedAt" = NOW()
       RETURNING id`,
      [parsed.role],
    );
    await pool.query(
      `INSERT INTO trexdb.user_role ("userId", "roleId") VALUES ($1, $2)
       ON CONFLICT ("userId", "roleId") DO NOTHING`,
      [parsed.userId, role.rows[0].id],
    );
    res.status(204).end();
  } catch (err) {
    console.error("[roles] assign failed:", err);
    res.status(500).json({ error: "server_error" });
  }
});

rolesRouter.post("/remove", apiLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseRoleAssignment(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  try {
    // Removing an assignment the user does not have is success, not an error:
    // the caller's intent is already satisfied.
    await pool.query(
      `DELETE FROM trexdb.user_role ur
        USING trexdb.role r
       WHERE ur."roleId" = r.id AND ur."userId" = $1 AND r.name = $2`,
      [parsed.userId, parsed.role],
    );
    res.status(204).end();
  } catch (err) {
    console.error("[roles] remove failed:", err);
    res.status(500).json({ error: "server_error" });
  }
});
