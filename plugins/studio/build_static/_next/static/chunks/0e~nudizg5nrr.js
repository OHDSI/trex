(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,850036,479084,332357,721490,247309,387578,640696,517638,53336,957386,779262,538892,788035,940562,e=>{"use strict";var t,n=e.i(97429),a=e.i(248593);let i=new Set(["AES128","AES256","ALL","ALLOWOVERWRITE","ANALYSE","ANALYZE","AND","ANY","ARRAY","AS","ASC","ASYMMETRIC","AUTHORIZATION","BACKUP","BETWEEN","BIGINT","BINARY","BIT","BLANKSASNULL","BOOLEAN","BOTH","BYTEDICT","CASE","CAST","CHAR","CHARACTER","CHECK","COALESCE","COLLATE","COLLATION","COLUMN","CONCURRENTLY","CONSTRAINT","CREATE","CREDENTIALS","CROSS","CURRENT_CATALOG","CURRENT_DATE","CURRENT_ROLE","CURRENT_SCHEMA","CURRENT_TIME","CURRENT_TIMESTAMP","CURRENT_USER_ID","CURRENT_USER","DEC","DECIMAL","DEFAULT","DEFERRABLE","DEFLATE","DEFRAG","DELETE","DELTA","DELTA32K","DESC","DISABLE","DISTINCT","DO","ELSE","EMPTYASNULL","ENABLE","ENCODE","ENCRYPT","ENCRYPTION","END","EXCEPT","EXISTS","EXPLICIT","EXTRACT","FALSE","FETCH","FLOAT","FOR","FOREIGN","FREEZE","FROM","FULL","GLOBALDICT256","GLOBALDICT64K","GRANT","GREATEST","GROUP","GROUPING","GZIP","HAVING","IDENTITY","IGNORE","ILIKE","IN","INITIALLY","INNER","INOUT","INSERT","INT","INTEGER","INTERSECT","INTERVAL","INTO","IS","ISNULL","JOIN","JSON_ARRAY","JSON_ARRAYAGG","JSON_EXISTS","JSON_OBJECT","JSON_OBJECTAGG","JSON_QUERY","JSON_SCALAR","JSON_SERIALIZE","JSON_TABLE","JSON_VALUE","JSON","LATERAL","LEADING","LEAST","LEFT","LIKE","LIMIT","LOCALTIME","LOCALTIMESTAMP","LUN","LUNS","LZO","LZOP","MERGE_ACTION","MINUS","MOSTLY13","MOSTLY32","MOSTLY8","NATIONAL","NATURAL","NCHAR","NEW","NONE","NORMALIZE","NOT","NOTNULL","NULL","NULLIF","NULLS","NUMERIC","OFF","OFFLINE","OFFSET","OLD","ON","ONLY","OPEN","OR","ORDER","OUT","OUTER","OVERLAPS","OVERLAY","PARALLEL","PARTITION","PERCENT","PLACING","POSITION","PRECISION","PRIMARY","RAW","READRATIO","REAL","RECOVER","REFERENCES","REJECTLOG","RESORT","RESTORE","RETURNING","RIGHT","ROW","SELECT","SESSION_USER","SETOF","SIMILAR","SMALLINT","SOME","SUBSTRING","SYMMETRIC","SYSDATE","SYSTEM_USER","SYSTEM","TABLE","TABLESAMPLE","TAG","TDES","TEXT255","TEXT32K","THEN","TIME","TIMESTAMP","TO","TOP","TRAILING","TREAT","TRIM","TRUE","TRUNCATECOLUMNS","UNION","UNIQUE","UPDATE","USER","USING","VALUES","VARCHAR","VARIADIC","VERBOSE","WALLET","WHEN","WHERE","WINDOW","WITH","WITHOUT","XMLATTRIBUTES","XMLCONCAT","XMLELEMENT","XMLEXISTS","XMLFOREST","XMLNAMESPACES","XMLPARSE","XMLPI","XMLROOT","XMLSERIALIZE","XMLTABLE"]);function r(e){return e.replace("T"," ").replace("Z","+00")}function o(e,t,n){let a=_``;for(let[e,i]of(a=_`${a} (`,t.entries()))a=_`${a}${0===e?_``:_`, `}${n(i)}`;return _`${a})`}function s(e){if(null==e)throw Error("SQL identifier cannot be null or undefined");if(!1===e)return'"f"';if(!0===e)return'"t"';if(e instanceof Date)return _`"${r(e.toISOString())}"`;if(Array.isArray(e)){let t=[];for(let n of e)if(!0===Array.isArray(n))throw TypeError("Nested array to grouped list conversion is not supported for SQL identifier");else t.push(s(n));return t.toString()}else if(e===Object(e))throw Error("SQL identifier cannot be an object");let t=String(e).slice(0);if(!0===/^[_a-z][\d$_a-z]*$/.test(t)&&!1==!!i.has(t.toUpperCase()))return t;let n='"';for(let e of t)n+='"'===e?e+e:e;return n+'"'}function l(e){let t,n="";if(null==e)return"NULL";if("bigint"==typeof e)return BigInt(e).toString();if(e===1/0)return"'Infinity'";if(e===-1/0)return"'-Infinity'";if(Number.isNaN(e))return"'NaN'";if("number"==typeof e)return Number(e).toString();if(!1===e)return"'f'";if(!0===e)return"'t'";if(e instanceof Date)return _`'${r(e.toISOString())}'`;if(Array.isArray(e)){let t=[];for(let[n,a]of e.entries())!0===Array.isArray(a)?t.push(o(0!==n,a,l)):t.push(l(a));return t.toString()}e===Object(e)?(t="jsonb",n=JSON.stringify(e)):n=String(e).slice(0);let a=!1,i="'";for(let e of n)"'"===e?i+=e+e:"\\"===e?(i+=e+e,a=!0):i+=e;return i+="'",!0===a&&(i=`E${i}`),t&&(i+=`::${t}`),i}function c(e){if(!/^[A-Za-z][A-Za-z0-9_ ]*$/.test(e))throw Error(`Not a valid keyword: "${e}". Only letters, numbers, underscores, and spaces are permitted.`);return e}function d(e,...t){let n,a;return n=0,a=RegExp("%(%|(\\d+\\$)?[ILs])","g"),e.replace(a,(e,a)=>{if("%"===a)return _`%`;let i=n,c=a.split("$");if(c.length>1&&(i=Number.parseInt(c[0],10)-1,a=c[1]),i<0)throw Error("specified argument 0 but arguments start at 1");if(i>t.length-1)throw Error("too few arguments");if(n=i+1,"I"===a)return s(t[i]);if("L"===a)return l(t[i]);if("s"===a)return function e(t){if(null==t)return _``;if(!1===t)return _`f`;if(!0===t)return _`t`;if(t instanceof Date)return r(t.toISOString());if(Array.isArray(t)){let n=[];for(let[a,i]of t.entries())null!=i&&(!0===Array.isArray(i)?n.push(o(0!==a,i,e)):n.push(e(i)));return n.toString()}return t&&"object"==typeof t?JSON.stringify(t):String(t).toString().slice(0)}(t[i]);throw Error(`unsupported format type: ${a}`)})}function _(e,...t){return e.reduce((e,n,a)=>e+n+(t[a]??""),"")}function p(e,t){return e.join(t)}e.s(["acceptUntrustedSql",0,function(e){return e},"format",0,d,"ident",0,s,"joinSqlFragments",0,p,"keyword",0,c,"literal",0,l,"rawSql",0,function(e){return e},"safeSql",0,_,"untrustedSql",0,function(e){return e}],479084);let m=(e,t)=>_`
COALESCE(
  (
    SELECT
      array_agg(row_to_json(${s(e)})) FILTER (WHERE ${t})
    FROM
      ${s(e)}
  ),
  '{}'
) AS ${s(e)}`;function E(e,t,n){return(n&&(t=n.concat(t??[])),e?.length)?_`IN (${p(e.map(l),",")})`:t?.length?_`NOT IN (${p(t.map(l),",")})`:_``}let u=_`
-- Lists each column's privileges in the form of:
--
-- [
--   {
--     "column_id": "12345.1",
--     "relation_schema": "public",
--     "relation_name": "mytable",
--     "column_name": "mycolumn",
--     "privileges": [
--       {
--         "grantor": "postgres",
--         "grantee": "myrole",
--         "privilege_type": "SELECT",
--         "is_grantable": false
--       },
--       ...
--     ]
--   },
--   ...
-- ]
--
-- Modified from information_schema.column_privileges. We try to be as close as
-- possible to the view definition, obtained from:
--
-- select pg_get_viewdef('information_schema.column_privileges');
--
-- The main differences are:
-- - we include column privileges for materialized views
--   (reason for exclusion in information_schema.column_privileges:
--    https://www.postgresql.org/message-id/9136.1502740844%40sss.pgh.pa.us)
-- - we query a.attrelid and a.attnum to generate column_id
-- - table_catalog is omitted
-- - table_schema -> relation_schema, table_name -> relation_name
--
-- Column privileges are intertwined with table privileges in that table
-- privileges override column privileges. E.g. if we do:
--
-- grant all on mytable to myrole;
--
-- Then myrole is granted privileges for ALL columns. Likewise, if we do:
--
-- grant all (id) on mytable to myrole;
-- revoke all on mytable from myrole;
--
-- Then the grant on the id column is revoked.
--
-- This is unlike how grants for schemas and tables interact, where you need
-- privileges for BOTH the schema the table is in AND the table itself in order
-- to access the table.

select (x.attrelid || '.' || x.attnum) as column_id,
       nc.nspname as relation_schema,
       x.relname as relation_name,
       x.attname as column_name,
       coalesce(
         jsonb_agg(
           jsonb_build_object(
             'grantor', u_grantor.rolname,
             'grantee', grantee.rolname,
             'privilege_type', x.prtype,
             'is_grantable', x.grantable
           )
         ),
         '[]'
       ) as privileges
from
  (select pr_c.grantor,
          pr_c.grantee,
          a.attrelid,
          a.attnum,
          a.attname,
          pr_c.relname,
          pr_c.relnamespace,
          pr_c.prtype,
          pr_c.grantable,
          pr_c.relowner
   from
     (select pg_class.oid,
             pg_class.relname,
             pg_class.relnamespace,
             pg_class.relowner,
             (aclexplode(coalesce(pg_class.relacl, acldefault('r', pg_class.relowner)))).grantor as grantor,
             (aclexplode(coalesce(pg_class.relacl, acldefault('r', pg_class.relowner)))).grantee as grantee,
             (aclexplode(coalesce(pg_class.relacl, acldefault('r', pg_class.relowner)))).privilege_type as privilege_type,
             (aclexplode(coalesce(pg_class.relacl, acldefault('r', pg_class.relowner)))).is_grantable as is_grantable
      from pg_class
      where (pg_class.relkind = any (array['r',
                                           'v',
                                           'm',
                                           'f',
                                           'p'])) ) pr_c(oid, relname, relnamespace, relowner, grantor, grantee, prtype, grantable),
                                                    pg_attribute a
   where ((a.attrelid = pr_c.oid)
          and (a.attnum > 0)
          and (not a.attisdropped))
   union select pr_a.grantor,
                pr_a.grantee,
                pr_a.attrelid,
                pr_a.attnum,
                pr_a.attname,
                c.relname,
                c.relnamespace,
                pr_a.prtype,
                pr_a.grantable,
                c.relowner
   from
     (select a.attrelid,
             a.attnum,
             a.attname,
             (aclexplode(coalesce(a.attacl, acldefault('c', cc.relowner)))).grantor as grantor,
             (aclexplode(coalesce(a.attacl, acldefault('c', cc.relowner)))).grantee as grantee,
             (aclexplode(coalesce(a.attacl, acldefault('c', cc.relowner)))).privilege_type as privilege_type,
             (aclexplode(coalesce(a.attacl, acldefault('c', cc.relowner)))).is_grantable as is_grantable
      from (pg_attribute a
            join pg_class cc on ((a.attrelid = cc.oid)))
      where ((a.attnum > 0)
             and (not a.attisdropped))) pr_a(attrelid, attnum, attname, grantor, grantee, prtype, grantable),
                                        pg_class c
   where ((pr_a.attrelid = c.oid)
          and (c.relkind = any (ARRAY['r',
                                      'v',
                                      'm',
                                      'f',
                                      'p'])))) x,
     pg_namespace nc,
     pg_authid u_grantor,
  (select pg_authid.oid,
          pg_authid.rolname
   from pg_authid
   union all select (0)::oid as oid,
                    'PUBLIC') grantee(oid, rolname)
where ((x.relnamespace = nc.oid)
       and (x.grantee = grantee.oid)
       and (x.grantor = u_grantor.oid)
       and (x.prtype = any (ARRAY['INSERT',
                                  'SELECT',
                                  'UPDATE',
                                  'REFERENCES']))
       and (pg_has_role(u_grantor.oid, 'USAGE')
            or pg_has_role(grantee.oid, 'USAGE')
            or (grantee.rolname = 'PUBLIC')))
group by column_id,
         nc.nspname,
         x.relname,
         x.attname
`,g=n.z.object({grantor:n.z.string(),grantee:n.z.string(),privilege_type:n.z.union([n.z.literal("SELECT"),n.z.literal("INSERT"),n.z.literal("UPDATE"),n.z.literal("REFERENCES")]),is_grantable:n.z.boolean()}),f=n.z.object({column_id:n.z.string(),relation_schema:n.z.string(),relation_name:n.z.string(),column_name:n.z.string(),privileges:n.z.array(g)}),N=n.z.array(f);n.z.object({columnId:n.z.string(),grantee:n.z.string(),privilegeType:n.z.union([n.z.literal("ALL"),n.z.literal("SELECT"),n.z.literal("INSERT"),n.z.literal("UPDATE"),n.z.literal("REFERENCES")]),isGrantable:n.z.boolean().optional()});let b=_`
-- Adapted from information_schema.columns

SELECT
  c.oid :: int8 AS table_id,
  nc.nspname AS schema,
  c.relname AS table,
  (c.oid || '.' || a.attnum) AS id,
  a.attnum AS ordinal_position,
  a.attname AS name,
  CASE
    WHEN a.atthasdef THEN pg_get_expr(ad.adbin, ad.adrelid)
    ELSE NULL
  END AS default_value,
  CASE
    WHEN t.typtype = 'd' THEN CASE
      WHEN bt.typelem <> 0 :: oid
      AND bt.typlen = -1 THEN 'ARRAY'
      WHEN nbt.nspname = 'pg_catalog' THEN format_type(t.typbasetype, NULL)
      ELSE 'USER-DEFINED'
    END
    ELSE CASE
      WHEN t.typelem <> 0 :: oid
      AND t.typlen = -1 THEN 'ARRAY'
      WHEN nt.nspname = 'pg_catalog' THEN format_type(a.atttypid, NULL)
      ELSE 'USER-DEFINED'
    END
  END AS data_type,
  COALESCE(bt.typname, t.typname) AS format,
  a.attidentity IN ('a', 'd') AS is_identity,
  CASE
    a.attidentity
    WHEN 'a' THEN 'ALWAYS'
    WHEN 'd' THEN 'BY DEFAULT'
    ELSE NULL
  END AS identity_generation,
  a.attgenerated IN ('s') AS is_generated,
  NOT (
    a.attnotnull
    OR t.typtype = 'd' AND t.typnotnull
  ) AS is_nullable,
  (
    c.relkind IN ('r', 'p')
    OR c.relkind IN ('v', 'f') AND pg_column_is_updatable(c.oid, a.attnum, FALSE)
  ) AS is_updatable,
  uniques.table_id IS NOT NULL AS is_unique,
  check_constraints.definition AS "check",
  array_to_json(
    array(
      SELECT
        enumlabel
      FROM
        pg_catalog.pg_enum enums
      WHERE
        enums.enumtypid = coalesce(bt.oid, t.oid)
        OR enums.enumtypid = coalesce(bt.typelem, t.typelem)
      ORDER BY
        enums.enumsortorder
    )
  ) AS enums,
  col_description(c.oid, a.attnum) AS comment
FROM
  pg_attribute a
  LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid
  AND a.attnum = ad.adnum
  JOIN (
    pg_class c
    JOIN pg_namespace nc ON c.relnamespace = nc.oid
  ) ON a.attrelid = c.oid
  JOIN (
    pg_type t
    JOIN pg_namespace nt ON t.typnamespace = nt.oid
  ) ON a.atttypid = t.oid
  LEFT JOIN (
    pg_type bt
    JOIN pg_namespace nbt ON bt.typnamespace = nbt.oid
  ) ON t.typtype = 'd'
  AND t.typbasetype = bt.oid
  LEFT JOIN (
    SELECT DISTINCT ON (table_id, ordinal_position)
      conrelid AS table_id,
      conkey[1] AS ordinal_position
    FROM pg_catalog.pg_constraint
    WHERE contype = 'u' AND cardinality(conkey) = 1
  ) AS uniques ON uniques.table_id = c.oid AND uniques.ordinal_position = a.attnum
  LEFT JOIN (
    -- We only select the first column check
    SELECT DISTINCT ON (table_id, ordinal_position)
      conrelid AS table_id,
      conkey[1] AS ordinal_position,
      substring(
        pg_get_constraintdef(pg_constraint.oid, true),
        8,
        length(pg_get_constraintdef(pg_constraint.oid, true)) - 8
      ) AS "definition"
    FROM pg_constraint
    WHERE contype = 'c' AND cardinality(conkey) = 1
    ORDER BY table_id, ordinal_position, oid asc
  ) AS check_constraints ON check_constraints.table_id = c.oid AND check_constraints.ordinal_position = a.attnum
WHERE
  NOT pg_is_other_temp_schema(nc.oid)
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND (c.relkind IN ('r', 'v', 'm', 'f', 'p'))
  AND (
    pg_has_role(c.relowner, 'USAGE')
    OR has_column_privilege(
      c.oid,
      a.attnum,
      'SELECT, INSERT, UPDATE, REFERENCES'
    )
  )
`,h=n.z.object({id:n.z.string(),table_id:n.z.number(),schema:n.z.string(),table:n.z.string(),name:n.z.string(),ordinal_position:n.z.number(),data_type:n.z.string(),format:n.z.string(),is_identity:n.z.boolean(),identity_generation:n.z.string().nullable(),is_generated:n.z.boolean(),is_nullable:n.z.boolean(),is_updatable:n.z.boolean(),is_unique:n.z.boolean(),check:n.z.string().nullable(),default_value:n.z.any().nullable(),enums:n.z.array(n.z.string()),comment:n.z.string().nullable()}),T=n.z.array(h),v=n.z.optional(h),A=e=>e.endsWith("[]")?`${s(e.slice(0,-2))}[]`:e.includes(".")?e:s(e),I=_`
SELECT
  name,
  setting,
  category,
  TRIM(split_part(category, '/', 1)) AS group,
  TRIM(split_part(category, '/', 2)) AS subgroup,
  unit,
  short_desc,
  extra_desc,
  context,
  vartype,
  source,
  min_val,
  max_val,
  enumvals,
  boot_val,
  reset_val,
  sourcefile,
  sourceline,
  pending_restart
FROM
  pg_settings
ORDER BY
  category,
  name
`,$=n.z.object({name:n.z.string(),setting:n.z.string(),category:n.z.string(),group:n.z.string(),subgroup:n.z.string(),unit:n.z.string().nullable(),short_desc:n.z.string(),extra_desc:n.z.string().nullable(),context:n.z.string(),vartype:n.z.string(),source:n.z.string(),min_val:n.z.string().nullable(),max_val:n.z.string().nullable(),enumvals:n.z.array(n.z.string()).nullable(),boot_val:n.z.string().nullable(),reset_val:n.z.string().nullable(),sourcefile:n.z.string().nullable(),sourceline:n.z.number().nullable(),pending_restart:n.z.boolean()}),S=n.z.array($),R=_`
SELECT
  e.name,
  n.nspname AS schema,
  e.default_version,
  x.extversion AS installed_version,
  e.comment
FROM
  pg_available_extensions() e(name, default_version, comment)
  LEFT JOIN pg_extension x ON e.name = x.extname
  LEFT JOIN pg_namespace n ON x.extnamespace = n.oid
`,L=n.z.object({name:n.z.string(),schema:n.z.string().nullable(),default_version:n.z.string(),installed_version:n.z.string().nullable(),comment:n.z.string()}),O=n.z.array(L),y=n.z.optional(L),C={list:function({limit:e,offset:t}={}){let n=R;return e&&(n=_`${n} LIMIT ${l(e)}`),t&&(n=_`${n} OFFSET ${l(t)}`),{sql:n,zod:O}},retrieve:function({name:e}){return{sql:_`${R} WHERE name = ${l(e)};`,zod:y}},create:function({name:e,schema:t,version:n,cascade:a=!1}){return{sql:_`
CREATE EXTENSION ${s(e)}
  ${void 0===t?_``:_`SCHEMA ${s(t)}`}
  ${void 0===n?_``:_`VERSION ${l(n)}`}
  ${a?_`CASCADE`:_``};`}},update:function(e,{update:t=!1,version:n,schema:a}){let i=_``;t&&(i=_`ALTER EXTENSION ${s(e)} UPDATE ${void 0===n?_``:_`TO ${l(n)}`};`);let r=void 0===a?_``:_`ALTER EXTENSION ${s(e)} SET SCHEMA ${s(a)};`;return{sql:_`BEGIN; ${i} ${r} COMMIT;`}},remove:function(e,{cascade:t=!1}={}){return{sql:_`DROP EXTENSION ${s(e)} ${t?_`CASCADE`:_`RESTRICT`};`}},zod:L},z=_`
select
  c.oid::int8 as id,
  n.nspname as schema,
  c.relname as name,
  obj_description(c.oid) as comment,
  fs.srvname as foreign_server_name,
  fdw.fdwname as foreign_data_wrapper_name,
  handler.proname as foreign_data_wrapper_handler
from
  pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  inner join pg_foreign_table ft on ft.ftrelid = c.oid
  inner join pg_foreign_server fs on fs.oid = ft.ftserver
  inner join pg_foreign_data_wrapper fdw on fdw.oid = fs.srvfdw
  inner join pg_proc handler on handler.oid = fdw.fdwhandler
where
  c.relkind = 'f'
`,D=n.z.object({id:n.z.number(),schema:n.z.string(),name:n.z.string(),comment:n.z.string().nullable(),foreign_server_name:n.z.string(),foreign_data_wrapper_name:n.z.string(),foreign_data_wrapper_handler:n.z.string(),columns:T.optional()}),F=n.z.array(D),x=n.z.optional(D),w=({includeColumns:e})=>_`
with foreign_tables as (${z})
  ${e?_`, columns as (${b})`:_``}
select
  *
  ${e?_`, ${m("columns",_`columns.table_id = foreign_tables.id`)}`:_``}
from foreign_tables`,H=_`
-- CTE with sane arg_modes, arg_names, and arg_types.
-- All three are always of the same length.
-- All three include all args, including OUT and TABLE args.
with functions as (
  select
    *,
    -- proargmodes is null when all arg modes are IN
    coalesce(
      p.proargmodes,
      array_fill('i'::text, array[cardinality(coalesce(p.proallargtypes, p.proargtypes))])
    ) as arg_modes,
    -- proargnames is null when all args are unnamed
    coalesce(
      p.proargnames,
      array_fill(''::text, array[cardinality(coalesce(p.proallargtypes, p.proargtypes))])
    ) as arg_names,
    -- proallargtypes is null when all arg modes are IN
    coalesce(p.proallargtypes, p.proargtypes) as arg_types,
    array_cat(
      array_fill(false, array[pronargs - pronargdefaults]),
      array_fill(true, array[pronargdefaults])) as arg_has_defaults
  from
    pg_proc as p
  where
    p.prokind = 'f'
)
select
  f.oid as id,
  n.nspname as schema,
  f.proname as name,
  l.lanname as language,
  case
    when l.lanname = 'internal' then ''
    else f.prosrc
  end as definition,
  case
    when l.lanname = 'internal' then f.prosrc
    else pg_get_functiondef(f.oid)
  end as complete_statement,
  coalesce(f_args.args, '[]') as args,
  pg_get_function_arguments(f.oid) as argument_types,
  pg_get_function_identity_arguments(f.oid) as identity_argument_types,
  f.prorettype as return_type_id,
  pg_get_function_result(f.oid) as return_type,
  nullif(rt.typrelid, 0) as return_type_relation_id,
  f.proretset as is_set_returning_function,
  case
    when f.provolatile = 'i' then 'IMMUTABLE'
    when f.provolatile = 's' then 'STABLE'
    when f.provolatile = 'v' then 'VOLATILE'
  end as behavior,
  f.prosecdef as security_definer,
  f_config.config_params as config_params
from
  functions f
  left join pg_namespace n on f.pronamespace = n.oid
  left join pg_language l on f.prolang = l.oid
  left join pg_type rt on rt.oid = f.prorettype
  left join (
    select
      oid,
      jsonb_object_agg(param, value) filter (where param is not null) as config_params
    from
      (
        select
          oid,
          (string_to_array(unnest(proconfig), '='))[1] as param,
          (string_to_array(unnest(proconfig), '='))[2] as value
        from
          functions
      ) as t
    group by
      oid
  ) f_config on f_config.oid = f.oid
  left join (
    select
      oid,
      jsonb_agg(jsonb_build_object(
        'mode', t2.mode,
        'name', name,
        'type_id', type_id,
        -- Cast null into false boolean
        'has_default', COALESCE(has_default, false)
      )) as args
    from
      (
        select
          oid,
          unnest(arg_modes) as mode,
          unnest(arg_names) as name,
          -- Coming from: coalesce(p.proallargtypes, p.proargtypes) postgres won't automatically assume
          -- integer, we need to cast it to be properly parsed
          unnest(arg_types)::int8 as type_id,
          unnest(arg_has_defaults) as has_default
        from
          functions
      ) as t1,
      lateral (
        select
          case
            when t1.mode = 'i' then 'in'
            when t1.mode = 'o' then 'out'
            when t1.mode = 'b' then 'inout'
            when t1.mode = 'v' then 'variadic'
            else 'table'
          end as mode
      ) as t2
    group by
      t1.oid
  ) f_args on f_args.oid = f.oid
`,U=n.z.object({id:n.z.number(),schema:n.z.string(),name:n.z.string(),language:n.z.string(),definition:n.z.string(),complete_statement:n.z.string(),args:n.z.array(n.z.object({mode:n.z.union([n.z.literal("in"),n.z.literal("out"),n.z.literal("inout"),n.z.literal("variadic"),n.z.literal("table")]),name:n.z.string(),type_id:n.z.number(),has_default:n.z.boolean()})),argument_types:n.z.string(),identity_argument_types:n.z.string(),return_type_id:n.z.number(),return_type:n.z.string(),return_type_relation_id:n.z.union([n.z.number(),n.z.null()]),is_set_returning_function:n.z.boolean(),behavior:n.z.union([n.z.literal("IMMUTABLE"),n.z.literal("STABLE"),n.z.literal("VOLATILE")]),security_definer:n.z.boolean(),config_params:n.z.union([n.z.record(n.z.string(),n.z.string()),n.z.null()])}),M=n.z.array(U),k=n.z.optional(U),q=n.z.object({name:n.z.string(),definition:n.z.string(),args:n.z.array(n.z.string()).optional(),behavior:n.z.enum(["IMMUTABLE","STABLE","VOLATILE"]).optional(),config_params:n.z.record(n.z.string(),n.z.string()).optional(),schema:n.z.string().optional(),language:n.z.string().optional(),return_type:n.z.string().optional(),security_definer:n.z.boolean().optional()});function P({name:e,schema:t,args:n,definition:a,return_type:i,language:r,behavior:o,security_definer:c,config_params:d},{replace:_=!1}={}){return`
    CREATE ${_?"OR REPLACE":""} FUNCTION ${s(t)}.${s(e)}(${n?.join(", ")||""})
    RETURNS ${i}
    AS ${l(a)}
    LANGUAGE ${r}
    ${o}
    CALLED ON NULL INPUT
    ${c?"SECURITY DEFINER":"SECURITY INVOKER"}
    ${d?Object.entries(d).map(([e,t])=>`SET ${e} ${"FROM CURRENT"===t?"FROM CURRENT":"TO "+('""'===t?"''":t)}`).join("\n"):""};
  `}let j=n.z.object({name:n.z.string().optional(),schema:n.z.string().optional(),definition:n.z.string().optional()}),W=n.z.object({cascade:n.z.boolean().default(!1).optional()});e.s(["create",0,function({name:e,schema:t="public",args:a=[],definition:i,return_type:r="void",language:o="sql",behavior:s="VOLATILE",security_definer:l=!1,config_params:c={}}){return{sql:P({name:e,schema:t,args:a,definition:i,return_type:r,language:o,behavior:s,security_definer:l,config_params:c}),zod:n.z.void()}},"list",0,function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r}={}){let o=_`
    with f as (
      ${H}
    )
    select
      f.*
    from f
  `,s=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return s&&(o=_`${o} where schema ${s}`),i&&(o=_`${o} limit ${l(i)}`),r&&(o=_`${o} offset ${l(r)}`),{sql:o,zod:M}},"pgFunctionArrayZod",0,M,"pgFunctionCreateZod",0,q,"pgFunctionDeleteZod",0,W,"pgFunctionOptionalZod",0,k,"pgFunctionUpdateZod",0,j,"pgFunctionZod",0,U,"remove",0,function(e,{cascade:t=!1}={}){return{sql:`DROP FUNCTION ${s(e.schema)}.${s(e.name)}
  (${e.identity_argument_types})
  ${t?"CASCADE":"RESTRICT"};`,zod:n.z.void()}},"retrieve",0,function({id:e,name:t,schema:n="public",args:a=[]}){if(e)return{sql:_`
      with f as (
        ${H}
      )
      select
        f.*
      from f where id = ${l(e)};`,zod:k};if(t&&n&&a){let e=a.length?_`(
          select string_agg(type_oid::text, ' ') from (
            select (
              split_args.arr[
                array_length(
                  split_args.arr,
                  1
                )
              ]::regtype::oid
            ) as type_oid from (
              select string_to_array(
                unnest(
                  array[${p(a.map(l),",")}]
                ),
                ' '
              ) as arr
            ) as split_args
          ) args
        )`:l("");return{sql:_`with f as (
      ${H}
    )
    select
      f.*
    from f join pg_proc as p on id = p.oid where schema = ${l(n)} and name = ${l(t)} and p.proargtypes::text = ${e}`,zod:k}}throw Error("Must provide either id or name and schema")},"update",0,function(e,{name:t,schema:a,definition:i}){let r=e.argument_types.split(", "),o=e.identity_argument_types,c="string"==typeof i?P({...e,definition:i,args:r,config_params:e.config_params??{}},{replace:!0}):"",d=t&&t!==e.name?`ALTER FUNCTION ${s(e.schema)}.${s(e.name)}(${o}) RENAME TO ${s(t)};`:"",_=a&&a!==e.schema?`ALTER FUNCTION ${s(e.schema)}.${s(t||e.name)}(${o})  SET SCHEMA ${s(a)};`:"";return{sql:`
    DO LANGUAGE plpgsql $$
    BEGIN
      IF ${"string"==typeof i?"TRUE":"FALSE"} THEN
        ${c}

        IF (
          SELECT id
          FROM (${H}) AS f
          WHERE f.schema = ${l(e.schema)}
          AND f.name = ${l(e.name)}
          AND f.identity_argument_types = ${l(o)}
        ) != ${e.id} THEN
          RAISE EXCEPTION 'Cannot find function "${e.schema}"."${e.name}"(${o})';
        END IF;
      END IF;

      ${d}

      ${_}
    END;
    $$;
  `,zod:n.z.void()}}],198687);var Y=e.i(198687);let B=_`
  SELECT
    idx.indexrelid::int8 AS id,
    idx.indrelid::int8 AS table_id,
    n.nspname AS schema,
    idx.indnatts AS number_of_attributes,
    idx.indnkeyatts AS number_of_key_attributes,
    idx.indisunique AS is_unique,
    idx.indisprimary AS is_primary,
    idx.indisexclusion AS is_exclusion,
    idx.indimmediate AS is_immediate,
    idx.indisclustered AS is_clustered,
    idx.indisvalid AS is_valid,
    idx.indcheckxmin AS check_xmin,
    idx.indisready AS is_ready,
    idx.indislive AS is_live,
    idx.indisreplident AS is_replica_identity,
    idx.indkey::smallint[] AS key_attributes,
    idx.indcollation::integer[] AS collation,
    idx.indclass::integer[] AS class,
    idx.indoption::smallint[] AS options,
    idx.indpred AS index_predicate,
    obj_description(idx.indexrelid, 'pg_class') AS comment,
    ix.indexdef as index_definition,
    am.amname AS access_method,
    jsonb_agg(
      jsonb_build_object(
        'attribute_number', a.attnum,
        'attribute_name', a.attname,
        'data_type', format_type(a.atttypid, a.atttypmod)
      )
      ORDER BY a.attnum
    ) AS index_attributes
  FROM
    pg_index idx
    JOIN pg_class c ON c.oid = idx.indexrelid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_am am ON c.relam = am.oid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(idx.indkey)
    JOIN pg_indexes ix ON c.relname = ix.indexname AND n.nspname = ix.schemaname
  GROUP BY
    idx.indexrelid, idx.indrelid, n.nspname, idx.indnatts, idx.indnkeyatts, idx.indisunique, 
    idx.indisprimary, idx.indisexclusion, idx.indimmediate, idx.indisclustered, idx.indisvalid, 
    idx.indcheckxmin, idx.indisready, idx.indislive, idx.indisreplident, idx.indkey, 
    idx.indcollation, idx.indclass, idx.indoption, idx.indexprs, idx.indpred, ix.indexdef, am.amname
`,G=n.z.object({id:n.z.number(),table_id:n.z.number(),schema:n.z.string(),number_of_attributes:n.z.number(),number_of_key_attributes:n.z.number(),is_unique:n.z.boolean(),is_primary:n.z.boolean(),is_exclusion:n.z.boolean(),is_immediate:n.z.boolean(),is_clustered:n.z.boolean(),is_valid:n.z.boolean(),check_xmin:n.z.boolean(),is_ready:n.z.boolean(),is_live:n.z.boolean(),is_replica_identity:n.z.boolean(),key_attributes:n.z.array(n.z.number()),collation:n.z.array(n.z.number()),class:n.z.array(n.z.number()),options:n.z.array(n.z.number()),index_predicate:n.z.string().nullable(),comment:n.z.string().nullable(),index_definition:n.z.string(),access_method:n.z.string(),index_attributes:n.z.array(n.z.object({attribute_number:n.z.number(),attribute_name:n.z.string(),data_type:n.z.string()}))}),X=n.z.array(G),J=n.z.optional(G),V=_`
select
  c.oid::int8 as id,
  n.nspname as schema,
  c.relname as name,
  c.relispopulated as is_populated,
  obj_description(c.oid) as comment
from
  pg_class c
  join pg_namespace n on n.oid = c.relnamespace
where
  c.relkind = 'm'
`,Q=n.z.object({id:n.z.number(),schema:n.z.string(),name:n.z.string(),is_populated:n.z.boolean(),comment:n.z.string().nullable(),columns:T.optional()}),K=n.z.array(Q),Z=n.z.optional(Q),ee=({includeColumns:e})=>_`
with materialized_views as (${V})
  ${e?_`, columns as (${b})`:_``}
select
  *
  ${e?_`, ${m("columns",_`columns.table_id = materialized_views.id`)}`:_``}
from materialized_views`,et=_`
select
  pol.oid :: int8 as id,
  n.nspname as schema,
  c.relname as table,
  c.oid :: int8 as table_id,
  pol.polname as name,
  case
    when pol.polpermissive then 'PERMISSIVE'::text
    else 'RESTRICTIVE'::text
  end as action,
  case
    when pol.polroles = '{0}'::oid[] then array_to_json(string_to_array('public'::text, ''::text)::name[])
    else array_to_json(array(
      select pg_roles.rolname
      from pg_roles
      where pg_roles.oid = any(pol.polroles)
      order by pg_roles.rolname
    ))
  end as roles,
  case pol.polcmd
    when 'r'::"char" then 'SELECT'::text
    when 'a'::"char" then 'INSERT'::text
    when 'w'::"char" then 'UPDATE'::text
    when 'd'::"char" then 'DELETE'::text
    when '*'::"char" then 'ALL'::text
    else null::text
  end as command,
  pg_get_expr(pol.polqual, pol.polrelid) as definition,
  pg_get_expr(pol.polwithcheck, pol.polrelid) as check
from
  pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  left join pg_namespace n on n.oid = c.relnamespace
`,en=n.z.object({id:n.z.number(),schema:n.z.string(),table:n.z.string(),table_id:n.z.number(),name:n.z.string(),action:n.z.union([n.z.literal("PERMISSIVE"),n.z.literal("RESTRICTIVE")]),roles:n.z.array(n.z.string()),command:n.z.union([n.z.literal("SELECT"),n.z.literal("INSERT"),n.z.literal("UPDATE"),n.z.literal("DELETE"),n.z.literal("ALL")]),definition:n.z.union([n.z.string(),n.z.null()]),check:n.z.union([n.z.string(),n.z.null()])}),ea=n.z.array(en),ei=n.z.optional(en),er=_`
SELECT
  p.oid :: int8 AS id,
  p.pubname AS name,
  p.pubowner::regrole::text AS owner,
  p.pubinsert AS publish_insert,
  p.pubupdate AS publish_update,
  p.pubdelete AS publish_delete,
  p.pubtruncate AS publish_truncate,
  CASE
    WHEN p.puballtables THEN NULL
    ELSE pr.tables
  END AS tables
FROM
  pg_catalog.pg_publication AS p
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        array_agg(
          json_build_object(
            'id',
            c.oid :: int8,
            'name',
            c.relname,
            'schema',
            nc.nspname
          )
        ),
        '{}'
      ) AS tables
    FROM
      pg_catalog.pg_publication_rel AS pr
      JOIN pg_class AS c ON pr.prrelid = c.oid
      join pg_namespace as nc on c.relnamespace = nc.oid
    WHERE
      pr.prpubid = p.oid
  ) AS pr ON 1 = 1
`,eo=n.z.object({id:n.z.number().optional(),name:n.z.string(),schema:n.z.string()}),es=n.z.object({id:n.z.number(),name:n.z.string(),owner:n.z.string(),publish_insert:n.z.boolean(),publish_update:n.z.boolean(),publish_delete:n.z.boolean(),publish_truncate:n.z.boolean(),tables:n.z.array(eo).nullable()}),el=n.z.array(es),ec=n.z.optional(es),ed=_`
-- Can't use pg_authid here since some managed Postgres providers don't expose it
-- https://github.com/supabase/postgres-meta/issues/212

select
  r.oid as id,
  rolname as name,
  rolsuper as "isSuperuser",
  rolcreatedb as "canCreateDb",
  rolcreaterole as "canCreateRole",
  rolinherit as "inheritRole",
  rolcanlogin as "canLogin",
  rolreplication as "isReplicationRole",
  rolbypassrls as "canBypassRls",
  (
    select
      count(*)
    from
      pg_stat_activity
    where
      r.rolname = pg_stat_activity.usename
  ) as "activeConnections",
  case when rolconnlimit = -1 then current_setting('max_connections') :: int8
       else rolconnlimit
  end as "connectionLimit",
  rolvaliduntil as "validUntil",
  coalesce(r_config.role_configs, '{}') as config
from
  pg_roles r
  left join (
    select
      oid,
      jsonb_object_agg(param, value) filter (where param is not null) as role_configs
    from
      (
        select
          oid,
          (string_to_array(unnest(rolconfig), '='))[1] as param,
          (string_to_array(unnest(rolconfig), '='))[2] as value
        from
          pg_roles
      ) as _
    group by
      oid
  ) r_config on r_config.oid = r.oid
`,e_=n.z.object({id:n.z.number(),name:n.z.string(),isSuperuser:n.z.boolean(),canCreateDb:n.z.boolean(),canCreateRole:n.z.boolean(),inheritRole:n.z.boolean(),canLogin:n.z.boolean(),isReplicationRole:n.z.boolean(),canBypassRls:n.z.boolean(),activeConnections:n.z.number(),connectionLimit:n.z.number(),validUntil:n.z.union([n.z.string(),n.z.null()]),config:n.z.record(n.z.string(),n.z.string())}),ep=n.z.array(e_),em=n.z.optional(e_);function eE(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name)return _`${s("name")} = ${l(e.name)}`;throw Error("Must provide either id or name")}let eu=_`
-- Adapted from information_schema.schemata

select
  n.oid as id,
  n.nspname as name,
  u.rolname as owner,
   obj_description(n.oid, 'pg_namespace') AS comment
from
  pg_namespace n,
  pg_roles u
where
  n.nspowner = u.oid
  and (
    pg_has_role(n.nspowner, 'USAGE')
    or has_schema_privilege(n.oid, 'CREATE, USAGE')
  )
  and not pg_catalog.starts_with(n.nspname, 'pg_temp_')
  and not pg_catalog.starts_with(n.nspname, 'pg_toast_temp_')
`,eg=n.z.object({id:n.z.number(),name:n.z.string(),owner:n.z.string(),comment:n.z.string().nullable()}),ef=n.z.array(eg),eN=n.z.optional(eg),eb=_`
-- Despite the name \`table_privileges\`, this includes other kinds of relations:
-- views, matviews, etc. "Relation privileges" just doesn't roll off the tongue.
--
-- For each relation, get its relacl in a jsonb format,
-- e.g.
--
-- '{postgres=arwdDxt/postgres}'
--
-- becomes
--
-- [
--   {
--     "grantee": "postgres",
--     "grantor": "postgres",
--     "is_grantable": false,
--     "privilege_type": "INSERT"
--   },
--   ...
-- ]
select
  c.oid as relation_id,
  nc.nspname as schema,
  c.relname as name,
  case
    when c.relkind = 'r' then 'table'
    when c.relkind = 'v' then 'view'
    when c.relkind = 'm' then 'materialized_view'
    when c.relkind = 'f' then 'foreign_table'
    when c.relkind = 'p' then 'partitioned_table'
  end as kind,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'grantor', grantor.rolname,
        'grantee', grantee.rolname,
        'privilege_type', _priv.privilege_type,
        'is_grantable', _priv.is_grantable
      )
    ) filter (where _priv is not null),
    '[]'
  ) as privileges
from pg_class c
join pg_namespace as nc
  on nc.oid = c.relnamespace
left join lateral (
  select grantor, grantee, privilege_type, is_grantable
  from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner)))
) as _priv on true
left join pg_roles as grantor
  on grantor.oid = _priv.grantor
left join (
  select
    pg_roles.oid,
    pg_roles.rolname
  from pg_roles
  union all
  select
    (0)::oid as oid, 'PUBLIC'
) as grantee (oid, rolname)
  on grantee.oid = _priv.grantee
where c.relkind in ('r', 'v', 'm', 'f', 'p')
  and not pg_is_other_temp_schema(c.relnamespace)
  and (
    pg_has_role(c.relowner, 'USAGE')
    or has_table_privilege(
      c.oid,
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
      || case when current_setting('server_version_num')::int4 >= 170000 then ', MAINTAIN' else '' end
    )
    or has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
  )
group by
  c.oid,
  nc.nspname,
  c.relname,
  c.relkind
`,eh=n.z.object({relation_id:n.z.number(),schema:n.z.string(),name:n.z.string(),kind:n.z.union([n.z.literal("table"),n.z.literal("view"),n.z.literal("materialized_view"),n.z.literal("foreign_table"),n.z.literal("partitioned_table")]),privileges:n.z.array(n.z.object({grantor:n.z.string(),grantee:n.z.string(),privilege_type:n.z.union([n.z.literal("SELECT"),n.z.literal("INSERT"),n.z.literal("UPDATE"),n.z.literal("DELETE"),n.z.literal("TRUNCATE"),n.z.literal("REFERENCES"),n.z.literal("TRIGGER"),n.z.literal("MAINTAIN")]),is_grantable:n.z.boolean()}))}),eT=n.z.array(eh),ev=n.z.optional(eh),eA=_`
SELECT
  c.oid :: int8 AS id,
  nc.nspname AS schema,
  c.relname AS name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  CASE
    WHEN c.relreplident = 'd' THEN 'DEFAULT'
    WHEN c.relreplident = 'i' THEN 'INDEX'
    WHEN c.relreplident = 'f' THEN 'FULL'
    ELSE 'NOTHING'
  END AS replica_identity,
  pg_total_relation_size(format('%I.%I', nc.nspname, c.relname)) :: int8 AS bytes,
  pg_size_pretty(
    pg_total_relation_size(format('%I.%I', nc.nspname, c.relname))
  ) AS size,
  pg_stat_get_live_tuples(c.oid) AS live_rows_estimate,
  pg_stat_get_dead_tuples(c.oid) AS dead_rows_estimate,
  obj_description(c.oid) AS comment,
  coalesce(pk.primary_keys, '[]') as primary_keys,
  coalesce(
    jsonb_agg(relationships) filter (where relationships is not null),
    '[]'
  ) as relationships
FROM
  pg_namespace nc
  JOIN pg_class c ON nc.oid = c.relnamespace
  left join (
    select
      c.oid::int8 as table_id,
      jsonb_agg(
        jsonb_build_object(
          'table_id', c.oid::int8,
          'schema', n.nspname,
          'table_name', c.relname,
          'name', a.attname
        )
        order by array_position(i.indkey, a.attnum)
      ) as primary_keys
    from
      pg_index i
      join pg_class c on i.indrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where
      i.indisprimary
    group by c.oid
  ) as pk
  on pk.table_id = c.oid
  left join (
    select
      c.oid :: int8 as id,
      c.conname as constraint_name,
      nsa.nspname as source_schema,
      csa.relname as source_table_name,
      sa.attname as source_column_name,
      nta.nspname as target_table_schema,
      cta.relname as target_table_name,
      ta.attname as target_column_name
    from
      pg_constraint c
    join (
      pg_attribute sa
      join pg_class csa on sa.attrelid = csa.oid
      join pg_namespace nsa on csa.relnamespace = nsa.oid
    ) on sa.attrelid = c.conrelid and sa.attnum = any (c.conkey)
    join (
      pg_attribute ta
      join pg_class cta on ta.attrelid = cta.oid
      join pg_namespace nta on cta.relnamespace = nta.oid
    ) on ta.attrelid = c.confrelid and ta.attnum = any (c.confkey)
    where
      c.contype = 'f'
  ) as relationships
  on (relationships.source_schema = nc.nspname and relationships.source_table_name = c.relname)
  or (relationships.target_table_schema = nc.nspname and relationships.target_table_name = c.relname)
WHERE
  c.relkind IN ('r', 'p')
  AND NOT pg_is_other_temp_schema(nc.oid)
  AND (
    pg_has_role(c.relowner, 'USAGE')
    OR has_table_privilege(
      c.oid,
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
  )
group by
  c.oid,
  c.relname,
  c.relrowsecurity,
  c.relforcerowsecurity,
  c.relreplident,
  nc.nspname,
  pk.primary_keys
`,eI=n.z.object({table_id:n.z.number(),name:n.z.string(),schema:n.z.string(),table_name:n.z.string()}),e$=n.z.object({id:n.z.number(),constraint_name:n.z.string(),source_schema:n.z.string(),source_table_name:n.z.string(),source_column_name:n.z.string(),target_table_schema:n.z.string(),target_table_name:n.z.string(),target_column_name:n.z.string()}),eS=n.z.object({id:n.z.number(),schema:n.z.string(),name:n.z.string(),rls_enabled:n.z.boolean(),rls_forced:n.z.boolean(),replica_identity:n.z.enum(["DEFAULT","INDEX","FULL","NOTHING"]),bytes:n.z.number(),size:n.z.string(),live_rows_estimate:n.z.number(),dead_rows_estimate:n.z.number(),comment:n.z.string().nullable(),primary_keys:n.z.array(eI),relationships:n.z.array(e$),columns:T.optional()}),eR=n.z.array(eS),eL=({includeColumns:e})=>_`
  with tables as (${eA})
  ${e?_`, columns as (${b})`:_``}
  select
    *
    ${e?_`, ${m("columns",_`columns.table_id = tables.id`)}`:_``}
  from tables`;e.s(["create",0,function({name:e,schema:t="public",comment:n,no_transaction:a=!1}){let i=_`CREATE TABLE ${s(t)}.${s(e)} ();`,r=void 0!=n?_`COMMENT ON TABLE ${s(t)}.${s(e)} IS ${l(n)};`:_``;return a?{sql:_`${i} ${r}`}:{sql:_`BEGIN; ${i} ${r} COMMIT;`}},"list",0,function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r,includeColumns:o=!0}={}){let s=eL({includeColumns:o}),c=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} where schema ${c}`),i&&(s=_`${s} limit ${l(i)}`),r&&(s=_`${s} offset ${l(r)}`),{sql:s,zod:eR}},"remove",0,function(e,{cascade:t=!1}={}){return{sql:_`DROP TABLE ${s(e.schema)}.${s(e.name)} ${t?_`CASCADE`:_`RESTRICT`};`}},"retrieve",0,function(e){let t=function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.schema)return _`${s("name")} = ${l(e.name)} and ${s("schema")} = ${l(e.schema)}`;throw Error("Must provide either id or name and schema")}(e);return{sql:_`${eL({includeColumns:!0})} where ${t};`,zod:eS}},"update",0,function(e,{name:t,schema:n,rls_enabled:a,rls_forced:i,replica_identity:r,replica_identity_index:o,primary_keys:d,comment:m}){let E=_`ALTER TABLE ${s(e.schema)}.${s(e.name)}`,u=void 0===n?_``:_`${E} SET SCHEMA ${s(n)};`,g=_``;if(void 0!==t&&t!==e.name){let a=void 0===n?e.schema:n;g=_`ALTER TABLE ${s(a)}.${s(e.name)} RENAME TO ${s(t)};`}let f=_``;if(void 0!==a){let e=_`${E} ENABLE ROW LEVEL SECURITY;`,t=_`${E} DISABLE ROW LEVEL SECURITY;`;f=a?e:t}let N=_``;if(void 0!==i){let e=_`${E} FORCE ROW LEVEL SECURITY;`,t=_`${E} NO FORCE ROW LEVEL SECURITY;`;N=i?e:t}let b=_``;if(void 0===r);else if("INDEX"===r){if(!o)throw Error("replica_identity_index is required when replica_identity is INDEX");b=_`${E} REPLICA IDENTITY USING INDEX ${s(o)};`}else b=_`${E} REPLICA IDENTITY ${c(r)};`;let h=_``;void 0===d||(h=_`${h}
