// Pure tests for the embed resolution of Plan.hs: findRel over a hand-built
// relationships map (all cardinalities, hints, self/computed rels, ambiguity
// and no-match errors with the exact Error.hs payloads), getJoinConditions,
// the internal alias scheme, and the fuzzyset machinery (the Error.hs
// doctests at lines 264-338 are transcribed verbatim).

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { PgrstError } from "../functions/errors.ts";
import { compressedRel, FuzzySet, fuzzyFromList, noRelBetweenHint, noRpcHint, relHint } from "../functions/errors-fuzzy.ts";
import { findRel, getJoinConditions, readPlan } from "../functions/plan/read-plan.ts";
import { resolveConfig } from "../functions/config.ts";
import { userApiRequest } from "../functions/parse/api-request.ts";
import type {
  Cardinality,
  ComputedRelationship,
  FkRelationship,
  QualifiedIdentifier,
  Relationship,
  RelationshipsMap,
  Routine,
  RoutineParam,
  SchemaCache,
} from "../functions/schema-cache/types.ts";
import { relsMapKey } from "../functions/schema-cache/types.ts";

// --------------------------------------------------------------------------
// Fixture relationships map (schema "test")
// --------------------------------------------------------------------------

const qi = (name: string): QualifiedIdentifier => ({ schema: "test", name });

function fkRel(
  table: string,
  foreignTable: string,
  cardinality: Cardinality,
  opts: { isSelf?: boolean; foreignTableIsView?: boolean } = {},
): FkRelationship {
  return {
    kind: "fk",
    table: qi(table),
    foreignTable: qi(foreignTable),
    isSelf: opts.isSelf ?? false,
    cardinality,
    tableIsView: false,
    foreignTableIsView: opts.foreignTableIsView ?? false,
  };
}

const projectsClientsM2O = fkRel("projects", "clients", {
  tag: "M2O",
  constraint: "projects_client_id_fkey",
  columns: [["client_id", "id"]],
});
const projectsTasksO2M = fkRel("projects", "tasks", {
  tag: "O2M",
  constraint: "tasks_project_id_fkey",
  columns: [["id", "project_id"]],
});
const projectsUsersM2M = fkRel("projects", "users", {
  tag: "M2M",
  junction: {
    table: qi("users_projects"),
    constraint1: "users_projects_project_id_fkey",
    constraint2: "users_projects_user_id_fkey",
    colsSource: [["id", "project_id"]],
    colsTarget: [["id", "user_id"]],
  },
});
const clientOfComputed: ComputedRelationship = {
  kind: "computed",
  function: qi("client_of"),
  table: qi("projects"),
  foreignTable: qi("clients"),
  tableAlias: qi("projects"),
  toOne: true,
  isSelf: false,
};
const clientsProjectsO2M = fkRel("clients", "projects", {
  tag: "O2M",
  constraint: "projects_client_id_fkey",
  columns: [["id", "client_id"]],
});
const clientsProjectsViewO2M = fkRel("clients", "projects_view", {
  tag: "O2M",
  constraint: "projects_client_id_fkey",
  columns: [["id", "client_id"]],
}, { foreignTableIsView: true });
const usersProjectsM2M = fkRel("users", "projects", {
  tag: "M2M",
  junction: {
    table: qi("users_projects"),
    constraint1: "users_projects_user_id_fkey",
    constraint2: "users_projects_project_id_fkey",
    colsSource: [["id", "user_id"]],
    colsTarget: [["id", "project_id"]],
  },
});
const staffBossM2O = fkRel("staff", "staff", {
  tag: "M2O",
  constraint: "staff_boss_id_fkey",
  columns: [["boss_id", "id"]],
}, { isSelf: true });
const staffSubsO2M = fkRel("staff", "staff", {
  tag: "O2M",
  constraint: "staff_boss_id_fkey",
  columns: [["id", "boss_id"]],
}, { isSelf: true });
const ordersBillingM2O = fkRel("orders", "addresses", {
  tag: "M2O",
  constraint: "orders_billing_address_id_fkey",
  columns: [["billing_address_id", "id"]],
});
const ordersShippingM2O = fkRel("orders", "addresses", {
  tag: "M2O",
  constraint: "orders_shipping_address_id_fkey",
  columns: [["shipping_address_id", "id"]],
});
const usersProfilesO2O = fkRel("users", "profiles", {
  tag: "O2O",
  constraint: "profiles_user_id_fkey",
  columns: [["id", "user_id"]],
  isParent: true,
});

