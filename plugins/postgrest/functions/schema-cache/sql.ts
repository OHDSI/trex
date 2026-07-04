// Ports src/PostgREST/SchemaCache.hs introspection queries (PostgREST v12.2.3).
//
// Queries are ported verbatim from the Haskell [q|...|] quasiquotes. Upstream
// gates some fragments on the server version (pgVersion100/110/120); trex runs
// PostgreSQL >= 14, so the newest branch of every version conditional is
// inlined here.
//
// Parameters keep upstream's hasql encoder style: text[] parameters are bound
// with `= ANY($n)`.

// Ports SchemaCache.hs tablesSqlQuery (allTables). Gets tables with their PK cols.
// Parameters: $1 text[] — exposed schemas.
// Version conditionals taken: columnDefault pgVersion120 branch, relispartition
// filter (pgVersion100).
// Deviation from upstream: `c.relkind` is added as the last output column so
// the cache can distinguish views from materialized views (upstream only
// computes `is_view`); everything else is byte-for-byte.
export const TABLES_SQL = `
  WITH
  columns AS (
      SELECT
          nc.nspname::name AS table_schema,
          c.relname::name AS table_name,
          a.attname::name AS column_name,
          d.description AS description,

          CASE
            WHEN t.typbasetype  != 0  THEN pg_get_expr(t.typdefaultbin, 0)
            WHEN a.attidentity  = 'd' THEN format('nextval(%s)', quote_literal(seqsch.nspname || '.' || seqclass.relname))
            WHEN a.attgenerated = 's' THEN null
            ELSE pg_get_expr(ad.adbin, ad.adrelid)::text
          END AS column_default,
          not (a.attnotnull OR t.typtype = 'd' AND t.typnotnull) AS is_nullable,
          CASE
              WHEN t.typtype = 'd' THEN
              CASE
                  WHEN nbt.nspname = 'pg_catalog'::name THEN format_type(t.typbasetype, NULL::integer)
                  ELSE format_type(a.atttypid, a.atttypmod)
              END
              ELSE
              CASE
                  WHEN nt.nspname = 'pg_catalog'::name THEN format_type(a.atttypid, NULL::integer)
                  ELSE format_type(a.atttypid, a.atttypmod)
              END
          END::text AS data_type,
          format_type(a.atttypid, a.atttypmod)::text AS nominal_data_type,
          information_schema._pg_char_max_length(
              information_schema._pg_truetypid(a.*, t.*),
              information_schema._pg_truetypmod(a.*, t.*)
          )::integer AS character_maximum_length,
          COALESCE(bt.oid, t.oid) AS base_type,
          a.attnum::integer AS position
      FROM pg_attribute a
          LEFT JOIN pg_description AS d
              ON d.objoid = a.attrelid and d.objsubid = a.attnum
          LEFT JOIN pg_attrdef ad
              ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
          JOIN (pg_class c JOIN pg_namespace nc ON c.relnamespace = nc.oid)
              ON a.attrelid = c.oid
          JOIN (pg_type t JOIN pg_namespace nt ON t.typnamespace = nt.oid)
              ON a.atttypid = t.oid
          LEFT JOIN (pg_type bt JOIN pg_namespace nbt ON bt.typnamespace = nbt.oid)
              ON t.typtype = 'd' AND t.typbasetype = bt.oid
          LEFT JOIN (pg_collation co JOIN pg_namespace nco ON co.collnamespace = nco.oid)
              ON a.attcollation = co.oid AND (nco.nspname <> 'pg_catalog'::name OR co.collname <> 'default'::name)
          LEFT JOIN pg_depend dep
              ON dep.refobjid = a.attrelid and dep.refobjsubid = a.attnum and dep.deptype = 'i'
          LEFT JOIN pg_class seqclass
              ON seqclass.oid = dep.objid
          LEFT JOIN pg_namespace seqsch
              ON seqsch.oid = seqclass.relnamespace
      WHERE
          NOT pg_is_other_temp_schema(nc.oid)
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND c.relkind in ('r', 'v', 'f', 'm', 'p')
          AND nc.nspname = ANY($1)
  ),
  columns_agg AS (
    SELECT DISTINCT
        info.table_schema AS table_schema,
        info.table_name AS table_name,
        array_agg(row(
          info.column_name,
          info.description,
          info.is_nullable::boolean,
          info.data_type,
          info.nominal_data_type,
          info.character_maximum_length,
          info.column_default,
          coalesce(enum_info.vals, '{}')) order by info.position) as columns
    FROM columns info
    LEFT OUTER JOIN (
        SELECT
            e.enumtypid,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) AS vals
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        GROUP BY enumtypid
    ) AS enum_info ON info.base_type = enum_info.enumtypid
    WHERE info.table_schema NOT IN ('pg_catalog', 'information_schema')
    GROUP BY info.table_schema, info.table_name
  ),
  tbl_constraints AS (
      SELECT
          c.conname::name AS constraint_name,
          nr.nspname::name AS table_schema,
          r.relname::name AS table_name
      FROM pg_namespace nc
      JOIN pg_constraint c ON nc.oid = c.connamespace
      JOIN pg_class r ON c.conrelid = r.oid
      JOIN pg_namespace nr ON nr.oid = r.relnamespace
      WHERE
        r.relkind IN ('r', 'p')
        AND NOT pg_is_other_temp_schema(nr.oid)
        AND c.contype = 'p'
  ),
  key_col_usage AS (
      SELECT
          ss.conname::name AS constraint_name,
          ss.nr_nspname::name AS table_schema,
          ss.relname::name AS table_name,
          a.attname::name AS column_name,
          (ss.x).n::integer AS ordinal_position,
          CASE
              WHEN ss.contype = 'f' THEN information_schema._pg_index_position(ss.conindid, ss.confkey[(ss.x).n])
              ELSE NULL::integer
          END::integer AS position_in_unique_constraint
      FROM pg_attribute a
      JOIN (
        SELECT r.oid AS roid,
          r.relname,
          r.relowner,
          nc.nspname AS nc_nspname,
          nr.nspname AS nr_nspname,
          c.oid AS coid,
          c.conname,
          c.contype,
          c.conindid,
          c.confkey,
          information_schema._pg_expandarray(c.conkey) AS x
        FROM pg_namespace nr
        JOIN pg_class r
          ON nr.oid = r.relnamespace
        JOIN pg_constraint c
          ON r.oid = c.conrelid
        JOIN pg_namespace nc
          ON c.connamespace = nc.oid
        WHERE
          c.contype in ('p', 'u')
          AND r.relkind IN ('r', 'p')
          AND NOT pg_is_other_temp_schema(nr.oid)
      ) ss ON a.attrelid = ss.roid AND a.attnum = (ss.x).x
      WHERE
        NOT a.attisdropped
  ),
  tbl_pk_cols AS (
    SELECT
        key_col_usage.table_schema,
        key_col_usage.table_name,
        array_agg(key_col_usage.column_name) as pk_cols
    FROM
        tbl_constraints
    JOIN
        key_col_usage
    ON
        key_col_usage.table_name = tbl_constraints.table_name AND
        key_col_usage.table_schema = tbl_constraints.table_schema AND
        key_col_usage.constraint_name = tbl_constraints.constraint_name
    WHERE
        key_col_usage.table_schema NOT IN ('pg_catalog', 'information_schema')
    GROUP BY key_col_usage.table_schema, key_col_usage.table_name
  )
  SELECT
    n.nspname AS table_schema,
    c.relname AS table_name,
    d.description AS table_description,
    c.relkind IN ('v','m') as is_view,
    (
      c.relkind IN ('r','p')
      OR (
        c.relkind in ('v','f')
        -- The function \`pg_relation_is_updateable\` returns a bitmask where 8
        -- corresponds to \`1 << CMD_INSERT\` in the PostgreSQL source code, i.e.
        -- it's possible to insert into the relation.
        AND (pg_relation_is_updatable(c.oid::regclass, TRUE) & 8) = 8
      )
    ) AS insertable,
    (
      c.relkind IN ('r','p')
      OR (
        c.relkind in ('v','f')
        -- CMD_UPDATE
        AND (pg_relation_is_updatable(c.oid::regclass, TRUE) & 4) = 4
      )
    ) AS updatable,
    (
      c.relkind IN ('r','p')
      OR (
        c.relkind in ('v','f')
        -- CMD_DELETE
        AND (pg_relation_is_updatable(c.oid::regclass, TRUE) & 16) = 16
      )
    ) AS deletable,
    coalesce(tpks.pk_cols, '{}') as pk_cols,
    coalesce(cols_agg.columns, '{}') as columns,
    c.relkind::text as relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_description d on d.objoid = c.oid and d.objsubid = 0
  LEFT JOIN tbl_pk_cols tpks ON n.nspname = tpks.table_schema AND c.relname = tpks.table_name
  LEFT JOIN columns_agg cols_agg ON n.nspname = cols_agg.table_schema AND c.relname = cols_agg.table_name
  WHERE c.relkind IN ('v','r','m','f','p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')  AND not c.relispartition ORDER BY table_schema, table_name`;

