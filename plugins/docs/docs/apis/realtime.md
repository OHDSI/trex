---
sidebar_position: 7
---

# Realtime API

Trex ships a native, in-process Realtime server that speaks the
Phoenix-channels protocol used by Supabase Realtime. It runs inside the core
server — there is no separate Realtime container. Clients get three
capabilities:

- **Broadcast** — low-latency pub/sub messaging between clients on a topic.
- **Presence** — track who is currently subscribed to a topic.
- **Postgres changes** — subscribe to `INSERT` / `UPDATE` / `DELETE` on a table
  via logical replication.

The `@supabase/supabase-js` client (`.channel(...)`) works unmodified against a
Trex deployment.

## Endpoints

With the default `BASE_PATH=/trex`:

| Method | Path | Description |
|--------|------|-------------|
| WS | `/trex/realtime/v1/websocket` | Phoenix-channels WebSocket. |
| POST | `/trex/realtime/v1/api/broadcast` | Inject a broadcast over HTTP. |
| GET | `/trex/realtime/v1/health` | Health check (`{"status":"ok"}`, or `503` when disabled). |

Set `TREX_REALTIME_DISABLED=true` to turn the whole subsystem off — WS upgrades
are refused and the HTTP endpoints return `503`.

## Authentication

Realtime uses the same JWT access tokens as the rest of the platform
(see [APIs → Auth](auth)).

- **WebSocket:** pass the token as a query parameter — `?apikey=<jwt>` or
  `?token=<jwt>`. A missing or invalid token fails the upgrade with
  `403 Forbidden`. You can refresh the token on a live connection by sending an
  `access_token` message.
- **HTTP broadcast:** pass `Authorization: Bearer <jwt>` or an `apikey` header.

**Private channels** (`config.private: true`) are authorized against row-level
security policies on the `realtime.messages` table: READ permission is required
to join, WRITE to broadcast. Only the `authenticated`, `anon`, and
`service_role` roles may connect.

## Features

### Broadcast

Send ephemeral messages to everyone subscribed to a topic. Honors
`broadcast.self` (echo to sender) and `broadcast.ack` (reply with an
acknowledgement). Messages can also be injected over the HTTP endpoint or by
inserting into `realtime.messages`.

### Presence

Track membership of a topic in memory. Joining a channel returns the current
`presence_state`; `track` / `untrack` produce `presence_diff` events.

:::note
Presence state is per-process and in-memory. In a multi-instance deployment,
presence is not shared across instances.
:::

### Postgres changes

Subscribe to row changes on a specific table via logical replication:

```js
channel.on(
  "postgres_changes",
  { event: "INSERT", schema: "public", table: "todos", filter: "user_id=eq.1" },
  (payload) => console.log(payload.new),
);
```

- You must name a concrete `table` — **schema-wide subscriptions (`table: "*"`)
  are not supported** and are rejected at join time.
- `event` may be `INSERT`, `UPDATE`, `DELETE`, or `*`.
- `filter` supports the `column=op.value` form (e.g. `id=eq.1`).

## Client example

```js
import { createClient } from "@supabase/supabase-js";

// URL host serves /trex/realtime/v1/websocket
const supabase = createClient(URL, ANON_KEY);

const channel = supabase
  .channel("room1", { config: { broadcast: { self: true } } })
  .on("broadcast", { event: "cursor" }, ({ payload }) => console.log(payload))
  .on("presence", { event: "sync" }, () => console.log(channel.presenceState()))
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "todos" },
    (p) => console.log(p.new),
  )
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      await channel.track({ online_at: new Date().toISOString() });
      channel.send({ type: "broadcast", event: "cursor", payload: { x: 1, y: 2 } });
    }
  });
```

Broadcast over HTTP (no WebSocket needed):

```bash
curl -X POST "$HOST/trex/realtime/v1/api/broadcast" \
  -H "apikey: $JWT" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"topic":"room1","event":"cursor","payload":{"x":1}}]}'
# -> 202 {}
```

## Compatibility notes

- JSON frames only (no binary/msgpack).
- Presence is single-process (in-memory).
- Schema-wide `postgres_changes` subscriptions are not supported; name the table.

## Next steps

- [APIs → Auth](auth) — the JWT model Realtime authorizes against.
- [APIs → REST](rest) — the data API that postgres_changes reflects.