const rels: RelationshipsMap = new Map([
  [relsMapKey(qi("projects"), "test"), [projectsClientsM2O, projectsTasksO2M, projectsUsersM2M, clientOfComputed]],
  [relsMapKey(qi("clients"), "test"), [clientsProjectsO2M, clientsProjectsViewO2M]],
  [relsMapKey(qi("users"), "test"), [usersProjectsM2M, usersProfilesO2O]],
  [relsMapKey(qi("staff"), "test"), [staffBossM2O, staffSubsO2M]],
  [relsMapKey(qi("orders"), "test"), [ordersBillingM2O, ordersShippingM2O]],
]);

function errOf(fn: () => unknown): PgrstError {
  const err = assertThrows(fn) as PgrstError;
  if (!(err instanceof PgrstError)) throw new Error(`expected PgrstError, got ${err}`);
  return err;
}

// --------------------------------------------------------------------------
// findRel — resolution matrix
// --------------------------------------------------------------------------

Deno.test("findRel: target as table name (/projects?select=clients(*))", () => {
  assertEquals(findRel("test", rels, "projects", "clients", null), projectsClientsM2O);
  assertEquals(findRel("test", rels, "projects", "tasks", null), projectsTasksO2M);
  assertEquals(findRel("test", rels, "clients", "projects", null), clientsProjectsO2M);
});

Deno.test("findRel: target as constraint / FK column (deprecated forms)", () => {
  assertEquals(findRel("test", rels, "projects", "projects_client_id_fkey", null), projectsClientsM2O);
  assertEquals(findRel("test", rels, "projects", "client_id", null), projectsClientsM2O);
});

Deno.test("findRel: constraint/column targets don't detect views", () => {
  // clients has the same constraint towards projects and projects_view, but
  // only the table is found by constraint (matchConstraint && not relFTableIsView).
  assertEquals(findRel("test", rels, "clients", "projects_client_id_fkey", null), clientsProjectsO2M);
});

Deno.test("findRel: hints — constraint, fk column, referenced column", () => {
  assertEquals(findRel("test", rels, "projects", "clients", "projects_client_id_fkey"), projectsClientsM2O);
  assertEquals(findRel("test", rels, "projects", "clients", "client_id"), projectsClientsM2O);
  assertEquals(findRel("test", rels, "projects", "clients", "id"), projectsClientsM2O);
});

Deno.test("findRel: M2M by table name and by junction hint", () => {
  assertEquals(findRel("test", rels, "users", "projects", null), usersProjectsM2M);
  assertEquals(findRel("test", rels, "users", "projects", "users_projects"), usersProjectsM2M);
  assertEquals(findRel("test", rels, "projects", "users", null), projectsUsersM2M);
});

Deno.test("findRel: O2O", () => {
  assertEquals(findRel("test", rels, "users", "profiles", null), usersProfilesO2O);
  assertEquals(findRel("test", rels, "users", "profiles", "profiles_user_id_fkey"), usersProfilesO2O);
});

Deno.test("findRel: computed relationship by function name", () => {
  assertEquals(findRel("test", rels, "projects", "client_of", null), clientOfComputed);
});

Deno.test("findRel: self relationship conventions", () => {
  // O2M by using the table name in the target (children)
  assertEquals(findRel("test", rels, "staff", "staff", null), staffSubsO2M);
  // M2O by using the column name in the target (parent)
  assertEquals(findRel("test", rels, "staff", "boss_id", null), staffBossM2O);
  // O2M with the referencing column as hint
  assertEquals(findRel("test", rels, "staff", "staff", "boss_id"), staffSubsO2M);
});

