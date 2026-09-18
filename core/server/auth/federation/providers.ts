// The only module in federation/ that talks to the database.
import { decryptWithDek, encryptWithDek } from "../dek.ts";
import { decideLink, type ExistingUser, type LinkDecision } from "./link.ts";
import { isPlaceholderAddress, PLACEHOLDER_EMAIL_DOMAIN } from "../engine-address.ts";
// Re-exported: the domain and the predicate moved beside the engine-address
// rule they belong to, but V17's twin comment, the slug parity test and the
// federation tests all name this module as where they live.
export { isPlaceholderAddress, PLACEHOLDER_EMAIL_DOMAIN };
import type { ProviderConfig, UpstreamIdentity } from "./types.ts";

// deno-lint-ignore no-explicit-any
type PgClient = any;

/**
 * Enabled providers that are actually federatable. A row with no issuer is
 * configuration in progress, not a provider — returning it would produce a
 * sign-in button that 500s.
 */
export async function loadProviders(client: PgClient): Promise<Map<string, ProviderConfig>> {
  const { rows } = await client.query(
    `SELECT id, "displayName", "clientId", "clientSecret", issuer, discovery_url,
            authorization_endpoint,
            scopes, claim_map, groups_source, groups_claim, link_policy, auto_provision,
            email_domain_allowlist, allow_elevated_auto_link
       FROM trexdb.sso_provider
      WHERE enabled = true AND issuer IS NOT NULL`,
  );
  const out = new Map<string, ProviderConfig>();
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      displayName: r.displayName,
      clientId: r.clientId,
      clientSecret: r.clientSecret,
      issuer: r.issuer,
      // Most providers publish discovery at the standard well-known path; only
      // the odd one out needs discovery_url set explicitly.
      discoveryUrl: r.discovery_url ??
        r.issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration",
      authorizationEndpoint: typeof r.authorization_endpoint === "string" && r.authorization_endpoint.trim()
        ? r.authorization_endpoint.trim()
        : null,
      scopes: r.scopes,
      claimMap: r.claim_map ?? {},
      groupsSource: r.groups_source,
      groupsClaim: r.groups_claim,
      linkPolicy: r.link_policy,
      autoProvision: r.auto_provision,
      emailDomainAllowlist: normaliseDomains(r.email_domain_allowlist),
      // `=== true` rather than a truthiness test: this decides whether an
      // upstream may take over an administrator's account, and the one value
      // that must enable it is the boolean true. Anything else — including a
      // column an older database has not got — stays off.
      allowElevatedAutoLink: r.allow_elevated_auto_link === true,
    });
  }
  return out;
}

/**
 * The trex user a verified upstream address resolves to, if any — with the
 * role, because whether it may be auto-linked at all depends on it (see
 * decideLink's elevated-account guard).
 */
export async function findLinkCandidateByEmail(
  client: PgClient,
  email: string,
): Promise<ExistingUser | null> {
  const { rows } = await client.query(
    // A match here becomes a link decision: an upstream identity is handed
    // the account it resolves to. Soft-deleted and banned users must never
    // resolve, or a deactivated account is resurrected for whoever controls
    // that address at the identity provider. Both columns are nullable with
    // NULL meaning "not disabled", so `banned = false` alone would wrongly
    // drop NULL rows; `IS NOT TRUE` treats NULL and false as not-banned.
    //
    // A placeholder address is trex's own invention for a user whose upstream
    // asserted none (see provisionUser, and V17 for the rows it backfilled).
    // Nobody asserted it and nobody can be reached at it, so it is an internal
    // identifier rather than a claim to an identity: matching on it would hand
    // an upstream that asserts <someone else's subject>@d2e.local as verified
    // that person's account. Excluded here rather than in decideLink because
    // decideLink's verified-email rule tests the *incoming* identity and never
    // the stored row, so it has nothing to test this against.
    //
    // The two filters answer different questions and neither substitutes for
    // the other: the placeholder clause decides which rows may be a candidate
    // at all, and LIMIT 2 exists so the count of the rows that survive it can
    // be checked below. Excluding placeholders cannot hide an ambiguity the
    // check would have caught — a placeholder is minted only by provisionUser,
    // under a domain nobody registers at, so it is never the row an attacker
    // planted, and two of them matching would resolve to nothing rather than to
    // a guess.
    `SELECT id, role FROM trexdb."user"
      WHERE lower(email) = lower($1)
        AND "deletedAt" IS NULL
        AND banned IS NOT TRUE
        AND is_placeholder_email IS NOT TRUE
      LIMIT 2`,
    [email],
  );
  // Two rows mean two accounts hold one address, which V16's unique index on
  // lower(email) forbids — so this is reachable only on a database missing that
  // index (a migration not run, a dump restored without it) and is exactly the
  // state the takeover needed: the victim's account and an attacker's case
  // variant, both matching the address the upstream just verified.
  //
  // Deliberately not an ORDER BY. An ordering would only make the choice
  // repeatable, and there is nothing to order by that distinguishes the victim
  // from the attacker: the attacker registers whenever they like, so neither
  // oldest-first nor id order is safe. The one correct answer to "which of
  // these two accounts is this identity?" is that nobody can tell, so this
  // refuses and takes the sign-in with it. The caller logs it and shows a
  // generic failure, which is a sign-in an operator must fix rather than a
  // silent link onto the wrong account.
  if (rows.length > 1) {
    throw new Error(
      `more than one trex user holds ${email}; refusing to guess which one this identity is`,
    );
  }
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, role: row.role ?? null };
}