// Ports SchemaCache.hs allViewsKeyDependencies — decompiles pg_rewrite ev_action
// (pg_node_tree) into JSON to find which view columns map to source-table PK/FK
// columns. Ported byte-for-byte (backslashes doubled for the TS literal) except
// for one deviation: `ANY($1 || $2)` gains a `$1::text[]` cast because hasql
// binds explicit text[] parameter OIDs while node-postgres leaves them for the
// server to infer, which fails across the `||` operator.
// Query explanation at:
//  * rationale: https://gist.github.com/wolfgangwalther/5425d64e7b0d20aad71f6f68474d9f19
//  * json transformation: https://gist.github.com/wolfgangwalther/3a8939da680c24ad767e93ad2c183089
// Parameters: $1 text[] — exposed schemas, $2 text[] — db-extra-search-path schemas.
export const VIEWS_KEY_DEPENDENCIES_SQL = `
      with recursive
      pks_fks as (
        -- pk + fk referencing col
        select
          contype::text as contype,
          conname,
          array_length(conkey, 1) as ncol,
          conrelid as resorigtbl,
          col as resorigcol,
          ord
        from pg_constraint
        left join lateral unnest(conkey) with ordinality as _(col, ord) on true
        where contype IN ('p', 'f')
        union
        -- fk referenced col
        select
          concat(contype, '_ref') as contype,
          conname,
          array_length(confkey, 1) as ncol,
          confrelid,
          col,
          ord
        from pg_constraint
        left join lateral unnest(confkey) with ordinality as _(col, ord) on true
        where contype='f'
      ),
      views as (
        select
          c.oid       as view_id,
          n.nspname   as view_schema,
          c.relname   as view_name,
          r.ev_action as view_definition
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_rewrite r on r.ev_class = c.oid
        where c.relkind in ('v', 'm') and n.nspname = ANY($1::text[] || $2)
      ),
      transform_json as (
        select
          view_id, view_schema, view_name,
          -- the following formatting is without indentation on purpose
          -- to allow simple diffs, with less whitespace noise
          replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            regexp_replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
            replace(
              view_definition::text,
            -- This conversion to json is heavily optimized for performance.
            -- The general idea is to use as few regexp_replace() calls as possible.
            -- Simple replace() is a lot faster, so we jump through some hoops
            -- to be able to use regexp_replace() only once.
            -- This has been tested against a huge schema with 250+ different views.
            -- The unit tests do NOT reflect all possible inputs. Be careful when changing this!
            -- -----------------------------------------------
            -- pattern           | replacement         | flags
            -- -----------------------------------------------
            -- \`<>\` in pg_node_tree is the same as \`null\` in JSON, but due to very poor performance of json_typeof
            -- we need to make this an empty array here to prevent json_array_elements from throwing an error
            -- when the targetList is null.
            -- We'll need to put it first, to make the node protection below work for node lists that start with
            -- null: \`(<> ...\`, too. This is the case for coldefexprs, when the first column does not have a default value.
               '<>'              , '()'
            -- \`,\` is not part of the pg_node_tree format, but used in the regex.
            -- This removes all \`,\` that might be part of column names.
            ), ','               , ''
            -- The same applies for \`{\` and \`}\`, although those are used a lot in pg_node_tree.
            -- We remove the escaped ones, which might be part of column names again.
            ), E'\\\\{'            , ''
            ), E'\\\\}'            , ''
            -- The fields we need are formatted as json manually to protect them from the regex.
            ), ' :targetList '   , ',"targetList":'
            ), ' :resno '        , ',"resno":'
            ), ' :resorigtbl '   , ',"resorigtbl":'
            ), ' :resorigcol '   , ',"resorigcol":'
            -- Make the regex also match the node type, e.g. \`{QUERY ...\`, to remove it in one pass.
            ), '{'               , '{ :'
            -- Protect node lists, which start with \`({\` or \`((\` from the greedy regex.
            -- The extra \`{\` is removed again later.
            ), '(('              , '{(('
            ), '({'              , '{({'
            -- This regex removes all unused fields to avoid the need to format all of them correctly.
            -- This leads to a smaller json result as well.
            -- Removal stops at \`,\` for used fields (see above) and \`}\` for the end of the current node.
            -- Nesting can't be parsed correctly with a regex, so we stop at \`{\` as well and
            -- add an empty key for the followig node.
            ), ' :[^}{,]+'       , ',"":'              , 'g'
            -- For performance, the regex also added those empty keys when hitting a \`,\` or \`}\`.
            -- Those are removed next.
            ), ',"":}'           , '}'
            ), ',"":,'           , ','
            -- This reverses the "node list protection" from above.
            ), '{('              , '('
            -- Every key above has been added with a \`,\` so far. The first key in an object doesn't need it.
            ), '{,'              , '{'
            -- pg_node_tree has \`()\` around lists, but JSON uses \`[]\`
            ), '('               , '['
            ), ')'               , ']'
            -- pg_node_tree has \` \` between list items, but JSON uses \`,\`
            ), ' '             , ','
          )::json as view_definition
        from views
      ),
      target_entries as(
        select
          view_id, view_schema, view_name,
          json_array_elements(view_definition->0->'targetList') as entry
        from transform_json
      ),
      results as(
        select
          view_id, view_schema, view_name,
          (entry->>'resno')::int as view_column,
          (entry->>'resorigtbl')::oid as resorigtbl,
          (entry->>'resorigcol')::int as resorigcol
        from target_entries
      ),
      -- CYCLE detection according to PG docs: https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-CYCLE
      -- Can be replaced with CYCLE clause once PG v13 is EOL.
      recursion(view_id, view_schema, view_name, view_column, resorigtbl, resorigcol, is_cycle, path) as(
        select
          r.*,
          false,
          ARRAY[resorigtbl]
        from results r
        where view_schema = ANY ($1)
        union all
        select
          view.view_id,
          view.view_schema,
          view.view_name,
          view.view_column,
          tab.resorigtbl,
          tab.resorigcol,
          tab.resorigtbl = ANY(path),
          path || tab.resorigtbl
        from recursion view
        join results tab on view.resorigtbl=tab.view_id and view.resorigcol=tab.view_column
        where not is_cycle
      ),
      repeated_references as(
        select
          view_id,
          view_schema,
          view_name,
          resorigtbl,
          resorigcol,
          array_agg(attname) as view_columns
        from recursion
        join pg_attribute vcol on vcol.attrelid = view_id and vcol.attnum = view_column
        group by
          view_id,
          view_schema,
          view_name,
          resorigtbl,
          resorigcol
      )
      select
        sch.nspname as table_schema,
        tbl.relname as table_name,
        rep.view_schema,
        rep.view_name,
        pks_fks.conname as constraint_name,
        pks_fks.contype as constraint_type,
        array_agg(row(col.attname, view_columns) order by pks_fks.ord) as column_dependencies
      from repeated_references rep
      join pks_fks using (resorigtbl, resorigcol)
      join pg_class tbl on tbl.oid = rep.resorigtbl
      join pg_attribute col on col.attrelid = tbl.oid and col.attnum = rep.resorigcol
      join pg_namespace sch on sch.oid = tbl.relnamespace
      group by sch.nspname, tbl.relname,  rep.view_schema, rep.view_name, pks_fks.conname, pks_fks.contype, pks_fks.ncol
      -- make sure we only return key for which all columns are referenced in the view - no partial PKs or FKs
      having ncol = array_length(array_agg(row(col.attname, view_columns) order by pks_fks.ord), 1)
      `;

