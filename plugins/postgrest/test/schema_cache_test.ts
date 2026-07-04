// Tests for the schema cache (Phase 2).
//
// Pure unit tests for the assembly helpers run always; the DB-backed tests
// need PGRST_DB_URI or DATABASE_URL and are skipped otherwise.
import { assert, assertEquals, assertExists } from "std/assert/mod.ts";
import { Pool } from "pg";
import {
  addInverseRels,
  addM2MRels,
  addViewM2OAndO2ORels,
  addViewPrimaryKeys,
  expandKeyDepCols,
  type FkRelationship,
  funcReturnsScalar,
  funcReturnsSingleComposite,
  funcTableName,
  getOverrideRelationshipsMap,
  loadSchemaCache,
  qiKey,
  type Relationship,
  relsMapKey,
  repKey,
  type Table,
  type TablesMap,
  type ViewKeyDependency,
} from "../functions/schema-cache/index.ts";

const qi = (schema: string, name: string) => ({ schema, name });

function m2o(
  table: string,
  foreignTable: string,
  constraint: string,
  columns: [string, string][],
  schema = "test",
): FkRelationship {
  return {
    kind: "fk",
    table: qi(schema, table),
    foreignTable: qi(schema, foreignTable),
    isSelf: table === foreignTable,
    cardinality: { tag: "M2O", constraint, columns },
    tableIsView: false,
    foreignTableIsView: false,
  };
}

function table(name: string, pkCols: string[], schema = "test"): Table {
  return {
    schema,
    name,
    description: null,
    kind: "table",
    insertable: true,
    updatable: true,
    deletable: true,
    pkCols,
    columns: [],
  };
}

function tablesMap(...tables: Table[]): TablesMap {
  return new Map(tables.map((t) => [qiKey({ schema: t.schema, name: t.name }), t]));
}

Deno.test("expandKeyDepCols builds the cartesian product, first column varying slowest", () => {
  assertEquals(expandKeyDepCols([]), [[]]);
  assertEquals(expandKeyDepCols([["a", ["a1", "a2"]], ["b", ["b1"]]]), [
    [["a", "a1"], ["b", "b1"]],
    [["a", "a2"], ["b", "b1"]],
  ]);
  // a column with no view references kills all combinations
  assertEquals(expandKeyDepCols([["a", ["a1"]], ["b", []]]), []);
});

Deno.test("addInverseRels adds O2M inversions of M2O rels", () => {
  const rel = m2o("books", "authors", "books_author_id_fkey", [["author_id", "id"]]);
  const rels = addInverseRels([rel]);
  assertEquals(rels.length, 2);
  const inv = rels[1] as FkRelationship;
  assertEquals(inv.table, qi("test", "authors"));
  assertEquals(inv.foreignTable, qi("test", "books"));
  assertEquals(inv.cardinality, { tag: "O2M", constraint: "books_author_id_fkey", columns: [["id", "author_id"]] });
});

Deno.test("addInverseRels flips isParent on O2O inversions", () => {
  const rel: FkRelationship = {
    ...m2o("profile", "users", "profile_user_id_fkey", [["user_id", "id"]]),
    cardinality: { tag: "O2O", constraint: "profile_user_id_fkey", columns: [["user_id", "id"]], isParent: false },
  };
  const rels = addInverseRels([rel]);
  const inv = rels[1] as FkRelationship;
  assertEquals(inv.cardinality, {
    tag: "O2O",
    constraint: "profile_user_id_fkey",
    columns: [["id", "user_id"]],
    isParent: true,
  });
});