/**
 * A configured allowlist, reduced to bare lower-cased domains. Whitespace and
 * a leading '@' (a natural way to write a domain in configuration) are
 * tolerated; anything empty is dropped, and a list left with nothing in it
 * becomes `null`, i.e. "no restriction" — the same as an unset column.
 */
function normaliseDomains(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim().replace(/^@/, "").toLowerCase())
    .filter((d) => d.length > 0);
  return out.length > 0 ? out : null;
}

/** An existing (providerId, accountId) link, and whether its user may sign in. */
export interface LinkedAccount {
  userId: string;
  /** Soft-deleted or banned. The link is real; the account may not be used. */
  disabled: boolean;
}

/**
 * The user an upstream identity is already linked to.
 *
 * `UNIQUE("providerId","accountId")` on trexdb.account IS the identity: this,
 * not the email address, is what says "this upstream subject is this trex
 * user". Email only ever answers the *linking* question, and only for an
 * upstream identity nobody has seen before — otherwise a person who changes
 * their address at the identity provider is silently re-targeted onto whoever
 * now holds that address in trex, and an administrator editing a federated
 * user's trex email orphans the link.
 *
 * The row is returned even when the user is disabled, with the fact reported
 * rather than filtered out. Dropping a disabled user here would make an
 * existing link indistinguishable from no link at all, and the flow would fall
 * through to the email path and try to provision the banned user's address
 * again — hitting user.email's UNIQUE constraint inside the transaction and
 * surfacing as an opaque failure instead of "this account is deactivated".
 */
export async function findLinkedUser(
  client: PgClient,
  providerId: string,
  accountId: string,
): Promise<LinkedAccount | null> {
  const { rows } = await client.query(
    `SELECT a."userId" AS "userId",
            (u."deletedAt" IS NOT NULL OR u.banned IS TRUE) AS disabled
       FROM trexdb.account a
       JOIN trexdb."user" u ON u.id = a."userId"
      WHERE a."providerId" = $1 AND a."accountId" = $2
      LIMIT 1`,
    [providerId, accountId],
  );
  const row = rows[0];
  if (!row) return null;
  return { userId: row.userId, disabled: row.disabled === true };
}

/**
 * Which trex user this upstream identity signs in as, in the one order that is
 * safe: the existing link first, the email question only when there is none.
 *
 * Deliberately NOT done here: rewriting the trex user's email to whatever the
 * upstream now asserts. `user.email` is trex's own identifier — it is UNIQUE,
 * it is what the password grant authenticates against, and it is what an
 * administrator sees. An upstream that changes it would be able to move a trex
 * account onto an address it chose, collide with another user's address and
 * fail the whole sign-in inside the transaction, or quietly redirect a native
 * login. The link, not the address, carries the identity; a drifted address is
 * for an administrator to reconcile.
 */
