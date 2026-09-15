// Assigning an application role was reachable only through the MCP tools, which
// a service cannot call. These are the same two operations over HTTP.
//
// Application roles are not the system role: `user.role` is admin/user and gates
// trex's own admin features, while these are named roles a deployment defines
// and a plugin or RLS policy can check.

import { Router } from "express";
import express from "express";
import { pool } from "../db.ts";
import { apiLimiter } from "../middleware/rate-limit.ts";
import { requireAdmin } from "./require-admin.ts";
import { parseRoleAssignment } from "./roles-policy.ts";

export { parseRoleAssignment };

export const rolesRouter = Router();

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