Deno.test("addM2MRels detects junctions whose FK columns are covered by the PK", () => {
  const rels: Relationship[] = [
    m2o("book_tags", "books", "bt_book_fkey", [["book_id", "id"]]),
    m2o("book_tags", "tags", "bt_tag_fkey", [["tag_id", "id"]]),
  ];
  const tbls = tablesMap(table("book_tags", ["book_id", "tag_id"]));
  const out = addM2MRels(tbls, rels);
  const m2ms = out.filter((r) => r.kind === "fk" && r.cardinality.tag === "M2M") as FkRelationship[];
  // both directions: books->tags and tags->books
  assertEquals(m2ms.length, 2);
  const booksToTags = m2ms.find((r) => r.table.name === "books");
  assertExists(booksToTags);
  assert(booksToTags.cardinality.tag === "M2M");
  assertEquals(booksToTags.cardinality.junction, {
    table: qi("test", "book_tags"),
    constraint1: "bt_book_fkey",
    constraint2: "bt_tag_fkey",
    colsSource: [["id", "book_id"]],
    colsTarget: [["id", "tag_id"]],
  });

  // no M2M when the junction's PK does not cover the FK columns
  const noPk = addM2MRels(tablesMap(table("book_tags", ["book_id"])), rels);
  assertEquals(noPk.filter((r) => r.kind === "fk" && r.cardinality.tag === "M2M").length, 0);
});

Deno.test("addViewPrimaryKeys takes the first view reference of each PK column", () => {
  const view: Table = { ...table("books_view", []), kind: "view" };
  const keyDeps: ViewKeyDependency[] = [
    {
      table: qi("test", "books"),
      view: qi("test", "books_view"),
      constraint: "books_pkey",
      type: "PKDep",
      cols: [["id", ["id_1", "id_2"]]],
    },
  ];
  const out = addViewPrimaryKeys(tablesMap(table("books", ["id"]), view), keyDeps);
  assertEquals(out.get("test.books_view")?.pkCols, ["id_1"]);
  assertEquals(out.get("test.books")?.pkCols, ["id"]);
});

Deno.test("addViewM2OAndO2ORels derives view-table, table-view and view-view rels", () => {
  const rel = m2o("books", "authors", "fk", [["author_id", "id"]]);
  const keyDeps: ViewKeyDependency[] = [
    // the view over books references the FK column
    {
      table: qi("test", "books"),
      view: qi("test", "books_view"),
      constraint: "fk",
      type: "FKDep",
      cols: [["author_id", ["writer_id"]]],
    },
    // a view over authors references the FK'd PK
    {
      table: qi("test", "authors"),
      view: qi("test", "authors_view"),
      constraint: "fk",
      type: "FKDepRef",
      cols: [["id", ["author_id"]]],
    },
  ];
  const out = addViewM2OAndO2ORels(keyDeps, [rel]) as FkRelationship[];
  assertEquals(out.length, 4);
  const [, viewTable, tableView, viewView] = out;
  assertEquals(viewTable.table, qi("test", "books_view"));
  assertEquals(viewTable.foreignTable, qi("test", "authors"));
  assertEquals(viewTable.cardinality, { tag: "M2O", constraint: "fk", columns: [["writer_id", "id"]] });
  assertEquals(tableView.table, qi("test", "books"));
  assertEquals(tableView.foreignTable, qi("test", "authors_view"));
  assertEquals(tableView.cardinality, { tag: "M2O", constraint: "fk", columns: [["author_id", "author_id"]] });
  assertEquals(viewView.table, qi("test", "books_view"));
  assertEquals(viewView.foreignTable, qi("test", "authors_view"));
  assertEquals(viewView.cardinality, { tag: "M2O", constraint: "fk", columns: [["writer_id", "author_id"]] });
  assert(viewView.tableIsView && viewView.foreignTableIsView);
});

Deno.test("getOverrideRelationshipsMap lets computed rels override detected ones", () => {
  const detected = m2o("books", "authors", "fk", [["author_id", "id"]]);
  const rels = getOverrideRelationshipsMap([detected], [
    {
      kind: "computed",
      function: qi("test", "authors"),
      table: qi("test", "books"),
      foreignTable: qi("test", "authors"),
      tableAlias: qi("", ""),
      toOne: true,
      isSelf: false,
    },
  ]);
  const list = rels.get(relsMapKey(qi("test", "books"), "test"));
  assertExists(list);
  assertEquals(list.length, 1);
  assertEquals(list[0].kind, "computed");
});

// ---------------------------------------------------------------------------
// DB-backed tests
// ---------------------------------------------------------------------------

const DSN = Deno.env.get("PGRST_DB_URI") ?? Deno.env.get("DATABASE_URL");
const SCHEMA = "pgrst_cache_test";