export async function resolveFederatedUser(
  client: PgClient,
  provider: ProviderConfig,
  identity: UpstreamIdentity,
): Promise<LinkDecision> {
  const linked = await findLinkedUser(client, provider.id, identity.sub);
  if (linked) {
    // A ban has to stop this path too, or a banned user keeps signing in
    // through the link they already have.
    if (linked.disabled) return { action: "refuse", reason: "account_disabled" };
    // The link IS the identity: whatever the upstream now says the address is,
    // and whether or not it says it is verified, this is the user.
    return { action: "link", userId: linked.userId };
  }
  // First sighting of this upstream identity. Only now does email decide
  // anything, and only under the provider's link policy — and only here do the
  // domain allowlist and the elevated-account guard apply. An identity with an
  // account row above has already been through them and keeps signing in.
  //
  // With no address there is nothing to look a candidate up by, so the query is
  // skipped rather than run with null and left to match whatever it would.
  const candidate = identity.email === null
    ? null
    : await findLinkCandidateByEmail(client, identity.email);
  return decideLink(identity, provider, candidate);
}

/**
 * The local part of a placeholder address, from the identifier the user signs
 * in with.
 *
 * Mirrors the `regexp_replace`/`btrim` chain in V17's DO block, and is verified
 * identical to it for every ASCII shape. Not for every input: JS
 * `toLowerCase()` expands U+0130 (İ) to `i` + U+0307, so `İstanbul` slugifies
 * to `i-stanbul` here and to `istanbul` in Postgres, whose `lower()` is
 * locale-dependent besides. Known and accepted rather than fixed — the
 * divergence is bounded to identifiers holding a character whose lowercase is
 * more than one code point, and chasing Unicode parity across two languages
 * costs more than it buys. Read "mirrors" as ASCII, not as a guarantee.
 *
 * The two still run over the same rows, so a change to either is a change to
 * both: a user backfilled by the migration and the same user re-provisioned
 * here have to land on the same address.
 *
 * Returns "" when nothing usable survives, which the caller must handle — an
 * empty local part would produce the address `@d2e.local`.
 *
 * Every non-empty result is an address the authentication engine will accept,
 * and the three steps are what make that true rather than a coincidence: the
 * surviving alphabet is `[a-z0-9._-]`, which the engine allows; runs of `.`
 * collapse, so no atom is empty; and the trim takes `.` and `-` off both ends,
 * so the local part neither begins nor ends with a separator. V17 refuses to
 * migrate an installation holding an address the engine would reject, and the
 * addresses this mints must never be among them —
 * placeholder-slug-parity.test.ts asserts exactly that, for every input in its
 * table, against the same predicate the migration uses.
 */