Deno.test("findRel: ambiguous — PGRST201 with compressedRel details and relHint hint", () => {
  const err = errOf(() => findRel("test", rels, "orders", "addresses", null));
  assertEquals(err.status, 300);
  assertEquals(err.body.code, "PGRST201");
  assertEquals(err.body.message, "Could not embed because more than one relationship was found for 'orders' and 'addresses'");
  assertEquals(err.body.details, [
    {
      embedding: "orders with addresses",
      cardinality: "many-to-one",
      relationship: "orders_billing_address_id_fkey using orders(billing_address_id) and addresses(id)",
    },
    {
      embedding: "orders with addresses",
      cardinality: "many-to-one",
      relationship: "orders_shipping_address_id_fkey using orders(shipping_address_id) and addresses(id)",
    },
  ]);
  assertEquals(
    err.body.hint,
    "Try changing 'addresses' to one of the following: 'addresses!orders_billing_address_id_fkey', " +
      "'addresses!orders_shipping_address_id_fkey'. Find the desired relationship in the 'details' key.",
  );
  // ...and the hint disambiguates
  assertEquals(findRel("test", rels, "orders", "addresses", "orders_billing_address_id_fkey"), ordersBillingM2O);
  assertEquals(findRel("test", rels, "orders", "addresses", "shipping_address_id"), ordersShippingM2O);
});

Deno.test("findRel: no match — PGRST200 with fuzzy hint", () => {
  const err = errOf(() => findRel("test", rels, "projects", "client", null));
  assertEquals(err.status, 400);
  assertEquals(err.body.code, "PGRST200");
  assertEquals(err.body.message, "Could not find a relationship between 'projects' and 'client' in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for a foreign key relationship between 'projects' and 'client' in the schema 'test', but no matches were found.",
  );
  assertEquals(err.body.hint, "Perhaps you meant 'clients' instead of 'client'.");
});

Deno.test("findRel: no match with a hint — details carry the hint, no suggestion", () => {
  const err = errOf(() => findRel("test", rels, "projects", "clients", "bad_hint"));
  assertEquals(err.body.code, "PGRST200");
  assertEquals(
    err.body.details,
    "Searched for a foreign key relationship between 'projects' and 'clients' using the hint 'bad_hint' " +
      "in the schema 'test', but no matches were found.",
  );
  assertEquals(err.body.hint, null);
});

Deno.test("relHint: computed relationships hint to an empty string (upstream mempty)", () => {
  assertEquals(relHint([projectsClientsM2O, clientOfComputed]), "'clients!projects_client_id_fkey', ");
  assertEquals(compressedRel(clientOfComputed), {});
});

// --------------------------------------------------------------------------
// getJoinConditions
// --------------------------------------------------------------------------

Deno.test("getJoinConditions: M2O with and without aliases", () => {
  assertEquals(getJoinConditions(null, null, projectsClientsM2O), [
    { left: [qi("clients"), "id"], right: [qi("projects"), "client_id"] },
  ]);
  assertEquals(getJoinConditions("clients_1", null, projectsClientsM2O), [
    { left: [{ schema: "", name: "clients_1" }, "id"], right: [qi("projects"), "client_id"] },
  ]);
  assertEquals(getJoinConditions("clients_2", "projects_1", projectsClientsM2O), [
    { left: [{ schema: "", name: "clients_2" }, "id"], right: [{ schema: "", name: "projects_1" }, "client_id"] },
  ]);
});

Deno.test("getJoinConditions: M2M produces the junction double leg", () => {
  assertEquals(getJoinConditions(null, null, usersProjectsM2M), [
    // junction <-> target table (never aliased)
    { left: [qi("users_projects"), "project_id"], right: [qi("projects"), "id"] },
    // junction <-> origin table
    { left: [qi("users_projects"), "user_id"], right: [qi("users"), "id"] },
  ]);
});

Deno.test("getJoinConditions: computed relationships have none", () => {
  assertEquals(getJoinConditions(null, null, clientOfComputed), []);
});

// --------------------------------------------------------------------------
// Alias scheme (addRels): <ftable>_<depth> / <table>_<name>_<depth>
// --------------------------------------------------------------------------

const planCache: SchemaCache = {
  tables: new Map(),
  relationships: rels,
  routines: new Map(),
  representations: new Map(),
  mediaHandlers: [],
  timezones: new Set(),
};