DO $$
DECLARE
  r record;
BEGIN
  SELECT conname
    INTO r
    FROM pg_constraint
    WHERE contype = 'p' AND conrelid = ${l(e.id)};
  IF r IS NOT NULL THEN
    EXECUTE ${l(`${E} DROP CONSTRAINT `)} || quote_ident(r.conname);
  END IF;
END
$$;
`,0===d.length||(h=_`${h} ${E} ADD PRIMARY KEY (${p(d.map(e=>s(e.name)),",")});`));let T=void 0==m?_``:_`COMMENT ON TABLE ${s(e.schema)}.${s(e.name)} IS ${l(m)};`;return{sql:_`
BEGIN;
  ${f}
  ${N}
  ${b}
  ${h}
  ${T}
  ${u}
  ${g}
COMMIT;`}}],330006);var eO=e.i(330006);let ey=_`
SELECT
  pg_t.oid AS id,
  pg_t.tgrelid AS table_id,
  CASE
    WHEN pg_t.tgenabled = 'D' THEN 'DISABLED'
    WHEN pg_t.tgenabled = 'O' THEN 'ORIGIN'
    WHEN pg_t.tgenabled = 'R' THEN 'REPLICA'
    WHEN pg_t.tgenabled = 'A' THEN 'ALWAYS'
  END AS enabled_mode,
  (
    STRING_TO_ARRAY(
      ENCODE(pg_t.tgargs, 'escape'), '\\000'
    )
  )[:pg_t.tgnargs] AS function_args,
  is_t.trigger_name AS name,
  is_t.event_object_table AS table,
  is_t.event_object_schema AS schema,
  is_t.action_condition AS condition,
  is_t.action_orientation AS orientation,
  is_t.action_timing AS activation,
  ARRAY_AGG(is_t.event_manipulation)::text[] AS events,
  pg_p.proname AS function_name,
  pg_n.nspname AS function_schema
