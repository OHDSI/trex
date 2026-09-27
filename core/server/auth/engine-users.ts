import { pool } from "../db.ts";
import { isPlaceholderAddress } from "./engine-address.ts";

export interface EngineUserInput {
  email: string;
  password?: string;
  name: string;
  role: string;
  userMetadata?: Record<string, unknown>;
  // /signup registers the address holder, so it is the one route that does not flag.
  flagPlaceholder?: boolean;
}

// Mirrors account.password back onto the legacy user.password_hash column (removed in V23).
export async function mirrorCredentialOntoUser(userId: string) {
  await pool.query(
    `UPDATE trexdb."user" u
        SET password_hash = a.password, "updatedAt" = NOW()
       FROM trexdb.account a
      WHERE u.id = $1
        AND a."userId" = u.id AND a."providerId" = 'credential'
        AND a.password IS NOT NULL AND u.password_hash IS NULL`,
    [userId],
  );
}

export async function createEngineUser(input: EngineUserInput): Promise<{ id: string; email: string }> {
  const { auth } = await import("./better-auth.ts");
  const synthetic = (input.flagPlaceholder ?? true) && isPlaceholderAddress(input.email);
  const created = await auth.api.createUser({
    body: {
      email: input.email,
      ...(input.password !== undefined ? { password: input.password } : {}),
      name: input.name,
      role: input.role as "user" | "admin",
      data: {
        emailVerified: !synthetic,
        ...(synthetic ? {} : { email_confirmed_at: new Date() }),
        is_placeholder_email: synthetic,
        user_metadata: input.userMetadata ?? {},
      },
    },
  });
  if (input.password !== undefined) await mirrorCredentialOntoUser(created.user.id);
  return { id: created.user.id, email: created.user.email };
}