function planTreeFor(url: string) {
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test" } });
  const [path] = url.split("?");
  const apiReq = userApiRequest(
    conf,
    { method: "GET", url: `http://localhost${url}`, headers: new Headers() },
    path,
    new Set(),
  );
  const act = apiReq.iAction;
  if (act.kind !== "ActDb" || act.db.kind !== "ActRelationRead") throw new Error("not a read action");
  return readPlan(act.db.qi, conf, planCache, apiReq);
}

Deno.test("addRels: internal aliases and join conditions land on the tree", () => {
  const tree = planTreeFor("/clients?select=name,projects(name,tasks(name))");
  const projects = tree.subForest[0].rootLabel;
  assertEquals(projects.fromAlias, "projects_1");
  assertEquals(projects.relAggAlias, "clients_projects_1");
  assertEquals(projects.relJoinConds, [
    { left: [{ schema: "", name: "projects_1" }, "client_id"], right: [qi("clients"), "id"] },
  ]);
  const tasks = tree.subForest[0].subForest[0].rootLabel;
  assertEquals(tasks.fromAlias, "tasks_2");
  assertEquals(tasks.relAggAlias, "projects_tasks_2");
  assertEquals(tasks.relJoinConds, [
    { left: [{ schema: "", name: "tasks_2" }, "project_id"], right: [{ schema: "", name: "projects_1" }, "id"] },
  ]);
});

Deno.test("addRels: the relAlias participates in the aggregate alias", () => {
  const tree = planTreeFor("/clients?select=name,my_projects:projects(name)");
  const projects = tree.subForest[0].rootLabel;
  assertEquals(projects.relAggAlias, "clients_my_projects_1");
  assertEquals(tree.rootLabel.relSelect, [
    {
      kind: "JsonEmbed",
      rsSelName: "my_projects",
      rsAggAlias: "clients_my_projects_1",
      rsEmbedMode: "JsonArray",
      rsEmptyEmbed: false,
    },
  ]);
});

Deno.test("addRels: M2M embeds get no from-alias (implicit junction join)", () => {
  const tree = planTreeFor("/users?select=name,projects(name)");
  const projects = tree.subForest[0].rootLabel;
  assertEquals(projects.fromAlias, null);
  assertEquals(projects.relAggAlias, "users_projects_1");
  assertEquals(projects.relJoinConds.length, 2);
});

// --------------------------------------------------------------------------
// Error.hs noRelBetweenHint doctests (lines 264-289)
// --------------------------------------------------------------------------

// >>> let rels = HM.fromList [((qi "films", "api"), [rel "directors", rel "roles", rel "actors"])]
const filmsRels: RelationshipsMap = new Map([
  [relsMapKey({ schema: "api", name: "films" }, "api"), ["directors", "roles", "actors"].map(
    (ft): Relationship => ({
      kind: "fk",
      table: { schema: "api", name: "films" },
      foreignTable: { schema: "api", name: ft },
      isSelf: false,
      cardinality: { tag: "O2M", constraint: `${ft}_fkey`, columns: [["id", "film_id"]] },
      tableIsView: false,
      foreignTableIsView: false,
    }),
  )],
]);

Deno.test("noRelBetweenHint doctests (Error.hs)", () => {
  // >>> noRelBetweenHint "film" "directors" "api" rels
  assertEquals(noRelBetweenHint("film", "directors", "api", filmsRels), "Perhaps you meant 'films' instead of 'film'.");
  // >>> noRelBetweenHint "films" "role" "api" rels
  assertEquals(noRelBetweenHint("films", "role", "api", filmsRels), "Perhaps you meant 'roles' instead of 'role'.");
  // >>> noRelBetweenHint "films" "actors" "api" rels
  assertEquals(noRelBetweenHint("films", "actors", "api", filmsRels), null);
  // >>> noRelBetweenHint "noclosealternative" "roles" "api" rels
  assertEquals(noRelBetweenHint("noclosealternative", "roles", "api", filmsRels), null);
  // >>> noRelBetweenHint "films" "noclosealternative" "api" rels
  assertEquals(noRelBetweenHint("films", "noclosealternative", "api", filmsRels), null);
  // >>> noRelBetweenHint "films" "noclosealternative" "noclosealternative" rels
  assertEquals(noRelBetweenHint("films", "noclosealternative", "noclosealternative", filmsRels), null);
});

