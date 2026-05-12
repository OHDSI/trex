---
sidebar_position: 1
---

# Secret Rotation

trexsql signs all user-facing JWTs (access tokens, anon key, service_role
key) with an HMAC secret read from the environment. This page describes
how to rotate that secret without invalidating in-flight sessions, and how
to rotate the long-lived `anon` and `service_role` keys.

## JWT Signing-Key Rotation

The signing key comes from one of two environment variables:

| Variable | Format | Purpose |
|----------|--------|---------|
| `BETTER_AUTH_SECRET` | single string | Backwards-compatible single-secret mode. Also accepted as `AUTH_JWT_SECRET`. |
| `BETTER_AUTH_SECRETS` | comma-separated list | Rotation list. The **first** entry is the active signing key; **all** entries are accepted for verification. |

If only `BETTER_AUTH_SECRET` is set, behavior is unchanged: the same key
signs and verifies every token.

### Rotation procedure

The goal is to replace `oldkey` with `newkey` without forcibly logging
out every active session.

1. **Add the new key as active, keep the old key for verification.**
   Set on every server instance:

   ```sh
   BETTER_AUTH_SECRETS=newkey,oldkey
   ```

   Restart. From this point onward:

   - All newly issued JWTs are signed with `newkey`.
   - JWTs signed with either `newkey` or `oldkey` continue to verify.

2. **Wait for clients to re-auth.** Access tokens have a 1-hour expiry,
   so within 1 hour every active client will have refreshed and obtained a
   token signed with `newkey`. Wait at least one access-token lifetime
   (default 1 hour) plus a safety margin appropriate for your refresh-
   token cadence.

3. **Drop the old key.** Set on every server instance:

   ```sh
   BETTER_AUTH_SECRETS=newkey
   ```

   Restart. The old key is no longer in the verification set; any token
   still signed with `oldkey` will be rejected and the client will need
   to re-authenticate.

You may also leave `BETTER_AUTH_SECRET=newkey` set during this process
— the merged secret list de-duplicates, so the legacy single-secret
variable will not introduce a duplicate entry.

### Why a list and not just two slots?

The list form lets you stack multiple historical keys (for example,
during an incident response in which you rotate twice within an hour).
The active key is always the first entry; everything after it is purely
for verification.

## anon / service_role Key Rotation

The `anon` and `service_role` keys are long-lived JWTs (100-year expiry)
persisted in `trex.setting`. They are signed with the active JWT signing
key at the moment they were generated.

To rotate either key, call the admin GraphQL mutation:

```graphql
mutation {
  rotateAnonKey
}
```

```graphql
mutation {
  rotateServiceRoleKey
}
```

Both mutations require `app.user_role = 'admin'`. The new key is
generated, persisted to `trex.setting`, and returned in the response.

**Effect on clients.** Rotation immediately invalidates the previous
key. Every client (browser SDKs, server-side integrations, scripts)
that holds the old key will receive 401 responses on its next request
and must be re-issued the new key.

Rotate the `service_role` key whenever you suspect it has been leaked
(commit history, log files, screenshots, third-party error trackers).
Rotate the `anon` key on the same trigger, or as part of a scheduled
hygiene policy.

### Combined rotation

If you are rotating the JWT signing key because it was leaked, you
should also rotate `anon` and `service_role` immediately afterwards —
otherwise the old long-lived keys remain valid (they are still on the
verification list during the overlap window). Sequence:

1. Rotate the JWT signing key (steps 1–3 above), or skip the overlap
   window entirely if the leak is confirmed.
2. Call `rotateAnonKey` and `rotateServiceRoleKey` so the long-lived
   keys are re-signed with the current active key.
3. Distribute the new `anon` / `service_role` keys to clients.
