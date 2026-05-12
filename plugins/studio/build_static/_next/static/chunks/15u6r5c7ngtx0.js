(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,143692,e=>{"use strict";let t=(0,e.i(388019).default)("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);e.s(["default",0,t])},971687,e=>{"use strict";var t=e.i(143692);e.s(["Calendar",()=>t.default])},245049,e=>{"use strict";var t=e.i(478902),a=e.i(975924),n=e.i(505859),r=e.i(938933);function i({align:e="center",ariaLabel:a,arrow:s=!1,children:l,className:o,defaultOpen:c=!1,modal:d,onOpenChange:u,open:p,overlay:m,side:f="bottom",sideOffset:h=6,style:g,header:b,footer:y,size:_="content",disabled:v,"data-testid":x}){let S=(0,r.default)("popover"),j=[S.content,S.size[_]];return o&&j.push(o),(0,t.jsxs)(n.Popover.Root,{defaultOpen:c,modal:d,onOpenChange:u,open:p,children:[(0,t.jsx)(n.Popover.Trigger,{disabled:v,className:S.trigger,"aria-label":a,"data-testid":x,children:l}),(0,t.jsx)(n.Popover.Portal,{children:(0,t.jsxs)(n.Popover.Content,{sideOffset:h,side:f,align:e,className:j.join(" "),style:g,children:[s&&(0,t.jsx)(n.Popover.Arrow,{offset:10}),b&&(0,t.jsx)("div",{className:S.header,children:b}),m,y&&(0,t.jsx)("div",{className:S.footer,children:y})]})})]})}i.Separator=function(){let e=(0,r.default)("popover");return(0,t.jsx)("div",{className:e.separator})},i.Close=function(){let e=(0,r.default)("popover");return(0,t.jsx)(n.Popover.Close,{className:e.close,children:(0,t.jsx)(a.X,{size:14,strokeWidth:2})})},e.s(["default",0,i])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},867467,e=>{"use strict";var t=e.i(389959);e.s(["useChanged",0,function(e){let a=(0,t.useRef)(),n=a.current!==e;return(0,t.useEffect)(()=>{a.current=e}),n},"useChangedSync",0,function(e){let a=(0,t.useRef)(),n=a.current!==e;return a.current=e,n}])},999918,e=>{"use strict";let t=(0,e.i(388019).default)("ShieldOff",[["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71",key:"1jlk70"}],["path",{d:"M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",key:"18rp1v"}]]);e.s(["ShieldOff",0,t],999918)},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:r,onCancel:i,title:s="Unsaved changes",description:l="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:o="Discard changes",cancelLabel:c="Keep editing",size:d="tiny"})=>{let u=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,a.useCallback)(()=>{u.current=!0,r()},[r]),m=(0,a.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}i()}},[i]);return(0,t.jsx)(n.AlertDialog,{open:e,onOpenChange:m,children:(0,t.jsxs)(n.AlertDialogContent,{size:d,children:[(0,t.jsxs)(n.AlertDialogHeader,{children:[(0,t.jsx)(n.AlertDialogTitle,{children:s}),null!=l&&(0,t.jsx)(n.AlertDialogDescription,{children:l})]}),(0,t.jsxs)(n.AlertDialogFooter,{children:[(0,t.jsx)(n.AlertDialogCancel,{children:c}),(0,t.jsx)(n.AlertDialogAction,{variant:"danger",onClick:p,children:o})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:n})=>{let[r,i]=(0,t.useState)(!1),s=(0,a.default)(e),l=(0,a.default)(n),o=(0,t.useCallback)(()=>{s.current()?i(!0):l.current()},[]),c=(0,t.useCallback)(e=>{e||o()},[o]),d=(0,t.useCallback)(()=>{i(!1),l.current()},[]),u=(0,t.useCallback)(()=>{i(!1)},[]),p=(0,t.useMemo)(()=>({visible:r,onClose:d,onCancel:u}),[r,d,u]);return(0,t.useMemo)(()=>({confirmOnClose:o,handleOpenChange:c,modalProps:p}),[o,c,p])}])},931078,(e,t,a)=>{var n=e.r(358849),r=e.r(854059),i=e.r(225083),s=e.r(145948),l=e.r(775484),o=e.r(904216),c=e.r(85057),d=e.r(562081),u=Object.prototype.hasOwnProperty;t.exports=function(e){if(null==e)return!0;if(l(e)&&(s(e)||"string"==typeof e||"function"==typeof e.splice||o(e)||d(e)||i(e)))return!e.length;var t=r(e);if("[object Map]"==t||"[object Set]"==t)return!e.size;if(c(e))return!n(e).length;for(var a in e)if(u.call(e,a))return!1;return!0}},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},847278,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),r=e.i(355901),i=e.i(138658),s=e.i(915993),l=e.i(714403),o=e.i(938343);async function c({projectRef:e,connectionString:a,id:n,name:r,schema:i,payload:s}){let{sql:o}=t.default.tables.update({id:n,name:r,schema:i},s),{result:d}=await (0,l.executeSql)({projectRef:e,connectionString:a,sql:o,queryKey:["table","update",n]});return d}e.s(["updateTable",0,c,"useTableUpdateMutation",0,({onSuccess:e,onError:t,...l}={})=>{let d=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>c(e),async onSuccess(t,a,n){let{projectRef:r,schema:l,id:c}=a;await Promise.all([d.invalidateQueries({queryKey:o.tableEditorKeys.tableEditor(r,c)}),d.invalidateQueries({queryKey:i.tableKeys.list(r,l)}),d.invalidateQueries({queryKey:s.lintKeys.lint(r)})]),await e?.(t,a,n)},async onError(e,a,n){void 0===t?r.toast.error(`Failed to update database table: ${e.message}`):t(e,a,n)},...l})}])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),a=e.i(242882),n=e.i(818135),r=e.i(714403);let i=t.default.tablePrivileges.list();async function s({projectRef:e,connectionString:t},a){let{result:n}=await (0,r.executeSql)({projectRef:e,connectionString:t,sql:i.sql,queryKey:["table-privileges"]},a);return n}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:n.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...i}={})=>(0,a.useQuery)({queryKey:n.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...i})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],a=["SELECT","INSERT","UPDATE","DELETE"],n={anon:[...a],authenticated:[...a],service_role:[...a]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,a,"DEFAULT_DATA_API_PRIVILEGES",0,n,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>a.includes(e)])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:r})=>[`CREATE TABLE ${(0,t.ident)(r)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(r)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(r)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),r=e.i(242882),i=e.i(938343),s=e.i(714403);async function l({projectRef:e,connectionString:t,id:n},r){if(!n)throw Error("id is required");let i=a({id:n}),{result:o}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:i,queryKey:["table-editor",n]},r);return o[0]?.entity??null}let o=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:i.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>l({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,l,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(o({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,o,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...i}={})=>(0,r.useQuery)({...o({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...i})],34479)},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:a,...n}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:a?.role,...n}],tableRowsCount:(e,{table:t,...a}={})=>["projects",e,"table-rows",t?.id,"count",a],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),a=e.i(962217);e.s(["formatFilterValue",0,function(e,a){let n=e.columns.find(e=>e.name==a.column);if(n&&(0,t.isNumericalColumn)(n.format)){let e=Number(a.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(a.value)}return a.value},"getPrimaryKeys",0,function({table:e}){if(!(0,a.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},310959,e=>{"use strict";var t=e.i(479084),a=e.i(721490);let n=10240,r=50,i=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],s=[t.safeSql`json`,t.safeSql`jsonb`],l=new Set(s),o=new Set([...i,...s,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,r,"MAX_CHARACTERS",0,n,"getTableRowsSql",0,({table:e,filters:s=[],sorts:c=[],page:d,limit:u,maxCharacters:p=n,maxArraySize:m=r,sortExcludedColumns:f=[]})=>{if(!e||!e.columns)return t.safeSql``;let h=new a.Query().from(e.name,e.schema).select();s.forEach(t=>{let a=e.columns?.find(e=>e.name===t.column),n=!a||i.includes(a.format);h=h.filter(t.column,t.operator,n||""!==t.value?t.value:null)});let g=e.live_rows_estimate||0;if(0===c.length&&g<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let a=e.primary_keys?.map(e=>e.name);if(a&&a.length>0&&!a.every(e=>t.includes(e)))return a;if(e.columns&&e.columns.length>0){let a=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(a.length>0)return[a[0].name]}return[]})(e,{excludedColumns:f});t.length>0&&t.forEach(t=>{h=h.order(e.name,t)})}else c.forEach(e=>{h=h.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:b,to:y}=function(e,t=100){let a=e?e*t:0;return{from:a,to:e?a+t-1:t-1}}((d??1)-1,u),_=t.safeSql`with _base_query as (${h.range(b,y).toSql({isCTE:!1,isFinal:!1})})`,v=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),x=e.columns.filter(e=>{let t;return t=e.format,o.has(t.toLowerCase())}).map(e=>e.name),S=v.map(({name:e})=>{let a=(0,t.ident)(e);return x.includes(e)?t.safeSql`case
        when octet_length(${a}::text) > ${(0,t.literal)(p)} 
        then left(${a}::text, ${(0,t.literal)(p)}) || '...'
        else ${a}::text
      end as ${a}`:a});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:a})=>{let n=S.findIndex(a=>a===(0,t.ident)(e)),r=l.has(a),i=r?t.safeSql`::${(0,t.keyword)(a)}[]`:t.safeSql`::text[]`,s=r?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,o=(0,t.ident)(e);n>=0&&(S[n]=t.safeSql`
        case 
          when octet_length(${o}::text) > ${(0,t.literal)(p)} 
          then
            case
              when array_ndims(${o}) = 1
              then
                (select array_cat(${o}[1:${(0,t.literal)(m)}]${i}, ${s}${i}))${i}
              else
                ${o}[1:${(0,t.literal)(m)}]${i}
            end
          else ${o}${i}
        end
      `)});let j=(0,t.joinSqlFragments)(S,","),E=new a.Query().from("_base_query").select(j);return t.safeSql`${_}
  ${E.toSql({isCTE:!0,isFinal:!0})}`}])},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),a=e.i(356003),n=e.i(989567),r=e.i(389959),i=e.i(85626),s=e.i(19583),l=e.i(150671),o=e.i(34479);e.i(850036);var c=e.i(479084),d=e.i(940562),u=e.i(721490),p=e.i(310959),m=e.i(242882);e.i(128328);var f=e.i(86086),h=e.i(790819),g=e.i(46974),b=e.i(311827),y=e.i(234745),_=e.i(714403),v=e.i(962217),x=e.i(48189),S=e.i(908937),j=e.i(201461),E=e.i(237948);async function w(e,t=3,a=1e3){for(let n=0;n<=t;n++)try{return await e()}catch(e){if(429===(e instanceof E.ResponseError?e.code:e.status)&&n<t){let t=function(e){if(e instanceof E.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),r=t?1e3*t:a*Math.pow(2,n);await (0,x.timeout)(r);continue}throw e}throw Error("Max retries reached without success")}let T=({table:e,filters:t=[],sorts:a=[]})=>{let n,r,i,s,l,o=new u.Query,d=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),p=o.from(e.name,e.schema??void 0).select(d.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...d],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let a=(0,g.formatFilterValue)(e,t);p=p.filter(t.column,t.operator,a)});let m=!1,{cursorPaginationEligible:f,cursorPaginationNonEligible:h}=(n=[],r=[],(i=e.primaryKey)&&n.push(i),s=e.uniqueIndexes,(l=s?.filter(t=>t.every(t=>{let a=e.columns.find(e=>e.name===t);return!!a&&!a.isNullable})))&&n.push(...l),r.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:n,cursorPaginationNonEligible:r}),y=e.type===b.ENTITY_TYPE.TABLE||e.type===b.ENTITY_TYPE.PARTITIONED_TABLE||e.type===b.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===a.length)f.length>0?(m=f[0],f[0].forEach(t=>{p=p.order(e.name,t)})):(h.length>0&&(p=p.order(e.name,h[0])),y&&(p=p.order(e.name,"ctid")));else{a.forEach(e=>{p=p.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=f[0];if(t){let n=new Set(a.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!n.has(e)).forEach(t=>{p=p.order(e.name,t)})}else y&&(p=p.order(e.name,"ctid"))}return{sql:p,cursorColumns:m}},q=async({projectRef:e,connectionString:t,table:a,filters:n=[],sorts:r=[],roleImpersonationState:i,progressCallback:s})=>{if(f.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let l=[],{sql:o,cursorColumns:c}=T({table:a,sorts:r,filters:n});if(c){let a=null;for(;;){let n=o.clone();a&&(n=n.filter(c,">",c.map(e=>a[e])));let r=(0,S.wrapWithRoleImpersonation)(n.range(0,499).toSql(),i);try{let{result:n}=await w(async()=>(0,_.executeSql)({projectRef:e,connectionString:t,sql:r}));for(let e of(l.push(...n),s?.(l.length),a={},c))a[e]=n[n.length-1]?.[e];if(n.length<500)break;await (0,x.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let a=-1;for(;;){let n=500*(a+=1),r=(a+1)*500-1,c=(0,S.wrapWithRoleImpersonation)(o.range(n,r).toSql(),i);try{let{result:a}=await w(async()=>(0,_.executeSql)({projectRef:e,connectionString:t,sql:c}));if(l.push(...a),s?.(l.length),a.length<500)break;await (0,x.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return l.filter(e=>1!==e[d.ROLE_IMPERSONATION_NO_RESULTS])};async function A({queryClient:e,projectRef:t,connectionString:a,tableId:n,roleImpersonationState:r,filters:i,sorts:l,limit:c,page:d,preflightCheck:u=!1},m){let f=await (0,o.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:n});if(!f)throw Error("Table not found");let h=(0,s.parseSupaTable)(f),g=i?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),b=(0,v.isMsSqlForeignTable)(f)?Array.from(new Set(g)):void 0,x=(0,S.wrapWithRoleImpersonation)((0,p.getTableRowsSql)({table:f,filters:i,sorts:l,limit:c,page:d,sortExcludedColumns:b}),r);try{let{result:e}=await (0,_.executeSql)({projectRef:t,connectionString:a,sql:x,queryKey:["table-rows",h?.id],isRoleImpersonationEnabled:(0,j.isRoleImpersonationEnabled)(r?.role),preflightCheck:u},m);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,y.handleError)(e)}}function k(e,{projectRef:t,connectionString:a,tableId:n,readReplicaIdentifier:r,...i}){return e.fetchQuery({queryKey:h.tableRowKeys.tableRows(t,{table:{id:n},readReplicaIdentifier:r,...i}),queryFn:({signal:r})=>A({queryClient:e,projectRef:t,connectionString:a,tableId:n,...i},r)})}e.s(["executeWithRetry",0,w,"fetchAllTableRows",0,q,"getAllTableRowsSql",0,T,"prefetchTableRows",0,k,"useTableRowsQuery",0,({projectRef:e,tableId:t,...n},{enabled:r=!0,...i}={})=>{let s=(0,a.useQueryClient)(),{connectionString:o,identifier:c}=(0,l.useConnectionStringForReadOps)(),{preflightCheck:d,...u}=n;return(0,m.useQuery)({queryKey:h.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...u}),queryFn:({signal:a})=>A({queryClient:s,projectRef:e,connectionString:o,tableId:t,...n},a),enabled:r&&void 0!==e&&void 0!==t&&(!f.IS_PLATFORM||void 0!==o),...i})}],70756);var P=e.i(635494),N=e.i(636047);function C({queryClient:e,projectRef:t,connectionString:a,readReplicaIdentifier:n,id:r,sorts:i,filters:l,roleImpersonationState:c}){return(0,o.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:r}).then(o=>{if(o){let d=(0,s.parseSupaTable)(o),{sorts:u=[],filters:p=[]}=(0,s.loadTableEditorStateFromLocalStorage)(t,o.id)??{};k(e,{projectRef:t,connectionString:a,readReplicaIdentifier:n,tableId:r,sorts:i??(0,s.formatSortURLParams)(d.name,u),filters:l??(0,s.formatFilterURLParams)(p),page:1,limit:N.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function R(){let e=(0,n.useRouter)(),t=(0,a.useQueryClient)(),{data:i}=(0,P.useSelectedProjectQuery)(),{connectionString:s,identifier:o}=(0,l.useConnectionStringForReadOps)(),c=(0,j.useRoleImpersonationStateSnapshot)();return(0,r.useCallback)(({id:a,filters:n,sorts:r})=>{let l=a?Number(a):void 0;!i||!l||isNaN(l)||(e.prefetch(`/project/${i.ref}/editor/${l}`),C({queryClient:t,projectRef:i.ref,connectionString:s,readReplicaIdentifier:o,id:l,sorts:r,filters:n,roleImpersonationState:c}).catch(()=>{}))},[s,o,i,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:a,sorts:n,filters:r,href:s,children:l,...o}){let c=R();return(0,t.jsx)(i.default,{href:s||`/project/${e}/editor/${a}`,prefetcher:()=>c({id:a,sorts:n,filters:r}),...o,children:l})},"prefetchEditorTablePage",0,C,"usePrefetchEditorTablePage",0,R],941381);var $=e.i(972089),I=e.i(462142);let O=({projectRef:e,schemaName:t},{enabled:a=!0}={})=>{let n=a&&!!e&&!!t,{data:i,isPending:s,isError:l}=(0,I.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:n,select:({db_schema:e})=>e}),o=(0,r.useMemo)(()=>i?(0,I.parseDbSchemaString)(i):[],[i]);return!n||s?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:l?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:o.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,O],963203);var L=e.i(84001);let D=[],M={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:a,tableNames:n=D},{enabled:i=!0,...s}={})=>{let l=(0,r.useMemo)(()=>new Set(n.filter(e=>"string"==typeof e&&e.length>0)),[n]),o=l.size>0,c=O({projectRef:e,schemaName:a},{enabled:i}),d=c.isSuccess&&!0===c.data,u=i&&o,p=(0,$.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:u,...s});return(0,r.useMemo)(()=>{if(!i||"pending"===c.status||u&&p.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||u&&p.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!o)return{data:M,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=d?((e,t,a)=>{if(!e)return{};let n={};return e.forEach(e=>{if(e.schema===t&&a.has(e.name)){var r;let t;n[e.name]=(r=e.privileges,t={anon:[],authenticated:[],service_role:[]},r.forEach(e=>{let{grantee:a,privilege_type:n}=e;(0,L.isApiAccessRole)(a)&&(0,L.isApiPrivilegeType)(n)&&t[a].push(n)}),t)}}),n})(p.data,a,l):{};return l.forEach(a=>{if(!d){e[a]={apiAccessType:"none"};return}let n=t[a]??{anon:[],authenticated:[],service_role:[]},r=n.anon.length>0||n.authenticated.length>0||n.service_role.length>0;e[a]=r?{apiAccessType:"access",grantStatus:L.API_ACCESS_ROLES.every(e=>L.API_PRIVILEGE_TYPES.every(t=>n[e].includes(t)))?"granted":"custom",privileges:n}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[i,u,o,c.status,d,p.isPending,p.isError,p.data,a,l])}],954707)},507648,(e,t,a)=>{var n=e.r(203941),r=e.r(297926),i=e.r(615573),s=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),a=arguments[0],l=e;l--;)t[l-1]=arguments[l];return n(s(a)?i(a):[a],r(t,1))}},707409,e=>{"use strict";var t=e.i(507648),a=e.i(827047);let n=["int2","int4","int8","float4","float8","numeric","double precision"],r=["json","jsonb"],i=["text","varchar"],s=["timestamp","timestamptz"],l=["date"],o=["time","timetz"],c=(0,t.default)(s,l,o),d=["uuid","bool","vector","bytea"],u=(0,a.default)((0,t.default)(n,r,i,c,d));e.s(["DATETIME_TYPES",0,c,"DATE_TYPES",0,l,"JSON_TYPES",0,r,"NUMERICAL_TYPES",0,n,"OTHER_DATA_TYPES",0,d,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,i,"TIMESTAMP_TYPES",0,s,"TIME_TYPES",0,o])},647307,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),r=e.i(355901),i=e.i(801834),s=e.i(714403);async function l({name:e,projectRef:a,connectionString:n}){let r=t.default.schemas.create({name:e,owner:"postgres"}).sql,{result:i}=await (0,s.executeSql)({projectRef:a,connectionString:n,sql:r,queryKey:["schema","create"]});return i}e.s(["useSchemaCreateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,n){let{projectRef:r}=a;await (0,i.invalidateSchemasQuery)(o,r),await e?.(t,a,n)},async onError(e,a,n){void 0===t?r.toast.error(`Failed to create schema: ${e.message}`):t(e,a,n)},...s})}])},433857,e=>{"use strict";let t=(0,e.i(388019).default)("ListPlus",[["path",{d:"M11 12H3",key:"51ecnj"}],["path",{d:"M16 6H3",key:"1wxfjs"}],["path",{d:"M16 18H3",key:"12xzn7"}],["path",{d:"M18 9v6",key:"1twb98"}],["path",{d:"M21 12h-6",key:"bt1uis"}]]);e.s(["ListPlus",0,t],433857)},973512,e=>{"use strict";var t=e.i(478902),a=e.i(802715),n=e.i(389959),r=e.i(837710),i=e.i(788070),s=e.i(368136),l=e.i(194125);e.s(["ActionBar",0,({loading:e=!1,disableApply:o=!1,hideApply:c=!1,children:d,applyButtonLabel:u="Apply",backButtonLabel:p="Back",applyFunction:m,closePanel:f=a.default,formId:h,visible:g=!0})=>{let[b,y]=(0,n.useState)(!1),_=(0,n.useCallback)(async()=>{y(!0),await new Promise(e=>m?.(e)),y(!1)},[m]),v=(0,n.useCallback)(()=>{if(!b&&!e&&!o&&!c)if(h){let e=document.getElementById(h);e&&e.requestSubmit()}else m&&_()},[b,e,o,c,h,m,_]);return(0,l.useShortcut)(s.SHORTCUT_IDS.ACTION_BAR_SAVE,v,{enabled:g}),(0,t.jsxs)("div",{className:"flex w-full items-center gap-3 border-t border-default px-3 py-4",children:[d,(0,t.jsxs)("div",{className:"flex items-center gap-3 ml-auto",children:[(0,t.jsx)(r.Button,{type:"default",htmlType:"button",onClick:f,disabled:b||e,children:p}),void 0!==m?(0,t.jsx)(r.Button,{onClick:_,disabled:o||b||e,loading:b||e,iconRight:b||e?void 0:(0,t.jsx)(i.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u}):c?(0,t.jsx)("div",{}):(0,t.jsx)(r.Button,{disabled:e||o,loading:e,"data-testid":"action-bar-save-row",htmlType:"submit",form:h,iconRight:e?void 0:(0,t.jsx)(i.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u})]})]})}])},272299,257320,e=>{"use strict";var t=e.i(388019);let a=(0,t.default)("ToggleRight",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"6",ry:"6",key:"f2vt7d"}],["circle",{cx:"16",cy:"12",r:"2",key:"4ma0v8"}]]);e.s(["ToggleRight",0,a],272299);let n=(0,t.default)("Type",[["polyline",{points:"4 7 4 4 20 4 20 7",key:"1nosan"}],["line",{x1:"9",x2:"15",y1:"20",y2:"20",key:"swin9y"}],["line",{x1:"12",x2:"12",y1:"4",y2:"20",key:"1tx1rr"}]]);e.s(["Type",0,n],257320)},1962,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(274664),r=e.i(546595),i="Progress",[s,l]=(0,n.createContextScope)(i),[o,c]=s(i),d=a.forwardRef((e,a)=>{var n,i;let{__scopeProgress:s,value:l=null,max:c,getValueLabel:d=m,...u}=e;(c||0===c)&&!g(c)&&console.error((n=`${c}`,`Invalid prop \`max\` of value \`${n}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let p=g(c)?c:100;null===l||b(l,p)||console.error((i=`${l}`,`Invalid prop \`value\` of value \`${i}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let y=b(l,p)?l:null,_=h(y)?d(y,p):void 0;return(0,t.jsx)(o,{scope:s,value:y,max:p,children:(0,t.jsx)(r.Primitive.div,{"aria-valuemax":p,"aria-valuemin":0,"aria-valuenow":h(y)?y:void 0,"aria-valuetext":_,role:"progressbar","data-state":f(y,p),"data-value":y??void 0,"data-max":p,...u,ref:a})})});d.displayName=i;var u="ProgressIndicator",p=a.forwardRef((e,a)=>{let{__scopeProgress:n,...i}=e,s=c(u,n);return(0,t.jsx)(r.Primitive.div,{"data-state":f(s.value,s.max),"data-value":s.value??void 0,"data-max":s.max,...i,ref:a})});function m(e,t){return`${Math.round(e/t*100)}%`}function f(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function h(e){return"number"==typeof e}function g(e){return h(e)&&!isNaN(e)&&e>0}function b(e,t){return h(e)&&!isNaN(e)&&e<=t&&e>=0}p.displayName=u,e.s(["Indicator",0,p,"Progress",0,d,"ProgressIndicator",0,p,"Root",0,d,"createProgressScope",0,l],386108);var y=e.i(386108),y=y,_=e.i(843778);let v=a.forwardRef(({className:e,value:a,...n},r)=>(0,t.jsx)(y.Root,{ref:r,className:(0,_.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...n,children:(0,t.jsx)(y.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(a||0)}%)`}})}));v.displayName=y.Root.displayName,e.s(["Progress",0,v],1962)},474325,e=>{"use strict";var t=e.i(478902),a=e.i(774803),n=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:r,action:i,message:s,description:l="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(a.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:s}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[r||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(n.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:l}),i]})]})]})])},509847,e=>{"use strict";e.s(["databasePoliciesKeys",0,{list:(e,t)=>["projects",e,"database-policies",t].filter(Boolean)}])},929486,(e,t,a)=>{var n=Object.prototype.hasOwnProperty;t.exports=function(e,t){return null!=e&&n.call(e,t)}},460224,(e,t,a)=>{var n=e.r(929486),r=e.r(129718);t.exports=function(e,t){return null!=e&&r(e,t,n)}},461250,(e,t,a)=>{var n=e.r(291996),r=e.r(949667),i=e.r(684912),s=Math.ceil,l=Math.max;t.exports=function(e,t,a){t=(a?r(e,t,a):void 0===t)?1:l(i(t),0);var o=null==e?0:e.length;if(!o||t<1)return[];for(var c=0,d=0,u=Array(s(o/t));c<o;)u[d++]=n(e,c,c+=t);return u}},321605,25912,e=>{"use strict";var t=e.i(248593),a=e.i(242882);let n={list:e=>["projects",e,"database-publications"]};e.s(["databasePublicationsKeys",0,n],25912);var r=e.i(234745),i=e.i(635494);async function s({projectRef:e,connectionString:a},n){if(!e)throw Error("projectRef is required");let i=new Headers;a&&i.set("x-connection-encrypted",a);let{data:l,error:o}=await (0,r.get)("/platform/pg-meta/{ref}/publications",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:i,signal:n});return o&&(0,r.handleError)(o),l}let l=({projectRef:e,connectionString:t},{enabled:r=!0,...i}={})=>(0,a.useQuery)({queryKey:n.list(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...i});e.s(["useDatabasePublicationsQuery",0,l,"useIsTableRealtimeEnabled",0,({id:e})=>{let{data:t}=(0,i.useSelectedProjectQuery)(),{data:a}=l({projectRef:t?.ref,connectionString:t?.connectionString}),n=(a??[]).find(e=>"supabase_realtime"===e.name);return(n?.tables??[]).some(t=>t.id===e)}],321605)},587768,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),r=e.i(355901),i=e.i(25912),s=e.i(714403);async function l({projectRef:e,connectionString:a,id:n,tables:r,publish_insert:i,publish_update:o,publish_delete:c,publish_truncate:d}){let{sql:u}=t.default.publications.update(n,{tables:r,publish_insert:i,publish_update:o,publish_delete:c,publish_truncate:d}),{result:p}=await (0,s.executeSql)({projectRef:e,connectionString:a,sql:u,queryKey:["publication","update",n]});return p}e.s(["useDatabasePublicationUpdateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,n){let{projectRef:r}=a;await o.invalidateQueries({queryKey:i.databasePublicationsKeys.list(r)}),await e?.(t,a,n)},async onError(e,a,n){void 0===t?r.toast.error(`Failed to update database publication: ${e.message}`):t(e,a,n)},...s})}])},983783,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(158639),n=e.i(17313),r=e.i(389959);e.s(["useQuerySchemaState",0,()=>{var e;let{ref:i}=(0,a.useParams)(),s=window.localStorage&&i&&i.length>0&&window.localStorage.getItem(t.LOCAL_STORAGE_KEYS.LAST_SELECTED_SCHEMA(i))||"public",[l,o]=(e=(0,r.useMemo)(()=>s,[i]),(0,n.useQueryState)("schema",n.parseAsString.withDefault(e).withOptions({clearOnDefault:!1})));return(0,r.useEffect)(()=>{window.localStorage&&i&&i.length>0&&window.localStorage.setItem(t.LOCAL_STORAGE_KEYS.LAST_SELECTED_SCHEMA(i),l)},[l,i]),{selectedSchema:l,setSelectedSchema:o}}])},238944,e=>{"use strict";var t=e.i(989567),a=e.i(389959),n=e.i(323796);e.s(["useUrlState",0,function({replace:e=!0,arrayKeys:r=[]}={}){let i=JSON.stringify(r),s=(0,a.useMemo)(()=>new Set(r),[i]),l=(0,t.useRouter)(),o=(0,a.useMemo)(()=>Object.fromEntries(Object.entries(l.query).map(([e,t])=>s.has(e)?Array.isArray(t)?[e,t]:[e,[t]]:[e,t])),[s,l.query]),c=(0,n.default)(o);return[o,(0,a.useCallback)(t=>{let a=c.current,n="function"==typeof t?t(a):t,r=Object.fromEntries(Object.entries({...a,...n}).filter(([,e])=>!!e));(e?l.replace:l.push)({pathname:l.pathname,query:r},void 0,{shallow:!0,scroll:!1})},[l,e])]}])},152285,e=>{"use strict";var t=e.i(478902),a=e.i(974331),n=e.i(389959),r=e.i(938933);let i=({defaultActiveId:e,activeId:i,type:s="pills",size:l="tiny",block:o,onChange:c,onClick:d,scrollable:u,wrappable:p,addOnBefore:m,addOnAfter:f,listClassNames:h,baseClassNames:g,refs:b,children:y})=>{let _=[];n.Children.forEach(y,e=>{(0,n.isValidElement)(e)&&_.push(e)});let[v,x]=(0,n.useState)(i??e??_?.[0]?.props?.id);(0,n.useMemo)(()=>{i&&i!==v&&x(i)},[i]);let S=(0,r.default)("tabs");function j(e){d?.(e),e!==v&&(c?.(e),x(e))}let E=[S[s].list];return u&&E.push(S.scrollable),p&&E.push(S.wrappable),h&&E.push(h),(0,t.jsxs)(a.Tabs.Root,{value:v,className:[S.base,g].join(" "),ref:b?.base,children:[(0,t.jsxs)(a.Tabs.List,{className:E.join(" "),ref:b?.list,children:[m,_.map(e=>{let n=v===e.props.id,r=[S[s].base,S.size[l]];return n?r.push(S[s].active):r.push(S[s].inactive),o&&r.push(S.block),(0,t.jsxs)(a.Tabs.Trigger,{onKeyDown:t=>{"Enter"===t.key&&(t.preventDefault(),j(e.props.id))},onClick:()=>j(e.props.id),value:e.props.id,className:r.join(" "),children:[e.props.icon,(0,t.jsx)("span",{children:e.props.label}),e.props.iconRight]},`${e.props.id}-tab-button`)}),f]}),_]})};i.Panel=({children:e,id:n,className:i})=>{let s=(0,r.default)("tabs");return(0,t.jsx)(a.Tabs.Content,{value:n,className:[s.content,i].join(" "),children:e})},e.s(["default",0,i])},200409,e=>{"use strict";var t=e.i(152285);e.s(["Tabs",()=>t.default])},701087,e=>{"use strict";let t=(0,e.i(388019).default)("LockOpen",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1",key:"1mm8w8"}]]);e.s(["Unlock",0,t],701087)},425861,e=>{"use strict";var t=e.i(478902),a=e.i(843778);e.s(["TwoOptionToggle",0,({options:e,width:n=50,activeOption:r,onClickOption:i,borderOverride:s="border-stronger"})=>(0,t.jsxs)("div",{className:`relative border ${s} rounded-md h-7`,style:{padding:1,width:(n+1)*2},children:[(0,t.jsx)("span",{style:{width:n,translate:r===e[1]?"0px":`${n-2}px`},"aria-hidden":"true",className:(0,a.cn)("z-0 inline-block rounded-sm h-full bg-overlay-hover shadow-sm transform","transition-all ease-in-out border border-strong")}),e.map((e,s)=>{let l;return(0,t.jsx)("span",{style:{width:n+1},className:`
              ${r===e?"text-foreground":"text-foreground-light"}
              ${0===s?"right-0":"left-0"}
              ${(l=r===e,`absolute top-0 z-1 text-xs inline-flex h-full items-center justify-center font-medium
    ${l?"hover:text-foreground-light hover:text-foreground":"hover:text-foreground"} hover:text-foreground focus:z-10 focus:outline-hidden focus:border-blue-300 focus:ring-blue
    transition ease-in-out duration-150`)}
              cursor-pointer
            `,onClick:()=>i(e),children:(0,t.jsx)("span",{className:(0,a.cn)("capitalize hover:text-foreground",r===e?"text-foreground":"text-foreground-light"),children:e})},`toggle_${s}`)})]})])},878594,e=>{"use strict";var t=e.i(991435);new WeakMap,new WeakMap;let a={get url(){return`file://${e.P("node_modules/.pnpm/valtio@1.12.0_@types+react@18.3.3_react@18.3.1/node_modules/valtio/esm/vanilla/utils.mjs")}`}},n=Symbol();e.s(["devtools",0,function(e,r){let i;"string"==typeof r&&(console.warn("string name option is deprecated, use { name }. https://github.com/pmndrs/valtio/pull/400"),r={name:r});let{enabled:s,name:l="",...o}=r||{};try{i=(null!=s?s:(a.env?a.env.MODE:void 0)!=="production")&&window.__REDUX_DEVTOOLS_EXTENSION__}catch{}if(!i){(a.env?a.env.MODE:void 0)!=="production"&&s&&console.warn("[Warning] Please install/enable Redux devtools extension");return}let c=!1,d=i.connect({name:l,...o}),u=(0,t.subscribe)(e,a=>{let r=a.filter(([e,t])=>t[0]!==n).map(([e,t])=>`${e}:${t.map(String).join(".")}`).join(", ");if(r)if(c)c=!1;else{let a=Object.assign({},(0,t.snapshot)(e));delete a[n],d.send({type:r,updatedAt:new Date().toLocaleString()},a)}}),p=d.subscribe(a=>{var r,i,s,l,o,u;if("ACTION"===a.type&&a.payload)try{Object.assign(e,JSON.parse(a.payload))}catch(e){console.error("please dispatch a serializable value that JSON.parse() and proxy() support\n",e)}if("DISPATCH"===a.type&&a.state)((null==(r=a.payload)?void 0:r.type)==="JUMP_TO_ACTION"||(null==(i=a.payload)?void 0:i.type)==="JUMP_TO_STATE")&&(c=!0,Object.assign(e,JSON.parse(a.state))),e[n]=a;else if("DISPATCH"===a.type&&(null==(s=a.payload)?void 0:s.type)==="COMMIT")d.init((0,t.snapshot)(e));else if("DISPATCH"===a.type&&(null==(l=a.payload)?void 0:l.type)==="IMPORT_STATE"){let n=null==(o=a.payload.nextLiftedState)?void 0:o.actionsById,r=(null==(u=a.payload.nextLiftedState)?void 0:u.computedStates)||[];c=!0,r.forEach(({state:a},r)=>{let i=n[r]||"No action found";Object.assign(e,a),0===r?d.init((0,t.snapshot)(e)):d.send(i,(0,t.snapshot)(e))})}});return d.init((0,t.snapshot)(e)),()=>{u(),null==p||p()}},"proxyMap",0,function(e){let a=(0,t.proxy)({data:Array.from(e||[]),has(e){return this.data.some(t=>t[0]===e)},set(e,t){let a=this.data.find(t=>t[0]===e);return a?a[1]=t:this.data.push([e,t]),this},get(e){var t;return null==(t=this.data.find(t=>t[0]===e))?void 0:t[1]},delete(e){let t=this.data.findIndex(t=>t[0]===e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},toJSON(){return new Map(this.data)},forEach(e){this.data.forEach(t=>{e(t[1],t[0],this)})},keys(){return this.data.map(e=>e[0]).values()},values(){return this.data.map(e=>e[1]).values()},entries(){return new Map(this.data).entries()},get[Symbol.toStringTag](){return"Map"},[Symbol.iterator](){return this.entries()}});return Object.defineProperties(a,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(a),a},"proxySet",0,function(e){let a=(0,t.proxy)({data:Array.from(new Set(e)),has(e){return -1!==this.data.indexOf(e)},add(e){let a=!1;return"object"==typeof e&&null!==e&&(a=-1!==this.data.indexOf((0,t.proxy)(e))),-1!==this.data.indexOf(e)||a||this.data.push(e),this},delete(e){let t=this.data.indexOf(e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},forEach(e){this.data.forEach(t=>{e(t,t,this)})},get[Symbol.toStringTag](){return"Set"},toJSON(){return new Set(this.data)},[Symbol.iterator](){return this.data[Symbol.iterator]()},values(){return this.data.values()},keys(){return this.data.values()},entries(){return new Set(this.data).entries()}});return Object.defineProperties(a,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(a),a}],878594)},419524,e=>{"use strict";let t=(0,e.i(388019).default)("AlignLeft",[["line",{x1:"21",x2:"3",y1:"6",y2:"6",key:"1fp77t"}],["line",{x1:"15",x2:"3",y1:"12",y2:"12",key:"v6grx8"}],["line",{x1:"17",x2:"3",y1:"18",y2:"18",key:"1awlsn"}]]);e.s(["AlignLeft",0,t],419524)},102703,e=>{"use strict";var t=e.i(478902),a=e.i(17203),n=e.i(180148),r=e.i(699879),i=e.i(345594),s=e.i(389959),l=e.i(837710);let o=(0,s.forwardRef)(({icon:e,title:o,description:c,url:d,urlLabel:u="Read more",defaultVisibility:p=!1,hideCollapse:m=!1,button:f,className:h="",block:g=!1},b)=>{let[y,_]=(0,s.useState)(p);return(0,t.jsx)("div",{ref:b,role:"alert",className:`${g?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${h}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:o})})]}),c&&!m?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>_(!y),children:y?(0,t.jsx)(r.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(n.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||d||f)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${y?"mt-3":""}`,style:{maxHeight:500*!!y},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c}),d&&(0,t.jsx)("div",{children:(0,t.jsx)(l.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(a.ExternalLink,{}),children:(0,t.jsx)(i.default,{href:d,target:"_blank",rel:"noreferrer",children:u})})}),f&&(0,t.jsx)("div",{children:f})]})]})})});o.displayName="InformationBox",e.s(["default",0,o])},768441,757489,e=>{"use strict";e.i(850036);var t=e.i(479084);function a({search:e,ignoredSchemas:n=[]}={}){let r=(0,t.joinSqlFragments)(n.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
    table_privileges as (
      select
        c.oid::int as id,
        n.nspname as schema_name,
        c.relname as name,
        c.relkind as kind,

        -- Anon Privileges
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'SELECT') as anon_select,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'INSERT') as anon_insert,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'UPDATE') as anon_update,
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'DELETE') as anon_delete,

        -- Authenticated Privileges
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'SELECT') as auth_select,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'INSERT') as auth_insert,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'UPDATE') as auth_update,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'DELETE') as auth_delete,

        -- Service Role Privileges
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'SELECT') as srv_select,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'INSERT') as srv_insert,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'UPDATE') as srv_update,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'DELETE') as srv_delete

      from pg_class c
      join pg_namespace n
        on n.oid = c.relnamespace
      left join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
        on true
      left join pg_roles pr
        on pr.oid = acl.grantee
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        ${r?t.safeSql`and n.nspname not in (${r})`:t.safeSql``}
        ${e?t.safeSql`and (n.nspname || '.' || c.relname) ilike ${(0,t.literal)(`%${e}%`)}`:t.safeSql``}
      group by c.oid, n.nspname, c.relname, c.relkind
    ),
    table_grants as (
      select
        id,
        schema_name,
        name,
        kind,
        case
          -- 1. Strict Granted: All 3 roles possess ALL 4 privileges
          when (
            anon_select and anon_insert and anon_update and anon_delete and
            auth_select and auth_insert and auth_update and auth_delete and
            srv_select and srv_insert and srv_update and srv_delete
          ) then 'granted'

          -- 2. Strict Revoked: NO role possesses ANY privilege
          when not (
            anon_select or anon_insert or anon_update or anon_delete or
            auth_select or auth_insert or auth_update or auth_delete or
            srv_select or srv_insert or srv_update or srv_delete
          ) then 'revoked'

          -- 3. Custom: Anything in between
          else 'custom'
        end as status
      from table_privileges
    )
  `}function n({search:e,ignoredSchemas:a=[]}={}){let r=(0,t.joinSqlFragments)(a.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
    function_privileges as (
      select
        n.nspname as schema_name,
        p.proname as name,

        -- Aggregate EXECUTE across all overloads + all 3 roles
        bool_or(pr.rolname = 'anon' and acl.privilege_type = 'EXECUTE') as anon_execute,
        bool_or(pr.rolname = 'authenticated' and acl.privilege_type = 'EXECUTE') as auth_execute,
        bool_or(pr.rolname = 'service_role' and acl.privilege_type = 'EXECUTE') as srv_execute

      from pg_proc p
      join pg_namespace n
        on n.oid = p.pronamespace
      left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
        on true
      left join pg_roles pr
        on pr.oid = acl.grantee
      where p.prokind in ('f', 'w')
        ${r?t.safeSql`and n.nspname not in (${r})`:t.safeSql``}
        ${e?t.safeSql`and (n.nspname || '.' || p.proname) ilike ${(0,t.literal)(`%${e}%`)}`:t.safeSql``}
      group by n.nspname, p.proname
    ),
    function_grants as (
      select
        schema_name,
        name,
        case
          when anon_execute and auth_execute and srv_execute then 'granted'
          when not (anon_execute or auth_execute or srv_execute) then 'revoked'
          else 'custom'
        end as status
      from function_privileges
    )
  `}function r({schema:e="public"}={}){return t.safeSql`
    select
      count(*)::int as grant_count
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    join pg_roles r on r.oid = d.defaclrole
    where n.nspname = ${(0,t.literal)(e)}
      and r.rolname = 'postgres'
      and d.defaclobjtype in ('r', 'f', 'S')
      and exists (
        select 1
        from aclexplode(d.defaclacl) acl
        join pg_roles gr on gr.oid = acl.grantee
        where gr.rolname in ('anon', 'authenticated', 'service_role')
      )
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let a=[];for(let n of["anon","authenticated","service_role"])"grant"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,t.ident)(n)}`):a.push(t.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,t.ident)(n)}`);return"revoke"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):a.push(t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),t.safeSql`${(0,t.joinSqlFragments)(a,";\n")};`},"buildFunctionPrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let n=(0,t.joinSqlFragments)(e.map(e=>{let a=e.indexOf("."),n=e.slice(0,a),r=e.slice(a+1);return t.safeSql`(${(0,t.literal)(n)},${(0,t.literal)(r)})`}),", "),r="grant"===a?t.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:t.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return t.safeSql`
    do $$
    declare
      nspname name;
      proname name;
      arg_types text;
    begin
      for nspname, proname, arg_types in
        select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname, p.proname) in (${n})
      loop
        execute format('${r}', nspname, proname, arg_types);
      end loop;
    end $$;
  `},"buildTablePrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let n="grant"===a?t.safeSql`grant select, insert, update, delete on table %I.%I to anon, authenticated, service_role`:t.safeSql`revoke all on table %I.%I from anon, authenticated, service_role`;return t.safeSql`
    do $$
    declare
      nspname name;
      relname name;
    begin
      for nspname, relname in
        select n.nspname, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.oid in (${(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", ")})
      loop
        execute format('${n}', nspname, relname);
      end loop;
    end $$;
  `},"getDefaultPrivilegesStateSql",0,r,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:a=[]}){let r=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${n({ignoredSchemas:a})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:a,limit:r,ignoredSchemas:i=[]}){return t.safeSql`
    with ${n({search:e,ignoredSchemas:i})}
    select
      (select count(*)::int from function_grants) as total_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'schema', fg.schema_name,
              'name', fg.name,
              'status', fg.status
            )
          )
          from (
            select *
            from function_grants
            order by schema_name, name
            offset ${(0,t.literal)(a)}
            limit ${(0,t.literal)(r)}
          ) fg
        ),
        '[]'::jsonb
      ) as functions;
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:n=[]}){let r=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${a({ignoredSchemas:n})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:n,limit:r,ignoredSchemas:i=[]}){return t.safeSql`
    with ${a({search:e,ignoredSchemas:i})}
    select
      (select count(*)::int from table_grants) as total_count,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', tg.id,
              'schema', tg.schema_name,
              'name', tg.name,
              'status', tg.status
            )
          )
          from (
            select *
            from table_grants
            order by schema_name, name
            offset ${(0,t.literal)(n)}
            limit ${(0,t.literal)(r)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var i=e.i(180141),s=e.i(818135),l=e.i(714403);async function o({projectRef:e,connectionString:t,schema:a},n){if(!e)throw Error("projectRef is required");let i=r({schema:a}),{result:s}=await (0,l.executeSql)({projectRef:e,connectionString:t,sql:i,queryKey:["default-privileges-state"]},n);return 3===s[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:t,schema:a},{enabled:n=!0}={})=>(0,i.queryOptions)({queryKey:s.privilegeKeys.defaultPrivileges(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,schema:a},n),enabled:n&&void 0!==e})],768441)},93472,165610,e=>{"use strict";var t=e.i(478902);let a=(0,e.i(388019).default)("OctagonAlert",[["path",{d:"M12 16h.01",key:"1drbdi"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",key:"1fd625"}]]);e.s(["AlertOctagon",0,a],165610);var n=e.i(217444),r=e.i(872646),i=e.i(833655),s=e.i(975924),l=e.i(389959),o=e.i(938933);let c={danger:(0,t.jsx)(a,{strokeWidth:1.5,size:18}),success:(0,t.jsx)(r.CheckCircle,{strokeWidth:1.5,size:18}),warning:(0,t.jsx)(n.AlertTriangle,{strokeWidth:1.5,size:18}),info:(0,t.jsx)(i.Info,{strokeWidth:1.5,size:18}),neutral:(0,t.jsx)(t.Fragment,{})};e.s(["Alert",0,function({variant:e="neutral",className:a,title:n,withIcon:r,closable:i,children:d,icon:u,actions:p}){let m=(0,o.default)("alert"),[f,h]=(0,l.useState)(!0),g=[m.base];g.push(m.variant[e].base),a&&g.push(a);let b=[m.description,m.variant[e].description],y=[m.close];return(0,t.jsx)(t.Fragment,{children:f&&(0,t.jsxs)("div",{className:g.join(" "),children:[r?(0,t.jsx)("div",{className:m.variant[e].icon,children:r&&c[e]}):null,u&&u,(0,t.jsxs)("div",{className:"flex flex-1 items-center justify-between",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:[m.variant[e].header,m.header].join(" "),children:n}),(0,t.jsx)("div",{className:b.join(" "),children:d})]}),p]}),i&&(0,t.jsx)("button",{"aria-label":"Close alert",onClick:()=>h(!1),className:y.join(" "),children:(0,t.jsx)(s.X,{strokeWidth:2,size:16})})]})})}],93472)},64102,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(843778);let r=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:a,header:n,disabled:r,className:i})=>{let s=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${r?" opacity-30":" opacity-100"}`,`${i}`];return(0,t.jsxs)("div",{id:a,className:s.join(" "),children:[n,e]})},"FormSectionContent",0,({children:e,loading:n=!0,loaders:i,fullWidth:s,className:l})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${s&&"col-span-12!"}
        ${l}
      `,children:n?i?Array(i).fill(0).map((e,a)=>(0,t.jsx)(r,{},a)):a.Children.map(e,(e,a)=>(0,t.jsx)(r,{},a)):e}),"FormSectionLabel",0,({children:e,className:a="",description:r})=>void 0!==r?(0,t.jsxs)("div",{className:(0,n.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",a),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),r]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${a}`,children:e})])},101369,e=>{"use strict";var t=e.i(478902),a=e.i(843778);let n=({max:e=100,value:n=0,barClass:r="bg-foreground",bgClass:i="",type:s="vertical",borderClass:l="",labelBottom:o="",labelBottomClass:c="tabular-nums",labelTop:d="",labelTopClass:u=""})=>{if("horizontal"===s){let s=Number(n/e*100),p=`${s}%`,m=o||d;return(0,t.jsxs)("div",{className:"flex flex-col w-full",children:[m&&(0,t.jsxs)("div",{className:"flex align-baseline justify-between pb-1 space-x-8",children:[(0,t.jsx)("p",{className:(0,a.cn)("text-foreground text-sm truncate capitalize-sentence",d.length>0&&"max-w-[75%]",c),children:o}),(0,t.jsx)("p",{className:(0,a.cn)("text-foreground-light text-sm",u),children:d})]}),(0,t.jsx)("div",{className:`relative rounded-sm h-1 overflow-hidden w-full border p-0 ${i||"bg-surface-400"} ${l||"border-none"}`,children:(0,t.jsx)("div",{className:`absolute rounded-sm inset-x-0 bottom-0 h-1 ${r} transition-all`,style:{width:p}})})]})}{let a=Number(n/e*35);return a<2&&(a=2),(0,t.jsx)("div",{className:`relative rounded-sm w-5 overflow-hidden border p-1 ${i||"bg-gray-400"} ${l||"border-none"}`,style:{height:35},children:(0,t.jsx)("div",{className:`absolute inset-x-0 bottom-0 w-5 ${r}`,style:{height:a}})})}};e.s(["SparkBar",0,n,"default",0,n])},577846,(e,t,a)=>{var n=e.r(714530);t.exports=function(e,t){return n(t,function(t){return e[t]})}},943262,(e,t,a)=>{var n=e.r(577846),r=e.r(375493);t.exports=function(e){return null==e?[]:n(e,r(e))}},333990,(e,t,a)=>{var n=e.r(491761),r=e.r(775484),i=e.r(141892),s=e.r(684912),l=e.r(943262),o=Math.max;t.exports=function(e,t,a,c){e=r(e)?e:l(e),a=a&&!c?s(a):0;var d=e.length;return a<0&&(a=o(d+a,0)),i(e)?a<=d&&e.indexOf(t,a)>-1:!!d&&n(e,t,a)>-1}},291969,e=>{"use strict";let t=(0,e.i(388019).default)("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);e.s(["FileText",0,t],291969)},554222,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(355901),r=e.i(171997),i=e.i(539013),s=e.i(647307),l=e.i(635494);e.s(["SchemaEditor",0,({visible:e,onSuccess:o,closePanel:c})=>{let{data:d}=(0,l.useSelectedProjectQuery)(),[u,p]=(0,a.useState)({name:void 0}),[m,f]=(0,a.useState)(""),{mutateAsync:h,isPending:g}=(0,s.useSchemaCreateMutation)();(0,a.useEffect)(()=>{e&&(f(""),p({name:void 0}))},[e]);let b=async()=>{let e={};if(0===m.length&&(e.name="Please provide a name for your schema"),Object.keys(e).length>0)return p(e);if(void 0===d)return console.error("Project is required");try{await h({projectRef:d.ref,connectionString:d.connectionString,name:m}),o(m),n.toast.success(`Successfully created schema "${m}"`)}catch(e){n.toast.error(`Failed to create schema: ${e}`)}};return(0,t.jsx)(i.SidePanel,{size:"medium",visible:e,header:"Create a new schema",className:"transition-all duration-100 ease-in",onCancel:c,onConfirm:b,loading:g,cancelText:"Cancel",confirmText:"Save",children:(0,t.jsx)(t.Fragment,{children:(0,t.jsx)(i.SidePanel.Content,{children:(0,t.jsx)("div",{className:"space-y-10 py-6",children:(0,t.jsx)(r.Input,{label:"Schema name",layout:"vertical",type:"text",error:u?.name,value:m,onChange:e=>f(e.target.value)})})})})},"SchemaEditor")}])},569033,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(124416);let n=()=>{let[e,n]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_INLINE_EDITOR,!1);return{inlineEditorEnabled:e??!1,setInlineEditorEnabled:n}},r=()=>{let[e,n]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_QUEUE_OPERATIONS,!1);return{isQueueOperationsEnabled:e??!1,setIsQueueOperationsEnabled:n}};e.s(["useIsInlineEditorEnabled",0,()=>{let{inlineEditorEnabled:e}=n();return e??!1},"useIsInlineEditorSetting",0,n,"useIsQueueOperationsEnabled",0,()=>{let{isQueueOperationsEnabled:e}=r();return e??!1},"useIsQueueOperationsSetting",0,r])},438756,(e,t,a)=>{t.exports=function(e){return null===e}},199327,e=>{"use strict";let t=(0,e.i(388019).default)("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);e.s(["Home",0,t],199327)},686255,e=>{"use strict";e.s(["enumeratedTypesKeys",0,{list:e=>["projects",e,"enumerated-types"]}])},155482,e=>{"use strict";var t=e.i(248593),a=e.i(242882),n=e.i(686255),r=e.i(234745);async function i({projectRef:e,connectionString:a},n){if(!e)throw Error("projectRef is required");let s=new Headers;a&&s.set("x-connection-encrypted",a);let{data:l,error:o}=await (0,r.get)("/platform/pg-meta/{ref}/types",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:Object.fromEntries(s),signal:n});return o&&(0,r.handleError)(o),l}e.s(["useEnumeratedTypesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...s}={})=>(0,a.useQuery)({queryKey:n.enumeratedTypesKeys.list(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...s})])},691337,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),r=e.i(355901),i=e.i(509847),s=e.i(714403);async function l({projectRef:e,connectionString:a,payload:n}){let r=new Headers;a&&r.set("x-connection-encrypted",a);let{sql:i}=t.default.policies.create(n),{result:o}=await (0,s.executeSql)({projectRef:e,connectionString:a,sql:i,queryKey:["policy","create"]});return o}e.s(["createDatabasePolicy",0,l,"useDatabasePolicyCreateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let o=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,n){let{projectRef:r}=a;await o.invalidateQueries({queryKey:i.databasePoliciesKeys.list(r)}),await e?.(t,a,n)},async onError(e,a,n){void 0===t?r.toast.error(`Failed to create database policy: ${e.message}`):t(e,a,n)},...s})}])}]);