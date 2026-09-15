import express from "express";
import { verifyAccessToken } from "./jwt.ts";

/** Admin APIs accept a trex admin's token or the service-role key. */
export async function requireAdmin(req: express.Request, res: express.Response): Promise<boolean> {
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
