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
// GET /eve/v1/session/:id/stream).
//
// AUTH: unlike a platform webhook channel (Discord/Slack), the eve WEB channel
// is trusted browser traffic that carries NO platform signature — so it does NOT
// run an adapter verify(). Instead it is authenticated by the trex JWT at the
// proxy, exactly like the native session API (spec §5: eve-web = "trex JWT").
// The `eve` channel id is therefore EXCLUDED from the proxy's channel auth
// carve-out (plugin/agents.ts channelAuthExemptPattern) — requests reach this
// adapter only after authContext+pluginAuthz, which inject `x-user-id` from the
// JWT. This route reads that header and attributes the session to that principal
// (created_by), rather than the forced-null of an unauthenticated webhook.
import { defineChannel, GET, POST } from "eve/channels";
import type { ChannelAuth, ChannelDef } from "eve/channels";

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
        // opens its own session.
        const continuationToken = body.continuationToken ?? crypto.randomUUID();
        // The proxy injects x-user-id from the verified trex JWT (see the module
        // doc). Attribute the session to that principal so channel eve-web
        // sessions get a real created_by, not the forced-null of a webhook.
        const userId = req.headers.get("x-user-id") || undefined;
        const auth: ChannelAuth | null = userId
          ? { authenticator: "trex", principalType: "user", principalId: userId }
          : null;
        const { id } = await send(body.message ?? "", {
          auth,
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
      GET("/session/:id/stream", async (req, { params, getSession }) => {
        const session = getSession(params.id);
        // 404 an empty id (getSession => null) OR a genuinely-unknown session id
        // (exists() store round-trip), matching the native /stream 404. Without
        // this a bad id would stream an empty 200.
        if (!session || !(await session.exists())) {
          return Response.json({ error: "session not found" }, { status: 404 });
        }
        const startIndex = Number(new URL(req.url).searchParams.get("startIndex") ?? "0") || 0;
        return new Response(session.getEventStream({ startIndex }), { headers: NDJSON_HEADERS });
      }),
    ],
  });
}