const SETUP_SQL = `
drop schema if exists ${SCHEMA} cascade;
create schema ${SCHEMA};
create type ${SCHEMA}.mood as enum ('happy', 'sad');
create table ${SCHEMA}.authors (
  id int generated by default as identity primary key,
  name text not null,
  mood ${SCHEMA}.mood
);
comment on table ${SCHEMA}.authors is 'the authors';
create table ${SCHEMA}.books (
  id int primary key,
  author_id int not null references ${SCHEMA}.authors(id),
  title text default 'untitled'
);
create table ${SCHEMA}.tags (id int primary key, label text);
create table ${SCHEMA}.book_tags (
  book_id int references ${SCHEMA}.books(id),
  tag_id int references ${SCHEMA}.tags(id),
  primary key (book_id, tag_id)
);
create view ${SCHEMA}.books_view as
  select id as book_id, author_id as writer_id, title from ${SCHEMA}.books;
create materialized view ${SCHEMA}.books_mat as select id, title from ${SCHEMA}.books;
create function ${SCHEMA}.get_book(bid int) returns ${SCHEMA}.books
  language sql stable as 'select * from ${SCHEMA}.books where id = bid';
create function ${SCHEMA}.add_it(a int) returns int
  language sql immutable as 'select a';
create function ${SCHEMA}.add_it(a int, b int) returns int
  language sql stable as 'select a + b';
create domain ${SCHEMA}.color as text check (value ~ '^#[0-9a-fA-F]{6}$');
create function ${SCHEMA}.color_to_json(${SCHEMA}.color) returns json
  language sql immutable as 'select to_json($1::text)';
create cast (${SCHEMA}.color as json)
  with function ${SCHEMA}.color_to_json(${SCHEMA}.color) as implicit;
`;

