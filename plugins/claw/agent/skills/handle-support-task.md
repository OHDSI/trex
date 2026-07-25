---
description: Handle a data2evidence support task forwarded from the Slack support agent — investigate, notify the right devs on Discord, review the proposed reply with them, send the approved answer back.
---

# Handle a support task

Two situations load this skill:

**A. A session whose first message starts with `SUPPORT_TASK`** (headless, no
Discord channel yet). The message carries `support_session`, `kind`,
`slack_user` and the `brief`. Steps:

1. **Investigate.** Pick the data2evidence app via `listApps` (kind `d2e`).
   Send ONE `askCodeAgent` message (passing `app`) telling the coder to run its
   `investigate-d2e-issue` skill on the brief and to reply ONLY with the
   skill's JSON result: `{problem_summary, affected_area, suggested_next_steps,
   proposed_user_reply, github_logins}`. Include the full brief verbatim.
   If the reply is not parseable as JSON, send ONE follow-up: "Reply with ONLY
   the JSON object, no prose." If it still is not valid JSON, extract the
   substance yourself from the prose (summary, next steps, proposed reply, and
   any GitHub logins mentioned), continue the flow with those values, and use
   an empty `github_logins` list if none were identifiable.
2. **Resolve owners.** `lookupDiscordIds` with the `github_logins`.
3. **Notify.** `postDevSummary` with the support session id, kind, brief, the
   investigation's summary/next steps/proposed reply, pass the investigation's full
   `github_logins` list as `githubLogins`, the resolved Discord ids as `discordUserIds`,
   the unmapped logins as `unmappedLogins`, and a short thread name. This creates the review thread.
4. **Reply to the caller** (your turn reply IS the acknowledgement the support
   agent relays to the user): one short paragraph — the task is filed, who was
   notified, and that a reviewed answer will follow in this thread.
   **If `postDevSummary` FAILED (tool error — e.g. `CLAW_DEV_CHANNEL_ID not
   set`, a Discord post failure), your reply MUST say so plainly:** state that
   the development team could NOT be notified and why (one line, e.g. "the dev
   channel is not configured on this deployment"). NEVER write an
   acknowledgement that implies the team was reached when the notify step
   failed — the support agent relays your words to the user verbatim, and a
   false 'team notified' strands the request invisibly.

**B. A message in a review thread you created** (`getSupportTask` on the
current channel id returns `found:true`). You are reviewing the proposed reply
with the devs:

1. Answer questions from the task's brief and investigation context; when a
   dev asks for changes, rewrite the draft, post the new version in the
   thread, and save it with `updateSupportTask`.
2. When a dev says it is good (or asks you to send), confirm the exact final
   text with `awaitApproval` (summarize the reply in the approval prompt).
   - Approved → `replyToSupport` with the final text, then confirm in the
     thread that the answer went out to the user.
   - Denied → ask what to change; if the devs want to drop it, agree a short
     fallback answer for the user, get it approved, send THAT via
     `replyToSupport`, and set status `discarded` afterwards with
     `updateSupportTask`. The user must never be left without an answer.

Never send anything to the user that a dev has not approved. Keep dev-channel
messages tight; the brief and investigation live in your session history.
