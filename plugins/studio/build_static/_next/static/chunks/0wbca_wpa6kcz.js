(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,892277,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(837710),i=e.i(253214),r=e.i(710483),s=e.i(392491);let o=({onClose:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(i.DialogHeader,{children:(0,t.jsx)(i.DialogTitle,{children:"Schemas managed by Supabase"})}),(0,t.jsx)(i.DialogSectionSeparator,{}),(0,t.jsxs)(i.DialogSection,{className:"space-y-2 prose",children:[(0,t.jsx)("p",{className:"text-sm",children:"The following schemas are managed by Supabase and are currently protected from write access through the dashboard."}),(0,t.jsx)("div",{className:"flex flex-wrap gap-1",children:s.INTERNAL_SCHEMAS.map(e=>(0,t.jsx)("code",{className:"text-xs",children:e},e))}),(0,t.jsx)("p",{className:"text-sm mt-4!",children:"These schemas are critical to the functionality of your Supabase project and hence we highly recommend not altering them."}),(0,t.jsx)("p",{className:"text-sm",children:"You can, however, still interact with those schemas through the SQL Editor although we advise you only do so if you know what you are doing."})]}),(0,t.jsx)(i.DialogFooter,{children:(0,t.jsx)("div",{className:"flex items-center justify-end space-x-2",children:(0,t.jsx)(n.Button,{type:"default",onClick:e,children:"Understood"})})})]});e.s(["ProtectedSchemaWarning",0,({size:e="md",schema:l,entity:c})=>{let[d,u]=(0,a.useState)(!1),{isSchemaLocked:m,reason:p,fdwType:b}=(0,s.useIsProtectedSchema)({schema:l});return m?(0,t.jsx)(r.Admonition,{showIcon:"sm"!==e,layout:"sm"===e?"vertical":"horizontal",type:"note",title:"sm"===e?"Viewing protected schema":`Viewing ${c} from a protected schema`,description:"fdw"===p&&"iceberg"===b?(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is used by Supabase to connect to analytics buckets and is read-only through the dashboard."]}):"fdw"===p&&"s3_vectors"===b?(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is used by Supabase to connect to vector buckets and is read-only through the dashboard."]}):(0,t.jsxs)("p",{children:["The ",(0,t.jsx)("code",{className:"text-code-inline",children:l})," schema is managed by Supabase and is read-only through the dashboard."]}),actions:("fdw"!==p||"iceberg"!==b&&"s3_vectors"!==b)&&(0,t.jsxs)(i.Dialog,{open:d,onOpenChange:u,children:[(0,t.jsx)(i.DialogTrigger,{asChild:!0,children:(0,t.jsx)(n.Button,{type:"default",size:"tiny",onClick:()=>u(!0),children:"Learn more"})}),(0,t.jsx)(i.DialogContent,{children:(0,t.jsx)(o,{onClose:()=>u(!1)})})]})}):null}])},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:i,onCancel:r,title:s="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:c="Keep editing",size:d="tiny"})=>{let u=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(u.current=!1)},[e]);let m=(0,a.useCallback)(()=>{u.current=!0,i()},[i]),p=(0,a.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}r()}},[r]);return(0,t.jsx)(n.AlertDialog,{open:e,onOpenChange:p,children:(0,t.jsxs)(n.AlertDialogContent,{size:d,children:[(0,t.jsxs)(n.AlertDialogHeader,{children:[(0,t.jsx)(n.AlertDialogTitle,{children:s}),null!=o&&(0,t.jsx)(n.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(n.AlertDialogFooter,{children:[(0,t.jsx)(n.AlertDialogCancel,{children:c}),(0,t.jsx)(n.AlertDialogAction,{variant:"danger",onClick:m,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:n})=>{let[i,r]=(0,t.useState)(!1),s=(0,a.default)(e),o=(0,a.default)(n),l=(0,t.useCallback)(()=>{s.current()?r(!0):o.current()},[]),c=(0,t.useCallback)(e=>{e||l()},[l]),d=(0,t.useCallback)(()=>{r(!1),o.current()},[]),u=(0,t.useCallback)(()=>{r(!1)},[]),m=(0,t.useMemo)(()=>({visible:i,onClose:d,onCancel:u}),[i,d,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:c,modalProps:m}),[l,c,m])}])},931078,(e,t,a)=>{var n=e.r(358849),i=e.r(854059),r=e.r(225083),s=e.r(145948),o=e.r(775484),l=e.r(904216),c=e.r(85057),d=e.r(562081),u=Object.prototype.hasOwnProperty;t.exports=function(e){if(null==e)return!0;if(o(e)&&(s(e)||"string"==typeof e||"function"==typeof e.splice||l(e)||d(e)||r(e)))return!e.length;var t=i(e);if("[object Map]"==t||"[object Set]"==t)return!e.size;if(c(e))return!n(e).length;for(var a in e)if(u.call(e,a))return!1;return!0}},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},847278,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),i=e.i(355901),r=e.i(138658),s=e.i(915993),o=e.i(714403),l=e.i(938343);async function c({projectRef:e,connectionString:a,id:n,name:i,schema:r,payload:s}){let{sql:l}=t.default.tables.update({id:n,name:i,schema:r},s),{result:d}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:l,queryKey:["table","update",n]});return d}e.s(["updateTable",0,c,"useTableUpdateMutation",0,({onSuccess:e,onError:t,...o}={})=>{let d=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>c(e),async onSuccess(t,a,n){let{projectRef:i,schema:o,id:c}=a;await Promise.all([d.invalidateQueries({queryKey:l.tableEditorKeys.tableEditor(i,c)}),d.invalidateQueries({queryKey:r.tableKeys.list(i,o)}),d.invalidateQueries({queryKey:s.lintKeys.lint(i)})]),await e?.(t,a,n)},async onError(e,a,n){void 0===t?i.toast.error(`Failed to update database table: ${e.message}`):t(e,a,n)},...o})}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:i})=>[`CREATE TABLE ${(0,t.ident)(i)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(i)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(i)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),i=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},i){if(!n)throw Error("id is required");let r=a({id:n}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",n]},i);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...r}={})=>(0,i.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),a=e.i(242882),n=e.i(818135),i=e.i(714403);let r=t.default.tablePrivileges.list();async function s({projectRef:e,connectionString:t},a){let{result:n}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:r.sql,queryKey:["table-privileges"]},a);return n}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:n.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...r}={})=>(0,a.useQuery)({queryKey:n.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),enabled:i&&void 0!==e,...r})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],a=["SELECT","INSERT","UPDATE","DELETE"],n={anon:[...a],authenticated:[...a],service_role:[...a]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,a,"DEFAULT_DATA_API_PRIVILEGES",0,n,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>a.includes(e)])},310959,e=>{"use strict";var t=e.i(479084),a=e.i(721490);let n=10240,i=50,r=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],s=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(s),l=new Set([...r,...s,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,i,"MAX_CHARACTERS",0,n,"getTableRowsSql",0,({table:e,filters:s=[],sorts:c=[],page:d,limit:u,maxCharacters:m=n,maxArraySize:p=i,sortExcludedColumns:b=[]})=>{if(!e||!e.columns)return t.safeSql``;let _=new a.Query().from(e.name,e.schema).select();s.forEach(t=>{let a=e.columns?.find(e=>e.name===t.column),n=!a||r.includes(a.format);_=_.filter(t.column,t.operator,n||""!==t.value?t.value:null)});let f=e.live_rows_estimate||0;if(0===c.length&&f<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let a=e.primary_keys?.map(e=>e.name);if(a&&a.length>0&&!a.every(e=>t.includes(e)))return a;if(e.columns&&e.columns.length>0){let a=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(a.length>0)return[a[0].name]}return[]})(e,{excludedColumns:b});t.length>0&&t.forEach(t=>{_=_.order(e.name,t)})}else c.forEach(e=>{_=_.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:h,to:y}=function(e,t=100){let a=e?e*t:0;return{from:a,to:e?a+t-1:t-1}}((d??1)-1,u),g=t.safeSql`with _base_query as (${_.range(h,y).toSql({isCTE:!1,isFinal:!1})})`,w=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),E=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),S=w.map(({name:e})=>{let a=(0,t.ident)(e);return E.includes(e)?t.safeSql`case
        when octet_length(${a}::text) > ${(0,t.literal)(m)} 
        then left(${a}::text, ${(0,t.literal)(m)}) || '...'
        else ${a}::text
      end as ${a}`:a});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:a})=>{let n=S.findIndex(a=>a===(0,t.ident)(e)),i=o.has(a),r=i?t.safeSql`::${(0,t.keyword)(a)}[]`:t.safeSql`::text[]`,s=i?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);n>=0&&(S[n]=t.safeSql`
        case 
          when octet_length(${l}::text) > ${(0,t.literal)(m)} 
          then
            case
              when array_ndims(${l}) = 1
              then
                (select array_cat(${l}[1:${(0,t.literal)(p)}]${r}, ${s}${r}))${r}
              else
                ${l}[1:${(0,t.literal)(p)}]${r}
            end
          else ${l}${r}
        end
      `)});let j=(0,t.joinSqlFragments)(S,","),v=new a.Query().from("_base_query").select(j);return t.safeSql`${g}
  ${v.toSql({isCTE:!0,isFinal:!0})}`}])},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:a,...n}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:a?.role,...n}],tableRowsCount:(e,{table:t,...a}={})=>["projects",e,"table-rows",t?.id,"count",a],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),a=e.i(962217);e.s(["formatFilterValue",0,function(e,a){let n=e.columns.find(e=>e.name==a.column);if(n&&(0,t.isNumericalColumn)(n.format)){let e=Number(a.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(a.value)}return a.value},"getPrimaryKeys",0,function({table:e}){if(!(0,a.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),a=e.i(356003),n=e.i(989567),i=e.i(389959),r=e.i(85626),s=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),d=e.i(940562),u=e.i(721490),m=e.i(310959),p=e.i(242882);e.i(128328);var b=e.i(86086),_=e.i(790819),f=e.i(46974),h=e.i(311827),y=e.i(234745),g=e.i(714403),w=e.i(962217),E=e.i(48189),S=e.i(908937),j=e.i(201461),v=e.i(237948);async function T(e,t=3,a=1e3){for(let n=0;n<=t;n++)try{return await e()}catch(e){if(429===(e instanceof v.ResponseError?e.code:e.status)&&n<t){let t=function(e){if(e instanceof v.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),i=t?1e3*t:a*Math.pow(2,n);await (0,E.timeout)(i);continue}throw e}throw Error("Max retries reached without success")}let q=({table:e,filters:t=[],sorts:a=[]})=>{let n,i,r,s,o,l=new u.Query,d=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),m=l.from(e.name,e.schema??void 0).select(d.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...d],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let a=(0,f.formatFilterValue)(e,t);m=m.filter(t.column,t.operator,a)});let p=!1,{cursorPaginationEligible:b,cursorPaginationNonEligible:_}=(n=[],i=[],(r=e.primaryKey)&&n.push(r),s=e.uniqueIndexes,(o=s?.filter(t=>t.every(t=>{let a=e.columns.find(e=>e.name===t);return!!a&&!a.isNullable})))&&n.push(...o),i.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:n,cursorPaginationNonEligible:i}),y=e.type===h.ENTITY_TYPE.TABLE||e.type===h.ENTITY_TYPE.PARTITIONED_TABLE||e.type===h.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===a.length)b.length>0?(p=b[0],b[0].forEach(t=>{m=m.order(e.name,t)})):(_.length>0&&(m=m.order(e.name,_[0])),y&&(m=m.order(e.name,"ctid")));else{a.forEach(e=>{m=m.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=b[0];if(t){let n=new Set(a.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!n.has(e)).forEach(t=>{m=m.order(e.name,t)})}else y&&(m=m.order(e.name,"ctid"))}return{sql:m,cursorColumns:p}},x=async({projectRef:e,connectionString:t,table:a,filters:n=[],sorts:i=[],roleImpersonationState:r,progressCallback:s})=>{if(b.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=q({table:a,sorts:i,filters:n});if(c){let a=null;for(;;){let n=l.clone();a&&(n=n.filter(c,">",c.map(e=>a[e])));let i=(0,S.wrapWithRoleImpersonation)(n.range(0,499).toSql(),r);try{let{result:n}=await T(async()=>(0,g.executeSql)({projectRef:e,connectionString:t,sql:i}));for(let e of(o.push(...n),s?.(o.length),a={},c))a[e]=n[n.length-1]?.[e];if(n.length<500)break;await (0,E.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let a=-1;for(;;){let n=500*(a+=1),i=(a+1)*500-1,c=(0,S.wrapWithRoleImpersonation)(l.range(n,i).toSql(),r);try{let{result:a}=await T(async()=>(0,g.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...a),s?.(o.length),a.length<500)break;await (0,E.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[d.ROLE_IMPERSONATION_NO_RESULTS])};async function A({queryClient:e,projectRef:t,connectionString:a,tableId:n,roleImpersonationState:i,filters:r,sorts:o,limit:c,page:d,preflightCheck:u=!1},p){let b=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:n});if(!b)throw Error("Table not found");let _=(0,s.parseSupaTable)(b),f=r?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),h=(0,w.isMsSqlForeignTable)(b)?Array.from(new Set(f)):void 0,E=(0,S.wrapWithRoleImpersonation)((0,m.getTableRowsSql)({table:b,filters:r,sorts:o,limit:c,page:d,sortExcludedColumns:h}),i);try{let{result:e}=await (0,g.executeSql)({projectRef:t,connectionString:a,sql:E,queryKey:["table-rows",_?.id],isRoleImpersonationEnabled:(0,j.isRoleImpersonationEnabled)(i?.role),preflightCheck:u},p);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,y.handleError)(e)}}function R(e,{projectRef:t,connectionString:a,tableId:n,readReplicaIdentifier:i,...r}){return e.fetchQuery({queryKey:_.tableRowKeys.tableRows(t,{table:{id:n},readReplicaIdentifier:i,...r}),queryFn:({signal:i})=>A({queryClient:e,projectRef:t,connectionString:a,tableId:n,...r},i)})}e.s(["executeWithRetry",0,T,"fetchAllTableRows",0,x,"getAllTableRowsSql",0,q,"prefetchTableRows",0,R,"useTableRowsQuery",0,({projectRef:e,tableId:t,...n},{enabled:i=!0,...r}={})=>{let s=(0,a.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:d,...u}=n;return(0,p.useQuery)({queryKey:_.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...u}),queryFn:({signal:a})=>A({queryClient:s,projectRef:e,connectionString:l,tableId:t,...n},a),enabled:i&&void 0!==e&&void 0!==t&&(!b.IS_PLATFORM||void 0!==l),...r})}],70756);var k=e.i(635494),I=e.i(636047);function P({queryClient:e,projectRef:t,connectionString:a,readReplicaIdentifier:n,id:i,sorts:r,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:i}).then(l=>{if(l){let d=(0,s.parseSupaTable)(l),{sorts:u=[],filters:m=[]}=(0,s.loadTableEditorStateFromLocalStorage)(t,l.id)??{};R(e,{projectRef:t,connectionString:a,readReplicaIdentifier:n,tableId:i,sorts:r??(0,s.formatSortURLParams)(d.name,u),filters:o??(0,s.formatFilterURLParams)(m),page:1,limit:I.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function C(){let e=(0,n.useRouter)(),t=(0,a.useQueryClient)(),{data:r}=(0,k.useSelectedProjectQuery)(),{connectionString:s,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,j.useRoleImpersonationStateSnapshot)();return(0,i.useCallback)(({id:a,filters:n,sorts:i})=>{let o=a?Number(a):void 0;!r||!o||isNaN(o)||(e.prefetch(`/project/${r.ref}/editor/${o}`),P({queryClient:t,projectRef:r.ref,connectionString:s,readReplicaIdentifier:l,id:o,sorts:i,filters:n,roleImpersonationState:c}).catch(()=>{}))},[s,l,r,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:a,sorts:n,filters:i,href:s,children:o,...l}){let c=C();return(0,t.jsx)(r.default,{href:s||`/project/${e}/editor/${a}`,prefetcher:()=>c({id:a,sorts:n,filters:i}),...l,children:o})},"prefetchEditorTablePage",0,P,"usePrefetchEditorTablePage",0,C],941381);var L=e.i(972089),N=e.i(462142);let $=({projectRef:e,schemaName:t},{enabled:a=!0}={})=>{let n=a&&!!e&&!!t,{data:r,isPending:s,isError:o}=(0,N.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:n,select:({db_schema:e})=>e}),l=(0,i.useMemo)(()=>r?(0,N.parseDbSchemaString)(r):[],[r]);return!n||s?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,$],963203);var D=e.i(84001);let F=[],K={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:a,tableNames:n=F},{enabled:r=!0,...s}={})=>{let o=(0,i.useMemo)(()=>new Set(n.filter(e=>"string"==typeof e&&e.length>0)),[n]),l=o.size>0,c=$({projectRef:e,schemaName:a},{enabled:r}),d=c.isSuccess&&!0===c.data,u=r&&l,m=(0,L.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:u,...s});return(0,i.useMemo)(()=>{if(!r||"pending"===c.status||u&&m.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||u&&m.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:K,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=d?((e,t,a)=>{if(!e)return{};let n={};return e.forEach(e=>{if(e.schema===t&&a.has(e.name)){var i;let t;n[e.name]=(i=e.privileges,t={anon:[],authenticated:[],service_role:[]},i.forEach(e=>{let{grantee:a,privilege_type:n}=e;(0,D.isApiAccessRole)(a)&&(0,D.isApiPrivilegeType)(n)&&t[a].push(n)}),t)}}),n})(m.data,a,o):{};return o.forEach(a=>{if(!d){e[a]={apiAccessType:"none"};return}let n=t[a]??{anon:[],authenticated:[],service_role:[]},i=n.anon.length>0||n.authenticated.length>0||n.service_role.length>0;e[a]=i?{apiAccessType:"access",grantStatus:D.API_ACCESS_ROLES.every(e=>D.API_PRIVILEGE_TYPES.every(t=>n[e].includes(t)))?"granted":"custom",privileges:n}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[r,u,l,c.status,d,m.isPending,m.isError,m.data,a,o])}],954707)}]);