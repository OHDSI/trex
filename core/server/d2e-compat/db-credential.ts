// Shared upsert for a single trexdb.database_credential row, used by both the
// admin /trex/db/ routes and the legacy trex.db migration.

import { encryptSecret } from "../auth/crypto.ts";
import { decryptD2eCredentialPassword, isD2eEncryptedCredential } from "./credential-crypto.ts";

// Upsert one credential row for a database. d2e clients (portal/demo) post the
// source password RSA-encrypted (with a salt); recover it and store it under the
// trex-native DEK scheme (password_encrypted) so boot-attach/dbm-sync see a uniform
// credential. Keyed on (databaseId, username, userScope) — d2e registers an Admin
// and a Read credential under the same username, and the native source-attach needs
// the Admin one, so both must coexist (see the constraint migration in index.ts).
export async function upsertDatabaseCredential(client: any, code: string, cred: any): Promise<void> {
  let password: string | null = cred.password ?? null;
  let passwordEncrypted: string | null = null;
  if (isD2eEncryptedCredential(cred)) {
    try {
      const plain = await decryptD2eCredentialPassword(cred.password, cred.salt, cred.serviceScope);
      passwordEncrypted = await encryptSecret(plain);
      password = null;
    } catch (e) {
      console.error(`[d2e-compat] credential decrypt failed for ${code}/${cred.userScope ?? ""}: ${e}`);
      // best-effort: leave the raw value so the row still exists
    }
  }
  await client.query(
    `INSERT INTO trexdb.database_credential
       ("databaseId", username, password, password_encrypted, "userScope", "serviceScope")
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("databaseId", username, "userScope") DO UPDATE SET
       password = EXCLUDED.password,
       password_encrypted = EXCLUDED.password_encrypted,
       "serviceScope" = EXCLUDED."serviceScope",
       "updatedAt" = NOW()`,
    [code, cred.username, password, passwordEncrypted, cred.userScope ?? null, cred.serviceScope ?? null],
  );
}
