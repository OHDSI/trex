(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,245049,e=>{"use strict";var t=e.i(478902),a=e.i(975924),n=e.i(505859),i=e.i(938933);function r({align:e="center",ariaLabel:a,arrow:s=!1,children:o,className:l,defaultOpen:c=!1,modal:d,onOpenChange:u,open:m,overlay:p,side:f="bottom",sideOffset:_=6,style:b,header:h,footer:g,size:y="content",disabled:v,"data-testid":E}){let w=(0,i.default)("popover"),S=[w.content,w.size[y]];return l&&S.push(l),(0,t.jsxs)(n.Popover.Root,{defaultOpen:c,modal:d,onOpenChange:u,open:m,children:[(0,t.jsx)(n.Popover.Trigger,{disabled:v,className:w.trigger,"aria-label":a,"data-testid":E,children:o}),(0,t.jsx)(n.Popover.Portal,{children:(0,t.jsxs)(n.Popover.Content,{sideOffset:_,side:f,align:e,className:S.join(" "),style:b,children:[s&&(0,t.jsx)(n.Popover.Arrow,{offset:10}),h&&(0,t.jsx)("div",{className:w.header,children:h}),p,g&&(0,t.jsx)("div",{className:w.footer,children:g})]})})]})}r.Separator=function(){let e=(0,i.default)("popover");return(0,t.jsx)("div",{className:e.separator})},r.Close=function(){let e=(0,i.default)("popover");return(0,t.jsx)(n.Popover.Close,{className:e.close,children:(0,t.jsx)(a.X,{size:14,strokeWidth:2})})},e.s(["default",0,r])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},1962,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(274664),i=e.i(546595),r="Progress",[s,o]=(0,n.createContextScope)(r),[l,c]=s(r),d=a.forwardRef((e,a)=>{var n,r;let{__scopeProgress:s,value:o=null,max:c,getValueLabel:d=p,...u}=e;(c||0===c)&&!b(c)&&console.error((n=`${c}`,`Invalid prop \`max\` of value \`${n}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let m=b(c)?c:100;null===o||h(o,m)||console.error((r=`${o}`,`Invalid prop \`value\` of value \`${r}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let g=h(o,m)?o:null,y=_(g)?d(g,m):void 0;return(0,t.jsx)(l,{scope:s,value:g,max:m,children:(0,t.jsx)(i.Primitive.div,{"aria-valuemax":m,"aria-valuemin":0,"aria-valuenow":_(g)?g:void 0,"aria-valuetext":y,role:"progressbar","data-state":f(g,m),"data-value":g??void 0,"data-max":m,...u,ref:a})})});d.displayName=r;var u="ProgressIndicator",m=a.forwardRef((e,a)=>{let{__scopeProgress:n,...r}=e,s=c(u,n);return(0,t.jsx)(i.Primitive.div,{"data-state":f(s.value,s.max),"data-value":s.value??void 0,"data-max":s.max,...r,ref:a})});function p(e,t){return`${Math.round(e/t*100)}%`}function f(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function _(e){return"number"==typeof e}function b(e){return _(e)&&!isNaN(e)&&e>0}function h(e,t){return _(e)&&!isNaN(e)&&e<=t&&e>=0}m.displayName=u,e.s(["Indicator",0,m,"Progress",0,d,"ProgressIndicator",0,m,"Root",0,d,"createProgressScope",0,o],386108);var g=e.i(386108),g=g,y=e.i(843778);let v=a.forwardRef(({className:e,value:a,...n},i)=>(0,t.jsx)(g.Root,{ref:i,className:(0,y.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...n,children:(0,t.jsx)(g.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(a||0)}%)`}})}));v.displayName=g.Root.displayName,e.s(["Progress",0,v],1962)},474325,e=>{"use strict";var t=e.i(478902),a=e.i(774803),n=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:i,action:r,message:s,description:o="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(a.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:s}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[i||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(n.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:o}),r]})]})]})])},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:i})=>[`CREATE TABLE ${(0,t.ident)(i)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(i)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(i)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),i=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},i){if(!n)throw Error("id is required");let r=a({id:n}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",n]},i);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...r}={})=>(0,i.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),a=e.i(242882),n=e.i(818135),i=e.i(714403);let r=t.default.tablePrivileges.list();async function s({projectRef:e,connectionString:t},a){let{result:n}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:r.sql,queryKey:["table-privileges"]},a);return n}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:n.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...r}={})=>(0,a.useQuery)({queryKey:n.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),enabled:i&&void 0!==e,...r})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],a=["SELECT","INSERT","UPDATE","DELETE"],n={anon:[...a],authenticated:[...a],service_role:[...a]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,a,"DEFAULT_DATA_API_PRIVILEGES",0,n,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>a.includes(e)])},310959,e=>{"use strict";var t=e.i(479084),a=e.i(721490);let n=10240,i=50,r=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],s=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(s),l=new Set([...r,...s,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,i,"MAX_CHARACTERS",0,n,"getTableRowsSql",0,({table:e,filters:s=[],sorts:c=[],page:d,limit:u,maxCharacters:m=n,maxArraySize:p=i,sortExcludedColumns:f=[]})=>{if(!e||!e.columns)return t.safeSql``;let _=new a.Query().from(e.name,e.schema).select();s.forEach(t=>{let a=e.columns?.find(e=>e.name===t.column),n=!a||r.includes(a.format);_=_.filter(t.column,t.operator,n||""!==t.value?t.value:null)});let b=e.live_rows_estimate||0;if(0===c.length&&b<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let a=e.primary_keys?.map(e=>e.name);if(a&&a.length>0&&!a.every(e=>t.includes(e)))return a;if(e.columns&&e.columns.length>0){let a=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(a.length>0)return[a[0].name]}return[]})(e,{excludedColumns:f});t.length>0&&t.forEach(t=>{_=_.order(e.name,t)})}else c.forEach(e=>{_=_.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:h,to:g}=function(e,t=100){let a=e?e*t:0;return{from:a,to:e?a+t-1:t-1}}((d??1)-1,u),y=t.safeSql`with _base_query as (${_.range(h,g).toSql({isCTE:!1,isFinal:!1})})`,v=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),E=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),w=v.map(({name:e})=>{let a=(0,t.ident)(e);return E.includes(e)?t.safeSql`case
        when octet_length(${a}::text) > ${(0,t.literal)(m)} 
        then left(${a}::text, ${(0,t.literal)(m)}) || '...'
        else ${a}::text
      end as ${a}`:a});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:a})=>{let n=w.findIndex(a=>a===(0,t.ident)(e)),i=o.has(a),r=i?t.safeSql`::${(0,t.keyword)(a)}[]`:t.safeSql`::text[]`,s=i?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);n>=0&&(w[n]=t.safeSql`
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
      `)});let S=(0,t.joinSqlFragments)(w,","),T=new a.Query().from("_base_query").select(S);return t.safeSql`${y}
  ${T.toSql({isCTE:!0,isFinal:!0})}`}])},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:a,...n}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:a?.role,...n}],tableRowsCount:(e,{table:t,...a}={})=>["projects",e,"table-rows",t?.id,"count",a],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),a=e.i(962217);e.s(["formatFilterValue",0,function(e,a){let n=e.columns.find(e=>e.name==a.column);if(n&&(0,t.isNumericalColumn)(n.format)){let e=Number(a.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(a.value)}return a.value},"getPrimaryKeys",0,function({table:e}){if(!(0,a.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),a=e.i(356003),n=e.i(989567),i=e.i(389959),r=e.i(85626),s=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),d=e.i(940562),u=e.i(721490),m=e.i(310959),p=e.i(242882);e.i(128328);var f=e.i(86086),_=e.i(790819),b=e.i(46974),h=e.i(311827),g=e.i(234745),y=e.i(714403),v=e.i(962217),E=e.i(48189),w=e.i(908937),S=e.i(201461),T=e.i(237948);async function j(e,t=3,a=1e3){for(let n=0;n<=t;n++)try{return await e()}catch(e){if(429===(e instanceof T.ResponseError?e.code:e.status)&&n<t){let t=function(e){if(e instanceof T.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),i=t?1e3*t:a*Math.pow(2,n);await (0,E.timeout)(i);continue}throw e}throw Error("Max retries reached without success")}let x=({table:e,filters:t=[],sorts:a=[]})=>{let n,i,r,s,o,l=new u.Query,d=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),m=l.from(e.name,e.schema??void 0).select(d.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...d],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let a=(0,b.formatFilterValue)(e,t);m=m.filter(t.column,t.operator,a)});let p=!1,{cursorPaginationEligible:f,cursorPaginationNonEligible:_}=(n=[],i=[],(r=e.primaryKey)&&n.push(r),s=e.uniqueIndexes,(o=s?.filter(t=>t.every(t=>{let a=e.columns.find(e=>e.name===t);return!!a&&!a.isNullable})))&&n.push(...o),i.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:n,cursorPaginationNonEligible:i}),g=e.type===h.ENTITY_TYPE.TABLE||e.type===h.ENTITY_TYPE.PARTITIONED_TABLE||e.type===h.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===a.length)f.length>0?(p=f[0],f[0].forEach(t=>{m=m.order(e.name,t)})):(_.length>0&&(m=m.order(e.name,_[0])),g&&(m=m.order(e.name,"ctid")));else{a.forEach(e=>{m=m.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=f[0];if(t){let n=new Set(a.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!n.has(e)).forEach(t=>{m=m.order(e.name,t)})}else g&&(m=m.order(e.name,"ctid"))}return{sql:m,cursorColumns:p}},P=async({projectRef:e,connectionString:t,table:a,filters:n=[],sorts:i=[],roleImpersonationState:r,progressCallback:s})=>{if(f.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=x({table:a,sorts:i,filters:n});if(c){let a=null;for(;;){let n=l.clone();a&&(n=n.filter(c,">",c.map(e=>a[e])));let i=(0,w.wrapWithRoleImpersonation)(n.range(0,499).toSql(),r);try{let{result:n}=await j(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:i}));for(let e of(o.push(...n),s?.(o.length),a={},c))a[e]=n[n.length-1]?.[e];if(n.length<500)break;await (0,E.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let a=-1;for(;;){let n=500*(a+=1),i=(a+1)*500-1,c=(0,w.wrapWithRoleImpersonation)(l.range(n,i).toSql(),r);try{let{result:a}=await j(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...a),s?.(o.length),a.length<500)break;await (0,E.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[d.ROLE_IMPERSONATION_NO_RESULTS])};async function q({queryClient:e,projectRef:t,connectionString:a,tableId:n,roleImpersonationState:i,filters:r,sorts:o,limit:c,page:d,preflightCheck:u=!1},p){let f=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:n});if(!f)throw Error("Table not found");let _=(0,s.parseSupaTable)(f),b=r?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),h=(0,v.isMsSqlForeignTable)(f)?Array.from(new Set(b)):void 0,E=(0,w.wrapWithRoleImpersonation)((0,m.getTableRowsSql)({table:f,filters:r,sorts:o,limit:c,page:d,sortExcludedColumns:h}),i);try{let{result:e}=await (0,y.executeSql)({projectRef:t,connectionString:a,sql:E,queryKey:["table-rows",_?.id],isRoleImpersonationEnabled:(0,S.isRoleImpersonationEnabled)(i?.role),preflightCheck:u},p);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,g.handleError)(e)}}function A(e,{projectRef:t,connectionString:a,tableId:n,readReplicaIdentifier:i,...r}){return e.fetchQuery({queryKey:_.tableRowKeys.tableRows(t,{table:{id:n},readReplicaIdentifier:i,...r}),queryFn:({signal:i})=>q({queryClient:e,projectRef:t,connectionString:a,tableId:n,...r},i)})}e.s(["executeWithRetry",0,j,"fetchAllTableRows",0,P,"getAllTableRowsSql",0,x,"prefetchTableRows",0,A,"useTableRowsQuery",0,({projectRef:e,tableId:t,...n},{enabled:i=!0,...r}={})=>{let s=(0,a.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:d,...u}=n;return(0,p.useQuery)({queryKey:_.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...u}),queryFn:({signal:a})=>q({queryClient:s,projectRef:e,connectionString:l,tableId:t,...n},a),enabled:i&&void 0!==e&&void 0!==t&&(!f.IS_PLATFORM||void 0!==l),...r})}],70756);var R=e.i(635494),I=e.i(636047);function L({queryClient:e,projectRef:t,connectionString:a,readReplicaIdentifier:n,id:i,sorts:r,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:i}).then(l=>{if(l){let d=(0,s.parseSupaTable)(l),{sorts:u=[],filters:m=[]}=(0,s.loadTableEditorStateFromLocalStorage)(t,l.id)??{};A(e,{projectRef:t,connectionString:a,readReplicaIdentifier:n,tableId:i,sorts:r??(0,s.formatSortURLParams)(d.name,u),filters:o??(0,s.formatFilterURLParams)(m),page:1,limit:I.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function N(){let e=(0,n.useRouter)(),t=(0,a.useQueryClient)(),{data:r}=(0,R.useSelectedProjectQuery)(),{connectionString:s,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,S.useRoleImpersonationStateSnapshot)();return(0,i.useCallback)(({id:a,filters:n,sorts:i})=>{let o=a?Number(a):void 0;!r||!o||isNaN(o)||(e.prefetch(`/project/${r.ref}/editor/${o}`),L({queryClient:t,projectRef:r.ref,connectionString:s,readReplicaIdentifier:l,id:o,sorts:i,filters:n,roleImpersonationState:c}).catch(()=>{}))},[s,l,r,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:a,sorts:n,filters:i,href:s,children:o,...l}){let c=N();return(0,t.jsx)(r.default,{href:s||`/project/${e}/editor/${a}`,prefetcher:()=>c({id:a,sorts:n,filters:i}),...l,children:o})},"prefetchEditorTablePage",0,L,"usePrefetchEditorTablePage",0,N],941381);var D=e.i(972089),k=e.i(462142);let M=({projectRef:e,schemaName:t},{enabled:a=!0}={})=>{let n=a&&!!e&&!!t,{data:r,isPending:s,isError:o}=(0,k.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:n,select:({db_schema:e})=>e}),l=(0,i.useMemo)(()=>r?(0,k.parseDbSchemaString)(r):[],[r]);return!n||s?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,M],963203);var $=e.i(84001);let Y=[],C={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:a,tableNames:n=Y},{enabled:r=!0,...s}={})=>{let o=(0,i.useMemo)(()=>new Set(n.filter(e=>"string"==typeof e&&e.length>0)),[n]),l=o.size>0,c=M({projectRef:e,schemaName:a},{enabled:r}),d=c.isSuccess&&!0===c.data,u=r&&l,m=(0,D.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:u,...s});return(0,i.useMemo)(()=>{if(!r||"pending"===c.status||u&&m.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||u&&m.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:C,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=d?((e,t,a)=>{if(!e)return{};let n={};return e.forEach(e=>{if(e.schema===t&&a.has(e.name)){var i;let t;n[e.name]=(i=e.privileges,t={anon:[],authenticated:[],service_role:[]},i.forEach(e=>{let{grantee:a,privilege_type:n}=e;(0,$.isApiAccessRole)(a)&&(0,$.isApiPrivilegeType)(n)&&t[a].push(n)}),t)}}),n})(m.data,a,o):{};return o.forEach(a=>{if(!d){e[a]={apiAccessType:"none"};return}let n=t[a]??{anon:[],authenticated:[],service_role:[]},i=n.anon.length>0||n.authenticated.length>0||n.service_role.length>0;e[a]=i?{apiAccessType:"access",grantStatus:$.API_ACCESS_ROLES.every(e=>$.API_PRIVILEGE_TYPES.every(t=>n[e].includes(t)))?"granted":"custom",privileges:n}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[r,u,l,c.status,d,m.isPending,m.isError,m.data,a,o])}],954707)},507648,(e,t,a)=>{var n=e.r(203941),i=e.r(297926),r=e.r(615573),s=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),a=arguments[0],o=e;o--;)t[o-1]=arguments[o];return n(s(a)?r(a):[a],i(t,1))}},707409,e=>{"use strict";var t=e.i(507648),a=e.i(827047);let n=["int2","int4","int8","float4","float8","numeric","double precision"],i=["json","jsonb"],r=["text","varchar"],s=["timestamp","timestamptz"],o=["date"],l=["time","timetz"],c=(0,t.default)(s,o,l),d=["uuid","bool","vector","bytea"],u=(0,a.default)((0,t.default)(n,i,r,c,d));e.s(["DATETIME_TYPES",0,c,"DATE_TYPES",0,o,"JSON_TYPES",0,i,"NUMERICAL_TYPES",0,n,"OTHER_DATA_TYPES",0,d,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,r,"TIMESTAMP_TYPES",0,s,"TIME_TYPES",0,l])},569033,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(124416);let n=()=>{let[e,n]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_INLINE_EDITOR,!1);return{inlineEditorEnabled:e??!1,setInlineEditorEnabled:n}},i=()=>{let[e,n]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_QUEUE_OPERATIONS,!1);return{isQueueOperationsEnabled:e??!1,setIsQueueOperationsEnabled:n}};e.s(["useIsInlineEditorEnabled",0,()=>{let{inlineEditorEnabled:e}=n();return e??!1},"useIsInlineEditorSetting",0,n,"useIsQueueOperationsEnabled",0,()=>{let{isQueueOperationsEnabled:e}=i();return e??!1},"useIsQueueOperationsSetting",0,i])},438756,(e,t,a)=>{t.exports=function(e){return null===e}},170286,(e,t,a)=>{e.e,t.exports=function(){"use strict";var e={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},t=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,a=/\d/,n=/\d\d/,i=/\d\d?/,r=/\d*[^-_:/,()\s\d]+/,s={},o=function(e){return(e*=1)+(e>68?1900:2e3)},l=function(e){return function(t){this[e]=+t}},c=[/[+-]\d\d:?(\d\d)?|Z/,function(e){(this.zone||(this.zone={})).offset=function(e){if(!e||"Z"===e)return 0;var t=e.match(/([+-]|\d\d)/g),a=60*t[1]+(+t[2]||0);return 0===a?0:"+"===t[0]?-a:a}(e)}],d=function(e){var t=s[e];return t&&(t.indexOf?t:t.s.concat(t.f))},u=function(e,t){var a,n=s.meridiem;if(n){for(var i=1;i<=24;i+=1)if(e.indexOf(n(i,0,t))>-1){a=i>12;break}}else a=e===(t?"pm":"PM");return a},m={A:[r,function(e){this.afternoon=u(e,!1)}],a:[r,function(e){this.afternoon=u(e,!0)}],Q:[a,function(e){this.month=3*(e-1)+1}],S:[a,function(e){this.milliseconds=100*e}],SS:[n,function(e){this.milliseconds=10*e}],SSS:[/\d{3}/,function(e){this.milliseconds=+e}],s:[i,l("seconds")],ss:[i,l("seconds")],m:[i,l("minutes")],mm:[i,l("minutes")],H:[i,l("hours")],h:[i,l("hours")],HH:[i,l("hours")],hh:[i,l("hours")],D:[i,l("day")],DD:[n,l("day")],Do:[r,function(e){var t=s.ordinal,a=e.match(/\d+/);if(this.day=a[0],t)for(var n=1;n<=31;n+=1)t(n).replace(/\[|\]/g,"")===e&&(this.day=n)}],w:[i,l("week")],ww:[n,l("week")],M:[i,l("month")],MM:[n,l("month")],MMM:[r,function(e){var t=d("months"),a=(d("monthsShort")||t.map(function(e){return e.slice(0,3)})).indexOf(e)+1;if(a<1)throw Error();this.month=a%12||a}],MMMM:[r,function(e){var t=d("months").indexOf(e)+1;if(t<1)throw Error();this.month=t%12||t}],Y:[/[+-]?\d+/,l("year")],YY:[n,function(e){this.year=o(e)}],YYYY:[/\d{4}/,l("year")],Z:c,ZZ:c};return function(a,n,i){i.p.customParseFormat=!0,a&&a.parseTwoDigitYear&&(o=a.parseTwoDigitYear);var r=n.prototype,l=r.parse;r.parse=function(a){var n=a.date,r=a.utc,o=a.args;this.$u=r;var c=o[1];if("string"==typeof c){var d=!0===o[2],u=!0===o[3],p=o[2];u&&(p=o[2]),s=this.$locale(),!d&&p&&(s=i.Ls[p]),this.$d=function(a,n,i,r){try{if(["x","X"].indexOf(n)>-1)return new Date(("X"===n?1e3:1)*a);var o=(function(a){var n,i;n=a,i=s&&s.formats;for(var r=(a=n.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,function(t,a,n){var r=n&&n.toUpperCase();return a||i[n]||e[n]||i[r].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,function(e,t,a){return t||a.slice(1)})})).match(t),o=r.length,l=0;l<o;l+=1){var c=r[l],d=m[c],u=d&&d[0],p=d&&d[1];r[l]=p?{regex:u,parser:p}:c.replace(/^\[|\]$/g,"")}return function(e){for(var t={},a=0,n=0;a<o;a+=1){var i=r[a];if("string"==typeof i)n+=i.length;else{var s=i.regex,l=i.parser,c=e.slice(n),d=s.exec(c)[0];l.call(t,d),e=e.replace(d,"")}}return function(e){var t=e.afternoon;if(void 0!==t){var a=e.hours;t?a<12&&(e.hours+=12):12===a&&(e.hours=0),delete e.afternoon}}(t),t}})(n)(a),l=o.year,c=o.month,d=o.day,u=o.hours,p=o.minutes,f=o.seconds,_=o.milliseconds,b=o.zone,h=o.week,g=new Date,y=d||(l||c?1:g.getDate()),v=l||g.getFullYear(),E=0;l&&!c||(E=c>0?c-1:g.getMonth());var w,S=u||0,T=p||0,j=f||0,x=_||0;return b?new Date(Date.UTC(v,E,y,S,T,j,x+60*b.offset*1e3)):i?new Date(Date.UTC(v,E,y,S,T,j,x)):(w=new Date(v,E,y,S,T,j,x),h&&(w=r(w).week(h).toDate()),w)}catch(e){return new Date("")}}(n,c,r,i),this.init(),p&&!0!==p&&(this.$L=this.locale(p).$L),(d||u)&&n!=this.format(c)&&(this.$d=new Date("")),s={}}else if(c instanceof Array)for(var f=c.length,_=1;_<=f;_+=1){o[1]=c[_-1];var b=i.apply(this,o);if(b.isValid()){this.$d=b.$d,this.$L=b.$L,this.init();break}_===f&&(this.$d=new Date(""))}else l.call(this,a)}}}()},197187,e=>{"use strict";let t=(0,e.i(388019).default)("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);e.s(["default",0,t])},181827,e=>{"use strict";var t=e.i(478902),a=e.i(156054);e.s(["MonacoEditor",0,({width:e,height:n,value:i,language:r,readOnly:s=!1,onChange:o,onMount:l})=>(0,t.jsx)(a.default,{width:e,height:n||"200px",theme:"supabase",wrapperProps:{className:"grid-monaco-editor-container"},className:"grid-monaco-editor",defaultLanguage:r||"plaintext",defaultValue:i,onChange:o,onMount:function(e){e.changeViewZones(e=>{e.addZone({afterLineNumber:0,heightInPx:4,domNode:document.createElement("div")})});let t=e.getModel().getPositionAt(i?.length);e.setPosition(t),setTimeout(()=>{e?.focus()},0),l&&l(e)},options:{readOnly:s,tabSize:2,fontSize:13,minimap:{enabled:!1},glyphMargin:!1,folding:!1,lineNumbers:"off",lineNumbersMinChars:0,scrollBeyondLastLine:!1,wordWrap:"on",unusualLineTerminators:"off"}})])}]);