FROM
  pg_trigger AS pg_t
JOIN
  pg_class AS pg_c
ON pg_t.tgrelid = pg_c.oid
JOIN information_schema.triggers AS is_t
ON is_t.trigger_name = pg_t.tgname
AND pg_c.relname = is_t.event_object_table
AND pg_c.relnamespace = (quote_ident(is_t.event_object_schema))::regnamespace
JOIN pg_proc AS pg_p
ON pg_t.tgfoid = pg_p.oid
JOIN pg_namespace AS pg_n
ON pg_p.pronamespace = pg_n.oid
GROUP BY
  pg_t.oid,
  pg_t.tgrelid,
  pg_t.tgenabled,
  pg_t.tgargs,
  pg_t.tgnargs,
  is_t.trigger_name,
  is_t.event_object_table,
  is_t.event_object_schema,
  is_t.action_condition,
  is_t.action_orientation,
  is_t.action_timing,
  pg_p.proname,
  pg_n.nspname
`,eC=n.z.object({id:n.z.number(),table_id:n.z.number(),enabled_mode:n.z.enum(["DISABLED","ORIGIN","REPLICA","ALWAYS"]),function_args:n.z.array(n.z.string()),name:n.z.string(),table:n.z.string(),schema:n.z.string(),condition:n.z.string().nullable(),orientation:n.z.string(),activation:n.z.string(),events:n.z.array(n.z.string()),function_name:n.z.string(),function_schema:n.z.string()}),ez=n.z.array(eC),eD=n.z.optional(eC);n.z.object({name:n.z.string(),schema:n.z.string().optional().default("public"),table:n.z.string(),function_schema:n.z.string().optional().default("public"),function_name:n.z.string(),function_args:n.z.array(n.z.string()).optional(),activation:n.z.enum(["BEFORE","AFTER","INSTEAD OF"]),events:n.z.array(n.z.string()),orientation:n.z.enum(["ROW","STATEMENT"]).optional(),condition:n.z.string().optional()}),n.z.object({name:n.z.string().optional(),enabled_mode:n.z.enum(["ORIGIN","REPLICA","ALWAYS","DISABLED"]).optional()});let eF=_`
select
  t.oid::int8 as id,
  t.typname as name,
  n.nspname as schema,
  format_type (t.oid, null) as format,
  coalesce(t_enums.enums, '[]') as enums,
  coalesce(t_attributes.attributes, '[]') as attributes,
  obj_description (t.oid, 'pg_type') as comment
from
  pg_type t
  left join pg_namespace n on n.oid = t.typnamespace
  left join (
    select
      enumtypid,
      jsonb_agg(enumlabel order by enumsortorder) as enums
    from
      pg_enum
    group by
      enumtypid
  ) as t_enums on t_enums.enumtypid = t.oid
  left join (
    select
      oid,
      jsonb_agg(
        jsonb_build_object('name', a.attname, 'type_id', a.atttypid::int8)
        order by a.attnum asc
      ) as attributes
    from
      pg_class c
      join pg_attribute a on a.attrelid = c.oid
    where
      c.relkind = 'c' and not a.attisdropped
    group by
      c.oid
  ) as t_attributes on t_attributes.oid = t.typrelid
where
  (
    t.typrelid = 0
    or (
      select
        c.relkind = 'c'
      from
        pg_class c
      where
        c.oid = t.typrelid
    )
  )
`,ex=n.z.object({id:n.z.number(),name:n.z.string(),schema:n.z.string(),format:n.z.string(),enums:n.z.array(n.z.string()),attributes:n.z.array(n.z.object({name:n.z.string(),type_id:n.z.number()})),comment:n.z.string().nullable()}),ew=n.z.array(ex),eH=_`
select
  version(),
  current_setting('server_version_num')::int8 as version_number,
  (
    select
      count(*) as active_connections
    from
      pg_stat_activity
  ) as active_connections,
  current_setting('max_connections')::int8 as max_connections
`,eU=n.z.object({version:n.z.string(),version_number:n.z.number(),active_connections:n.z.number(),max_connections:n.z.number()}),eM=_`
SELECT
  c.oid :: int8 AS id,
  n.nspname AS schema,
  c.relname AS name,
  (pg_relation_is_updatable(c.oid, false) & 20) = 20 AS is_updatable,
  obj_description(c.oid) AS comment
FROM
  pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE
  c.relkind = 'v'
`,ek=n.z.object({id:n.z.number(),schema:n.z.string(),name:n.z.string(),is_updatable:n.z.boolean(),comment:n.z.string().nullable(),columns:T.optional()}),eq=n.z.array(ek),eP=n.z.optional(ek),ej=({includeColumns:e})=>_`
with views as (${eM})
  ${e?_`, columns as (${b})`:_``}
