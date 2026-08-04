// An authored `custom` channel — NOT backed by any adapter. It uses the eve
// channels authoring API directly (defineChannel + a bespoke route) to prove an
// agent author can expose their own inbound HTTP contract and drive a turn
// through the channel layer with no framework adapter. The route maps this
// service's own payload shape ({ text, ref }) onto the layer's send(): `text`
// becomes the turn message and `ref` becomes the continuation token.
import { defineChannel, POST } from "eve/channels";

export default defineChannel({
  routes: [
    POST("/ingest", async (req, { send }) => {
      const body = await req.json().catch(() => ({})) as { text?: string; ref?: string };
      const { id } = await send(body.text ?? "", {
        auth: null,
        continuationToken: body.ref ?? crypto.randomUUID(),
      });
      // A bespoke response shape — an author is free to answer however their
      // upstream expects (here: 202 Accepted with the opened session id).
      return Response.json({ accepted: true, session: id }, { status: 202 });
    }),
  ],
});