// Ports SchemaCache.hs allM2OandO2ORels — many-to-one relationships over
// pg_constraint, plus the one-to-one refinement (FK cols form a PK/unique).
// Parameters: none. Version conditional taken: `conparentid = 0` (pgVersion110).
// We use jsonb_agg for comparing the uniques/pks instead of array_agg to avoid
// the ERROR:  cannot accumulate arrays of different dimensionality
export const M2O_AND_O2O_RELS_SQL = `
    WITH
    pks_uniques_cols AS (
      SELECT
        connamespace,
        conrelid,
        jsonb_agg(column_info.cols) as cols
      FROM pg_constraint
      JOIN lateral (
        SELECT array_agg(cols.attname order by cols.attnum) as cols
        FROM ( select unnest(conkey) as col) _
        JOIN pg_attribute cols on cols.attrelid = conrelid and cols.attnum = col
      ) column_info ON TRUE
      WHERE
        contype IN ('p', 'u') and
        connamespace::regnamespace::text <> 'pg_catalog'
      GROUP BY connamespace, conrelid
    )
    SELECT
      ns1.nspname AS table_schema,
      tab.relname AS table_name,
      ns2.nspname AS foreign_table_schema,
      other.relname AS foreign_table_name,
      (ns1.nspname, tab.relname) = (ns2.nspname, other.relname) AS is_self,
      traint.conname  AS constraint_name,
      column_info.cols_and_fcols,
      (column_info.cols IN (SELECT * FROM jsonb_array_elements(pks_uqs.cols))) AS one_to_one
    FROM pg_constraint traint
    JOIN LATERAL (
      SELECT
        array_agg(row(cols.attname, refs.attname) order by ord) AS cols_and_fcols,
        jsonb_agg(cols.attname order by cols.attnum) AS cols
      FROM unnest(traint.conkey, traint.confkey) WITH ORDINALITY AS _(col, ref, ord)
      JOIN pg_attribute cols ON cols.attrelid = traint.conrelid AND cols.attnum = col
      JOIN pg_attribute refs ON refs.attrelid = traint.confrelid AND refs.attnum = ref
    ) AS column_info ON TRUE
    JOIN pg_namespace ns1 ON ns1.oid = traint.connamespace
    JOIN pg_class tab ON tab.oid = traint.conrelid
    JOIN pg_class other ON other.oid = traint.confrelid
    JOIN pg_namespace ns2 ON ns2.oid = other.relnamespace
    LEFT JOIN pks_uniques_cols pks_uqs ON pks_uqs.connamespace = traint.connamespace AND pks_uqs.conrelid = traint.conrelid
    WHERE traint.contype = 'f'
   and traint.conparentid = 0 ORDER BY traint.conrelid, traint.conname`;

