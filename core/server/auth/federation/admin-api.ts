// Service-role administration of federation: register an upstream provider and
// pre-link identities to trex users before they first sign in. Used by d2e to
// migrate existing Logto users; any deployment migrating from an IdP can use it.
import express, { Router } from "express";
import { pool } from "../../db.ts";
import { apiLimiter } from "../../middleware/rate-limit.ts";
import { requireAdmin } from "../require-admin.ts";
import { parseLinkRequest, parseProviderUpsert } from "./admin-policy.ts";
import { linkIdentity, setProviderEnabled, upsertProvider } from "./admin-store.ts";

export const federationAdminRouter = Router();

federationAdminRouter.put("/providers/:id", apiLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseProviderUpsert(req.params.id, req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  try {
    await upsertProvider(client, parsed);
    res.status(204).end();
  } catch (err) {
    console.error("[federation-admin] provider upsert failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});

federationAdminRouter.patch("/providers/:id", apiLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  try {
    const found = await setProviderEnabled(client, req.params.id, req.body.enabled);
    if (!found) {
      res.status(404).json({ error: "unknown_provider" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error("[federation-admin] provider enable failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});

federationAdminRouter.put("/links", apiLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseLinkRequest(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  try {
    const result = await linkIdentity(client, parsed);
    if ("unknownProvider" in result) {
      res.status(404).json({ error: "unknown_provider" });
    } else if ("conflict" in result) {
      res.status(409).json({ error: "conflict", userId: result.userId });
    } else {
      res.status(200).json(result);
    }
  } catch (err) {
    console.error("[federation-admin] link failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
});
