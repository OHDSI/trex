import { Router } from "express";
import express from "express";
import { BASE_PATH } from "../config.ts";
import { verifyAccessToken } from "../auth/jwt.ts";
import { generateApiKey } from "../mcp/auth.ts";

const router = Router();
// Mounted globally (see core/server/index.ts), so this json parser gates the body
// size of EVERY request including plugin-function POSTs (e.g. hades-api /jobs with
// a full Strategus analysis spec). Default is ~100kb; raise it so large specs pass.
router.use(express.json({ limit: "50mb" }));

// ── In-memory session store with 5-minute TTL ───────────────────────────────

interface CliSession {
  device_code: string;
  encrypted_access_token: string; // hex
  server_public_key: string; // hex
  nonce: string; // hex
  created_at: string; // ISO timestamp
}

const sessions = new Map<string, CliSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

// Cleanup expired sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - new Date(session.created_at).getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 60_000);

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateDeviceCode(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  // 8-char hex code, easy to type
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAuthUser(req: any): Promise<{ id: string; role: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const claims = await verifyAccessToken(token);
  if (!claims) return null;
  return { id: claims.sub, role: claims.app_metadata?.trex_role || "user" };
}

// ── POST /api/cli/sessions — approve CLI login (called by web UI) ───────────

router.post(`${BASE_PATH}/api/cli/sessions`, async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user || user.role !== "admin") {
      res.status(401).json({ error: "Admin authentication required" });
      return;
    }

    const { session_id, public_key, token_name } = req.body || {};
    if (!session_id || !public_key || !token_name) {
      res.status(400).json({ error: "session_id, public_key, and token_name are required" });
      return;
    }

    // Validate session_id is UUID-like
    if (!/^[0-9a-f-]{36}$/i.test(session_id)) {
      res.status(400).json({ error: "Invalid session_id format" });
      return;
    }

    // Generate sbp_ token for the CLI
    const result = await generateApiKey(user.id, token_name, undefined, "sbp_");
    const tokenBytes = new TextEncoder().encode(result.key);

    // Import CLI's public key (raw P-256, uncompressed, hex-encoded)
    const clientPubBytes = hexToBytes(public_key);
    const clientPubKey = await crypto.subtle.importKey(
      "raw",
      clientPubBytes,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );

    // Generate server ECDH keypair
    const serverKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );

    // Derive shared secret (32 bytes for P-256)
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPubKey },
      serverKeyPair.privateKey,
      256,
    );

    // Import shared secret as AES-GCM key
    const aesKey = await crypto.subtle.importKey(
      "raw",
      sharedBits,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    // Encrypt the token with AES-256-GCM
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      tokenBytes,
    );

    // Export server public key (raw uncompressed format)
    const serverPubRaw = await crypto.subtle.exportKey("raw", serverKeyPair.publicKey);

    // Generate device code for verification
    const device_code = generateDeviceCode();

    // Store session
    sessions.set(session_id, {
      device_code,
      encrypted_access_token: bytesToHex(new Uint8Array(encrypted)),
      server_public_key: bytesToHex(new Uint8Array(serverPubRaw)),
      nonce: bytesToHex(nonce),
      created_at: new Date().toISOString(),
    });

    // Return device code so the browser can display it to the user
    res.json({ ok: true, device_code });
  } catch (err) {
    console.error("CLI session creation error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /platform/cli/login/:session_id — polling endpoint (no auth) ────────

router.get(`${BASE_PATH}/platform/cli/login/:session_id`, (req, res) => {
  const { session_id } = req.params;
  const device_code = req.query.device_code as string;
  const session = sessions.get(session_id);

  if (!session) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  // Verify device code matches
  if (!device_code || device_code !== session.device_code) {
    // Don't delete — CLI will retry with correct code
    res.status(404).json({ message: "Not found" });
    return;
  }

  // One-time retrieval — delete after sending
  sessions.delete(session_id);

  res.json({
    id: session_id,
    created_at: session.created_at,
    access_token: session.encrypted_access_token,
    public_key: session.server_public_key,
    nonce: session.nonce,
  });
});

export { router as cliLoginRouter };