export function placeholderLocalPart(signInId: string): string {
  return signInId
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    // `.` is inside the allowed set, so a run of them survives the line above:
    // `foo..bar` would mint an address with an empty atom, which the engine
    // rejects and V17 refuses to migrate past.
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * An address for an identity that asserted none, under the rule V17 uses: the
 * upstream subject, else the user id, and a collision refused rather than
 * resolved in anyone's favour.
 */
async function synthesisePlaceholderEmail(
  client: PgClient,
  subject: string,
  userId: string,
): Promise<string> {
  const taken = async (address: string): Promise<boolean> => {
    // Case-insensitively, matching V16's user_email_lower_key: an address that
    // differs from a real one only in case is a lookalike, and handing one out
    // is the thing this whole path exists to avoid. Asking the same way the
    // index does means this refuses before the INSERT rather than after it,
    // with an error naming the address instead of a constraint name.
    const { rows } = await client.query(
      `SELECT 1 FROM trexdb."user" WHERE lower(email) = $1 LIMIT 1`,
      [address],
    );
    return rows.length > 0;
  };

  // The id is the only identifier guaranteed distinct, so it is the backbone
  // of the scheme rather than merely a fallback: without a usable one there is
  // nothing left to fall back to.
  const fromId = placeholderLocalPart(userId);
  if (fromId === "") {
    throw new Error(
      `cannot synthesise a placeholder address for user ${userId}: its id yields no usable local part`,
    );
  }

  const fromSubject = placeholderLocalPart(subject);
  let candidate = `${fromSubject || fromId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  // Two upstream subjects can slugify to the same local part.
  if (await taken(candidate)) candidate = `${fromId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  if (await taken(candidate)) {
    throw new Error(
      `cannot synthesise a placeholder address for user ${userId}: ${candidate} is already taken`,
    );
  }
  return candidate;
}

/**
 * A federated user has no password: no row in account with providerId 'credential'.
 *
 * An upstream that asserts no address gets a synthesised one. V14 had let
 * user.email be NULL for exactly that case; V17 restored NOT NULL because
 * Better Auth requires an address on every user, so absence is no longer
 * available and V14's objection has to be met rather than avoided. It recorded
 * that a made-up address is a real address that happens to be wrong: it can
 * collide, it can be mailed, and an administrator cannot tell it from one the
 * person gave.
 *
 * All three are met. The address is minted from the upstream subject under a
 * domain that resolves nowhere, and a collision is refused instead of attaching
 * one person's identity to another's row; `is_placeholder_email` marks the row
 * so an administrator and every mail path can tell.
 *
 * The third — that a synthesised address can be *matched* where an absent one
 * could not — is met on the link path rather than on the row, because that is
 * where it has to be met: findLinkCandidateByEmail excludes placeholders, so an
 * upstream asserting <someone else's subject>@d2e.local as verified resolves to
 * nothing. The flag on the row is what that query reads; writing it alone would
 * not have been enough, and the domain and emailDomainAllowlist are defence in
 * depth behind it rather than the control (emailDomainAllowed permits
 * everything when the list is unset, which is the default).
 *
 * The exclusion costs a migrated user nothing while their address is still
 * synthesised: resolveFederatedUser answers from the (providerId, accountId)
 * account row first and only asks about email for an upstream identity it has
 * never seen. It would cost them everything once they replace it, so the flag
 * is not merely set: PUT /user (auth-router.ts) derives it from the address the
 * account holder supplies, which clears it for a real one. A flag that is never
 * cleared turns "unclaimable" into "unlinkable for good", which is why the two
 * belong in one change and not in two. The other routes that write an address
 * derive it the same way; isPlaceholderAddress lists them.
 *
 * The federation *admin* API's linkIdentity (admin-store.ts) still matches a
 * placeholder by address, through email lookups of its own that never reach
 * this function. Left that way on purpose: that caller is an authenticated
 * administrator asserting a link, not an upstream claiming one, and a migration
 * pre-linking the rows V17 backfilled is exactly what it is for.
 *
 * That separation is also what lets provisionUser flag a supplied placeholder
 * address without breaking the migration that supplies it. linkIdentity
 * resolves by (providerId, accountId) first and by its own unfiltered address
 * lookup second, so a re-run finds the rows it created however they are
 * flagged; only the sign-in path here excludes them, which is the whole point.
 */
export async function provisionUser(
  client: PgClient,
  identity: UpstreamIdentity,
  // Only the admin link path passes an id: a migrated user keeps the id it had
  // at its previous identity provider, because that is its token `sub`.
  opts: { id?: string } = {},
): Promise<string> {
  const id = opts.id ?? crypto.randomUUID();
  const placeholder = identity.email === null
    ? await synthesisePlaceholderEmail(client, identity.sub, id)
    : null;
  const address = placeholder ?? identity.email;
  // Two ways to be a placeholder, and the row must not be able to tell them
  // apart: one this function synthesised because the identity asserted no
  // address, and one the caller supplied that is in the placeholder domain
  // anyway. The second is how a migration with nothing to give writes 66 rows
  // (see isPlaceholderAddress), and before this it wrote them as genuine.
  const synthetic = placeholder !== null || isPlaceholderAddress(address);
  await client.query(
    // A placeholder was asserted by nobody, so it is never confirmed. That is a
    // true statement about the row and not a protection: see the note above for
    // what the link path does and does not read.
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role,
                                is_placeholder_email)
     VALUES ($1, $2, $3, $4::boolean, CASE WHEN $4::boolean THEN NOW() END, 'user', $5::boolean)`,
    // The subject is the last fallback for the name: a row has to be
    // identifiable in an administrator's list even with neither name nor
    // address.
    [
      id,
      identity.name ?? identity.email ?? identity.sub,
      address,
      !synthetic,
      synthetic,
    ],
  );
  return id;
}

/**
 * Encrypt one upstream token for storage, or return SQL NULL if there isn't one.
 *
 * The null mapping is load-bearing, not tidiness. upsertAccount's ON CONFLICT
 * preserves a stored refresh token when the incoming one is absent, and it does
 * that with COALESCE(EXCLUDED, stored) — a *null test*, never a comparison. So
 * the rule the plaintext version relied on has to survive verbatim: an absent
 * token must reach the statement as NULL. Encrypting "" (or the string
 * "undefined") would produce a perfectly good ciphertext, COALESCE would take
 * it, and the stored refresh token would be destroyed by a sign-in that simply
 * did not carry one.
 *
 * Nothing anywhere compares these columns, which is what makes ciphertext safe
 * here at all: AES-GCM with a fresh IV encrypts the same token differently
 * every time, so the stored value churns on each sign-in even when the upstream
 * token has not changed. Only null-ness is ever tested, and that is preserved.
 *
 * Failure is fatal to the sign-in by design. The DEK is initialised at boot
 * (index.ts, before server.listen, and a failure there aborts boot), so the
 * only way this throws in practice is a genuinely broken key state — and
 * storing a live upstream credential in the clear because encryption was
 * unavailable is precisely the outcome this change exists to prevent. The
 * caller's transaction rolls back and /callback answers with its generic
 * failure, with the detail in the log.
 */
async function sealToken(
  value: string | null | undefined,
  label: string,
): Promise<string | null> {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return await encryptWithDek(value);
  } catch (err) {
    // Never log the value; name the column and re-throw.
    throw new Error(`could not encrypt upstream ${label}: ${err}`);
  }
}

/** Reverse of sealToken. NULL stays null; ciphertext is decrypted or throws. */
async function openToken(value: string | null | undefined, label: string): Promise<string | null> {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return await decryptWithDek(value);
  } catch (err) {
    // A decrypt failure means the stored value is not usable under the current
    // key — a rotated/lost KEK, or a row written before these columns were
    // encrypted. Surfacing it beats handing a caller a token-shaped null and
    // letting it conclude the upstream never issued one.
    throw new Error(`could not decrypt stored upstream ${label}: ${err}`);
  }
}

/** The upstream tokens held for one linked identity, decrypted. */
export interface UpstreamTokens {
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
}

/**
 * Read back what upsertAccount stored. The three token columns are ciphertext
 * at rest (see sealToken), so every reader must come through here rather than
 * SELECTing the columns directly — including phase 5's PhysioNet token broker,
 * which is the first consumer this exists for.
 */
export async function readAccountTokens(
  client: PgClient,
  providerId: string,
  accountId: string,
): Promise<UpstreamTokens | null> {
  const { rows } = await client.query(
    `SELECT "userId", "accessToken", "refreshToken", "idToken",
            "accessTokenExpiresAt", scope
       FROM trexdb.account
      WHERE "providerId" = $1 AND "accountId" = $2
      LIMIT 1`,
    [providerId, accountId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.userId,
    accessToken: await openToken(row.accessToken, "access token"),
    refreshToken: await openToken(row.refreshToken, "refresh token"),
    idToken: await openToken(row.idToken, "id token"),
    accessTokenExpiresAt: row.accessTokenExpiresAt ?? null,
    scope: row.scope ?? null,
  };
}

export async function upsertAccount(client: PgClient, args: {
  userId: string;
  providerId: string;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  scope?: string;
  idToken?: string;
}): Promise<void> {
  // These are live credentials at another identity provider: an access token
  // that speaks for the person at the upstream, a refresh token that mints more
  // of them, and an id_token. They are encrypted under the DEK before they
  // reach the statement, so the row (and any dump or replica of it) holds no
  // usable credential. RLS on trexdb.account remains the outer guard; this is
  // the one that survives a copy of the data.
  const [accessToken, refreshToken, idToken] = await Promise.all([
    sealToken(args.accessToken, "access token"),
    sealToken(args.refreshToken, "refresh token"),
    sealToken(args.idToken, "id token"),
  ]);
  await client.query(
    `INSERT INTO trexdb.account
       (id, "userId", "accountId", "providerId", "accessToken", "refreshToken",
        "accessTokenExpiresAt", scope, "idToken")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT ("providerId", "accountId") DO UPDATE SET
       -- Kept in step with the user this sign-in was actually granted to, so
       -- the row can never disagree with the identity resolution above. In the
       -- ordinary path this is a no-op: the link is what selected the user.
       "userId" = EXCLUDED."userId",
       "accessToken" = EXCLUDED."accessToken",
       -- Providers commonly return a refresh token only on first authorization;
       -- overwriting a stored one with NULL on a later sign-in would strand
       -- whatever depends on it (see phase 5's refresh-token use).
       "refreshToken" = COALESCE(EXCLUDED."refreshToken", trexdb.account."refreshToken"),
       "accessTokenExpiresAt" = EXCLUDED."accessTokenExpiresAt",
       scope = EXCLUDED.scope,
       "idToken" = EXCLUDED."idToken",
       "updatedAt" = NOW()`,
    [
      crypto.randomUUID(), args.userId, args.accountId, args.providerId,
      accessToken, refreshToken,
      args.accessTokenExpiresAt ?? null, args.scope ?? null, idToken,
    ],
  );
}
