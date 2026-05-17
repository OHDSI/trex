import { pool } from "../db.ts";
import {
  generateAnonKey,
  generateServiceRoleKey,
  getJwtSecret,
} from "./jwt.ts";

/**
 * Ensure anon key, service_role key, and jwt_secret are stored in trexdb.setting.
 * Generates them on first run; prints to console for easy copy.
 */
export async function ensureAuthKeys(): Promise<{
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
}> {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT key, value FROM trexdb.setting WHERE key IN ('auth.anonKey', 'auth.serviceRoleKey', 'auth.jwtSecret')`,
    );

    const settings: Record<string, string> = {};
    for (const row of existing.rows) {
      // value is stored as JSONB, so it's a JSON string (quoted)
      settings[row.key] =
        typeof row.value === "string" ? row.value : JSON.parse(row.value);
    }

    const jwtSecret = await getJwtSecret();
    if (!jwtSecret) {
      throw new Error(
        "TREX_ROOT_KEY is required to derive the JWT signing key",
      );
    }

    let anonKey = settings["auth.anonKey"];
    let serviceRoleKey = settings["auth.serviceRoleKey"];

    if (!anonKey) {
      anonKey = await generateAnonKey();
      await client.query(
        `INSERT INTO trexdb.setting (key, value) VALUES ('auth.anonKey', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(anonKey)],
      );
    }

    if (!serviceRoleKey) {
      serviceRoleKey = await generateServiceRoleKey();
      await client.query(
        `INSERT INTO trexdb.setting (key, value) VALUES ('auth.serviceRoleKey', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(serviceRoleKey)],
      );
    }

    if (!settings["auth.jwtSecret"]) {
      await client.query(
        `INSERT INTO trexdb.setting (key, value) VALUES ('auth.jwtSecret', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(jwtSecret)],
      );
    }

    console.log(`[auth] Anon key: ${anonKey.slice(0, 40)}...`);
    console.log(`[auth] Service role key: ${serviceRoleKey.slice(0, 40)}...`);

    return { anonKey, serviceRoleKey, jwtSecret };
  } finally {
    client.release();
  }
}
