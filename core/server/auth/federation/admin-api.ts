// Service-role administration of federation: register an upstream provider and
// pre-link identities to trex users before they first sign in. Used by d2e to
// migrate existing Logto users; any deployment migrating from an IdP can use it.
import express, { Router } from "express";
import { pool } from "../../db.ts";
import { adminLimiter } from "../../middleware/rate-limit.ts";
import { requireAdmin } from "../require-admin.ts";
import { parseLinkRequest, parseProviderUpsert } from "./admin-policy.ts";
import { linkIdentity, setProviderEnabled, upsertProvider } from "./admin-store.ts";

export const federationAdminRouter = Router();

federationAdminRouter.put("/providers/:id", adminLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseProviderUpsert(req.params.id, req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  let queryErr: Error | undefined;
  try {
    await upsertProvider(client, parsed);
    res.status(204).end();
  } catch (err) {
    queryErr = err instanceof Error ? err : new Error(String(err));
    console.error("[federation-admin] provider upsert failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    // A pooled client is only known-good after a clean release; release it
    // WITH the error when the query failed so pg discards the connection
    // instead of handing a possibly-broken one to the next request.
    client.release(queryErr);
  }
});

federationAdminRouter.patch("/providers/:id", adminLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  let queryErr: Error | undefined;
  try {
    const found = await setProviderEnabled(client, req.params.id, req.body.enabled);
    if (!found) {
      res.status(404).json({ error: "unknown_provider" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    queryErr = err instanceof Error ? err : new Error(String(err));
    console.error("[federation-admin] provider enable failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release(queryErr);
  }
});

federationAdminRouter.put("/links", adminLimiter, express.json(), async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = parseLinkRequest(req.body);
  if (!parsed) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const client = await pool.connect();
  let queryErr: Error | undefined;
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
    queryErr = err instanceof Error ? err : new Error(String(err));
    console.error("[federation-admin] link failed:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release(queryErr);
  }
});