// Ports SchemaCache.hs allComputedRels — one-argument functions taking a
// relation row type and returning a relation row type.
// Parameters: none. (Trailing `;` from upstream dropped so the query can be
// wrapped in a subselect.)
export const COMPUTED_RELS_SQL = `
    with
    all_relations as (
      select reltype
      from pg_class
      where relkind in ('v','r','m','f','p')
    ),
    computed_rels as (
      select
        (parse_ident(p.pronamespace::regnamespace::text))[1] as schema,
        p.proname::text                  as name,
        arg_schema.nspname::text         as rel_table_schema,
        arg_name.typname::text           as rel_table_name,
        ret_schema.nspname::text         as rel_ftable_schema,
        ret_name.typname::text           as rel_ftable_name,
        not p.proretset or p.prorows = 1 as single_row
      from pg_proc p
        join pg_type      arg_name   on arg_name.oid = p.proargtypes[0]
        join pg_namespace arg_schema on arg_schema.oid = arg_name.typnamespace
        join pg_type      ret_name   on ret_name.oid = p.prorettype
        join pg_namespace ret_schema on ret_schema.oid = ret_name.typnamespace
      where
        p.pronargs = 1
        and p.proargtypes[0] in (select reltype from all_relations)
        and p.prorettype in (select reltype from all_relations)
    )
    select
      *,
      row(rel_table_schema, rel_table_name) = row(rel_ftable_schema, rel_ftable_name) as is_self
    from computed_rels
  `;

