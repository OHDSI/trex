// The `eve` (web) channel adapter — eve's own web-chat contract exposed as a
// channel so a browser client can talk to an agent through the same channel
// layer that platform webhooks (Discord/Slack/…) use.
//
// THIN BY DESIGN: this adapter owns NO session or streaming logic. Both routes
// delegate entirely to the per-request ChannelRouteArgs the layer builds —
// `send()` (resolve-or-create a session + start a turn) and
// `getSession(id).getEventStream()` (the replay-then-live NDJSON tail). It is a
// contract wrapper, not a second session implementation: the surface here mirrors
// the eve session API in service/handler.ts (POST /eve/v1/session +
// GET /eve/v1/session/:id/stream), but routed through the unauthenticated channel
// boundary. Because the web channel is trusted client traffic there is no
// platform-signature verify() step (unlike Discord/Slack adapters) — auth is
// null and callers are attributed anonymously, exactly as an anonymous eve
// session is.
import { defineChannel, GET, POST } from "eve/channels";
import type { ChannelDef } from "eve/channels";

const NDJSON_HEADERS = {
  "content-type": "application/x-ndjson",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

export function eveChannel(): ChannelDef {
  return defineChannel({
    routes: [
      // POST /session — create (or resume, via continuationToken) a session and
      // start a turn. Mirrors POST /eve/v1/session: returns the sessionId plus a
      // continuationToken handle the client reuses to address the same session.
      POST("/session", async (req, { send }) => {
        const body = await req.json().catch(() => ({})) as {
          message?: string;
          continuationToken?: string;
          state?: unknown;
          title?: string;
        };
        // The raw continuation token addresses the session (the layer namespaces
        // it with this channel's id). Absent one, mint a fresh token so each call
        // opens its own session — same posture as an anonymous eve session.
        const continuationToken = body.continuationToken ?? crypto.randomUUID();
        const { id } = await send(body.message ?? "", {
          auth: null,
          continuationToken,
          state: body.state,
          title: body.title,
        });
        return Response.json(
          { sessionId: id, continuationToken },
          { headers: { "x-eve-session-id": id } },
        );
      }),

      // GET /session/:id/stream — the session's NDJSON event stream. Delegates to
      // the layer's getSession(id).getEventStream(); the layer owns replay +
      // live-tail ordering. eve reconnects with ?startIndex=<event-count cursor>.
      GET("/session/:id/stream", (req, { params, getSession }) => {
        const session = getSession(params.id);
        if (!session) {
          return Response.json({ error: "session not found" }, { status: 404 });
        }
        const startIndex = Number(new URL(req.url).searchParams.get("startIndex") ?? "0") || 0;
        return new Response(session.getEventStream({ startIndex }), { headers: NDJSON_HEADERS });
      }),
    ],
  });
}