Deno.test({
  name: "loadSchemaCache against a real database",
  ignore: !DSN,
  // npm:pg keeps sockets/timers alive within the pool; pool.end() runs in
  // finally but the sanitizers still race with its internal cleanup.
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    const pool = new Pool({ connectionString: DSN, max: 2 });
    try {
      await pool.query(SETUP_SQL);
      const cache = await loadSchemaCache(pool, [SCHEMA]);

      await t.step("table, column and PK extraction", () => {
        const authors = cache.tables.get(`${SCHEMA}.authors`);
        assertExists(authors);
        assertEquals(authors.kind, "table");
        assertEquals(authors.description, "the authors");
        assertEquals(authors.pkCols, ["id"]);
        assert(authors.insertable && authors.updatable && authors.deletable);
        assertEquals(authors.columns.map((c) => c.name), ["id", "name", "mood"]);
        const [id, name, mood] = authors.columns;
        assertEquals(id.nullable, false);
        assertEquals(id.dataType, "integer");
        assert(id.default?.startsWith("nextval("), `identity default, got: ${id.default}`);
        assertEquals(name.nullable, false);
        assertEquals(mood.nullable, true);
        assertEquals(mood.enumVals, ["happy", "sad"]);
        const title = cache.tables.get(`${SCHEMA}.books`)?.columns.find((c) => c.name === "title");
        assertEquals(title?.default, "'untitled'::text");
        // pk_cols comes from an ORDER BY-less array_agg (verbatim upstream
        // SQL), so the composite-PK column order is plan-dependent.
        assertEquals([...(cache.tables.get(`${SCHEMA}.book_tags`)?.pkCols ?? [])].sort(), ["book_id", "tag_id"]);
      });

      await t.step("M2O and inverted O2M relationships", () => {
        const booksRels = cache.relationships.get(relsMapKey(qi(SCHEMA, "books"), SCHEMA));
        assertExists(booksRels);
        const toAuthors = booksRels.find(
          (r): r is FkRelationship =>
            r.kind === "fk" && r.foreignTable.name === "authors" && r.cardinality.tag === "M2O",
        );
        assertExists(toAuthors);
        assertEquals(toAuthors.cardinality.tag === "M2O" && toAuthors.cardinality.columns, [["author_id", "id"]]);
        assertEquals(toAuthors.isSelf, false);

        const authorsRels = cache.relationships.get(relsMapKey(qi(SCHEMA, "authors"), SCHEMA));
        assertExists(authorsRels);
        const toBooks = authorsRels.find(
          (r): r is FkRelationship =>
            r.kind === "fk" && r.foreignTable.name === "books" && r.cardinality.tag === "O2M",
        );
        assertExists(toBooks);
        assertEquals(toBooks.cardinality.tag === "O2M" && toBooks.cardinality.columns, [["id", "author_id"]]);
      });

      await t.step("M2M junction detection", () => {
        const booksRels = cache.relationships.get(relsMapKey(qi(SCHEMA, "books"), SCHEMA));
        assertExists(booksRels);
        const toTags = booksRels.find(
          (r): r is FkRelationship =>
            r.kind === "fk" && r.foreignTable.name === "tags" && r.cardinality.tag === "M2M",
        );
        assertExists(toTags);
        assert(toTags.cardinality.tag === "M2M");
        const junction = toTags.cardinality.junction;
        assertEquals(junction.table, qi(SCHEMA, "book_tags"));
        assertEquals(junction.colsSource, [["id", "book_id"]]);
        assertEquals(junction.colsTarget, [["id", "tag_id"]]);
      });

      await t.step("view-through relationships and view PK inference", () => {
        const view = cache.tables.get(`${SCHEMA}.books_view`);
        assertExists(view);
        assertEquals(view.kind, "view");
        assertEquals(view.pkCols, ["book_id"]);
        assertEquals(cache.tables.get(`${SCHEMA}.books_mat`)?.kind, "matview");
        assertEquals(cache.tables.get(`${SCHEMA}.books_mat`)?.pkCols, ["id"]);

        const viewRels = cache.relationships.get(relsMapKey(qi(SCHEMA, "books_view"), SCHEMA));
        assertExists(viewRels);
        const toAuthors = viewRels.find(
          (r): r is FkRelationship =>
            r.kind === "fk" && r.foreignTable.name === "authors" && r.cardinality.tag === "M2O",
        );
        assertExists(toAuthors);
        assertEquals(toAuthors.cardinality.tag === "M2O" && toAuthors.cardinality.columns, [["writer_id", "id"]]);
        assert(toAuthors.tableIsView);

        // the inverse O2M lands on the authors side
        const authorsRels = cache.relationships.get(relsMapKey(qi(SCHEMA, "authors"), SCHEMA));
        const toView = authorsRels?.find(
          (r) => r.kind === "fk" && r.foreignTable.name === "books_view" && r.cardinality.tag === "O2M",
        );
        assertExists(toView);
      });

      await t.step("routine overloads, volatility and return type classification", () => {
        const addIt = cache.routines.get(`${SCHEMA}.add_it`);
        assertExists(addIt);
        assertEquals(addIt.map((r) => r.params.length), [1, 2]);
        assertEquals(addIt.map((r) => r.volatility), ["immutable", "stable"]);
        assert(funcReturnsScalar(addIt[0]));
        assertEquals(addIt[1].params.map((p) => p.name), ["a", "b"]);
        assert(addIt[1].params.every((p) => p.required && !p.variadic));

        const getBook = cache.routines.get(`${SCHEMA}.get_book`);
        assertExists(getBook);
        assertEquals(getBook.length, 1);
        assertEquals(getBook[0].volatility, "stable");
        assert(funcReturnsSingleComposite(getBook[0]));
        assertEquals(funcTableName(getBook[0]), "books");
        assertEquals(getBook[0].returnType.pgType.qi, qi(SCHEMA, "books"));
      });

      await t.step("data representations from domain casts", () => {
        const rep = cache.representations.get(repKey(`${SCHEMA}.color`, "json"));
        assertExists(rep);
        assertEquals(rep.function, `${SCHEMA}.color_to_json`);
      });

      await t.step("internal schemas are filtered out", () => {
        for (const tbl of cache.tables.values()) assertEquals(tbl.schema, SCHEMA);
        for (const rels of cache.relationships.values()) {
          for (const rel of rels) assertEquals(rel.foreignTable.schema, SCHEMA);
        }
      });
    } finally {
      await pool.query(`drop schema if exists ${SCHEMA} cascade`).catch(() => {});
      await pool.end();
    }
  },
});