// --------------------------------------------------------------------------
// Error.hs noRpcHint doctests (lines 303-338)
// --------------------------------------------------------------------------

// >>> let procs = [(QualifiedIdentifier "api" "test"), (QualifiedIdentifier "api" "another"), (QualifiedIdentifier "private" "other")]
const procs: QualifiedIdentifier[] = [
  { schema: "api", name: "test" },
  { schema: "api", name: "another" },
  { schema: "private", name: "other" },
];

function routineWithParams(paramNames: string[]): Routine {
  const params: RoutineParam[] = paramNames.map((name) => ({
    name,
    type: "text",
    typeMaxLength: "text",
    required: true,
    variadic: false,
  }));
  return {
    schema: "api",
    name: "test",
    description: null,
    params,
    returnType: { kind: "single", pgType: { qi: { schema: "pg_catalog", name: "void" }, composite: false, compositeAlias: false } },
    volatility: "volatile",
    hasVariadic: false,
    isolationLvl: null,
    funcSettings: [],
  };
}

// >>> let procsDesc = [Function {pdParams = [val, param, name]}, Function {pdParams = [id, attr]}]
const procsDesc: Routine[] = [routineWithParams(["val", "param", "name"]), routineWithParams(["id", "attr"])];

Deno.test("noRpcHint doctests (Error.hs)", () => {
  // >>> noRpcHint "api" "testt" ["val", "param", "name"] procs []
  assertEquals(noRpcHint("api", "testt", ["val", "param", "name"], procs, []), "Perhaps you meant to call the function api.test");
  // >>> noRpcHint "api" "other" [] procs []
  assertEquals(noRpcHint("api", "other", [], procs, []), "Perhaps you meant to call the function api.another");
  // >>> noRpcHint "api" "noclosealternative" [] procs []
  assertEquals(noRpcHint("api", "noclosealternative", [], procs, []), null);
  // >>> noRpcHint "api" "test" ["vall", "pqaram", "nam"] procs procsDesc
  assertEquals(
    noRpcHint("api", "test", ["vall", "pqaram", "nam"], procs, procsDesc),
    "Perhaps you meant to call the function api.test(name, param, val)",
  );
  // >>> noRpcHint "api" "test" ["val", "param"] procs procsDesc
  assertEquals(
    noRpcHint("api", "test", ["val", "param"], procs, procsDesc),
    "Perhaps you meant to call the function api.test(name, param, val)",
  );
  // >>> noRpcHint "api" "test" ["id", "attrs"] procs procsDesc
  assertEquals(noRpcHint("api", "test", ["id", "attrs"], procs, procsDesc), "Perhaps you meant to call the function api.test(attr, id)");
  // >>> noRpcHint "api" "test" ["id"] procs procsDesc
  assertEquals(noRpcHint("api", "test", ["id"], procs, procsDesc), "Perhaps you meant to call the function api.test(attr, id)");
  // >>> noRpcHint "api" "test" ["noclosealternative"] procs procsDesc
  assertEquals(noRpcHint("api", "test", ["noclosealternative"], procs, procsDesc), null);
});

// --------------------------------------------------------------------------
// Data.FuzzySet doctests (fuzzyset-0.2.4)
// --------------------------------------------------------------------------

Deno.test("fuzzyset doctests", () => {
  // >>> defaultSet `add` "Jurassic Park" `add` "Terminator" `add` "The Matrix" `getOne` "percolator"
  const movies = new FuzzySet();
  for (const m of ["Jurassic Park", "Terminator", "The Matrix"]) movies.add(m);
  assertEquals(movies.getOne("percolator"), "Terminator");

  // >>> ... `get` "Shaggy Jones"
  const gang = new FuzzySet();
  for (const m of ["Shaggy Rogers", "Fred Jones", "Daphne Blake", "Velma Dinkley"]) gang.add(m);
  assertEquals(gang.get("Shaggy Jones"), [[0.7692307692307693, "Shaggy Rogers"], [0.5, "Fred Jones"]]);

  // exact matches score 1.0
  assertEquals(fuzzyFromList(["Alaska", "Wyoming"]).get("Alaska"), [[1.0, "Alaska"]]);
});