// Ports SchemaCache.hs funcsSqlQuery. Version conditional taken: `prokind = 'f'`
// (pgVersion110). Parameters: $2 text[] — db-hoisted-tx-settings regex patterns
// (the $1 slot is appended by the two variants below, matching upstream).
export const FUNCS_SQL = `
 -- Recursively get the base types of domains
  WITH
  base_types AS (
    WITH RECURSIVE
    recurse AS (
      SELECT
        oid,
        typbasetype,
        COALESCE(NULLIF(typbasetype, 0), oid) AS base
      FROM pg_type
      UNION
      SELECT
        t.oid,
        b.typbasetype,
        COALESCE(NULLIF(b.typbasetype, 0), b.oid) AS base
      FROM recurse t
      JOIN pg_type b ON t.typbasetype = b.oid
    )
    SELECT
      oid,
      base
    FROM recurse
    WHERE typbasetype = 0
  ),
  arguments AS (
    SELECT
      oid,
      array_agg((
        COALESCE(name, ''), -- name
        type::regtype::text, -- type
        CASE type
          WHEN 'bit'::regtype THEN 'bit varying'
          WHEN 'bit[]'::regtype THEN 'bit varying[]'
          WHEN 'character'::regtype THEN 'character varying'
          WHEN 'character[]'::regtype THEN 'character varying[]'
          ELSE type::regtype::text
        END, -- convert types that ignore the lenth and accept any value till maximum size
        idx <= (pronargs - pronargdefaults), -- is_required
        COALESCE(mode = 'v', FALSE) -- is_variadic
      ) ORDER BY idx) AS args,
      CASE COUNT(*) - COUNT(name) -- number of unnamed arguments
        WHEN 0 THEN true
        WHEN 1 THEN (array_agg(type))[1] IN ('bytea'::regtype, 'json'::regtype, 'jsonb'::regtype, 'text'::regtype, 'xml'::regtype)
        ELSE false
      END AS callable
    FROM pg_proc,
         unnest(proargnames, proargtypes, proargmodes)
           WITH ORDINALITY AS _ (name, type, mode, idx)
    WHERE type IS NOT NULL -- only input arguments
    GROUP BY oid
  )
  SELECT
    pn.nspname AS proc_schema,
    p.proname AS proc_name,
    d.description AS proc_description,
    COALESCE(a.args, '{}') AS args,
    tn.nspname AS schema,
    COALESCE(comp.relname, t.typname) AS name,
    p.proretset AS rettype_is_setof,
    (t.typtype = 'c'
     -- if any TABLE, INOUT or OUT arguments present, treat as composite
     or COALESCE(proargmodes::text[] && '{t,b,o}', false)
    ) AS rettype_is_composite,
    bt.oid <> bt.base as rettype_is_composite_alias,
    p.provolatile,
    p.provariadic > 0 as hasvariadic,
    lower((regexp_split_to_array((regexp_split_to_array(iso_config, '='))[2], ','))[1]) AS transaction_isolation_level,
    coalesce(func_settings.kvs, '{}') as kvs
  FROM pg_proc p
  LEFT JOIN arguments a ON a.oid = p.oid
  JOIN pg_namespace pn ON pn.oid = p.pronamespace
  JOIN base_types bt ON bt.oid = p.prorettype
  JOIN pg_type t ON t.oid = bt.base
  JOIN pg_namespace tn ON tn.oid = t.typnamespace
  LEFT JOIN pg_class comp ON comp.oid = t.typrelid
  LEFT JOIN pg_description as d ON d.objoid = p.oid
  LEFT JOIN LATERAL unnest(proconfig) iso_config ON iso_config LIKE 'default_transaction_isolation%'
  LEFT JOIN LATERAL (
    SELECT
      array_agg(row(
        substr(setting, 1, strpos(setting, '=') - 1),
        substr(setting, strpos(setting, '=') + 1)
      )) as kvs
    FROM unnest(proconfig) setting
    WHERE setting ~ ANY($2)
  ) func_settings ON TRUE
  WHERE t.oid <> 'trigger'::regtype AND COALESCE(a.callable, true)
AND prokind = 'f'`;

