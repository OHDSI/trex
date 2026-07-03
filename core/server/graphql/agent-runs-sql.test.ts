import { assert, assertEquals } from "jsr:@std/assert";
import { sessionsQuery, sessionDetailQueries } from "./agent-runs-sql.ts";

Deno.test("sessionsQuery: defaults, no filters", () => {
  const { sql, params } = sessionsQuery({});
  assert(sql.includes("FROM agents.sessions s"));
  assert(sql.includes("COUNT(t.id)"));
  assert(sql.includes("ORDER BY s.updated_at DESC"));
  assertEquals(params, [50, 0]); // default limit/offset
});

Deno.test("sessionsQuery: filters are parameterized in order", () => {
  const { sql, params } = sessionsQuery({ agent: "pythia", status: "active", limit: 10, offset: 20 });
  assert(sql.includes("s.agent = $3"));
  assert(sql.includes("s.status = $4"));
  assertEquals(params, [10, 20, "pythia", "active"]);
});

Deno.test("sessionsQuery: caps limit at 200", () => {
  const { params } = sessionsQuery({ limit: 9999 });
  assertEquals(params[0], 200);
});

Deno.test("sessionDetailQueries: three parameterized queries keyed by session id", () => {
  const q = sessionDetailQueries("s-1");
  assert(q.session.sql.includes("WHERE s.id = $1"));
  assert(q.turns.sql.includes("WHERE t.session_id = $1"));
  assert(q.steps.sql.includes("agents.steps"));
  assertEquals(q.session.params, ["s-1"]);
  assertEquals(q.turns.params, ["s-1"]);
  assertEquals(q.steps.params, ["s-1"]);
});
