import { defineChannel, POST } from "eve/channels";

export default defineChannel({
  routes: [
    POST("/message", async (req, { send }) => {
      const b = await req.json();
      const s = await send(b.message, { auth: null, continuationToken: b.token });
      return Response.json({ sessionId: s.id });
    }),
  ],
});