select
  *
  ${e?_`, ${m("columns",_`columns.table_id = views.id`)}`:_``}
from views`;function eW(e,t){let n=_`select count(*) from ${eK(e)}`,{filters:a}=t??{};return a&&(n=eV(n,a)),_`${n};`}function eY(e,t){let n=_`truncate ${eK(e)}`,{cascade:a}=t??{};return a&&(n=_`${n} cascade`),_`${n};`}function eB(e,t,n){if(!t||0===t.length)throw Error("no filters for this delete query");let a=_`delete from ${eK(e)}`,{returning:i,enumArrayColumns:r}=n??{};if(t&&(a=eV(a,t)),i){let e=void 0===r||0===r.length?_` returning *`:_` returning *, ${p(r.map(e=>_`${s(e)}::text[]`),",")}`;a=_`${a}${e}`}return _`${a};`}function eG(e,t,n){if(!t||0===t.length)throw Error("no value to insert");let{returning:a,enumArrayColumns:i}=n??{},r=p(Object.keys(t[0]).map(e=>s(e)),","),o=_``;if(o=0==r.length?d(_`insert into %1$s select from jsonb_populate_recordset(null::%1$s, %2$s)`,eK(e),l(JSON.stringify(t))):d(_`insert into %1$s (%2$s) select %2$s from jsonb_populate_recordset(null::%1$s, %3$s)`,eK(e),r,l(JSON.stringify(t))),a){let e=void 0===i||0===i.length?_` returning *`:_` returning *, ${p(i.map(e=>_`${s(e)}::text[]`),",")}`;o=_`${o}${e}`}return _`${o};`}function eX(e,t,n,a=!0,i=!1){var r,o;let c,d=_``,m=t??_`*`;d=_`select ${m} from ${i?(r=e,_`${s(r.name)}`):eK(e)}`;let{filters:E,pagination:u,sorts:g}=n??{};if(E&&(d=eV(d,E)),g&&(o=d,d=0===(c=g.filter(e=>e.column)).length?o:o=_`${o} order by ${p(c.map(e=>{let t=e.ascending?_`asc`:_`desc`,n=e.nullsFirst?_`nulls first`:_`nulls last`;return _`${s(e.table)}.${s(e.column)} ${t} ${n}`}),", ")}`),u){let{limit:e,offset:t}=u??{};d=_`${d} limit ${l(e)} offset ${l(t)}`}return _`${d}${a?_`;`:_``}`}function eJ(e,t,n){let{filters:a,returning:i,enumArrayColumns:r}=n??{};if(!a||0===a.length)throw Error("no filters for this update query");let o=p(Object.keys(t).map(e=>s(e)),","),c=d(_`update %1$s set (%2$s) = (select %2$s from json_populate_record(null::%1$s, %3$s))`,eK(e),o,l(JSON.stringify(t)));if(a&&(c=eV(c,a)),i){let e=void 0===r||0===r.length?_` returning *`:_` returning *, ${p(r.map(e=>_`${s(e)}::text[]`),",")}`;c=_`${c}${e}`}return _`${c};`}function eV(e,t){return 0===t.length?e:e=_`${e} where ${p(t.map(e=>{if(Array.isArray(e.column))switch(e.operator){case"in":var t,n,a=e;if(!Array.isArray(a.column))throw Error("Use inFilterSql for single columns");if(!Array.isArray(a.value))throw Error("Values for a tuple 'in' filter must be an array");let i=_`(${p(a.column.map(e=>s(e)),", ")})`,r=a.value.map(e=>{if(Array.isArray(e)){if(e.length!==a.column.length)throw Error("Tuple value length must match column length");return _`(${p(e.map(e=>eQ(e)),", ")})`}{let t=String(e).split(",");if(t.length!==a.column.length)throw Error("Tuple value length must match column length");return _`(${p(t.map(e=>eQ(e)),", ")})`}});return _`${i} ${a.operator} (${p(r,", ")})`;case"=":case"<>":case">":case"<":case">=":case"<=":var o=e;if(!Array.isArray(o.column))throw Error("Use standard applyFilters for single column");if(!Array.isArray(o.value))throw Error("Tuple filter value must be an array");if(o.value.length!==o.column.length)throw Error("Tuple filter value must have the same length as the column array");let l=_`(${p(o.column.map(e=>s(e)),", ")})`,c=_`(${p(o.value.map(e=>eQ(e)),", ")})`;return _`${l} ${o.operator} ${c}`;default:throw Error(`Cannot use ${e.operator} operator in a tuple filter`)}switch(e.operator){case"in":let d;return d=Array.isArray((t=e).value)?t.value.map(e=>eQ(e)):String(t.value).split(",").map(e=>eQ(e)),_`${s(t.column)} ${t.operator} (${p(d,",")})`;case"is":var m=e;let E=String(m.value);switch(E){case"null":case"false":case"true":case"not null":return _`${s(m.column)} ${m.operator} ${E}`;default:return _`${s(m.column)} ${m.operator} ${eQ(m.value)}`}case"~~":case"~~*":case"!~~":case"!~~*":return n=e,_`${s(n.column)}::text ${n.operator} ${eQ(n.value)}`;default:return _`${s(e.column)} ${e.operator} ${eQ(e.value)}`}})," and ")}`}function eQ(e){if("boolean"==typeof e)return e?"true":"false";if("string"==typeof e&&e.startsWith("ARRAY[")){let t=function(e){if(!e.startsWith("ARRAY["))return null;let t=e.slice(6),n=!1,a=-1;for(let e=0;e<t.length;e++){let i=t[e];if(n)"'"===i&&"'"===t[e+1]?e++:"'"===i&&(n=!1);else if("]"===i){a=e;break}else"'"===i&&(n=!0)}if(-1===a)return null;let i=t.slice(0,a),r=t.slice(a+1),o=_``;if(""!==r){let e=r.match(/^::([A-Za-z_][A-Za-z0-9_]*)(\[\])?$/);if(!e)return null;o=_`::${e[1]}${e[2]?_`[]`:_``}`}let s=[],c="",d=!1;for(let e=0;e<i.length;e++){let t=i[e];d?"'"===t&&"'"===i[e+1]?(c+="''",e++):"'"===t?(c+=t,d=!1):c+=t:"'"===t?(d=!0,c+=t):","===t?(s.push(c.trim()),c=""):c+=t}c.trim()&&s.push(c.trim());let m=p(s.map(e=>e.startsWith("'")&&e.endsWith("'")?e.slice(1,-1).replace(/''/g,"'"):e).map(e=>l(e)),",");return _`ARRAY[${m}]${o}`}(e);if(null!==t)return t}return l(e)}function eK(e){return _`${s(e.schema)}.${s(e.name)}`}function eZ(e){return _`
    begin;

    ${e}

    commit;
  `}function e0(e){return _`
    begin;

    ${e}

    rollback;
  `}e.s([],967533),e.i(967533),e.s(["countQuery",0,eW,"deleteQuery",0,eB,"insertQuery",0,eG,"selectQuery",0,eX,"truncateQuery",0,eY,"updateQuery",0,eJ,"wrapWithRollback",0,e0,"wrapWithTransaction",0,eZ],332357);class e1{table;actionConfig;options;pagination;constructor(e,t,n){this.table=e,this.actionConfig=t,this.options=n}range(e,t){return this.pagination={offset:e,limit:t-e+1},this}toSql(e={isCTE:!1,isFinal:!0}){try{let{actionOptions:t,filters:n,sorts:a}=this.options??{};switch(this.actionConfig.action){case"count":return eW(this.table,{filters:n});case"delete":return eB(this.table,n,{returning:t?.returning,enumArrayColumns:t?.enumArrayColumns});case"insert":return eG(this.table,this.actionConfig.actionValue,{returning:t?.returning,enumArrayColumns:t?.enumArrayColumns});case"select":return eX(this.table,this.actionConfig.actionValue,{filters:n,pagination:this.pagination,sorts:a},e.isFinal,e.isCTE);case"update":return eJ(this.table,this.actionConfig.actionValue,{filters:n,returning:t?.returning,enumArrayColumns:t?.enumArrayColumns});case"truncate":return eY(this.table,{cascade:t?.cascade});default:return _``}}catch(e){throw e}}}e.s(["QueryModifier",0,e1],29659);class e2{table;actionConfig;actionOptions;filters;sorts;constructor(e,t,n){this.table=e,this.actionConfig=t,this.actionOptions=n,this.filters=[],this.sorts=[]}filter(e,t,n){return this.filters.push({column:e,operator:t,value:n}),this}match(e){return Object.entries(e).map(([e,t])=>{this.filters.push({column:e,operator:"=",value:t})}),this}order(e,t,n=!0,a=!1){return this.sorts.push({table:e,column:t,ascending:n,nullsFirst:a}),this}range(e,t){return this._getQueryModifier().range(e,t)}clone(){let e=structuredClone({table:this.table,actionConfig:this.actionConfig,actionOptions:this.actionOptions,filters:this.filters,sorts:this.sorts}),t=new e2(e.table,e.actionConfig,e.actionOptions);return t.filters=e.filters,t.sorts=e.sorts,t}toSql(e){return this._getQueryModifier().toSql(e)}_getQueryModifier(){return new e1(this.table,this.actionConfig,{actionOptions:this.actionOptions,filters:this.filters,sorts:this.sorts})}}e.s(["QueryFilter",0,e2],193767);class e3{table;constructor(e){this.table=e}count(){return new e2(this.table,{action:"count"})}delete(e){return new e2(this.table,{action:"delete"},e)}insert(e,t){return new e2(this.table,{action:"insert",actionValue:e},t)}select(e){return new e2(this.table,{action:"select",actionValue:e})}update(e,t){return new e2(this.table,{action:"update",actionValue:e},t)}truncate(e){return new e2(this.table,{action:"truncate"},e)}}e.s(["QueryAction",0,e3],212695);class e8{from(e,t){return new e3({name:e,schema:t??"public"})}}e.s(["Query",0,e8],721490),e.i(721490),e.i(332357),e.i(193767),e.i(212695),e.i(29659),e.s(["Query",0,e8,"QueryAction",0,e3,"QueryFilter",0,e2,"QueryModifier",0,e1,"countQuery",0,eW,"deleteQuery",0,eB,"insertQuery",0,eG,"selectQuery",0,eX,"truncateQuery",0,eY,"updateQuery",0,eJ,"wrapWithRollback",0,e0,"wrapWithTransaction",0,eZ],377171);var e7=e.i(377171);let e4=_`
