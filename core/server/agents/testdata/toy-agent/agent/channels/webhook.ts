import { defineChannel, POST } from "eve/channels";

export default defineChannel({
  routes: [
    POST("/message", async (req, { send }) => {
      const b = await req.json();
      const s = await send(b.message, { auth: null, continuationToken: b.token });
      return Response.json({ sessionId: s.id });
    }),
    // Task 17 test seam: drive args.resume (channel HITL) via HTTP so the layer
    // test can exercise it end-to-end without an adapter (adapter wiring is Task 18).
    POST("/resume", async (req, { resume }) => {
      const b = await req.json();
      const r = await resume(b.token, b.input);
      return Response.json(r);
    }),
  ],
});