// Ports SchemaCache.hs allFunctions. Parameters: $1 text[] — exposed schemas,
// $2 text[] — db-hoisted-tx-settings patterns.
export const ALL_FUNCTIONS_SQL = `${FUNCS_SQL} AND pn.nspname = ANY($1)`;

// Ports SchemaCache.hs accessibleFuncs. Parameters: $1 text — schema,
// $2 text[] — db-hoisted-tx-settings patterns.
export const ACCESSIBLE_FUNCS_SQL = `${FUNCS_SQL} AND pn.nspname = $1 AND has_function_privilege(p.oid, 'execute')`;

// Ports SchemaCache.hs dataRepresentations. Selects all potential data
// representation transformations: implicit casts to or from a domain, to/from
// JSON or text for now.
// Parameters: none. (Upstream declares a [Schema] encoder but the SQL never
// references $1, so no parameter is bound here.)
export const DATA_REPRESENTATIONS_SQL = `
    SELECT
      c.castsource::regtype::text,
      c.casttarget::regtype::text,
      c.castfunc::regproc::text
    FROM
      pg_catalog.pg_cast c
    JOIN pg_catalog.pg_type src_t
      ON c.castsource::oid = src_t.oid
    JOIN pg_catalog.pg_type dst_t
      ON c.casttarget::oid = dst_t.oid
    WHERE
      c.castcontext = 'i'
      AND c.castmethod = 'f'
      AND has_function_privilege(c.castfunc, 'execute')
      AND ((src_t.typtype = 'd' AND c.casttarget IN ('json'::regtype::oid , 'text'::regtype::oid))
       OR (dst_t.typtype = 'd' AND c.castsource IN ('json'::regtype::oid , 'text'::regtype::oid)))
    `;