CREATE OR REPLACE FUNCTION pg_temp.count_estimate(
    query text
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
    plan jsonb;
BEGIN
    EXECUTE 'EXPLAIN (FORMAT JSON)' || query INTO plan;
    RETURN plan->0->'Plan'->'Plan Rows';
END;
$$;
`;function e5(e,t){let n="00000000-0000-0000-0000-000000000000".split("").map((t,n)=>"-"===t?t:e[n]??t);if(e.length>=n.length)return n.join("");if(e.length&&e.length<15&&(n[14]="4"),e.length&&e.length<20&&(n[19]=t?"b":"8"),t)for(let t=e.length;t<n.length;t+=1)"0"===n[t]&&(n[t]="f");return n.join("")}function e6(e){if(!e)return[e,void 0];let t=e.charCodeAt(e.length-1);if(122===t)return[e,e+"~"];if(t>=126)return[e,e+" "];let n=e.substring(0,e.length-1)+String.fromCharCode(t+1);return[e,n]}e.s(["COUNT_ESTIMATE_SQL",0,e4,"THRESHOLD_COUNT",0,5e4],247309),e.s(["prefixToUUID",0,e5,"stringRange",0,e6],387578);let e9=_`select reltuples as estimate from pg_class where oid = 'auth.users'::regclass`;e.s(["getUsersCountSQL",0,({filter:e,keywords:t,providers:n,forceExactCount:a=!1,column:i})=>{let r=t&&""!==t,o=[],s=_`select count(*) from auth.users`,c=_`select * from auth.users`;if(i&&r){if("email"===i){let e=e6(t),n=l(e[0]),a=e[1]?l(e[1]):null;o.push(_`lower(email) >= ${n}${a?_` and lower(email) < ${a}`:_``} and instance_id = '00000000-0000-0000-0000-000000000000'::uuid`)}else if("phone"===i){let e=e6(t),n=l(e[0]),a=e[1]?l(e[1]):null;o.push(_`phone >= ${n}${a?_` and phone < ${a}`:_``}`)}else if("id"===i){let e=e5(t,!1);if(e===t)o.push(_`id = ${l(t)}`);else{let n=e5(t,!0);o.push(_`id >= ${l(e)} and id < ${l(n)}`)}}}else{if(r){let e=l(`%${t}%`);o.push(_`id::text ilike ${e} or email ilike ${e} or phone ilike ${e}`)}if("verified"===e?o.push(_`email_confirmed_at IS NOT NULL or phone_confirmed_at IS NOT NULL`):"anonymous"===e?o.push(_`is_anonymous is true`):"unverified"===e&&o.push(_`email_confirmed_at IS NULL AND phone_confirmed_at IS NULL`),n&&n.length>0)if(n.includes("saml 2.0")){let e=n.map(e=>"saml 2.0"===e?"sso":e);o.push(_`(select jsonb_agg(case when value ~ '^sso' then 'sso' else value end) from jsonb_array_elements_text((raw_app_meta_data ->> 'providers')::jsonb)) ?| array[${l(e)}]`)}else o.push(_`(raw_app_meta_data->>'providers')::jsonb ?| array[${l(n)}]`)}let d=p(o.map(e=>_`(${e})`)," and "),m=o.length>0?_` where ${d}`:_``;if(a)return _`select (${s}${m}), false as is_estimate;`;{let e=_`${c}${m}`,t=_`${s}${m}`,n=l(e);return _`${e4}

with approximation as (${e9})
select 
  case 
    when estimate = -1 then (select pg_temp.count_estimate(${n}))::int
    when estimate > ${l(5e4)} then ${o.length>0?_`(select pg_temp.count_estimate(${n}))::int`:_`estimate::int`}
    else (${t})
  end as count,
  estimate = -1 or estimate > ${l(5e4)} as is_estimate
from approximation`}}],640696);let te=_`
SELECT id, name, file_size_limit
FROM storage.buckets
WHERE file_size_limit IS NOT NULL
ORDER BY file_size_limit DESC
LIMIT ${l(51)};
`;e.s(["LARGEST_SIZE_LIMIT_BUCKETS_COUNT",0,50,"getLargestSizeLimitBucketsSqlUnoptimized",0,te],517638),e.s(["getDatabaseExtensionsSQL",0,()=>_`
SELECT
  e.name,
  n.nspname AS schema,
  e.default_version,
  x.extversion AS installed_version,
  e.comment,
  ev.schema AS default_version_schema
FROM
  pg_available_extensions e
  LEFT JOIN pg_extension x ON e.name = x.extname
  LEFT JOIN pg_namespace n ON x.extnamespace = n.oid
  LEFT JOIN pg_available_extension_versions ev
    ON ev.name = e.name AND ev.version = e.default_version;
`,"getEnableDatabaseExtensionSQL",0,({schema:e,name:t,version:n,cascade:a,createSchema:i=!1})=>{let{sql:r}=C.create({schema:e,name:t,version:n,cascade:a});return i?_`CREATE SCHEMA IF NOT EXISTS ${s(e)};
${r}`:r}],53336);let tt=_`pgmq_public`,tn=_`
  drop function if exists 
    ${tt}.pop(queue_name text),
    ${tt}.send(queue_name text, message jsonb, sleep_seconds integer),
    ${tt}.send_batch(queue_name text, message jsonb[], sleep_seconds integer),
    ${tt}.archive(queue_name text, message_id bigint),
    ${tt}.delete(queue_name text, message_id bigint),
    ${tt}.read(queue_name text, sleep integer, n integer)
  ;

  -- Revoke execute permissions on inner pgmq functions to roles (inverse of enabling)
  do $$
  begin
      if exists (select 1 from pg_namespace where nspname = 'pgmq') then
          -- Revoke privileges on the schema itself
          revoke all on schema pgmq from anon, authenticated, service_role;
          
          -- Revoke default privileges for future objects
          alter default privileges in schema pgmq revoke all on tables from anon, authenticated, service_role;
          alter default privileges in schema pgmq revoke all on sequences from anon, authenticated, service_role;
          alter default privileges in schema pgmq revoke all on functions from anon, authenticated, service_role;
      end if;
  end $$;

  drop schema if exists ${tt};
`;e.s(["HIDE_QUEUES_FROM_POSTGREST_SQL",0,tn,"QUEUES_SCHEMA",0,tt,"getExposeQueuesSQL",0,({isNewerPgmqversion:e})=>{let t=e?_`, conditional := '{}'::jsonb`:_``,n=e?_`, jsonb`:_``;return _`
  create schema if not exists ${tt};
  grant usage on schema ${tt} to postgres, anon, authenticated, service_role;

  create or replace function ${tt}.pop(
      queue_name text
  )
    returns setof pgmq.message_record
    language plpgsql
    set search_path = ''
  as $$
  begin
      return query
      select *
      from pgmq.pop(
          queue_name := queue_name
      );
  end;
  $$;

  comment on function ${tt}.pop(queue_name text) is 'Retrieves and locks the next message from the specified queue.';


  create or replace function ${tt}.send(
      queue_name text,
      message jsonb,
      sleep_seconds integer default 0  -- renamed from 'delay'
  )
    returns setof bigint
    language plpgsql
    set search_path = ''
  as $$
  begin
      return query
      select *
      from pgmq.send(
          queue_name := queue_name,
          msg := message,
          delay := sleep_seconds
      );
  end;
  $$;

  comment on function ${tt}.send(queue_name text, message jsonb, sleep_seconds integer) is 'Sends a message to the specified queue, optionally delaying its availability by a number of seconds.';


  create or replace function ${tt}.send_batch(
      queue_name text,
      messages jsonb[],
      sleep_seconds integer default 0  -- renamed from 'delay'
  )
    returns setof bigint
    language plpgsql
    set search_path = ''
  as $$
  begin
      return query
      select *
      from pgmq.send_batch(
          queue_name := queue_name,
          msgs := messages,
          delay := sleep_seconds
      );
  end;
  $$;

  comment on function ${tt}.send_batch(queue_name text, messages jsonb[], sleep_seconds integer) is 'Sends a batch of messages to the specified queue, optionally delaying their availability by a number of seconds.';


  create or replace function ${tt}.archive(
      queue_name text,
      message_id bigint
  )
    returns boolean
    language plpgsql
    set search_path = ''
  as $$
  begin
      return
      pgmq.archive(
          queue_name := queue_name,
          msg_id := message_id
      );
  end;
  $$;

  comment on function ${tt}.archive(queue_name text, message_id bigint) is 'Archives a message by moving it from the queue to a permanent archive.';


  create or replace function ${tt}.delete(
      queue_name text,
      message_id bigint
  )
    returns boolean
    language plpgsql
    set search_path = ''
  as $$
  begin
      return
      pgmq.delete(
          queue_name := queue_name,
          msg_id := message_id
      );
  end;
  $$;

  comment on function ${tt}.delete(queue_name text, message_id bigint) is 'Permanently deletes a message from the specified queue.';

  create or replace function ${tt}.read(
      queue_name text,
      sleep_seconds integer,
      n integer
  )
    returns setof pgmq.message_record
    language plpgsql
    set search_path = ''
  as $$
  begin
      return query
      select *
      from pgmq.read(
          queue_name := queue_name,
          vt := sleep_seconds,
          qty := n ${t}
      );
  end;
  $$;

  comment on function ${tt}.read(queue_name text, sleep_seconds integer, n integer) is 'Reads up to "n" messages from the specified queue with an optional "sleep_seconds" (visibility timeout).';

  -- Grant execute permissions on wrapper functions to roles
  grant execute on function ${tt}.pop(text) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.pop(text) to postgres, service_role, anon, authenticated;

  grant execute on function ${tt}.send(text, jsonb, integer) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.send(text, jsonb, integer) to postgres, service_role, anon, authenticated;

  grant execute on function ${tt}.send_batch(text, jsonb[], integer) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.send_batch(text, jsonb[], integer) to postgres, service_role, anon, authenticated;

  grant execute on function ${tt}.archive(text, bigint) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.archive(text, bigint) to postgres, service_role, anon, authenticated;

  grant execute on function ${tt}.delete(text, bigint) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.delete(text, bigint) to postgres, service_role, anon, authenticated;

  grant execute on function ${tt}.read(text, integer, integer) to postgres, service_role, anon, authenticated;
  grant execute on function pgmq.read(text, integer, integer ${n}) to postgres, service_role, anon, authenticated;

  -- For the service role, we want full access
  -- Grant permissions on existing tables
  grant all privileges on all tables in schema pgmq to postgres, service_role;

  -- Ensure service_role has permissions on future tables
  alter default privileges in schema pgmq grant all privileges on tables to postgres, service_role;

  grant usage on schema pgmq to postgres, anon, authenticated, service_role;


  /*
    Grant access to sequences to API roles by default. Existing table permissions
    continue to enforce insert restrictions. This is necessary to accommodate the
    on-backup hook that rebuild queue table primary keys to avoid a pg_dump segfault.
    This can be removed once logical backups are completely retired.
  */
  grant usage, select, update
  on all sequences in schema pgmq
  to anon, authenticated, service_role;

  alter default privileges in schema pgmq
  grant usage, select, update
  on sequences
  to anon, authenticated, service_role;
`},"getQueuesExposePostgrestStatusSQL",0,()=>_`
    SELECT exists (select schema_name FROM information_schema.schemata WHERE schema_name = '${tt}');
  `],957386),e.s(["getTableRowsCountSql",0,({table:e,filters:t=[],enforceExactCount:n=!1,isUsingReadReplica:a=!1})=>{if(!e)return _``;if(n){let n=new e8().from(e.name,e.schema??void 0).count();t.filter(e=>e.value&&""!==e.value).forEach(e=>{n=n.filter(e.column,e.operator,e.value)});let a=n.toSql(),i=a.endsWith(";")?a.slice(0,-1):a;return _`select (${i}), false as is_estimate;`}{let n=new e8().from(e.name,e.schema??void 0).select();t.filter(e=>e.value&&""!=e.value).forEach(e=>{n=n.filter(e.column,e.operator,e.value)});let i=n.toSql(),r=i.endsWith(";")?i.slice(0,-1):i,o=new e8().from(e.name,e.schema??void 0).count();t.filter(e=>e.value&&""!=e.value).forEach(e=>{o=o.filter(e.column,e.operator,e.value)});let s=o.toSql(),c=s.endsWith(";")?s.slice(0,-1):s;return a?_`
with approximation as (
    select reltuples as estimate
    from pg_class
    where oid = ${l(e.id)}
)
select 
  case 
    when estimate > ${l(5e4)} then (select -1)
    else (${c})
  end as count,
  estimate > ${l(5e4)} as is_estimate
from approximation;
`:_`
${e4}

with approximation as (
    select reltuples as estimate
    from pg_class
    where oid = ${l(e.id)}
)
select 
  case 
    when estimate > ${l(5e4)} then ${t.length>0?_`pg_temp.count_estimate('${r.replaceAll("'","''")}')`:_`estimate`}
    else (${c})
  end as count,
  estimate > ${l(5e4)} as is_estimate
from approximation;
`}}],779262);let ta=_`
  DROP TYPE IF EXISTS pg_temp.tabledefs CASCADE;
  CREATE TYPE pg_temp.tabledefs AS ENUM ('PKEY_INTERNAL','PKEY_EXTERNAL','FKEYS_INTERNAL', 'FKEYS_EXTERNAL', 'COMMENTS', 'FKEYS_NONE', 'INCLUDE_TRIGGERS', 'NO_TRIGGERS');

  -- SELECT * FROM pg_temp.pg_get_coldef('sample','orders','id');
  -- DROP FUNCTION pg_temp.pg_get_coldef(text,text,text,boolean);
  CREATE OR REPLACE FUNCTION pg_temp.pg_get_coldef(
    in_schema text,
    in_table  text,
    in_column text,
    oldway    boolean default False
  )
  RETURNS text
  LANGUAGE plpgsql VOLATILE
  AS
  $$
  DECLARE
  v_coldef     text;
  v_dt1        text;
  v_dt2        text;
  v_dt3        text;
  v_nullable   boolean;
  v_position   int;
  v_identity   text;
  v_generated  text;
  v_hasdflt    boolean;
  v_dfltexpr   text;

  BEGIN
    IF oldway THEN
      SELECT pg_catalog.format_type(a.atttypid, a.atttypmod) INTO v_coldef FROM pg_namespace n, pg_class c, pg_attribute a, pg_type t
      WHERE n.nspname = in_schema AND n.oid = c.relnamespace AND c.relname = in_table AND a.attname = in_column and a.attnum > 0 AND a.attrelid = c.oid AND a.atttypid = t.oid ORDER BY a.attnum;
      -- RAISE NOTICE 'DEBUG: oldway=%',v_coldef;
    ELSE
      -- a.attrelid::regclass::text, a.attname
      SELECT CASE WHEN a.atttypid = ANY ('{int,int8,int2}'::regtype[]) AND EXISTS (SELECT FROM pg_attrdef ad WHERE ad.adrelid = a.attrelid AND ad.adnum   = a.attnum AND
      pg_get_expr(ad.adbin, ad.adrelid) = 'nextval(''' || (pg_get_serial_sequence (a.attrelid::regclass::text, a.attname))::regclass || '''::regclass)') THEN CASE a.atttypid
      WHEN 'int'::regtype  THEN 'serial' WHEN 'int8'::regtype THEN 'bigserial' WHEN 'int2'::regtype THEN 'smallserial' END ELSE format_type(a.atttypid, a.atttypmod) END AS data_type
      INTO v_coldef FROM pg_namespace n, pg_class c, pg_attribute a, pg_type t
      WHERE n.nspname = in_schema AND n.oid = c.relnamespace AND c.relname = in_table AND a.attname = in_column and a.attnum > 0 AND a.attrelid = c.oid AND a.atttypid = t.oid ORDER BY a.attnum;
      -- RAISE NOTICE 'DEBUG: newway=%',v_coldef;

      -- Issue#24: not implemented yet
      -- might replace with this below to do more detailed parsing...
      -- SELECT a.atttypid::regtype AS dt1, format_type(a.atttypid, a.atttypmod) as dt2, t.typname as dt3, CASE WHEN not(a.attnotnull) THEN True ELSE False END AS nullable,
      -- a.attnum, a.attidentity, a.attgenerated, a.atthasdef, pg_get_expr(ad.adbin, ad.adrelid) dfltexpr
      -- INTO v_dt1, v_dt2, v_dt3, v_nullable, v_position, v_identity, v_generated, v_hasdflt, v_dfltexpr
      -- FROM pg_attribute a JOIN pg_class c ON (a.attrelid = c.oid) JOIN pg_type t ON (a.atttypid = t.oid) LEFT JOIN pg_attrdef ad ON (a.attrelid = ad.adrelid AND a.attnum = ad.adnum)
      -- WHERE c.relkind in ('r','p') AND a.attnum > 0 AND NOT a.attisdropped AND c.relnamespace::regnamespace::text = in_schema AND c.relname = in_table AND a.attname = in_column;
      -- RAISE NOTICE 'schema=%  table=%  column=%  dt1=%  dt2=%  dt3=%  nullable=%  pos=%  identity=%   generated=%  HasDefault=%  DeftExpr=%', in_schema, in_table, in_column, v_dt1,v_dt2,v_dt3,v_nullable,v_position,v_identity,v_generated,v_hasdflt,v_dfltexpr;
    END IF;
    RETURN v_coldef;
  END;
  $$;

  -- SELECT * FROM pg_temp.pg_get_tabledef('sample', 'address', false);
  DROP FUNCTION IF EXISTS pg_temp.pg_get_tabledef(character varying,character varying,boolean,tabledefs[]);
  CREATE OR REPLACE FUNCTION pg_temp.pg_get_tabledef(
    in_schema varchar,
    in_table varchar,
    _verbose boolean,
    VARIADIC arr pg_temp.tabledefs[] DEFAULT '{}':: pg_temp.tabledefs[]
  )
  RETURNS text
  LANGUAGE plpgsql VOLATILE
  AS
  $$
    DECLARE
      v_qualified text := '';
      v_table_ddl text;
      v_table_oid int;
      v_colrec record;
      v_constraintrec record;
      v_trigrec       record;
      v_indexrec record;
      v_rec           record;
      v_constraint_name text;
      v_constraint_def  text;
      v_pkey_def        text := '';
      v_fkey_def        text := '';
      v_fkey_defs       text := '';
      v_trigger text := '';
      v_partition_key text := '';
      v_partbound text;
      v_parent text;
      v_parent_schema text;
      v_persist text;
      v_temp  text := '';
      v_temp2 text;
      v_relopts text;
      v_tablespace text;
      v_pgversion int;
      bSerial boolean;
      bPartition boolean;
      bInheritance boolean;
      bRelispartition boolean;
      constraintarr text[] := '{}';
      constraintelement text;
      bSkip boolean;
      bVerbose boolean := False;
      v_cnt1   integer;
      v_cnt2   integer;
      search_path_old text := '';
      search_path_new text := '';
      v_partial    boolean;
      v_pos        integer;

      -- assume defaults for ENUMs at the getgo
      pkcnt            int := 0;
      fkcnt            int := 0;
      trigcnt          int := 0;
      cmtcnt           int := 0;
      pktype           pg_temp.tabledefs := 'PKEY_INTERNAL';
      fktype           pg_temp.tabledefs := 'FKEYS_INTERNAL';
      trigtype         pg_temp.tabledefs := 'NO_TRIGGERS';
      arglen           integer;
      vargs            text;
      avarg            pg_temp.tabledefs;

      -- exception variables
      v_ret            text;
      v_diag1          text;
      v_diag2          text;
      v_diag3          text;
      v_diag4          text;
      v_diag5          text;
      v_diag6          text;

    BEGIN
      SET client_min_messages = 'notice';
      IF _verbose THEN bVerbose = True; END IF;

      -- v17 fix: handle case-sensitive
      -- v_qualified = in_schema || '.' || in_table;

      arglen := array_length($4, 1);
      IF arglen IS NULL THEN
          -- nothing to do, so assume defaults
          NULL;
      ELSE
          -- loop thru args
          -- IF 'NO_TRIGGERS' = ANY ($4)
          -- select array_to_string($4, ',', '***') INTO vargs;
          IF bVerbose THEN RAISE NOTICE 'arguments=%', $4; END IF;
          FOREACH avarg IN ARRAY $4 LOOP
              IF bVerbose THEN RAISE NOTICE 'arg=%', avarg; END IF;
              IF avarg = 'FKEYS_INTERNAL' OR avarg = 'FKEYS_EXTERNAL' OR avarg = 'FKEYS_NONE' THEN
                  fkcnt = fkcnt + 1;
                  fktype = avarg;
              ELSEIF avarg = 'INCLUDE_TRIGGERS' OR avarg = 'NO_TRIGGERS' THEN
                  trigcnt = trigcnt + 1;
                  trigtype = avarg;
              ELSEIF avarg = 'PKEY_EXTERNAL' THEN
                  pkcnt = pkcnt + 1;
                  pktype = avarg;
              ELSEIF avarg = 'COMMENTS' THEN
                  cmtcnt = cmtcnt + 1;

              END IF;
          END LOOP;
          IF fkcnt > 1 THEN
              RAISE WARNING 'Only one foreign key option can be provided. You provided %', fkcnt;
              RETURN '';
          ELSEIF trigcnt > 1 THEN
              RAISE WARNING 'Only one trigger option can be provided. You provided %', trigcnt;
              RETURN '';
          ELSEIF pkcnt > 1 THEN
              RAISE WARNING 'Only one pkey option can be provided. You provided %', pkcnt;
              RETURN '';
          ELSEIF cmtcnt > 1 THEN
              RAISE WARNING 'Only one comments option can be provided. You provided %', cmtcnt;
              RETURN '';

          END IF;
      END IF;

      SELECT c.oid, (select setting from pg_settings where name = 'server_version_num') INTO v_table_oid, v_pgversion FROM pg_catalog.pg_class c LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind in ('r','p') AND c.relname = in_table AND n.nspname = in_schema;

    -- set search_path = public before we do anything to force explicit schema qualification but dont forget to set it back before exiting...
      SELECT setting INTO search_path_old FROM pg_settings WHERE name = 'search_path';

      -- RAISE NOTICE 'DEBUG tableddl: saving old search_path: ***%***', search_path_old;
      EXECUTE 'SET search_path = "public"';
      SELECT setting INTO search_path_new FROM pg_settings WHERE name = 'search_path';
      -- RAISE NOTICE 'DEBUG tableddl: using new search path=***%***', search_path_new;

      -- throw an error if table was not found
      IF (v_table_oid IS NULL) THEN
        RAISE EXCEPTION 'table does not exist';
      END IF;

      -- get user-defined tablespaces if applicable
      SELECT tablespace INTO v_temp FROM pg_tables WHERE schemaname = in_schema and tablename = in_table and tablespace IS NOT NULL;
      IF v_temp IS NULL THEN
        v_tablespace := 'TABLESPACE pg_default';
      ELSE
        v_tablespace := 'TABLESPACE ' || v_temp;
      END IF;

      -- also see if there are any SET commands for this table, ie, autovacuum_enabled=off, fillfactor=70
      WITH relopts AS (SELECT unnest(c.reloptions) relopts FROM pg_class c, pg_namespace n WHERE n.nspname = in_schema and n.oid = c.relnamespace and c.relname = in_table)
      SELECT string_agg(r.relopts, ', ') as relopts INTO v_temp from relopts r;
      IF v_temp IS NULL THEN
        v_relopts := '';
      ELSE
        v_relopts := ' WITH (' || v_temp || ')';
      END IF;

      -- -----------------------------------------------------------------------------------
      -- Create table defs for partitions/children using inheritance or declarative methods.
      -- inheritance: pg_class.relkind = 'r'   pg_class.relispartition=false   pg_class.relpartbound is NULL
      -- declarative: pg_class.relkind = 'r'   pg_class.relispartition=true    pg_class.relpartbound is NOT NULL
      -- -----------------------------------------------------------------------------------
      v_partbound := '';
      bPartition := False;
      bInheritance := False;
      IF v_pgversion < 100000 THEN
        -- Issue#11: handle parent schema
        SELECT c2.relname parent, c2.relnamespace::regnamespace INTO v_parent, v_parent_schema from pg_class c1, pg_namespace n, pg_inherits i, pg_class c2
        WHERE n.nspname = in_schema and n.oid = c1.relnamespace and c1.relname = in_table and c1.oid = i.inhrelid and i.inhparent = c2.oid and c1.relkind = 'r';
        IF (v_parent IS NOT NULL) THEN
          bPartition   := True;
          bInheritance := True;
        END IF;
      ELSE
        -- Issue#11: handle parent schema
        SELECT c2.relname parent, c1.relispartition, pg_get_expr(c1.relpartbound, c1.oid, true), c2.relnamespace::regnamespace INTO v_parent, bRelispartition, v_partbound, v_parent_schema from pg_class c1, pg_namespace n, pg_inherits i, pg_class c2
        WHERE n.nspname = in_schema and n.oid = c1.relnamespace and c1.relname = in_table and c1.oid = i.inhrelid and i.inhparent = c2.oid and c1.relkind = 'r';
        IF (v_parent IS NOT NULL) THEN
          bPartition   := True;
          IF bRelispartition THEN
            bInheritance := False;
          ELSE
            bInheritance := True;
          END IF;
        END IF;
      END IF;
      IF bPartition THEN
        --Issue#17 fix for case-sensitive tables
        -- SELECT count(*) INTO v_cnt1 FROM information_schema.tables t WHERE EXISTS (SELECT REGEXP_MATCHES(s.table_name, '([A-Z]+)','g') FROM information_schema.tables s
        -- WHERE t.table_schema=s.table_schema AND t.table_name=s.table_name AND t.table_schema = quote_ident(in_schema) AND t.table_name = quote_ident(in_table) AND t.table_type = 'BASE TABLE');
        SELECT count(*) INTO v_cnt1 FROM information_schema.tables t WHERE EXISTS (SELECT REGEXP_MATCHES(s.table_name, '([A-Z]+)','g') FROM information_schema.tables s
        WHERE t.table_schema=s.table_schema AND t.table_name=s.table_name AND t.table_schema = in_schema AND t.table_name = in_table AND t.table_type = 'BASE TABLE');

        --Issue#19 put double-quotes around SQL keyword column names
        -- Issue#121: fix keyword lookup for table name not column name that does not apply here
        -- SELECT COUNT(*) INTO v_cnt2 FROM pg_get_keywords() WHERE word = v_colrec.column_name AND catcode = 'R';
        SELECT COUNT(*) INTO v_cnt2 FROM pg_get_keywords() WHERE word = in_table AND catcode = 'R';

        IF bInheritance THEN
          -- inheritance-based
          IF v_cnt1 > 0 OR v_cnt2 > 0 THEN
            v_table_ddl := 'CREATE TABLE ' || in_schema || '."' || in_table || '"( '|| E'\\n';
          ELSE
            v_table_ddl := 'CREATE TABLE ' || in_schema || '.' || in_table || '( '|| E'\\n';
          END IF;

          -- Jump to constraints section to add the check constraints
        ELSE
          -- declarative-based
          IF v_relopts <> '' THEN
            IF v_cnt1 > 0 OR v_cnt2 > 0 THEN
              v_table_ddl := 'CREATE TABLE ' || in_schema || '."' || in_table || '" PARTITION OF ' || in_schema || '.' || v_parent || ' ' || v_partbound || v_relopts || ' ' || v_tablespace || '; ' || E'\\n';
            ELSE
              v_table_ddl := 'CREATE TABLE ' || in_schema || '.' || in_table || ' PARTITION OF ' || in_schema || '.' || v_parent || ' ' || v_partbound || v_relopts || ' ' || v_tablespace || '; ' || E'\\n';
            END IF;
          ELSE
            IF v_cnt1 > 0 OR v_cnt2 > 0 THEN
              v_table_ddl := 'CREATE TABLE ' || in_schema || '."' || in_table || '" PARTITION OF ' || in_schema || '.' || v_parent || ' ' || v_partbound || ' ' || v_tablespace || '; ' || E'\\n';
            ELSE
              v_table_ddl := 'CREATE TABLE ' || in_schema || '.' || in_table || ' PARTITION OF ' || in_schema || '.' || v_parent || ' ' || v_partbound || ' ' || v_tablespace || '; ' || E'\\n';
            END IF;
          END IF;
          -- Jump to constraints and index section to add the check constraints and indexes and perhaps FKeys
        END IF;
      END IF;
      IF bVerbose THEN RAISE NOTICE '(1)tabledef so far: %', v_table_ddl; END IF;

      IF NOT bPartition THEN
        -- see if this is unlogged or temporary table
        select c.relpersistence into v_persist from pg_class c, pg_namespace n where n.nspname = in_schema and n.oid = c.relnamespace and c.relname = in_table and c.relkind = 'r';
        IF v_persist = 'u' THEN
          v_temp := 'UNLOGGED';
        ELSIF v_persist = 't' THEN
          v_temp := 'TEMPORARY';
        ELSE
          v_temp := '';
        END IF;
      END IF;

      -- start the create definition for regular tables unless we are in progress creating an inheritance-based child table
      IF NOT bPartition THEN
        --Issue#17 fix for case-sensitive tables
        -- SELECT count(*) INTO v_cnt1 FROM information_schema.tables t WHERE EXISTS (SELECT REGEXP_MATCHES(s.table_name, '([A-Z]+)','g') FROM information_schema.tables s
        -- WHERE t.table_schema=s.table_schema AND t.table_name=s.table_name AND t.table_schema = quote_ident(in_schema) AND t.table_name = quote_ident(in_table) AND t.table_type = 'BASE TABLE');
        SELECT count(*) INTO v_cnt1 FROM information_schema.tables t WHERE EXISTS (SELECT REGEXP_MATCHES(s.table_name, '([A-Z]+)','g') FROM information_schema.tables s
        WHERE t.table_schema=s.table_schema AND t.table_name=s.table_name AND t.table_schema = in_schema AND t.table_name = in_table AND t.table_type = 'BASE TABLE');
        IF v_cnt1 > 0 THEN
          v_table_ddl := 'CREATE ' || v_temp || ' TABLE ' || in_schema || '."' || in_table || '" (' || E'\\n';
        ELSE
          v_table_ddl := 'CREATE ' || v_temp || ' TABLE ' || in_schema || '.' || in_table || ' (' || E'\\n';
        END IF;
      END IF;
      -- RAISE NOTICE 'DEBUG2: tabledef so far: %', v_table_ddl;
      -- define all of the columns in the table unless we are in progress creating an inheritance-based child table
      IF NOT bPartition THEN
        FOR v_colrec IN
          SELECT c.column_name, c.data_type, c.udt_name, c.udt_schema, c.character_maximum_length, c.is_nullable, c.column_default, c.numeric_precision, c.numeric_scale, c.is_identity, c.identity_generation, c.is_generated, c.generation_expression
          FROM information_schema.columns c WHERE (table_schema, table_name) = (in_schema, in_table) ORDER BY ordinal_position
        LOOP
          IF bVerbose THEN RAISE NOTICE '(col loop) name=%  type=%  udt_name=%  default=%  is_generated=%  gen_expr=%', v_colrec.column_name, v_colrec.data_type, v_colrec.udt_name, v_colrec.column_default, v_colrec.is_generated, v_colrec.generation_expression; END IF;

          -- v17 fix: handle case-sensitive for pg_get_serial_sequence that requires SQL Identifier handling
          -- SELECT CASE WHEN pg_get_serial_sequence(v_qualified, v_colrec.column_name) IS NOT NULL THEN True ELSE False END into bSerial;
          SELECT CASE WHEN pg_get_serial_sequence(quote_ident(in_schema) || '.' || quote_ident(in_table), v_colrec.column_name) IS NOT NULL THEN True ELSE False END into bSerial;
          IF bVerbose THEN
            -- v17 fix: handle case-sensitive for pg_get_serial_sequence that requires SQL Identifier handling
            -- SELECT pg_get_serial_sequence(v_qualified, v_colrec.column_name) into v_temp;
            SELECT pg_get_serial_sequence(quote_ident(in_schema) || '.' || quote_ident(in_table), v_colrec.column_name) into v_temp;
            IF v_temp IS NULL THEN v_temp = 'NA'; END IF;
            SELECT pg_temp.pg_get_coldef(in_schema, in_table,v_colrec.column_name) INTO v_diag1;
            RAISE NOTICE 'DEBUG table: %  Column: %  datatype: %  Serial=%  serialval=%  coldef=%', v_qualified, v_colrec.column_name, v_colrec.data_type, bSerial, v_temp, v_diag1;
            RAISE NOTICE 'DEBUG tabledef: %', v_table_ddl;
          END IF;

          --Issue#17 put double-quotes around case-sensitive column names
          SELECT COUNT(*) INTO v_cnt1 FROM information_schema.columns t WHERE EXISTS (SELECT REGEXP_MATCHES(s.column_name, '([A-Z]+)','g') FROM information_schema.columns s
          WHERE t.table_schema=s.table_schema and t.table_name=s.table_name and t.column_name=s.column_name AND t.table_schema = quote_ident(in_schema) AND column_name = v_colrec.column_name);

          --Issue#19 put double-quotes around SQL keyword column names
          SELECT COUNT(*) INTO v_cnt2 FROM pg_get_keywords() WHERE word = v_colrec.column_name AND catcode = 'R';

          IF v_cnt1 > 0 OR v_cnt2 > 0 THEN
            v_table_ddl := v_table_ddl || '  "' || v_colrec.column_name || '" ';
          ELSE
            v_table_ddl := v_table_ddl || '  ' || v_colrec.column_name || ' ';
          END IF;

          -- Issue#23: Handle autogenerated columns and rewrite as a simpler IF THEN ELSE branch instead of a much more complex embedded CASE STATEMENT
          IF v_colrec.is_generated = 'ALWAYS' and v_colrec.generation_expression IS NOT NULL THEN
              -- searchable tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, COALESCE(translate(email, '@.-'::citext, ' '::text), ''::text)) ) STORED
              v_temp = v_colrec.data_type || ' GENERATED ALWAYS AS (' || v_colrec.generation_expression || ') STORED ';
          ELSEIF v_colrec.udt_name in ('geometry', 'box2d', 'box2df', 'box3d', 'geography', 'geometry_dump', 'gidx', 'spheroid', 'valid_detail') THEN
              v_temp = v_colrec.udt_name;
          ELSEIF v_colrec.data_type = 'USER-DEFINED' THEN
              v_temp = v_colrec.udt_schema || '.' || v_colrec.udt_name;
          ELSEIF v_colrec.data_type = 'ARRAY' THEN
                -- Issue#6 fix: handle arrays
              v_temp = pg_temp.pg_get_coldef(in_schema, in_table,v_colrec.column_name);
              -- v17 fix: handle case-sensitive for pg_get_serial_sequence that requires SQL Identifier handling
              -- WHEN pg_get_serial_sequence(v_qualified, v_colrec.column_name) IS NOT NULL
          ELSEIF pg_get_serial_sequence(quote_ident(in_schema) || '.' || quote_ident(in_table), v_colrec.column_name) IS NOT NULL THEN
              -- Issue#8 fix: handle serial. Note: NOT NULL is implied so no need to declare it explicitly
              v_temp = pg_temp.pg_get_coldef(in_schema, in_table,v_colrec.column_name);
          ELSE
              v_temp = v_colrec.data_type;
          END IF;
          -- RAISE NOTICE 'column def1=%', v_temp;

          -- handle IDENTITY columns
          IF v_colrec.is_identity = 'YES' THEN
              IF v_colrec.identity_generation = 'ALWAYS' THEN
                  v_temp = v_temp || ' GENERATED ALWAYS AS IDENTITY';
              ELSE
                  v_temp = v_temp || ' GENERATED BY DEFAULT AS IDENTITY';
              END IF;
          ELSEIF v_colrec.character_maximum_length IS NOT NULL THEN
              v_temp = v_temp || ('(' || v_colrec.character_maximum_length || ')');
          ELSEIF v_colrec.numeric_precision > 0 AND v_colrec.numeric_scale > 0 THEN
              v_temp = v_temp || '(' || v_colrec.numeric_precision || ',' || v_colrec.numeric_scale || ')';
          END IF;

          -- Handle NULL/NOT NULL
          IF bSerial THEN
              v_temp = v_temp || ' NOT NULL';
          ELSEIF v_colrec.is_nullable = 'NO' THEN
              v_temp = v_temp || ' NOT NULL';
          ELSEIF v_colrec.is_nullable = 'YES' THEN
              v_temp = v_temp || ' NULL';
          END IF;

          -- Handle defaults
          IF v_colrec.column_default IS NOT null AND NOT bSerial THEN
              -- RAISE NOTICE 'Setting default for column, %', v_colrec.column_name;
              v_temp = v_temp || (' DEFAULT ' || v_colrec.column_default);
          END IF;
          v_temp = v_temp || ',' || E'\\n';
          -- RAISE NOTICE 'column def2=%', v_temp;
          v_table_ddl := v_table_ddl || v_temp;
          -- RAISE NOTICE 'tabledef=%', v_table_ddl;

        END LOOP;
      END IF;
      IF bVerbose THEN RAISE NOTICE '(2)tabledef so far: %', v_table_ddl; END IF;

      -- define all the constraints: conparentid does not exist pre PGv11
      IF v_pgversion < 110000 THEN
        FOR v_constraintrec IN
          SELECT con.conname as constraint_name, con.contype as constraint_type,
            CASE
              WHEN con.contype = 'p' THEN 1 -- primary key constraint
              WHEN con.contype = 'u' THEN 2 -- unique constraint
              WHEN con.contype = 'f' THEN 3 -- foreign key constraint
              WHEN con.contype = 'c' THEN 4
              ELSE 5
            END as type_rank,
            pg_get_constraintdef(con.oid) as constraint_definition
          FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
          WHERE nsp.nspname = in_schema AND rel.relname = in_table ORDER BY type_rank
        LOOP
          v_constraint_name := v_constraintrec.constraint_name;
          v_constraint_def  := v_constraintrec.constraint_definition;
          IF v_constraintrec.type_rank = 1 THEN
              IF pkcnt = 0 OR pktype = 'PKEY_INTERNAL' THEN
                  -- internal def
                  v_constraint_name := v_constraintrec.constraint_name;
                  v_constraint_def  := v_constraintrec.constraint_definition;
                  v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                    || 'CONSTRAINT' || ' '
                    || v_constraint_name || ' '
                    || v_constraint_def
                    || ',' || E'\\n';
              ELSE
                -- Issue#16 handle external PG def
                SELECT 'ALTER TABLE ONLY ' || in_schema || '.' || c.relname || ' ADD CONSTRAINT ' || r.conname || ' ' || pg_catalog.pg_get_constraintdef(r.oid, true) || ';' INTO v_pkey_def
                FROM pg_catalog.pg_constraint r, pg_class c, pg_namespace n where r.conrelid = c.oid and  r.contype = 'p' and n.oid = r.connamespace and n.nspname = in_schema AND c.relname = in_table and r.conname = v_constraint_name;
              END IF;
              IF bPartition THEN
                continue;
              END IF;
          ELSIF v_constraintrec.type_rank = 3 THEN
              -- handle foreign key constraints
              --Issue#22 fix: added FKEY_NONE check
              IF fktype = 'FKEYS_NONE' THEN
                  -- skip
                  continue;
              ELSIF fkcnt = 0 OR fktype = 'FKEYS_INTERNAL' THEN
                  -- internal def
                  v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                    || 'CONSTRAINT' || ' '
                    || v_constraint_name || ' '
                    || v_constraint_def
                    || ',' || E'\\n';
              ELSE
                  -- external def
                  SELECT 'ALTER TABLE ONLY ' || n.nspname || '.' || c2.relname || ' ADD CONSTRAINT ' || r.conname || ' ' || pg_catalog.pg_get_constraintdef(r.oid, true) || ';' INTO v_fkey_def
                  FROM pg_constraint r, pg_class c1, pg_namespace n, pg_class c2 where r.conrelid = c1.oid and  r.contype = 'f' and n.nspname = in_schema and n.oid = r.connamespace and r.conrelid = c2.oid and c2.relname = in_table;
                  v_fkey_defs = v_fkey_defs || v_fkey_def || E'\\n';
              END IF;
          ELSE
              -- handle all other constraints besides PKEY and FKEYS as internal defs by default
              v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                || 'CONSTRAINT' || ' '
                || v_constraint_name || ' '
                || v_constraint_def
                || ',' || E'\\n';
          END IF;
          if bVerbose THEN RAISE NOTICE 'DEBUG4: constraint name=% constraint_def=%', v_constraint_name,v_constraint_def; END IF;
          constraintarr := constraintarr || v_constraintrec.constraint_name:: text;

        END LOOP;
      ELSE
        -- handle PG versions 11 and up
        -- Issue#20: Fix logic for external PKEY and FKEYS
        FOR v_constraintrec IN
          SELECT con.conname as constraint_name, con.contype as constraint_type,
            CASE
              WHEN con.contype = 'p' THEN 1 -- primary key constraint
              WHEN con.contype = 'u' THEN 2 -- unique constraint
              WHEN con.contype = 'f' THEN 3 -- foreign key constraint
              WHEN con.contype = 'c' THEN 4
              ELSE 5
            END as type_rank,
            pg_get_constraintdef(con.oid) as constraint_definition
          FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
          WHERE nsp.nspname = in_schema AND rel.relname = in_table
                --Issue#13 added this condition:
                AND con.conparentid = 0
                ORDER BY type_rank
        LOOP
          v_constraint_name := v_constraintrec.constraint_name;
          v_constraint_def  := v_constraintrec.constraint_definition;
          IF v_constraintrec.type_rank = 1 THEN
              IF pkcnt = 0 OR pktype = 'PKEY_INTERNAL' THEN
                  -- internal def
                  v_constraint_name := v_constraintrec.constraint_name;
                  v_constraint_def  := v_constraintrec.constraint_definition;
                  v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                    || 'CONSTRAINT' || ' '
                    || v_constraint_name || ' '
                    || v_constraint_def
                    || ',' || E'\\n';
              ELSE
                -- Issue#16 handle external PG def
                SELECT 'ALTER TABLE ONLY ' || in_schema || '.' || c.relname || ' ADD CONSTRAINT ' || r.conname || ' ' || pg_catalog.pg_get_constraintdef(r.oid, true) || ';' INTO v_pkey_def
                FROM pg_catalog.pg_constraint r, pg_class c, pg_namespace n where r.conrelid = c.oid and  r.contype = 'p' and n.oid = r.connamespace and n.nspname = in_schema AND c.relname = in_table;
              END IF;
              IF bPartition THEN
                continue;
              END IF;
          ELSIF v_constraintrec.type_rank = 3 THEN
              -- handle foreign key constraints
              --Issue#22 fix: added FKEY_NONE check
              IF fktype = 'FKEYS_NONE' THEN
                  -- skip
                  continue;
              ELSIF fkcnt = 0 OR fktype = 'FKEYS_INTERNAL' THEN
                  -- internal def
                  v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                    || 'CONSTRAINT' || ' '
                    || v_constraint_name || ' '
                    || v_constraint_def
                    || ',' || E'\\n';
              ELSE
                  -- external def
                  SELECT 'ALTER TABLE ONLY ' || n.nspname || '.' || c2.relname || ' ADD CONSTRAINT ' || r.conname || ' ' || pg_catalog.pg_get_constraintdef(r.oid, true) || ';' INTO v_fkey_def
                  FROM pg_constraint r, pg_class c1, pg_namespace n, pg_class c2 where r.conrelid = c1.oid and  r.contype = 'f' and n.nspname = in_schema and n.oid = r.connamespace and r.conrelid = c2.oid and c2.relname = in_table and
                  r.conname = v_constraint_name and r.conparentid = 0;
                  v_fkey_defs = v_fkey_defs || v_fkey_def || E'\\n';
              END IF;
          ELSE
              -- handle all other constraints besides PKEY and FKEYS as internal defs by default
              v_table_ddl := v_table_ddl || '  ' -- note: two char spacer to start, to indent the column
                || 'CONSTRAINT' || ' '
                || v_constraint_name || ' '
                || v_constraint_def
                || ',' || E'\\n';
          END IF;
          if bVerbose THEN RAISE NOTICE 'DEBUG4: constraint name=% constraint_def=%', v_constraint_name,v_constraint_def; END IF;
          constraintarr := constraintarr || v_constraintrec.constraint_name:: text;

        END LOOP;
      END IF;

      -- drop the last comma before ending the create statement, which should be right before the carriage return character
      -- Issue#24: make sure the comma is there before removing it
      select substring(v_table_ddl, length(v_table_ddl) - 1, 1) INTO v_temp;
      IF v_temp = ',' THEN
          v_table_ddl = substr(v_table_ddl, 0, length(v_table_ddl) - 1) || E'\\n';
      END IF;
      IF bVerbose THEN RAISE NOTICE '(3)tabledef so far: %', trim(v_table_ddl); END IF;

      -- ---------------------------------------------------------------------------
      -- at this point we have everything up to the last table-enclosing parenthesis
      -- ---------------------------------------------------------------------------
      IF bVerbose THEN RAISE NOTICE '(4)tabledef so far: %', v_table_ddl; END IF;

      -- See if this is an inheritance-based child table and finish up the table create.
      IF bPartition and bInheritance THEN
        -- Issue#11: handle parent schema
        -- v_table_ddl := v_table_ddl || ') INHERITS (' || in_schema || '.' || v_parent || ') ' || E'\\n' || v_relopts || ' ' || v_tablespace || ';' || E'\\n';
        IF v_parent_schema = '' OR v_parent_schema IS NULL THEN v_parent_schema = in_schema; END IF;
        v_table_ddl := v_table_ddl || ') INHERITS (' || v_parent_schema || '.' || v_parent || ') ' || E'\\n' || v_relopts || ' ' || v_tablespace || ';' || E'\\n';
      END IF;

      IF v_pgversion >= 100000 AND NOT bPartition and NOT bInheritance THEN
        -- See if this is a partitioned table (pg_class.relkind = 'p') and add the partitioned key
        SELECT pg_get_partkeydef(c1.oid) as partition_key INTO v_partition_key FROM pg_class c1 JOIN pg_namespace n ON (n.oid = c1.relnamespace) LEFT JOIN pg_partitioned_table p ON (c1.oid = p.partrelid)
        WHERE n.nspname = in_schema and n.oid = c1.relnamespace and c1.relname = in_table and c1.relkind = 'p';

        IF v_partition_key IS NOT NULL AND v_partition_key <> '' THEN
          -- add partition clause
          -- NOTE:  cannot specify default tablespace for partitioned relations
          -- v_table_ddl := v_table_ddl || ') PARTITION BY ' || v_partition_key || ' ' || v_tablespace || ';' || E'\\n';
          v_table_ddl := v_table_ddl || ') PARTITION BY ' || v_partition_key || ';' || E'\\n';
        ELSEIF v_relopts <> '' THEN
          v_table_ddl := v_table_ddl || ') ' || v_relopts || ' ' || v_tablespace || ';' || E'\\n';
        ELSE
          -- end the create definition
          v_table_ddl := v_table_ddl || ') ' || v_tablespace || ';' || E'\\n';
        END IF;
      END IF;

      IF bVerbose THEN RAISE NOTICE '(5)tabledef so far: %', v_table_ddl; END IF;

      -- Add closing paren for regular tables
      -- IF NOT bPartition THEN
      -- v_table_ddl := v_table_ddl || ') ' || v_relopts || ' ' || v_tablespace || E';\\n';
      -- END IF;
      -- RAISE NOTICE 'ddlsofar3: %', v_table_ddl;

      -- Issue#16 create the external PKEY def if indicated
      IF v_pkey_def <> '' THEN
          v_table_ddl := v_table_ddl || v_pkey_def || E'\\n';
      END IF;

      -- Issue#20
      IF v_fkey_defs <> '' THEN
            v_table_ddl := v_table_ddl || v_fkey_defs || E'\\n';
      END IF;

      IF bVerbose THEN RAISE NOTICE '(6)tabledef so far: %', v_table_ddl; END IF;

      -- create indexes
      FOR v_indexrec IN
        SELECT indexdef, COALESCE(tablespace, 'pg_default') as tablespace, indexname FROM pg_indexes WHERE (schemaname, tablename) = (in_schema, in_table)
      LOOP
        -- RAISE NOTICE 'DEBUG6: indexname=%  indexdef=%', v_indexrec.indexname, v_indexrec.indexdef;
        -- loop through constraints and skip ones already defined
        bSkip = False;
        FOREACH constraintelement IN ARRAY constraintarr
        LOOP
          IF constraintelement = v_indexrec.indexname THEN
              -- RAISE NOTICE 'DEBUG7: skipping index, %', v_indexrec.indexname;
              bSkip = True;
              EXIT;
          END IF;
        END LOOP;
        if bSkip THEN CONTINUE; END IF;

        -- Add IF NOT EXISTS clause so partition index additions will not be created if declarative partition in effect and index already created on parent
        v_indexrec.indexdef := REPLACE(v_indexrec.indexdef, 'CREATE INDEX', 'CREATE INDEX IF NOT EXISTS');
        -- Fix Issue#26: do it for unique/primary key indexes as well
        v_indexrec.indexdef := REPLACE(v_indexrec.indexdef, 'CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS');
        -- RAISE NOTICE 'DEBUG8: adding index, %', v_indexrec.indexname;

        -- NOTE:  cannot specify default tablespace for partitioned relations
        IF v_partition_key IS NOT NULL AND v_partition_key <> '' THEN
            v_table_ddl := v_table_ddl || v_indexrec.indexdef || ';' || E'\\n';
        ELSE
            -- Issue#25: see if partial index or not
            select CASE WHEN i.indpred IS NOT NULL THEN True ELSE False END INTO v_partial
            FROM pg_index i JOIN pg_class c1 ON (i.indexrelid = c1.oid) JOIN pg_class c2 ON (i.indrelid = c2.oid)
            WHERE c1.relnamespace::regnamespace::text = in_schema AND c2.relnamespace::regnamespace::text = in_schema AND c2.relname = in_table AND c1.relname = v_indexrec.indexname;
            IF v_partial THEN
                -- Put tablespace def before WHERE CLAUSE
                v_temp = v_indexrec.indexdef;
                v_pos = POSITION(' WHERE ' IN v_temp);
                v_temp2 = SUBSTRING(v_temp, v_pos);
                v_temp  = SUBSTRING(v_temp, 1, v_pos);
                v_table_ddl := v_table_ddl || v_temp || ' TABLESPACE ' || v_indexrec.tablespace || v_temp2 || ';' || E'\\n';
            ELSE
                v_table_ddl := v_table_ddl || v_indexrec.indexdef || ' TABLESPACE ' || v_indexrec.tablespace || ';' || E'\\n';
            END IF;
        END IF;

      END LOOP;
      IF bVerbose THEN RAISE NOTICE '(7)tabledef so far: %', v_table_ddl; END IF;

      -- Issue#20: added logic for table and column comments
      IF  cmtcnt > 0 THEN
          FOR v_rec IN
            SELECT c.relname, 'COMMENT ON ' || CASE WHEN c.relkind in ('r','p') AND a.attname IS NULL THEN 'TABLE ' WHEN c.relkind in ('r','p') AND a.attname IS NOT NULL THEN 'COLUMN ' WHEN c.relkind = 'f' THEN 'FOREIGN TABLE '
                  WHEN c.relkind = 'm' THEN 'MATERIALIZED VIEW ' WHEN c.relkind = 'v' THEN 'VIEW ' WHEN c.relkind = 'i' THEN 'INDEX ' WHEN c.relkind = 'S' THEN 'SEQUENCE ' ELSE 'XX' END || n.nspname || '.' ||
                  CASE WHEN c.relkind in ('r','p') AND a.attname IS NOT NULL THEN quote_ident(c.relname) || '.' || a.attname ELSE quote_ident(c.relname) END || ' IS '   || quote_literal(d.description) || ';' as ddl
            FROM pg_class c JOIN pg_namespace n ON (n.oid = c.relnamespace) LEFT JOIN pg_description d ON (c.oid = d.objoid) LEFT JOIN pg_attribute a ON (c.oid = a.attrelid AND a.attnum > 0 and a.attnum = d.objsubid)
            WHERE d.description IS NOT NULL AND n.nspname = in_schema AND c.relname = in_table ORDER BY 2 desc, ddl
          LOOP
              --RAISE NOTICE 'comments:%', v_rec.ddl;
              v_table_ddl = v_table_ddl || v_rec.ddl || E'\\n';
          END LOOP;
      END IF;
      IF bVerbose THEN RAISE NOTICE '(8)tabledef so far: %', v_table_ddl; END IF;

      IF trigtype = 'INCLUDE_TRIGGERS' THEN
        -- Issue#14: handle multiple triggers for a table
        FOR v_trigrec IN
            select pg_get_triggerdef(t.oid, True) || ';' as triggerdef FROM pg_trigger t, pg_class c, pg_namespace n
            WHERE n.nspname = in_schema and n.oid = c.relnamespace and c.relname = in_table and c.relkind = 'r' and t.tgrelid = c.oid and NOT t.tgisinternal
        LOOP
            v_table_ddl := v_table_ddl || v_trigrec.triggerdef;
            v_table_ddl := v_table_ddl || E'\\n';
            IF bVerbose THEN RAISE NOTICE 'triggerdef = %', v_trigrec.triggerdef; END IF;
        END LOOP;
      END IF;

      IF bVerbose THEN RAISE NOTICE '(9)tabledef so far: %', v_table_ddl; END IF;
      -- add empty line
      v_table_ddl := v_table_ddl || E'\\n';
      IF bVerbose THEN RAISE NOTICE '(10)tabledef so far: %', v_table_ddl; END IF;

      -- reset search_path back to what it was
      IF search_path_old = '' THEN
        SELECT set_config('search_path', '', false) into v_temp;
      ELSE
        EXECUTE 'SET search_path = ' || search_path_old;
      END IF;

      RETURN v_table_ddl;

      EXCEPTION
      WHEN others THEN
      BEGIN
        GET STACKED DIAGNOSTICS v_diag1 = MESSAGE_TEXT, v_diag2 = PG_EXCEPTION_DETAIL, v_diag3 = PG_EXCEPTION_HINT, v_diag4 = RETURNED_SQLSTATE, v_diag5 = PG_CONTEXT, v_diag6 = PG_EXCEPTION_CONTEXT;
        -- v_ret := 'line=' || v_diag6 || '. '|| v_diag4 || '. ' || v_diag1 || ' .' || v_diag2 || ' .' || v_diag3;
        v_ret := 'line=' || v_diag6 || '. '|| v_diag4 || '. ' || v_diag1;
        RAISE EXCEPTION '%', v_ret;
        -- put additional coding here if necessarY
        RETURN '';
      END;

    END;
  $$;`;e.s(["getTableDefinitionSql",0,({id:e})=>_`
    ${ta}

    with table_info as (
      select 
        n.nspname::text as schema,
        c.relname::text as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.oid = ${l(e)}
    )
    select pg_temp.pg_get_tabledef (
      t.schema,
      t.name,
      false,
      'FKEYS_INTERNAL',
      'INCLUDE_TRIGGERS'
    ) as definition
    from table_info t;
  `],538892);var ti=((t={}).NO_ACTION="a",t.RESTRICT="r",t.CASCADE="c",t.SET_NULL="n",t.SET_DEFAULT="d",t);e.s(["FOREIGN_KEY_CASCADE_ACTION",()=>ti,"getAddForeignKeySQL",0,({table:e,foreignKeys:t})=>{let n=t.map(t=>{let{deletionAction:n,updateAction:a}=t,i="c"===n?_`ON DELETE CASCADE`:"r"===n?_`ON DELETE RESTRICT`:"d"===n?_`ON DELETE SET DEFAULT`:"n"===n?_`ON DELETE SET NULL`:_``,r="c"===a?_`ON UPDATE CASCADE`:"r"===a?_`ON UPDATE RESTRICT`:_``,o=p(t.columns.map(e=>s(e.source)),", "),l=p(t.columns.map(e=>s(e.target)),", ");return _`ALTER TABLE ${s(e.schema)}.${s(e.name)} ADD FOREIGN KEY (${o}) REFERENCES ${s(t.schema)}.${s(t.table)} (${l}) ${r} ${i}`});return _`${p(n,";\n")};`},"getForeignKeyConstraintsSql",0,({schema:e})=>{if(!e)throw Error("schema is required");return _`
SELECT
  con.oid as id,
  con.conname as constraint_name,
  con.confdeltype as deletion_action,
  con.confupdtype as update_action,
  rel.oid as source_id,
  nsp.nspname as source_schema,
  rel.relname as source_table,
  (
    SELECT
      array_agg(
        att.attname
        ORDER BY
          un.ord
      )
    FROM
      unnest(con.conkey) WITH ORDINALITY un (attnum, ord)
      INNER JOIN pg_attribute att ON att.attnum = un.attnum
    WHERE
      att.attrelid = rel.oid
  ) source_columns,
  frel.oid as target_id,
  fnsp.nspname as target_schema,
  frel.relname as target_table,
  (
    SELECT
      array_agg(
        att.attname
        ORDER BY
          un.ord
      )
    FROM
      unnest(con.confkey) WITH ORDINALITY un (attnum, ord)
      INNER JOIN pg_attribute att ON att.attnum = un.attnum
    WHERE
      att.attrelid = frel.oid
  ) target_columns
FROM
  pg_constraint con
  INNER JOIN pg_class rel ON rel.oid = con.conrelid
  INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  INNER JOIN pg_class frel ON frel.oid = con.confrelid
  INNER JOIN pg_namespace fnsp ON fnsp.oid = frel.relnamespace
WHERE
  con.contype = 'f'
  AND nsp.nspname = ${l(e)}
`},"getRemoveForeignKeySQL",0,({table:e,foreignKeys:t})=>{let n=t.map(t=>_`ALTER TABLE IF EXISTS ${s(e.schema)}.${s(e.name)} DROP CONSTRAINT IF EXISTS ${s(t.name)}`);return _`${p(n,";\n")};`}],788035);let tr=_`ROLE_IMPERSONATION_NO_RESULTS`;e.s(["ROLE_IMPERSONATION_NO_RESULTS",0,tr,"ROLE_IMPERSONATION_SQL_LINE_COUNT",0,11,"getImpersonationSQL",0,({role:e,unexpiredClaims:t,sql:n})=>{var a;let i="postgrest"===e.type?void 0!==t?function({role:e,unexpiredClaims:t}){return _`
select set_config('role', ${l(e)}, true),
set_config('request.jwt.claims', ${l(JSON.stringify(t))}, true),
set_config('request.method', 'POST', true),
set_config('request.path', '/impersonation-example-request-path', true),
set_config('request.headers', '{"accept": "*/*"}', true);
  `}({role:e.role,unexpiredClaims:t}):_``:(a=e.role,_`
    set local role ${l(a)};
  `);return _`
    ${i}

    -- If the users sql returns no rows, pg-meta will
    -- fallback to returning the result of the impersonation sql.
    select 1 as "${tr}";

    ${n}
  `}],940562),e.s(["default",0,{roles:{list:function({includeDefaultRoles:e=!1,limit:t,offset:n}={}){let a=_`
with
  roles as (${ed})
select
  *
from
  roles
where
  true
`;return e||(a=_`${a} and not pg_catalog.starts_with(name, 'pg_')`),t&&(a=_`${a} limit ${l(t)}`),n&&(a=_`${a} offset ${l(n)}`),{sql:a,zod:ep}},retrieve:function(e){return{sql:_`with roles as (${ed}) select * from roles where ${eE(e)};`,zod:em}},create:function({name:e,isSuperuser:t=!1,canCreateDb:n=!1,canCreateRole:a=!1,inheritRole:i=!0,canLogin:r=!1,isReplicationRole:o=!1,canBypassRls:c=!1,connectionLimit:d=-1,password:m,validUntil:E,memberOf:u=[],members:g=[],admins:f=[],config:N={}}){return{sql:_`
create role ${s(e)}
  ${t?_`superuser`:_``}
  ${n?_`createdb`:_``}
  ${a?_`createrole`:_``}
  ${i?_``:_`noinherit`}
  ${r?_`login`:_``}
  ${o?_`replication`:_``}
  ${c?_`bypassrls`:_``}
  connection limit ${l(d)}
  ${void 0===m?_``:_`password ${l(m)}`}
  ${void 0===E?_``:_`valid until ${l(E)}`}
  ${0===u.length?_``:_`in role ${p(u.map(s),",")}`}
  ${0===g.length?_``:_`role ${p(g.map(s),",")}`}
  ${0===f.length?_``:_`admin ${p(f.map(s),",")}`}
  ;
${p(Object.entries(N).map(([t,n])=>_`alter role ${s(e)} set ${s(t)} = ${l(n)};`),"\n")}
`}},update:function(e,t){let{name:n,isSuperuser:a,canCreateDb:i,canCreateRole:r,inheritRole:o,canLogin:s,isReplicationRole:c,canBypassRls:d,connectionLimit:p,password:m,validUntil:E}=t;return{sql:_`
do $$
declare
  old record;
begin
  with roles as (${ed})
  select * into old from roles where ${eE(e)};
  if old is null then
    raise exception 'Cannot find role with id %', id;
  end if;

  execute(format('alter role %I
    ${void 0===a?_``:a?_`superuser`:_`nosuperuser`}
    ${void 0===i?_``:i?_`createdb`:_`nocreatedb`}
    ${void 0===r?_``:r?_`createrole`:_`nocreaterole`}
    ${void 0===o?_``:o?_`inherit`:_`noinherit`}
    ${void 0===s?_``:s?_`login`:_`nologin`}
    ${void 0===c?_``:c?_`replication`:_`noreplication`}
    ${void 0===d?_``:d?_`bypassrls`:_`nobypassrls`}
    ${void 0===p?_``:_`connection limit ${l(p)}`}
    ${void 0===m?_``:_`password ${l(m)}`}
    ${void 0===E?_``:_`valid until %L`}
  ', old.name${void 0===E?_``:_`, ${l(E)}`}));

  ${void 0===n?_``:_`
  -- Using the same name in the rename clause gives an error, so only do it if the new name is different.
  if ${l(n)} != old.name then
    execute(format('alter role %I rename to %I;', old.name, ${l(n)}));
  end if;
  `}
end
$$;
`}},remove:function(e,{ifExists:t=!1}={}){return{sql:_`
do $$
declare
  old record;
begin
  with roles as (${ed})
  select * into old from roles where ${eE(e)};
  if old is null then
    raise exception 'Cannot find role with id %', id;
  end if;

  execute(format('drop role ${t?_`if exists`:_``} %I;', old.name));
end
$$;
`}},zod:e_},columns:{list:function({tableId:e,includeSystemSchemas:t=!1,includedSchemas:n,excludedSchemas:i,limit:r,offset:o}={}){let s=_`
with
  columns as (${b})
select
  *
from
  columns
where
 true
`,c=E(n,i,t?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} and schema ${c}`),void 0!==e&&(s=_`${s} and table_id = ${l(e)} `),r&&(s=_`${s} limit ${l(r)}`),o&&(s=_`${s} offset ${l(o)}`),{sql:s,zod:T}},retrieve:function(e){return{sql:_`WITH columns AS (${b}) SELECT * FROM columns WHERE ${function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.schema&&e.table)return _`schema = ${l(e.schema)} AND ${s("table")} = ${l(e.table)} AND name = ${l(e.name)}`;throw Error("Must provide either id or schema, name and table")}(e)};`,zod:v}},create:function({schema:e,table:t,name:n,type:a,default_value:i,default_value_format:r="literal",is_identity:o=!1,identity_generation:c="BY DEFAULT",is_nullable:d,is_primary_key:_=!1,is_unique:p=!1,comment:m,check:E,no_transaction:u=!1}){let g="";if(o){if(void 0!==i)throw Error("Columns cannot both be identity and have a default value");g=`GENERATED ${c} AS IDENTITY`}else void 0===i||(g="expression"===r?`DEFAULT ${i}`:`DEFAULT ${l(i)}`);let f="";void 0!==d&&(f=d?"NULL":"NOT NULL");let N=void 0===E?"":`CHECK (${E})`,b=void 0===m?"":`COMMENT ON COLUMN ${s(e)}.${s(t)}.${s(n)} IS ${l(m)}`,h=`
  ALTER TABLE ${s(e)}.${s(t)} ADD COLUMN ${s(n)} ${A(a)}
    ${g}
    ${f}
    ${_?"PRIMARY KEY":""}
    ${p?"UNIQUE":""}
    ${N};
  ${b};`;return u?{sql:h}:{sql:`
  BEGIN;
    ${h};
  COMMIT;`}},update:function(e,{name:t,type:n,drop_default:a=!1,default_value:i,default_value_format:r="literal",is_identity:o,identity_generation:c="BY DEFAULT",is_nullable:d,is_unique:_,comment:p,check:m}){let E,u,g=void 0===t||t===e.name?"":`ALTER TABLE ${s(e.schema)}.${s(e.table)} RENAME COLUMN ${s(e.name)} TO ${s(t)};`,f=void 0===n?"":`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)} SET DATA TYPE ${A(n)} USING ${s(e.name)}::${A(n)};`;if(a)E=`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)} DROP DEFAULT;`;else if(void 0===i)E="";else{let t="expression"===r?i:l(i);E=`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)} SET DEFAULT ${t};`}let N=`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)}`;!1===o?N+=" DROP IDENTITY IF EXISTS;":!0===e.is_identity?void 0===c?N="":N+=` SET GENERATED ${c};`:void 0===o?N="":N+=` ADD GENERATED ${c} AS IDENTITY;`,u=void 0===d?"":d?`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)} DROP NOT NULL;`:`ALTER TABLE ${s(e.schema)}.${s(e.table)} ALTER COLUMN ${s(e.name)} SET NOT NULL;`;let b="";!0===e.is_unique&&!1===_?b=`
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint WHERE
      contype = 'u'
      AND cardinality(conkey) = 1
      AND conrelid = ${l(e.table_id)}
      AND conkey[1] = ${l(e.ordinal_position)}
  LOOP
    EXECUTE ${l(`ALTER TABLE ${s(e.schema)}.${s(e.table)} DROP CONSTRAINT `)} || quote_ident(r.conname);
  END LOOP;
END
$$;
`:!1===e.is_unique&&!0===_&&(b=`ALTER TABLE ${s(e.schema)}.${s(e.table)} ADD UNIQUE (${s(e.name)});`);let h=void 0===p?"":`COMMENT ON COLUMN ${s(e.schema)}.${s(e.table)}.${s(e.name)} IS ${l(p)};`,T=void 0===m?"":`
DO $$
DECLARE
  v_conname name;
  v_conkey int2[];
BEGIN
  SELECT conname into v_conname FROM pg_constraint WHERE
    contype = 'c'
    AND cardinality(conkey) = 1
    AND conrelid = ${l(e.table_id)}
    AND conkey[1] = ${l(e.ordinal_position)}
    ORDER BY oid asc
    LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ${s(e.schema)}.${s(e.table)} DROP CONSTRAINT %I', v_conname);
  END IF;

  ${null!==m?`
  ALTER TABLE ${s(e.schema)}.${s(e.table)} ADD CONSTRAINT ${s(`${e.table}_${e.name}_check`)} CHECK (${m});

  SELECT conkey into v_conkey FROM pg_constraint WHERE conname = ${l(`${e.table}_${e.name}_check`)};

  ASSERT v_conkey IS NOT NULL, 'error creating column constraint: check condition must refer to this column';
  ASSERT cardinality(v_conkey) = 1, 'error creating column constraint: check condition cannot refer to multiple columns';
  ASSERT v_conkey[1] = ${l(e.ordinal_position)}, 'error creating column constraint: check condition cannot refer to other columns';
`:""}
END
$$;
`;return{sql:`
BEGIN;
  ${u}
  ${f}
  ${E}
  ${N}
  ${b}
  ${h}
  ${T}
  ${g}
COMMIT;`}},remove:function(e,{cascade:t=!1}={}){return{sql:_`ALTER TABLE ${s(e.schema)}.${s(e.table)} DROP COLUMN ${s(e.name)} ${t?_`CASCADE`:_`RESTRICT`};`}},zod:h},schemas:{list:function({includeSystemSchemas:e=!1,limit:t,offset:n}={}){let i=eu;return e||(i=_`${i} and not (n.nspname in (${p(a.DEFAULT_SYSTEM_SCHEMAS.map(l),",")}))`),t&&(i=_`${i} limit ${l(t)}`),n&&(i=_`${i} offset ${l(n)}`),{sql:i,zod:ef}},retrieve:function({id:e,name:t}){return e?{sql:_`${eu} and n.oid = ${l(e)};`,zod:eN}:{sql:_`${eu} and n.nspname = ${l(t)};`,zod:eN}},create:function({name:e,owner:t}){return{sql:_`create schema ${s(e)}
  ${void 0===t?_``:_`authorization ${s(t)}`};
`}},update:function({id:e,name:t},{name:n,owner:a}){return{sql:_`
do $$
declare
  id oid := ${void 0===e?_`${l(t)}::regnamespace`:l(e)};
  old record;
  new_name text := ${void 0===n?l(null):l(n)};
  new_owner text := ${void 0===a?l(null):l(a)};
begin
  select * into old from pg_namespace where oid = id;
  if old is null then
    raise exception 'Cannot find schema with id %', id;
  end if;

  if new_owner is not null then
    execute(format('alter schema %I owner to %I;', old.nspname, new_owner));
  end if;

  -- Using the same name in the rename clause gives an error, so only do it if the new name is different.
  if new_name is not null and new_name != old.nspname then
    execute(format('alter schema %I rename to %I;', old.nspname, new_name));
  end if;
end
$$;
`}},remove:function({id:e,name:t},{cascade:n=!1}={}){return{sql:_`
do $$
declare
  id oid := ${void 0===e?_`${l(t)}::regnamespace`:l(e)};
  old record;
  cascade bool := ${l(n)};
begin
  select * into old from pg_namespace where oid = id;
  if old is null then
    raise exception 'Cannot find schema with id %', id;
  end if;

  execute(format('drop schema %I %s;', old.nspname, case when cascade then 'cascade' else 'restrict' end));
end
$$;
`}},zod:eg},tables:eO,functions:Y,tablePrivileges:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r}={}){let o=_`
with table_privileges as (${eb})
select *
from table_privileges
`,s=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return s&&(o=_`${o} where schema ${s}`),i&&(o=_`${o} limit ${l(i)}`),r&&(o=_`${o} offset ${l(r)}`),{sql:o,zod:eT}},retrieve:function({id:e,name:t,schema:n="public"}){return e?{sql:_`
with table_privileges as (${eb})
select *
from table_privileges
where table_privileges.relation_id = ${l(e)};`,zod:ev}:{sql:_`
with table_privileges as (${eb})
select *
from table_privileges
where table_privileges.schema = ${l(n)}
  and table_privileges.name = ${l(t)}
`,zod:ev}},grant:function(e){return{sql:_`
do $$
begin
${p(e.map(({privilegeType:e,relationId:t,grantee:n,isGrantable:a})=>_`execute format('grant ${c(e)} on table %s to ${"public"===n.toLowerCase()?_`public`:s(n)} ${a?_`with grant option`:_``}', ${l(t)}::regclass);`),"\n")}
end $$;
`}},revoke:function(e){return{sql:_`
do $$
begin
${p(e.map(({privilegeType:e,relationId:t,grantee:n})=>_`execute format('revoke ${c(e)} on table %s from ${"public"===n.toLowerCase()?_`public`:s(n)}', ${l(t)}::regclass);`),"\n")}
end $$;
`}},zod:eh},publications:{list:function({limit:e,offset:t}={}){let n=_`with publications as (${er}) select * from publications`;return e&&(n=_`${n} limit ${l(e)}`),t&&(n=_`${n} offset ${l(t)}`),{sql:n,zod:el}},retrieve:function(e){return{sql:_`with publications as (${er}) select * from publications where ${function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name)return _`${s("name")} = ${l(e.name)}`;throw Error("Must provide either id or name")}(e)};`,zod:ec}},create:function({name:e,publish_insert:t=!1,publish_update:n=!1,publish_delete:a=!1,publish_truncate:i=!1,tables:r=null}){let o;o=null==r?_`FOR ALL TABLES`:0===r.length?_``:_`FOR TABLE ${p(r.map(e=>{if(!e.includes("."))return s(e);let[t,...n]=e.split("."),a=n.join(".");return _`${s(t)}.${s(a)}`}),",")}`;let c=[];return t&&c.push("insert"),n&&c.push("update"),a&&c.push("delete"),i&&c.push("truncate"),{sql:_`
CREATE PUBLICATION ${s(e)} ${o}
  WITH (publish = ${l(c.join(","))});`}},update:function(e,{name:t,owner:n,publish_insert:a,publish_update:i,publish_delete:r,publish_truncate:o,tables:c}){return{sql:_`
do $$
declare
  id oid := ${l(e)};
  old record;
  new_name text := ${void 0===t?l(null):l(t)};
  new_owner text := ${void 0===n?l(null):l(n)};
  new_publish_insert bool := ${l(a??null)};
  new_publish_update bool := ${l(i??null)};
  new_publish_delete bool := ${l(r??null)};
  new_publish_truncate bool := ${l(o??null)};
  new_tables text := ${void 0===c?l(null):l(null===c?"all tables":c.map(e=>{if(!e.includes("."))return s(e);let[t,...n]=e.split("."),a=n.join(".");return _`${s(t)}.${s(a)}`}).join(","))};
begin
  select * into old from pg_publication where oid = id;
  if old is null then
    raise exception 'Cannot find publication with id %', id;
  end if;

  if new_tables is null then
    null;
  elsif new_tables = 'all tables' then
    if old.puballtables then
      null;
    else
      -- Need to recreate because going from list of tables <-> all tables with alter is not possible.
      execute(format('drop publication %1$I; create publication %1$I for all tables;', old.pubname));
    end if;
  else
    if old.puballtables then
      -- Need to recreate because going from list of tables <-> all tables with alter is not possible.
      execute(format('drop publication %1$I; create publication %1$I;', old.pubname));
    elsif exists(select from pg_publication_rel where prpubid = id) then
      execute(
        format(
          'alter publication %I drop table %s',
          old.pubname,
          (select string_agg(prrelid::regclass::text, ', ') from pg_publication_rel where prpubid = id)
        )
      );
    end if;

    -- At this point the publication must have no tables.

    if new_tables != '' then
      execute(format('alter publication %I add table %s', old.pubname, new_tables));
    end if;
  end if;

  execute(
    format(
      'alter publication %I set (publish = %L);',
      old.pubname,
      concat_ws(
        ', ',
        case when coalesce(new_publish_insert, old.pubinsert) then 'insert' end,
        case when coalesce(new_publish_update, old.pubupdate) then 'update' end,
        case when coalesce(new_publish_delete, old.pubdelete) then 'delete' end,
        case when coalesce(new_publish_truncate, old.pubtruncate) then 'truncate' end
      )
    )
  );

  execute(format('alter publication %I owner to %I;', old.pubname, coalesce(new_owner, old.pubowner::regrole::name)));

  -- Using the same name in the rename clause gives an error, so only do it if the new name is different.
  if new_name is not null and new_name != old.pubname then
    execute(format('alter publication %I rename to %I;', old.pubname, coalesce(new_name, old.pubname)));
  end if;

  -- We need to retrieve the publication later, so we need a way to uniquely identify which publication this is.
  -- We can't rely on id because it gets changed if it got recreated.
  -- We use a temp table to store the unique name - DO blocks can't return a value.
  create temp table pg_meta_publication_tmp (name) on commit drop as values (coalesce(new_name, old.pubname));
end $$;
`}},remove:function(e){return{sql:_`DROP PUBLICATION IF EXISTS ${s(e.name)};`}},zod:es},extensions:C,config:{list:function({limit:e,offset:t}={}){let n=I;return e&&(n=_`${n} LIMIT ${l(e)}`),t&&(n=_`${n} OFFSET ${l(t)}`),{sql:n,zod:S}},zod:$},materializedViews:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r,includeColumns:o=!0}={}){let s=ee({includeColumns:o}),c=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} where schema ${c}`),i&&(s=_`${s} limit ${l(i)}`),r&&(s=_`${s} offset ${l(r)}`),{sql:s,zod:K}},retrieve:function(e){let t=function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.schema)return _`${s("name")} = ${l(e.name)} and ${s("schema")} = ${l(e.schema)}`;throw Error("Must provide either id or name and schema")}(e);return{sql:_`${ee({includeColumns:!0})} where ${t};`,zod:Z}},zod:Q},foreignTables:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r,includeColumns:o=!0}={}){let s=w({includeColumns:o}),c=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} where schema ${c}`),i&&(s=_`${s} limit ${l(i)}`),r&&(s=_`${s} offset ${l(r)}`),{sql:s,zod:F}},retrieve:function(e){return{sql:_`${w({includeColumns:!0})} where ${function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.schema)return _`${s("name")} = ${l(e.name)} and ${s("schema")} = ${l(e.schema)}`;throw Error("Must provide either id or name and schema")}(e)};`,zod:x}},zod:D},views:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r,includeColumns:o=!0}={}){let s=ej({includeColumns:o}),c=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} where schema ${c}`),i&&(s=_`${s} limit ${l(i)}`),r&&(s=_`${s} offset ${l(r)}`),{sql:s,zod:eq}},retrieve:function(e){let t=function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.schema)return _`${s("name")} = ${l(e.name)} and ${s("schema")} = ${l(e.schema)}`;throw Error("Must provide either id or name and schema")}(e);return{sql:_`${ej({includeColumns:!0})} where ${t};`,zod:eP}},zod:ek},policies:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r}={}){let o=_`
    with policies as (${et})
    select *
    from policies
    `,s=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return s&&(o=_`${o}where schema ${s}`),i&&(o=_`${o} limit ${l(i)}`),r&&(o=_`${o} offset ${l(r)}`),{sql:o,zod:ea}},retrieve:function(e){return{sql:_`with policies as (${et}) select * from policies where ${function(e){if("id"in e&&e.id)return _`id = ${l(e.id)}`;if("name"in e&&e.name&&e.schema&&e.table)return _`name = ${l(e.name)} AND schema = ${l(e.schema)} AND table = ${l(e.table)}`;throw Error("Must provide either id or name, schema and table")}(e)};`,zod:ei}},create:function({name:e,schema:t="public",table:n,definition:a,check:i,action:r="PERMISSIVE",command:o="ALL",roles:l=["public"]}){return{sql:`
create policy ${s(e)} on ${s(t)}.${s(n)}
  as ${r}
  for ${o}
  to ${l.map(s).join(",")}
  ${a?`using (${a})`:""}
  ${i?`with check (${i})`:""};`}},update:function(e,t){let{name:n,definition:a,check:i,roles:r}=t,o=`ALTER POLICY ${s(e.name)} ON ${s(e.schema)}.${s(e.table)}`,l=void 0===n?"":`${o} RENAME TO ${s(n)};`,c=void 0===a?"":`${o} USING (${a});`,d=void 0===i?"":`${o} WITH CHECK (${i});`,_=void 0===r?"":`${o} TO ${r.map(s).join(",")};`;return{sql:`BEGIN; ${c} ${d} ${_} ${l} COMMIT;`}},remove:function(e){return{sql:_`DROP POLICY ${s(e.name)} ON ${s(e.schema)}.${s(e.table)};`}},zod:en},triggers:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r}={}){let o=_`with triggers as (${ey}) select * from triggers`,s=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return s&&(o=_`${o} where schema ${s}`),i&&(o=_`${o} limit ${l(i)}`),r&&(o=_`${o} offset ${l(r)}`),{sql:o,zod:ez}},retrieve:function(e){let t=function(e){if("id"in e&&e.id)return _`${s("id")} = ${l(e.id)}`;if("name"in e&&e.name&&e.table&&e.schema)return _`${s("name")} = ${l(e.name)} and ${s("schema")} = ${l(e.schema)} and ${s("table")} = ${l(e.table)}`;throw Error("Must provide either id or name, schema and table")}(e);return{sql:_`with triggers as (${ey}) select * from triggers where ${t};`,zod:eD}},create:function({name:e,schema:t="public",table:a,function_schema:i="public",function_name:r,function_args:o=[],activation:c,events:d,orientation:_,condition:p}){let m=`${s(t)}.${s(a)}`,E=`${s(i)}.${s(r)}`,u=d.join(" or "),g=_?`for each ${_}`:"",f=p?`when (${p})`:"",N=o.map(l).join(",");return{sql:`create trigger ${s(e)} ${c} ${u} on ${m} ${g} ${f} execute function ${E}(${N});`,zod:n.z.void()}},update:function(e,t){let a=_`${s(e.schema)}.${s(e.table)}`,i=_``;switch(t.enabled_mode){case"ORIGIN":i=_`alter table ${a} enable trigger ${s(e.name)};`;break;case"DISABLED":i=_`alter table ${a} disable trigger ${s(e.name)};`;break;case"REPLICA":case"ALWAYS":i=_`alter table ${a} enable ${c(t.enabled_mode)} trigger ${s(e.name)};`}let r=t.name&&t.name!==e.name?_`alter trigger ${s(e.name)} on ${a} rename to ${s(t.name)};`:_``;return{sql:_`begin; ${i}; ${r}; commit;`,zod:n.z.void()}},remove:function(e,{cascade:t=!1}={}){let a=_`${s(e.schema)}.${s(e.table)}`;return{sql:_`drop trigger ${s(e.name)} on ${a} ${t?_`cascade`:_``};`,zod:n.z.void()}},zod:eC},types:{list:function({includeArrayTypes:e=!1,includeSystemSchemas:t=!1,includedSchemas:n,excludedSchemas:i,limit:r,offset:o}={}){let s=eF;e||(s=_`${s} and not exists (
      select from pg_type el
      where el.oid = t.typelem
        and el.typarray = t.oid
    )`);let c=E(n,i,t?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return c&&(s=_`${s} and n.nspname ${c}`),r&&(s=_`${s} limit ${l(r)}`),o&&(s=_`${s} offset ${l(o)}`),{sql:s,zod:ew}},zod:ex},version:{retrieve:function(){return{sql:eH,zod:eU}},zod:eU},indexes:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,limit:i,offset:r}={}){let o=_`
    with indexes as (${B})
    select *
    from indexes
  `,s=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return s&&(o=_`${o} where schema ${s}`),i&&(o=_`${o} limit ${l(i)}`),r&&(o=_`${o} offset ${l(r)}`),{sql:o,zod:X}},retrieve:function({id:e}){return{sql:_`
    with indexes as (${B})
    select *
    from indexes
    where id = ${l(e)};
  `,zod:J}},zod:G},columnPrivileges:{list:function({includeSystemSchemas:e=!1,includedSchemas:t,excludedSchemas:n,columnIds:i,limit:r,offset:o}={}){let s=_`
  with column_privileges as (${u})
  select *
  from column_privileges
  `,c=[],d=E(t,n,e?void 0:a.DEFAULT_SYSTEM_SCHEMAS);return d&&c.push(_`relation_schema ${d}`),i?.length&&c.push(_`column_id in (${p(i.map(l),",")})`),c.length>0&&(s=_`${s} where ${p(c," and ")}`),r&&(s=_`${s} limit ${l(r)}`),o&&(s=_`${s} offset ${l(o)}`),{sql:s,zod:N}},grant:function(e){return{sql:_`
do $$
declare
  col record;
begin
${p(e.map(({privilegeType:e,columnId:t,grantee:n,isGrantable:a})=>{let[i,r]=t.split(".");return _`
select *
from pg_attribute a
where a.attrelid = ${l(i)}
  and a.attnum = ${l(r)}
into col;
execute format(
  'grant ${c(e)} (%I) on %s to ${"public"===n.toLowerCase()?_`public`:s(n)} ${a?_`with grant option`:_``}',
  col.attname,
  col.attrelid::regclass
);`}),"\n")}
end $$;
`}},revoke:function(e){return{sql:_`
do $$
declare
  col record;
begin
${p(e.map(({privilegeType:e,columnId:t,grantee:n})=>{let[a,i]=t.split(".");return _`
select *
from pg_attribute a
where a.attrelid = ${l(a)}
  and a.attnum = ${l(i)}
into col;
execute format(
  'revoke ${c(e)} (%I) on %s from ${"public"===n.toLowerCase()?_`public`:s(n)}',
  col.attname,
  col.attrelid::regclass
);`}),"\n")}
end $$;
`}},zod:f},query:e7}],850036)}]);