(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,892277,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(837710),i=e.i(253214),s=e.i(710483),r=e.i(392491);let o=({onClose:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(i.DialogHeader,{children:(0,t.jsx)(i.DialogTitle,{children:"Schemas managed by Supabase"})}),(0,t.jsx)(i.DialogSectionSeparator,{}),(0,t.jsxs)(i.DialogSection,{className:"space-y-2 prose",children:[(0,t.jsx)("p",{className:"text-sm",children:"The following schemas are managed by Supabase and are currently protected from write access through the dashboard."}),(0,t.jsx)("div",{className:"flex flex-wrap gap-1",children:r.INTERNAL_SCHEMAS.map(e=>(0,t.jsx)("code",{className:"text-xs",children:e},e))}),(0,t.jsx)("p",{className:"text-sm mt-4!",children:"These schemas are critical to the functionality of your Supabase project and hence we highly recommend not altering them."}),(0,t.jsx)("p",{className:"text-sm",children:"You can, however, still interact with those schemas through the SQL Editor although we advise you only do so if you know what you are doing."})]}),(0,t.jsx)(i.DialogFooter,{children:(0,t.jsx)("div",{className:"flex items-center justify-end space-x-2",children:(0,t.jsx)(n.Button,{type:"default",onClick:e,children:"Understood"})})})]});e.s(["ProtectedSchemaWarning",0,({size:e="md",schema:l,entity:c})=>{let[d,u]=(0,a.useState)(!1),{isSchemaLocked:p,reason:m,fdwType:_}=(0,r.useIsProtectedSchema)({schema:l});return p?(0,t.jsx)(s.Admonition,{showIcon:"sm"!==e,layout:"sm"===e?"vertical":"horizontal",type:"note",title:"sm"===e?"Viewing protected schema":`Viewing ${c} from a protected schema`,description:"fdw"===m&&"iceberg"===_?(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is used by Supabase to connect to analytics buckets and is read-only through the dashboard."]}):"fdw"===m&&"s3_vectors"===_?(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is used by Supabase to connect to vector buckets and is read-only through the dashboard."]}):(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is managed by Supabase and is read-only through the dashboard."]}),actions:("fdw"!==m||"iceberg"!==_&&"s3_vectors"!==_)&&(0,t.jsxs)(i.Dialog,{open:d,onOpenChange:u,children:[(0,t.jsx)(i.DialogTrigger,{asChild:!0,children:(0,t.jsx)(n.Button,{type:"default",size:"tiny",onClick:()=>u(!0),children:"Learn more"})}),(0,t.jsx)(i.DialogContent,{children:(0,t.jsx)(o,{onClose:()=>u(!1)})})]})}):null}])},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
    with base_table_info as (
        select
            c.oid::int8 as id,
            nc.nspname as schema,
            c.relname as name,
            c.relkind,
            c.relrowsecurity as rls_enabled,
            c.relforcerowsecurity as rls_forced,
            c.relreplident,
            c.relowner,
            obj_description(c.oid) as comment,
            fs.srvname as foreign_server_name,
            fdw.fdwname as foreign_data_wrapper_name,
            fdw_handler.proname as foreign_data_wrapper_handler
        from pg_class c
        join pg_namespace nc on nc.oid = c.relnamespace
        left join pg_foreign_table ft on ft.ftrelid = c.oid
        left join pg_foreign_server fs on fs.oid = ft.ftserver
        left join pg_foreign_data_wrapper fdw on fdw.oid = fs.srvfdw
        left join pg_proc fdw_handler on fdw.fdwhandler = fdw_handler.oid
        where c.oid = ${e}
            and not pg_is_other_temp_schema(nc.oid)
            and (
                pg_has_role(c.relowner, 'USAGE')
                or has_table_privilege(
                    c.oid,
                    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
                )
                or has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
            )
    ),
    table_stats as (
        select
            b.id,
            case
                when b.relreplident = 'd' then 'DEFAULT'
                when b.relreplident = 'i' then 'INDEX'
                when b.relreplident = 'f' then 'FULL'
                else 'NOTHING'
            end as replica_identity,
            pg_total_relation_size(format('%I.%I', b.schema, b.name))::int8 as bytes,
            pg_size_pretty(pg_total_relation_size(format('%I.%I', b.schema, b.name))) as size,
            pg_stat_get_live_tuples(b.id) as live_rows_estimate,
            pg_stat_get_dead_tuples(b.id) as dead_rows_estimate
        from base_table_info b
        where b.relkind in ('r', 'p')
    ),
    primary_keys as (
        select
            i.indrelid as table_id,
            jsonb_agg(
                jsonb_build_object(
                    'schema', n.nspname,
                    'table_name', c.relname,
                    'table_id', i.indrelid::int8,
                    'name', a.attname
                )
                order by array_position(i.indkey, a.attnum)
            ) as primary_keys
        from pg_index i
        join pg_class c on i.indrelid = c.oid
        join pg_namespace n on c.relnamespace = n.oid
		join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
        where i.indisprimary
        group by i.indrelid
    ),
    index_cols as (
        select
            i.indrelid as table_id,
            i.indkey,
            array_agg(
                a.attname
                order by array_position(i.indkey, a.attnum)
            ) as columns
        from pg_index i
        join pg_class c on i.indrelid = c.oid
        join pg_attribute a on a.attrelid = c.oid
            and a.attnum = any(i.indkey)
        where i.indisunique
            and i.indisprimary = false
        group by i.indrelid, i.indkey
    ),
    unique_indexes as (
        select
            ic.table_id,
            jsonb_agg(
                jsonb_build_object(
                    'schema', n.nspname,
                    'table_name', c.relname,
                    'table_id', ic.table_id::int8,
                    'columns', ic.columns
                )
            ) as unique_indexes
        from index_cols ic
        join pg_class c on c.oid = ic.table_id
        join pg_namespace n on n.oid = c.relnamespace
        group by ic.table_id
    ),
    relationships as (
        select
            c.conrelid as source_id,
            c.confrelid as target_id,
            jsonb_build_object(
                'id', c.oid::int8,
                'constraint_name', c.conname,
                'deletion_action', c.confdeltype,
                'update_action', c.confupdtype,
                'source_schema', nsa.nspname,
                'source_table_name', csa.relname,
                'source_column_name', sa.attname,
                'target_table_schema', nta.nspname,
                'target_table_name', cta.relname,
                'target_column_name', ta.attname
            ) as rel_info
        from pg_constraint c
        join pg_class csa on c.conrelid = csa.oid
        join pg_namespace nsa on csa.relnamespace = nsa.oid
        join pg_attribute sa on (sa.attrelid = c.conrelid and sa.attnum = any(c.conkey))
        join pg_class cta on c.confrelid = cta.oid
        join pg_namespace nta on cta.relnamespace = nta.oid
        join pg_attribute ta on (ta.attrelid = c.confrelid and ta.attnum = any(c.confkey))
        where c.contype = 'f'
    ),
    columns as (
        select
            a.attrelid as table_id,
            jsonb_agg(jsonb_build_object(
                'id', (a.attrelid || '.' || a.attnum),
                'table_id', c.oid::int8,
                'schema', nc.nspname,
                'table', c.relname,
                'ordinal_position', a.attnum,
                'name', a.attname,
                'default_value', case
                    when a.atthasdef then pg_get_expr(ad.adbin, ad.adrelid)
                    else null
                end,
                'data_type', case
                    when t.typtype = 'd' then
                        case
                            when bt.typelem <> 0::oid and bt.typlen = -1 then 'ARRAY'
                            when nbt.nspname = 'pg_catalog' then format_type(t.typbasetype, null)
                            else 'USER-DEFINED'
                        end
                    else
                        case
                            when t.typelem <> 0::oid and t.typlen = -1 then 'ARRAY'
                            when nt.nspname = 'pg_catalog' then format_type(a.atttypid, null)
                            else 'USER-DEFINED'
                        end
                end,
                'format', case
                    when t.typtype = 'e' then
                        case
                            when nt.nspname <> 'public' then concat(nt.nspname, '.', coalesce(bt.typname, t.typname))
                            else coalesce(bt.typname, t.typname)
                        end
                    else
                        coalesce(bt.typname, t.typname)
                end,
                'is_identity', a.attidentity in ('a', 'd'),
                'identity_generation', case a.attidentity
                    when 'a' then 'ALWAYS'
                    when 'd' then 'BY DEFAULT'
                    else null
                end,
                'is_generated', a.attgenerated in ('s'),
                'is_nullable', not (a.attnotnull or t.typtype = 'd' and t.typnotnull),
                'is_updatable', (
                    b.relkind in ('r', 'p') or
                    (b.relkind in ('v', 'f') and pg_column_is_updatable(b.id, a.attnum, false))
                ),
                'is_unique', uniques.table_id is not null,
                'check', check_constraints.definition,
                'comment', col_description(c.oid, a.attnum),
                'enums', coalesce(
                    (
                        select jsonb_agg(e.enumlabel order by e.enumsortorder)
                        from pg_catalog.pg_enum e
                        where e.enumtypid = coalesce(bt.oid, t.oid)
                            or e.enumtypid = coalesce(bt.typelem, t.typelem)
                    ),
                    '[]'::jsonb
                )
            ) order by a.attnum) as columns
        from pg_attribute a
        join base_table_info b on a.attrelid = b.id
        join pg_class c on a.attrelid = c.oid
        join pg_namespace nc on c.relnamespace = nc.oid
        left join pg_attrdef ad on (a.attrelid = ad.adrelid and a.attnum = ad.adnum)
        join pg_type t on a.atttypid = t.oid
        join pg_namespace nt on t.typnamespace = nt.oid
        left join pg_type bt on (t.typtype = 'd' and t.typbasetype = bt.oid)
        left join pg_namespace nbt on bt.typnamespace = nbt.oid
        left join (
            select
                conrelid as table_id,
                conkey[1] as ordinal_position
            from pg_catalog.pg_constraint
            where contype = 'u' and cardinality(conkey) = 1
            group by conrelid, conkey[1]
        ) as uniques on uniques.table_id = a.attrelid and uniques.ordinal_position = a.attnum
        left join (
            select distinct on (conrelid, conkey[1])
                conrelid as table_id,
                conkey[1] as ordinal_position,
                substring(
                    pg_get_constraintdef(oid, true),
                    8,
                    length(pg_get_constraintdef(oid, true)) - 8
                ) as definition
            from pg_constraint
            where contype = 'c' and cardinality(conkey) = 1
            order by conrelid, conkey[1], oid asc
        ) as check_constraints on check_constraints.table_id = a.attrelid
                            and check_constraints.ordinal_position = a.attnum
        where a.attnum > 0
        and not a.attisdropped
        group by a.attrelid
    )
    select
        case b.relkind
            when 'r' then jsonb_build_object(
                'entity_type', b.relkind,
                'id', b.id,
                'schema', b.schema,
                'name', b.name,
                'rls_enabled', b.rls_enabled,
                'rls_forced', b.rls_forced,
                'replica_identity', ts.replica_identity,
                'bytes', ts.bytes,
                'size', ts.size,
                'live_rows_estimate', ts.live_rows_estimate,
                'dead_rows_estimate', ts.dead_rows_estimate,
                'comment', b.comment,
                'primary_keys', coalesce(pk.primary_keys, '[]'::jsonb),
                'unique_indexes', coalesce(ui.unique_indexes, '[]'::jsonb),
                'relationships', coalesce(
                    (select jsonb_agg(r.rel_info)
                    from relationships r
                    where r.source_id = b.id or r.target_id = b.id),
                    '[]'::jsonb
                ),
                'columns', coalesce(c.columns, '[]'::jsonb)
            )
            when 'p' then jsonb_build_object(
                'entity_type', b.relkind,
                'id', b.id,
                'schema', b.schema,
                'name', b.name,
                'rls_enabled', b.rls_enabled,
                'rls_forced', b.rls_forced,
                'replica_identity', ts.replica_identity,
                'bytes', ts.bytes,
                'size', ts.size,
                'live_rows_estimate', ts.live_rows_estimate,
                'dead_rows_estimate', ts.dead_rows_estimate,
                'comment', b.comment,
                'primary_keys', coalesce(pk.primary_keys, '[]'::jsonb),
                'unique_indexes', coalesce(ui.unique_indexes, '[]'::jsonb),
                'relationships', coalesce(
                    (select jsonb_agg(r.rel_info)
                    from relationships r
                    where r.source_id = b.id or r.target_id = b.id),
                    '[]'::jsonb
                ),
                'columns', coalesce(c.columns, '[]'::jsonb)
            )
            when 'v' then jsonb_build_object(
                'entity_type', b.relkind,
                'id', b.id,
                'schema', b.schema,
                'name', b.name,
                'is_updatable', (pg_relation_is_updatable(b.id, false) & 20) = 20,
                'comment', b.comment,
                'columns', coalesce(c.columns, '[]'::jsonb)
            )
            when 'm' then jsonb_build_object(
                'entity_type', b.relkind,
                'id', b.id,
                'schema', b.schema,
                'name', b.name,
                'is_populated', true,
                'comment', b.comment,
                'columns', coalesce(c.columns, '[]'::jsonb)
            )
            when 'f' then jsonb_build_object(
                'entity_type', b.relkind,
                'id', b.id,
                'schema', b.schema,
                'name', b.name,
                'comment', b.comment,
                'foreign_server_name', b.foreign_server_name,
                'foreign_data_wrapper_name', b.foreign_data_wrapper_name,
                'foreign_data_wrapper_handler', b.foreign_data_wrapper_handler,
                'columns', coalesce(c.columns, '[]'::jsonb)
            )
        end as entity
    from base_table_info b
    left join table_stats ts on b.id = ts.id
    left join primary_keys pk on b.id = pk.table_id
    left join unique_indexes ui on b.id = ui.table_id
    left join columns c on b.id = c.table_id;
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:i})=>[`CREATE TABLE ${(0,t.ident)(i)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(i)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(i)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),i=e.i(242882),s=e.i(938343),r=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},i){if(!n)throw Error("id is required");let s=a({id:n}),{result:l}=await (0,r.executeSql)({projectRef:e,connectionString:t,sql:s,queryKey:["table-editor",n]},i);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:s.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...s}={})=>(0,i.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...s})],34479)},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),a=e.i(242882),n=e.i(818135),i=e.i(714403);let s=t.default.tablePrivileges.list();async function r({projectRef:e,connectionString:t},a){let{result:n}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:s.sql,queryKey:["table-privileges"]},a);return n}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:n.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...s}={})=>(0,a.useQuery)({queryKey:n.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:a})=>r({projectRef:e,connectionString:t},a),enabled:i&&void 0!==e,...s})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],a=["SELECT","INSERT","UPDATE","DELETE"],n={anon:[...a],authenticated:[...a],service_role:[...a]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,a,"DEFAULT_DATA_API_PRIVILEGES",0,n,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>a.includes(e)])},310959,e=>{"use strict";var t=e.i(479084),a=e.i(721490);let n=10240,i=50,s=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],r=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(r),l=new Set([...s,...r,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,i,"MAX_CHARACTERS",0,n,"getTableRowsSql",0,({table:e,filters:r=[],sorts:c=[],page:d,limit:u,maxCharacters:p=n,maxArraySize:m=i,sortExcludedColumns:_=[]})=>{if(!e||!e.columns)return t.safeSql``;let b=new a.Query().from(e.name,e.schema).select();r.forEach(t=>{let a=e.columns?.find(e=>e.name===t.column),n=!a||s.includes(a.format);b=b.filter(t.column,t.operator,n||""!==t.value?t.value:null)});let f=e.live_rows_estimate||0;if(0===c.length&&f<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let a=e.primary_keys?.map(e=>e.name);if(a&&a.length>0&&!a.every(e=>t.includes(e)))return a;if(e.columns&&e.columns.length>0){let a=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(a.length>0)return[a[0].name]}return[]})(e,{excludedColumns:_});t.length>0&&t.forEach(t=>{b=b.order(e.name,t)})}else c.forEach(e=>{b=b.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:h,to:y}=function(e,t=100){let a=e?e*t:0;return{from:a,to:e?a+t-1:t-1}}((d??1)-1,u),g=t.safeSql`with _base_query as (${b.range(h,y).toSql({isCTE:!1,isFinal:!1})})`,w=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),S=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),E=w.map(({name:e})=>{let a=(0,t.ident)(e);return S.includes(e)?t.safeSql`case
        when octet_length(${a}::text) > ${(0,t.literal)(p)} 
        then left(${a}::text, ${(0,t.literal)(p)}) || '...'
        else ${a}::text
      end as ${a}`:a});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:a})=>{let n=E.findIndex(a=>a===(0,t.ident)(e)),i=o.has(a),s=i?t.safeSql`::${(0,t.keyword)(a)}[]`:t.safeSql`::text[]`,r=i?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);n>=0&&(E[n]=t.safeSql`
        case 
          when octet_length(${l}::text) > ${(0,t.literal)(p)} 
          then
            case
              when array_ndims(${l}) = 1
              then
                (select array_cat(${l}[1:${(0,t.literal)(m)}]${s}, ${r}${s}))${s}
              else
                ${l}[1:${(0,t.literal)(m)}]${s}
            end
          else ${l}${s}
        end
      `)});let j=(0,t.joinSqlFragments)(E,","),q=new a.Query().from("_base_query").select(j);return t.safeSql`${g}
  ${q.toSql({isCTE:!0,isFinal:!0})}`}])},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:a,...n}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:a?.role,...n}],tableRowsCount:(e,{table:t,...a}={})=>["projects",e,"table-rows",t?.id,"count",a],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),a=e.i(962217);e.s(["formatFilterValue",0,function(e,a){let n=e.columns.find(e=>e.name==a.column);if(n&&(0,t.isNumericalColumn)(n.format)){let e=Number(a.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(a.value)}return a.value},"getPrimaryKeys",0,function({table:e}){if(!(0,a.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),a=e.i(356003),n=e.i(989567),i=e.i(389959),s=e.i(85626),r=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),d=e.i(940562),u=e.i(721490),p=e.i(310959),m=e.i(242882);e.i(128328);var _=e.i(86086),b=e.i(790819),f=e.i(46974),h=e.i(311827),y=e.i(234745),g=e.i(714403),w=e.i(962217),S=e.i(48189),E=e.i(908937),j=e.i(201461),q=e.i(237948);async function v(e,t=3,a=1e3){for(let n=0;n<=t;n++)try{return await e()}catch(e){if(429===(e instanceof q.ResponseError?e.code:e.status)&&n<t){let t=function(e){if(e instanceof q.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),i=t?1e3*t:a*Math.pow(2,n);await (0,S.timeout)(i);continue}throw e}throw Error("Max retries reached without success")}let $=({table:e,filters:t=[],sorts:a=[]})=>{let n,i,s,r,o,l=new u.Query,d=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),p=l.from(e.name,e.schema??void 0).select(d.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...d],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let a=(0,f.formatFilterValue)(e,t);p=p.filter(t.column,t.operator,a)});let m=!1,{cursorPaginationEligible:_,cursorPaginationNonEligible:b}=(n=[],i=[],(s=e.primaryKey)&&n.push(s),r=e.uniqueIndexes,(o=r?.filter(t=>t.every(t=>{let a=e.columns.find(e=>e.name===t);return!!a&&!a.isNullable})))&&n.push(...o),i.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:n,cursorPaginationNonEligible:i}),y=e.type===h.ENTITY_TYPE.TABLE||e.type===h.ENTITY_TYPE.PARTITIONED_TABLE||e.type===h.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===a.length)_.length>0?(m=_[0],_[0].forEach(t=>{p=p.order(e.name,t)})):(b.length>0&&(p=p.order(e.name,b[0])),y&&(p=p.order(e.name,"ctid")));else{a.forEach(e=>{p=p.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=_[0];if(t){let n=new Set(a.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!n.has(e)).forEach(t=>{p=p.order(e.name,t)})}else y&&(p=p.order(e.name,"ctid"))}return{sql:p,cursorColumns:m}},T=async({projectRef:e,connectionString:t,table:a,filters:n=[],sorts:i=[],roleImpersonationState:s,progressCallback:r})=>{if(_.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=$({table:a,sorts:i,filters:n});if(c){let a=null;for(;;){let n=l.clone();a&&(n=n.filter(c,">",c.map(e=>a[e])));let i=(0,E.wrapWithRoleImpersonation)(n.range(0,499).toSql(),s);try{let{result:n}=await v(async()=>(0,g.executeSql)({projectRef:e,connectionString:t,sql:i}));for(let e of(o.push(...n),r?.(o.length),a={},c))a[e]=n[n.length-1]?.[e];if(n.length<500)break;await (0,S.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let a=-1;for(;;){let n=500*(a+=1),i=(a+1)*500-1,c=(0,E.wrapWithRoleImpersonation)(l.range(n,i).toSql(),s);try{let{result:a}=await v(async()=>(0,g.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...a),r?.(o.length),a.length<500)break;await (0,S.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[d.ROLE_IMPERSONATION_NO_RESULTS])};async function R({queryClient:e,projectRef:t,connectionString:a,tableId:n,roleImpersonationState:i,filters:s,sorts:o,limit:c,page:d,preflightCheck:u=!1},m){let _=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:n});if(!_)throw Error("Table not found");let b=(0,r.parseSupaTable)(_),f=s?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),h=(0,w.isMsSqlForeignTable)(_)?Array.from(new Set(f)):void 0,S=(0,E.wrapWithRoleImpersonation)((0,p.getTableRowsSql)({table:_,filters:s,sorts:o,limit:c,page:d,sortExcludedColumns:h}),i);try{let{result:e}=await (0,g.executeSql)({projectRef:t,connectionString:a,sql:S,queryKey:["table-rows",b?.id],isRoleImpersonationEnabled:(0,j.isRoleImpersonationEnabled)(i?.role),preflightCheck:u},m);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,y.handleError)(e)}}function x(e,{projectRef:t,connectionString:a,tableId:n,readReplicaIdentifier:i,...s}){return e.fetchQuery({queryKey:b.tableRowKeys.tableRows(t,{table:{id:n},readReplicaIdentifier:i,...s}),queryFn:({signal:i})=>R({queryClient:e,projectRef:t,connectionString:a,tableId:n,...s},i)})}e.s(["executeWithRetry",0,v,"fetchAllTableRows",0,T,"getAllTableRowsSql",0,$,"prefetchTableRows",0,x,"useTableRowsQuery",0,({projectRef:e,tableId:t,...n},{enabled:i=!0,...s}={})=>{let r=(0,a.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:d,...u}=n;return(0,m.useQuery)({queryKey:b.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...u}),queryFn:({signal:a})=>R({queryClient:r,projectRef:e,connectionString:l,tableId:t,...n},a),enabled:i&&void 0!==e&&void 0!==t&&(!_.IS_PLATFORM||void 0!==l),...s})}],70756);var A=e.i(635494),P=e.i(636047);function I({queryClient:e,projectRef:t,connectionString:a,readReplicaIdentifier:n,id:i,sorts:s,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:i}).then(l=>{if(l){let d=(0,r.parseSupaTable)(l),{sorts:u=[],filters:p=[]}=(0,r.loadTableEditorStateFromLocalStorage)(t,l.id)??{};x(e,{projectRef:t,connectionString:a,readReplicaIdentifier:n,tableId:i,sorts:s??(0,r.formatSortURLParams)(d.name,u),filters:o??(0,r.formatFilterURLParams)(p),page:1,limit:P.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function k(){let e=(0,n.useRouter)(),t=(0,a.useQueryClient)(),{data:s}=(0,A.useSelectedProjectQuery)(),{connectionString:r,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,j.useRoleImpersonationStateSnapshot)();return(0,i.useCallback)(({id:a,filters:n,sorts:i})=>{let o=a?Number(a):void 0;!s||!o||isNaN(o)||(e.prefetch(`/project/${s.ref}/editor/${o}`),I({queryClient:t,projectRef:s.ref,connectionString:r,readReplicaIdentifier:l,id:o,sorts:i,filters:n,roleImpersonationState:c}).catch(()=>{}))},[r,l,s,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:a,sorts:n,filters:i,href:r,children:o,...l}){let c=k();return(0,t.jsx)(s.default,{href:r||`/project/${e}/editor/${a}`,prefetcher:()=>c({id:a,sorts:n,filters:i}),...l,children:o})},"prefetchEditorTablePage",0,I,"usePrefetchEditorTablePage",0,k],941381);var L=e.i(972089),C=e.i(462142);let N=({projectRef:e,schemaName:t},{enabled:a=!0}={})=>{let n=a&&!!e&&!!t,{data:s,isPending:r,isError:o}=(0,C.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:n,select:({db_schema:e})=>e}),l=(0,i.useMemo)(()=>s?(0,C.parseDbSchemaString)(s):[],[s]);return!n||r?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,N],963203);var D=e.i(84001);let F=[],U={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:a,tableNames:n=F},{enabled:s=!0,...r}={})=>{let o=(0,i.useMemo)(()=>new Set(n.filter(e=>"string"==typeof e&&e.length>0)),[n]),l=o.size>0,c=N({projectRef:e,schemaName:a},{enabled:s}),d=c.isSuccess&&!0===c.data,u=s&&l,p=(0,L.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:u,...r});return(0,i.useMemo)(()=>{if(!s||"pending"===c.status||u&&p.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||u&&p.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:U,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=d?((e,t,a)=>{if(!e)return{};let n={};return e.forEach(e=>{if(e.schema===t&&a.has(e.name)){var i;let t;n[e.name]=(i=e.privileges,t={anon:[],authenticated:[],service_role:[]},i.forEach(e=>{let{grantee:a,privilege_type:n}=e;(0,D.isApiAccessRole)(a)&&(0,D.isApiPrivilegeType)(n)&&t[a].push(n)}),t)}}),n})(p.data,a,o):{};return o.forEach(a=>{if(!d){e[a]={apiAccessType:"none"};return}let n=t[a]??{anon:[],authenticated:[],service_role:[]},i=n.anon.length>0||n.authenticated.length>0||n.service_role.length>0;e[a]=i?{apiAccessType:"access",grantStatus:D.API_ACCESS_ROLES.every(e=>D.API_PRIVILEGE_TYPES.every(t=>n[e].includes(t)))?"granted":"custom",privileges:n}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[s,u,l,c.status,d,p.isPending,p.isError,p.data,a,o])}],954707)},188698,e=>{"use strict";e.s(["getConnectionStrings",0,({connectionInfo:e,poolingInfo:t,metadata:a})=>{let n=t?.connectionString.includes("options=reference"),{projectRef:i}=a,s="[YOUR-PASSWORD]",r=e.db_user,o=e.db_port,l=e.db_host,c=e.db_name,d=t?.db_user,u=t?.db_port,p=t?.db_host,m=t?.db_name,_=n?`psql "postgresql://${r}:${s}@${l}:${o}/${c}"`:`psql -h ${l} -p ${o} -d ${c} -U ${r}`,b=`postgresql://${r}:${s}@${l}:${o}/${c}`,f=`DATABASE_URL=${b}`,h=`jdbc:postgresql://${l}:${o}/${c}?user=${r}&password=${s}`,y=`{
  "ConnectionStrings": {
    "DefaultConnection": "Host=${l};Database=${c};Username=${r};Password=${s};SSL Mode=Require;Trust Server Certificate=true"
  }
}`,g=`{
  "ConnectionStrings": {
    "DefaultConnection": "User Id=${d};Password=${s};Server=${p};Port=${u};Database=${m}${n?`;Options='reference=${i}'`:""}"
  }
}`,w=`DATABASE_URL=${b}`,S=n?`psql "postgresql://${d}:${s}@${p}:${u}/${m}?options=reference%3D${i}"`:`psql -h ${p} -p ${u} -d ${m} -U ${d}`,E=t?.connectionString??"",j=`DATABASE_URL=${t?.connectionString}`,q=`user=${d} 
password=${s} 
host=${p}
port=${u}
dbname=${m}${n?`options=reference=${i}`:""}`,v=`jdbc:postgresql://${p}:${u}/${m}?user=${d}${n?`&options=reference%3D${i}`:""}&password=${s}`;return{direct:{psql:_,uri:b,golang:f,jdbc:h,dotnet:y,nodejs:w,php:f,python:f,sqlalchemy:`user=${r} 
password=${s} 
host=${l} 
port=${o} 
dbname=${c}`},pooler:{psql:S,uri:E,golang:q,jdbc:v,dotnet:g,nodejs:j,php:q,python:q,sqlalchemy:`user=${d} 
password=${s} 
host=${p} 
port=${u} 
dbname=${m}`}}}])},487164,e=>{"use strict";e.i(850036);var t=e.i(538892),a=e.i(242882),n=e.i(246230),i=e.i(714403);async function s({projectRef:e,connectionString:a,id:n},r){if(!n)throw Error("id is required");let o=(0,t.getTableDefinitionSql)({id:n}),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:a,sql:o,queryKey:["table-definition",n]},r);return l[0].definition.trim()}e.s(["getTableDefinition",0,s,"useTableDefinitionQuery",0,({projectRef:e,connectionString:t,id:i},{enabled:r=!0,...o}={})=>(0,a.useQuery)({queryKey:n.databaseKeys.tableDefinition(e,i),queryFn:({signal:a})=>s({projectRef:e,connectionString:t,id:i},a),enabled:r&&void 0!==e&&void 0!==i&&!isNaN(i),...o})])},274575,e=>{"use strict";var t=e.i(38429),a=e.i(355901),n=e.i(234745);async function i({ref:e,region:t,services:a=["postgresql"],source_notification_id:s}){let{data:r,error:o}=await (0,n.post)("/platform/projects/{ref}/restart-services",{params:{path:{ref:e}},body:{restartRequest:{region:t,services:a,source_notification_id:s}}});return o&&(0,n.handleError)(o),r}e.s(["useProjectRestartServicesMutation",0,({onSuccess:e,onError:n,...s}={})=>(0,t.useMutation)({mutationFn:e=>i(e),async onSuccess(t,a,n){await e?.(t,a,n)},async onError(e,t,i){void 0===n?a.toast.error(`Failed to restart project: ${e.message}`):n(e,t,i)},...s})])}]);