// Ports SchemaCache.hs mediaHandlers — custom media-type handlers: aggregates
// over a composite/anyelement returning a media-type domain, or scalar
// functions returning one. Parameters: $1 text[] — exposed schemas.
// Version conditional taken: `prokind = 'f'` (pgVersion110).
export const MEDIA_HANDLERS_SQL = `
      with
      all_relations as (
        select reltype
        from pg_class
        where relkind in ('v','r','m','f','p')
        union
        select oid
        from pg_type
        where typname = 'anyelement'
      ),
      media_types as (
          SELECT
            t.oid,
            lower(t.typname) as typname,
            b.oid as base_oid,
            b.typname AS basetypname,
            t.typnamespace,
            case t.typname
              when '*/*' then 'application/octet-stream'
              else t.typname
            end as resolved_media_type
          FROM pg_type t
          JOIN pg_type b ON t.typbasetype = b.oid
          WHERE
            t.typbasetype <> 0 and
            (t.typname ~* '^[A-Za-z0-9.-]+/[A-Za-z0-9.\\+-]+$' or t.typname = '*/*')
      )
      select
        proc_schema.nspname           as handler_schema,
        proc.proname                  as handler_name,
        arg_schema.nspname::text      as target_schema,
        arg_name.typname::text        as target_name,
        media_types.typname           as media_type,
        media_types.resolved_media_type
      from media_types
        join pg_proc      proc         on proc.prorettype = media_types.oid
        join pg_namespace proc_schema  on proc_schema.oid = proc.pronamespace
        join pg_aggregate agg          on agg.aggfnoid = proc.oid
        join pg_type      arg_name     on arg_name.oid = proc.proargtypes[0]
        join pg_namespace arg_schema   on arg_schema.oid = arg_name.typnamespace
      where
        proc_schema.nspname = ANY($1) and
        proc.pronargs = 1 and
        arg_name.oid in (select reltype from all_relations)
      union
      select
          typ_sch.nspname as handler_schema,
          mtype.typname   as handler_name,
          pro_sch.nspname as target_schema,
          proname         as target_name,
          mtype.typname   as media_type,
          mtype.resolved_media_type
      from pg_proc proc
        join pg_namespace pro_sch on pro_sch.oid = proc.pronamespace
        join media_types mtype on proc.prorettype = mtype.oid
        join pg_namespace typ_sch     on typ_sch.oid = mtype.typnamespace
      where
        pro_sch.nspname = ANY($1) and NOT proretset
       AND prokind = 'f'`;

// Ports SchemaCache.hs schemaDescription. Parameters: $1 text — schema.
export const SCHEMA_DESCRIPTION_SQL = `
      select
        description
      from
        pg_namespace n
        left join pg_description d on d.objoid = n.oid
      where
        n.nspname = $1 `;

// Ports SchemaCache.hs accessibleTables. Parameters: $1 text[] — exposed
// schemas. Version conditional taken: relispartition filter (pgVersion100).
export const ACCESSIBLE_TABLES_SQL = `
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('v','r','m','f','p')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname = ANY($1)
    AND (
      pg_has_role(c.relowner, 'USAGE')
      or has_table_privilege(c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      or has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
    )  AND not c.relispartition ORDER BY table_schema, table_name`;

// Ports SchemaCache.hs timezones. Parameters: none.
export const TIMEZONES_SQL = "SELECT name FROM pg_timezone_names";
