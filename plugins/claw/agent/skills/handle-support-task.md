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
   **Source links up front:** when the report references an issue/PR/any URL
   (a GitHub issue link in the brief, a screenshot), put that link VERBATIM at
   the START of the `summary` you pass (e.g. "Source: https://github.com/…/issues/3067"),
   so the dev post links straight to it — devs must never have to ask where
   the report came from.
4. **Reply to the caller** (your turn reply IS the acknowledgement the support
   agent relays to the user): a SHORT acknowledgement only — the report was
   filed, the team is looking at it, and an update will follow in this thread.
   Hard rules for this reply AND for `proposedReply`:
   - **Never name individuals.** Which specific people were mentioned/own the
     code is internal routing — the user hears "the team", never a name or
     handle. Names belong only in the Discord dev thread.
   - **Never claim something was reproduced, tested, or verified unless the
     investigation actually ran it** (drove the UI, hit a live endpoint —
     evidence in the investigation output). Code-reading that explains the
     mechanism is analysis, not reproduction: say "we've identified the likely
     cause" at most.
   - No findings dump: the diagnosis lives in the dev thread; the user gets an
     acknowledgement, and later the reviewed answer (and PR link when fixed).
   **If `postDevSummary` FAILED (tool error — e.g. `CLAW_DEV_CHANNEL_ID not
   set`, a Discord post failure), your reply MUST say so plainly:** state that
   the development team could NOT be notified and why (one line, e.g. "the dev
   channel is not configured on this deployment"). NEVER write an
   acknowledgement that implies the team was reached when the notify step
   failed — the support agent relays your words to the user verbatim, and a
   false 'team notified' strands the request invisibly.

5. **Small, well-scoped fix → offer to build it.** When the investigation
   shows a small targeted change (a prop, a config, a one-file fix), say so in
   the `nextSteps` you pass to `postDevSummary` and OFFER in the review thread
   to implement it and open a PR ("Small fix — say go and I'll open a PR").
   When a dev says go (a message in the review thread), run the normal coding
   flow on the d2e app (askCodeAgent: implement, test with the relevant
   testing skills, commit, open the PR), post the PR link in the review
   thread, and update the proposed reply so the user's follow-up says the fix
   is in review with the PR linked. The intended end-to-end shape is: bug
   filed → dev thread with mentions + user gets a short acknowledgement →
   coder fixes it → user gets the reply that it's being fixed, with the PR.

**B. A message in a review thread you created** (`getSupportTask` on the
current channel id returns `found:true`). You are reviewing the proposed reply
with the devs:

1. Answer questions from the task's brief and investigation context.
   **Answering a question is NOT a draft revision** — thread answers to the
   devs must never touch the stored draft. Call `updateSupportTask` ONLY when
   a dev explicitly asks to change the USER-FACING reply ("reword this", "add
   the workaround", "drop the second sentence"), and then post the full
   revised text in the thread clearly labeled as the new draft ("Updated
   draft: …") before saving it. When it is ambiguous whether a message is a
   question or an edit request, treat it as a question and leave the draft
   alone.
2. When a dev says it is good (or asks you to send), confirm with
   `awaitApproval`, quoting the COMPLETE final reply VERBATIM in the approval
   prompt — never a summary and never from memory: fetch the stored draft
   with `getSupportTask` first and quote exactly that text. This gate is
   mandatory even when the dev's message already sounds like final approval
   ("go ahead", "send it") — it is the last chance to catch a stale or
   clobbered draft before the user sees it.
   - Approved → `replyToSupport` with EXACTLY the text quoted in the approval
     prompt (byte-for-byte — no rewording between approval and send), then
     confirm in the thread that the answer went out to the user.
   - Denied → ask what to change; if the devs want to drop it, agree a short
     fallback answer for the user, get it approved, send THAT via
     `replyToSupport`, and set status `discarded` afterwards with
     `updateSupportTask`. The user must never be left without an answer.

Never send anything to the user that a dev has not approved. Keep dev-channel
messages tight; the brief and investigation live in your session history.
