/**
 * Rewrite a Postgres connection URL's credentials to the unprivileged
 * `authenticator` role. Mirrors the PostgREST derivation in
 * `deploy/shared/containers.ts` so GraphQL and REST connect identically.
 *
 * Only the first `//<userinfo>@` segment is rewritten, leaving host, port,
 * database name and query parameters untouched.
 *
 * Fails closed: if the URL has no `//user[:pass]@` segment we throw rather than
 * return it unchanged, because silently connecting with the original (possibly
 * owner) credentials would bypass RLS — the whole point of this helper.
 */
export function toAuthenticatorUrl(databaseUrl: string): string {
  const credentialSegment = /\/\/[^@]+@/;
  if (!credentialSegment.test(databaseUrl)) {
    throw new Error(
      "toAuthenticatorUrl: connection URL has no '//user[:pass]@' segment; " +
        "refusing to connect as a non-authenticator role. Set GRAPHQL_DATABASE_URL explicitly.",
    );
  }
  return databaseUrl.replace(credentialSegment, "//authenticator:authenticator_pass@");
}
