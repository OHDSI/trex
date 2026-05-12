(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,245049,e=>{"use strict";var t=e.i(478902),n=e.i(975924),a=e.i(505859),r=e.i(938933);function i({align:e="center",ariaLabel:n,arrow:s=!1,children:o,className:l,defaultOpen:c=!1,modal:d,onOpenChange:u,open:m,overlay:p,side:f="bottom",sideOffset:h=6,style:_,header:b,footer:g,size:y="content",disabled:v,"data-testid":w}){let E=(0,r.default)("popover"),x=[E.content,E.size[y]];return l&&x.push(l),(0,t.jsxs)(a.Popover.Root,{defaultOpen:c,modal:d,onOpenChange:u,open:m,children:[(0,t.jsx)(a.Popover.Trigger,{disabled:v,className:E.trigger,"aria-label":n,"data-testid":w,children:o}),(0,t.jsx)(a.Popover.Portal,{children:(0,t.jsxs)(a.Popover.Content,{sideOffset:h,side:f,align:e,className:x.join(" "),style:_,children:[s&&(0,t.jsx)(a.Popover.Arrow,{offset:10}),b&&(0,t.jsx)("div",{className:E.header,children:b}),p,g&&(0,t.jsx)("div",{className:E.footer,children:g})]})})]})}i.Separator=function(){let e=(0,r.default)("popover");return(0,t.jsx)("div",{className:e.separator})},i.Close=function(){let e=(0,r.default)("popover");return(0,t.jsx)(a.Popover.Close,{className:e.close,children:(0,t.jsx)(n.X,{size:14,strokeWidth:2})})},e.s(["default",0,i])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},1962,e=>{"use strict";var t=e.i(478902),n=e.i(389959),a=e.i(274664),r=e.i(546595),i="Progress",[s,o]=(0,a.createContextScope)(i),[l,c]=s(i),d=n.forwardRef((e,n)=>{var a,i;let{__scopeProgress:s,value:o=null,max:c,getValueLabel:d=p,...u}=e;(c||0===c)&&!_(c)&&console.error((a=`${c}`,`Invalid prop \`max\` of value \`${a}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let m=_(c)?c:100;null===o||b(o,m)||console.error((i=`${o}`,`Invalid prop \`value\` of value \`${i}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let g=b(o,m)?o:null,y=h(g)?d(g,m):void 0;return(0,t.jsx)(l,{scope:s,value:g,max:m,children:(0,t.jsx)(r.Primitive.div,{"aria-valuemax":m,"aria-valuemin":0,"aria-valuenow":h(g)?g:void 0,"aria-valuetext":y,role:"progressbar","data-state":f(g,m),"data-value":g??void 0,"data-max":m,...u,ref:n})})});d.displayName=i;var u="ProgressIndicator",m=n.forwardRef((e,n)=>{let{__scopeProgress:a,...i}=e,s=c(u,a);return(0,t.jsx)(r.Primitive.div,{"data-state":f(s.value,s.max),"data-value":s.value??void 0,"data-max":s.max,...i,ref:n})});function p(e,t){return`${Math.round(e/t*100)}%`}function f(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function h(e){return"number"==typeof e}function _(e){return h(e)&&!isNaN(e)&&e>0}function b(e,t){return h(e)&&!isNaN(e)&&e<=t&&e>=0}m.displayName=u,e.s(["Indicator",0,m,"Progress",0,d,"ProgressIndicator",0,m,"Root",0,d,"createProgressScope",0,o],386108);var g=e.i(386108),g=g,y=e.i(843778);let v=n.forwardRef(({className:e,value:n,...a},r)=>(0,t.jsx)(g.Root,{ref:r,className:(0,y.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...a,children:(0,t.jsx)(g.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(n||0)}%)`}})}));v.displayName=g.Root.displayName,e.s(["Progress",0,v],1962)},474325,e=>{"use strict";var t=e.i(478902),n=e.i(774803),a=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:r,action:i,message:s,description:o="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(n.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:s}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[r||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(a.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:o}),i]})]})]})])},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let n=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:n,sourceTableSchema:a})=>`INSERT INTO ${(0,t.ident)(a)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(a)}.${(0,t.ident)(n)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:n,sourceTableName:a,sourceTableSchema:r})=>[`CREATE TABLE ${(0,t.ident)(r)}.${(0,t.ident)(n)} (LIKE ${(0,t.ident)(r)}.${(0,t.ident)(a)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(r)}.${(0,t.ident)(n)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,n],664304);var a=e.i(180141),r=e.i(242882),i=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:a},r){if(!a)throw Error("id is required");let i=n({id:a}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:i,queryKey:["table-editor",a]},r);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:n})=>(0,a.queryOptions)({queryKey:i.tableEditorKeys.tableEditor(e,n),queryFn:({signal:a})=>o({projectRef:e,connectionString:t,id:n},a)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:n,id:a}){return e.fetchQuery(l({projectRef:t,connectionString:n,id:a}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:n},{enabled:a=!0,...i}={})=>(0,r.useQuery)({...l({projectRef:e,connectionString:t,id:n}),enabled:a&&void 0!==e&&void 0!==n&&!isNaN(n),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...i})],34479)},310959,e=>{"use strict";var t=e.i(479084),n=e.i(721490);let a=10240,r=50,i=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],s=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(s),l=new Set([...i,...s,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,r,"MAX_CHARACTERS",0,a,"getTableRowsSql",0,({table:e,filters:s=[],sorts:c=[],page:d,limit:u,maxCharacters:m=a,maxArraySize:p=r,sortExcludedColumns:f=[]})=>{if(!e||!e.columns)return t.safeSql``;let h=new n.Query().from(e.name,e.schema).select();s.forEach(t=>{let n=e.columns?.find(e=>e.name===t.column),a=!n||i.includes(n.format);h=h.filter(t.column,t.operator,a||""!==t.value?t.value:null)});let _=e.live_rows_estimate||0;if(0===c.length&&_<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let n=e.primary_keys?.map(e=>e.name);if(n&&n.length>0&&!n.every(e=>t.includes(e)))return n;if(e.columns&&e.columns.length>0){let n=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(n.length>0)return[n[0].name]}return[]})(e,{excludedColumns:f});t.length>0&&t.forEach(t=>{h=h.order(e.name,t)})}else c.forEach(e=>{h=h.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:b,to:g}=function(e,t=100){let n=e?e*t:0;return{from:n,to:e?n+t-1:t-1}}((d??1)-1,u),y=t.safeSql`with _base_query as (${h.range(b,g).toSql({isCTE:!1,isFinal:!1})})`,v=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),w=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),E=v.map(({name:e})=>{let n=(0,t.ident)(e);return w.includes(e)?t.safeSql`case
        when octet_length(${n}::text) > ${(0,t.literal)(m)} 
        then left(${n}::text, ${(0,t.literal)(m)}) || '...'
        else ${n}::text
      end as ${n}`:n});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:n})=>{let a=E.findIndex(n=>n===(0,t.ident)(e)),r=o.has(n),i=r?t.safeSql`::${(0,t.keyword)(n)}[]`:t.safeSql`::text[]`,s=r?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);a>=0&&(E[a]=t.safeSql`
        case 
          when octet_length(${l}::text) > ${(0,t.literal)(m)} 
          then
            case
              when array_ndims(${l}) = 1
              then
                (select array_cat(${l}[1:${(0,t.literal)(p)}]${i}, ${s}${i}))${i}
              else
                ${l}[1:${(0,t.literal)(p)}]${i}
            end
          else ${l}${i}
        end
      `)});let x=(0,t.joinSqlFragments)(E,","),S=new n.Query().from("_base_query").select(x);return t.safeSql`${y}
  ${S.toSql({isCTE:!0,isFinal:!0})}`}])},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:n,...a}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:n?.role,...a}],tableRowsCount:(e,{table:t,...n}={})=>["projects",e,"table-rows",t?.id,"count",n],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),n=e.i(962217);e.s(["formatFilterValue",0,function(e,n){let a=e.columns.find(e=>e.name==n.column);if(a&&(0,t.isNumericalColumn)(a.format)){let e=Number(n.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(n.value)}return n.value},"getPrimaryKeys",0,function({table:e}){if(!(0,n.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),n=e.i(356003),a=e.i(989567),r=e.i(389959),i=e.i(85626),s=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),d=e.i(940562),u=e.i(721490),m=e.i(310959),p=e.i(242882);e.i(128328);var f=e.i(86086),h=e.i(790819),_=e.i(46974),b=e.i(311827),g=e.i(234745),y=e.i(714403),v=e.i(962217),w=e.i(48189),E=e.i(908937),x=e.i(201461),S=e.i(237948);async function j(e,t=3,n=1e3){for(let a=0;a<=t;a++)try{return await e()}catch(e){if(429===(e instanceof S.ResponseError?e.code:e.status)&&a<t){let t=function(e){if(e instanceof S.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),r=t?1e3*t:n*Math.pow(2,a);await (0,w.timeout)(r);continue}throw e}throw Error("Max retries reached without success")}let T=({table:e,filters:t=[],sorts:n=[]})=>{let a,r,i,s,o,l=new u.Query,d=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),m=l.from(e.name,e.schema??void 0).select(d.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...d],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let n=(0,_.formatFilterValue)(e,t);m=m.filter(t.column,t.operator,n)});let p=!1,{cursorPaginationEligible:f,cursorPaginationNonEligible:h}=(a=[],r=[],(i=e.primaryKey)&&a.push(i),s=e.uniqueIndexes,(o=s?.filter(t=>t.every(t=>{let n=e.columns.find(e=>e.name===t);return!!n&&!n.isNullable})))&&a.push(...o),r.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:a,cursorPaginationNonEligible:r}),g=e.type===b.ENTITY_TYPE.TABLE||e.type===b.ENTITY_TYPE.PARTITIONED_TABLE||e.type===b.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===n.length)f.length>0?(p=f[0],f[0].forEach(t=>{m=m.order(e.name,t)})):(h.length>0&&(m=m.order(e.name,h[0])),g&&(m=m.order(e.name,"ctid")));else{n.forEach(e=>{m=m.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=f[0];if(t){let a=new Set(n.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!a.has(e)).forEach(t=>{m=m.order(e.name,t)})}else g&&(m=m.order(e.name,"ctid"))}return{sql:m,cursorColumns:p}},q=async({projectRef:e,connectionString:t,table:n,filters:a=[],sorts:r=[],roleImpersonationState:i,progressCallback:s})=>{if(f.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=T({table:n,sorts:r,filters:a});if(c){let n=null;for(;;){let a=l.clone();n&&(a=a.filter(c,">",c.map(e=>n[e])));let r=(0,E.wrapWithRoleImpersonation)(a.range(0,499).toSql(),i);try{let{result:a}=await j(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:r}));for(let e of(o.push(...a),s?.(o.length),n={},c))n[e]=a[a.length-1]?.[e];if(a.length<500)break;await (0,w.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let n=-1;for(;;){let a=500*(n+=1),r=(n+1)*500-1,c=(0,E.wrapWithRoleImpersonation)(l.range(a,r).toSql(),i);try{let{result:n}=await j(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...n),s?.(o.length),n.length<500)break;await (0,w.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[d.ROLE_IMPERSONATION_NO_RESULTS])};async function A({queryClient:e,projectRef:t,connectionString:n,tableId:a,roleImpersonationState:r,filters:i,sorts:o,limit:c,page:d,preflightCheck:u=!1},p){let f=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:n,id:a});if(!f)throw Error("Table not found");let h=(0,s.parseSupaTable)(f),_=i?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),b=(0,v.isMsSqlForeignTable)(f)?Array.from(new Set(_)):void 0,w=(0,E.wrapWithRoleImpersonation)((0,m.getTableRowsSql)({table:f,filters:i,sorts:o,limit:c,page:d,sortExcludedColumns:b}),r);try{let{result:e}=await (0,y.executeSql)({projectRef:t,connectionString:n,sql:w,queryKey:["table-rows",h?.id],isRoleImpersonationEnabled:(0,x.isRoleImpersonationEnabled)(r?.role),preflightCheck:u},p);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,g.handleError)(e)}}function P(e,{projectRef:t,connectionString:n,tableId:a,readReplicaIdentifier:r,...i}){return e.fetchQuery({queryKey:h.tableRowKeys.tableRows(t,{table:{id:a},readReplicaIdentifier:r,...i}),queryFn:({signal:r})=>A({queryClient:e,projectRef:t,connectionString:n,tableId:a,...i},r)})}e.s(["executeWithRetry",0,j,"fetchAllTableRows",0,q,"getAllTableRowsSql",0,T,"prefetchTableRows",0,P,"useTableRowsQuery",0,({projectRef:e,tableId:t,...a},{enabled:r=!0,...i}={})=>{let s=(0,n.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:d,...u}=a;return(0,p.useQuery)({queryKey:h.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...u}),queryFn:({signal:n})=>A({queryClient:s,projectRef:e,connectionString:l,tableId:t,...a},n),enabled:r&&void 0!==e&&void 0!==t&&(!f.IS_PLATFORM||void 0!==l),...i})}],70756);var R=e.i(635494),N=e.i(636047);function D({queryClient:e,projectRef:t,connectionString:n,readReplicaIdentifier:a,id:r,sorts:i,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:n,id:r}).then(l=>{if(l){let d=(0,s.parseSupaTable)(l),{sorts:u=[],filters:m=[]}=(0,s.loadTableEditorStateFromLocalStorage)(t,l.id)??{};P(e,{projectRef:t,connectionString:n,readReplicaIdentifier:a,tableId:r,sorts:i??(0,s.formatSortURLParams)(d.name,u),filters:o??(0,s.formatFilterURLParams)(m),page:1,limit:N.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function I(){let e=(0,a.useRouter)(),t=(0,n.useQueryClient)(),{data:i}=(0,R.useSelectedProjectQuery)(),{connectionString:s,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,x.useRoleImpersonationStateSnapshot)();return(0,r.useCallback)(({id:n,filters:a,sorts:r})=>{let o=n?Number(n):void 0;!i||!o||isNaN(o)||(e.prefetch(`/project/${i.ref}/editor/${o}`),D({queryClient:t,projectRef:i.ref,connectionString:s,readReplicaIdentifier:l,id:o,sorts:r,filters:a,roleImpersonationState:c}).catch(()=>{}))},[s,l,i,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:n,sorts:a,filters:r,href:s,children:o,...l}){let c=I();return(0,t.jsx)(i.default,{href:s||`/project/${e}/editor/${n}`,prefetcher:()=>c({id:n,sorts:a,filters:r}),...l,children:o})},"prefetchEditorTablePage",0,D,"usePrefetchEditorTablePage",0,I],941381);var M=e.i(972089),k=e.i(462142);let L=({projectRef:e,schemaName:t},{enabled:n=!0}={})=>{let a=n&&!!e&&!!t,{data:i,isPending:s,isError:o}=(0,k.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:a,select:({db_schema:e})=>e}),l=(0,r.useMemo)(()=>i?(0,k.parseDbSchemaString)(i):[],[i]);return!a||s?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,L],963203);var $=e.i(84001);let C=[],Y={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:n,tableNames:a=C},{enabled:i=!0,...s}={})=>{let o=(0,r.useMemo)(()=>new Set(a.filter(e=>"string"==typeof e&&e.length>0)),[a]),l=o.size>0,c=L({projectRef:e,schemaName:n},{enabled:i}),d=c.isSuccess&&!0===c.data,u=i&&l,m=(0,M.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:u,...s});return(0,r.useMemo)(()=>{if(!i||"pending"===c.status||u&&m.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||u&&m.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:Y,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=d?((e,t,n)=>{if(!e)return{};let a={};return e.forEach(e=>{if(e.schema===t&&n.has(e.name)){var r;let t;a[e.name]=(r=e.privileges,t={anon:[],authenticated:[],service_role:[]},r.forEach(e=>{let{grantee:n,privilege_type:a}=e;(0,$.isApiAccessRole)(n)&&(0,$.isApiPrivilegeType)(a)&&t[n].push(a)}),t)}}),a})(m.data,n,o):{};return o.forEach(n=>{if(!d){e[n]={apiAccessType:"none"};return}let a=t[n]??{anon:[],authenticated:[],service_role:[]},r=a.anon.length>0||a.authenticated.length>0||a.service_role.length>0;e[n]=r?{apiAccessType:"access",grantStatus:$.API_ACCESS_ROLES.every(e=>$.API_PRIVILEGE_TYPES.every(t=>a[e].includes(t)))?"granted":"custom",privileges:a}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[i,u,l,c.status,d,m.isPending,m.isError,m.data,n,o])}],954707)},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),n=e.i(38429),a=e.i(356003),r=e.i(355901),i=e.i(667286),s=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:n,schema:a,name:r,version:i,cascade:s=!1,createSchema:c=!1}){let d=new Headers;n&&d.set("x-connection-encrypted",n);let u=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:i,cascade:s,createSchema:c}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:n,sql:u,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let c=(0,a.useQueryClient)();return(0,n.useMutation)({mutationFn:e=>l(e),async onSuccess(t,n,a){let{projectRef:r}=n;await Promise.all([c.invalidateQueries({queryKey:i.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:s.configKeys.upgradeEligibility(r)})]),await e?.(t,n,a)},async onError(e,n,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,n,a)},...o})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),n=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function i({projectRef:e,connectionString:a,indexStatements:r,onSuccess:s,onError:o}){if(!e){let e=Error("Project ref is required");return o&&o(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return o&&o(e),Promise.reject(e)}try{return await (0,n.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),s&&s(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),o&&o(e),Promise.reject(e)}}function s(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let n=t[1]||t[2];return!n||!a.INTERNAL_SCHEMAS.includes(n.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let n=Number(e),a=Number(t);return n<=0||n<=a?0:(n-a)/n*100},"createIndexes",0,i,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=s(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,s,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var o=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,o.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:n,indexAdvisor:a}=r(t??[]),i=!!n&&!!a,s=i&&null!==n.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:i,isIndexAdvisorEnabled:s}}],888525);var c=e.i(478902),d=e.i(389959),u=e.i(232520),m=e.i(837710),p=e.i(610144),f=e.i(967052);let h=({open:e,setOpen:n})=>{let a=(0,f.useTrack)(),{data:i}=(0,l.useSelectedProjectQuery)(),{data:s}=(0,o.useDatabaseExtensionsQuery)({projectRef:i?.ref,connectionString:i?.connectionString}),{hypopg:d,indexAdvisor:m}=r(s),{mutateAsync:h,isPending:_}=(0,p.useDatabaseExtensionEnableMutation)(),b=async()=>{if(void 0===i)return t.toast.error("Project is required");try{d?.installed_version===null&&await h({projectRef:i?.ref,connectionString:i?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),m?.installed_version===null&&await h({projectRef:i?.ref,connectionString:i?.connectionString,name:m.name,schema:m?.schema??"extensions",version:m.default_version}),t.toast.success("Successfully enabled Index Advisor!"),n(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(u.AlertDialog,{open:e,onOpenChange:()=>n(!e),children:(0,c.jsxs)(u.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(u.AlertDialogHeader,{children:[(0,c.jsx)(u.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(u.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(u.AlertDialogFooter,{children:[(0,c.jsx)(u.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(u.AlertDialogAction,{onClick:e=>{e.preventDefault(),b(),a("index_advisor_dialog_enable_button_clicked")},disabled:_,children:_?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,f.useTrack)(),[t,n]=(0,d.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(m.Button,{type:"primary",onClick:()=>{n(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(h,{open:t,setOpen:n})]})},"EnableIndexAdvisorDialog",0,h],284399)},937357,e=>{"use strict";e.s(["databaseIndexesKeys",0,{list:(e,t)=>["projects",e,"database-indexes",t].filter(Boolean)}])},503256,e=>{"use strict";var t=e.i(389959);let n=t.forwardRef(function({title:e,titleId:n,...a},r){return t.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:r,"aria-labelledby":n},a),e?t.createElement("title",{id:n},e):null,t.createElement("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"}))});e.s(["InformationCircleIcon",0,n],503256)},507648,(e,t,n)=>{var a=e.r(203941),r=e.r(297926),i=e.r(615573),s=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),n=arguments[0],o=e;o--;)t[o-1]=arguments[o];return a(s(n)?i(n):[n],r(t,1))}},707409,e=>{"use strict";var t=e.i(507648),n=e.i(827047);let a=["int2","int4","int8","float4","float8","numeric","double precision"],r=["json","jsonb"],i=["text","varchar"],s=["timestamp","timestamptz"],o=["date"],l=["time","timetz"],c=(0,t.default)(s,o,l),d=["uuid","bool","vector","bytea"],u=(0,n.default)((0,t.default)(a,r,i,c,d));e.s(["DATETIME_TYPES",0,c,"DATE_TYPES",0,o,"JSON_TYPES",0,r,"NUMERICAL_TYPES",0,a,"OTHER_DATA_TYPES",0,d,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,i,"TIMESTAMP_TYPES",0,s,"TIME_TYPES",0,l])},438756,(e,t,n)=>{t.exports=function(e){return null===e}},170286,(e,t,n)=>{e.e,t.exports=function(){"use strict";var e={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},t=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,n=/\d/,a=/\d\d/,r=/\d\d?/,i=/\d*[^-_:/,()\s\d]+/,s={},o=function(e){return(e*=1)+(e>68?1900:2e3)},l=function(e){return function(t){this[e]=+t}},c=[/[+-]\d\d:?(\d\d)?|Z/,function(e){(this.zone||(this.zone={})).offset=function(e){if(!e||"Z"===e)return 0;var t=e.match(/([+-]|\d\d)/g),n=60*t[1]+(+t[2]||0);return 0===n?0:"+"===t[0]?-n:n}(e)}],d=function(e){var t=s[e];return t&&(t.indexOf?t:t.s.concat(t.f))},u=function(e,t){var n,a=s.meridiem;if(a){for(var r=1;r<=24;r+=1)if(e.indexOf(a(r,0,t))>-1){n=r>12;break}}else n=e===(t?"pm":"PM");return n},m={A:[i,function(e){this.afternoon=u(e,!1)}],a:[i,function(e){this.afternoon=u(e,!0)}],Q:[n,function(e){this.month=3*(e-1)+1}],S:[n,function(e){this.milliseconds=100*e}],SS:[a,function(e){this.milliseconds=10*e}],SSS:[/\d{3}/,function(e){this.milliseconds=+e}],s:[r,l("seconds")],ss:[r,l("seconds")],m:[r,l("minutes")],mm:[r,l("minutes")],H:[r,l("hours")],h:[r,l("hours")],HH:[r,l("hours")],hh:[r,l("hours")],D:[r,l("day")],DD:[a,l("day")],Do:[i,function(e){var t=s.ordinal,n=e.match(/\d+/);if(this.day=n[0],t)for(var a=1;a<=31;a+=1)t(a).replace(/\[|\]/g,"")===e&&(this.day=a)}],w:[r,l("week")],ww:[a,l("week")],M:[r,l("month")],MM:[a,l("month")],MMM:[i,function(e){var t=d("months"),n=(d("monthsShort")||t.map(function(e){return e.slice(0,3)})).indexOf(e)+1;if(n<1)throw Error();this.month=n%12||n}],MMMM:[i,function(e){var t=d("months").indexOf(e)+1;if(t<1)throw Error();this.month=t%12||t}],Y:[/[+-]?\d+/,l("year")],YY:[a,function(e){this.year=o(e)}],YYYY:[/\d{4}/,l("year")],Z:c,ZZ:c};return function(n,a,r){r.p.customParseFormat=!0,n&&n.parseTwoDigitYear&&(o=n.parseTwoDigitYear);var i=a.prototype,l=i.parse;i.parse=function(n){var a=n.date,i=n.utc,o=n.args;this.$u=i;var c=o[1];if("string"==typeof c){var d=!0===o[2],u=!0===o[3],p=o[2];u&&(p=o[2]),s=this.$locale(),!d&&p&&(s=r.Ls[p]),this.$d=function(n,a,r,i){try{if(["x","X"].indexOf(a)>-1)return new Date(("X"===a?1e3:1)*n);var o=(function(n){var a,r;a=n,r=s&&s.formats;for(var i=(n=a.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,function(t,n,a){var i=a&&a.toUpperCase();return n||r[a]||e[a]||r[i].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,function(e,t,n){return t||n.slice(1)})})).match(t),o=i.length,l=0;l<o;l+=1){var c=i[l],d=m[c],u=d&&d[0],p=d&&d[1];i[l]=p?{regex:u,parser:p}:c.replace(/^\[|\]$/g,"")}return function(e){for(var t={},n=0,a=0;n<o;n+=1){var r=i[n];if("string"==typeof r)a+=r.length;else{var s=r.regex,l=r.parser,c=e.slice(a),d=s.exec(c)[0];l.call(t,d),e=e.replace(d,"")}}return function(e){var t=e.afternoon;if(void 0!==t){var n=e.hours;t?n<12&&(e.hours+=12):12===n&&(e.hours=0),delete e.afternoon}}(t),t}})(a)(n),l=o.year,c=o.month,d=o.day,u=o.hours,p=o.minutes,f=o.seconds,h=o.milliseconds,_=o.zone,b=o.week,g=new Date,y=d||(l||c?1:g.getDate()),v=l||g.getFullYear(),w=0;l&&!c||(w=c>0?c-1:g.getMonth());var E,x=u||0,S=p||0,j=f||0,T=h||0;return _?new Date(Date.UTC(v,w,y,x,S,j,T+60*_.offset*1e3)):r?new Date(Date.UTC(v,w,y,x,S,j,T)):(E=new Date(v,w,y,x,S,j,T),b&&(E=i(E).week(b).toDate()),E)}catch(e){return new Date("")}}(a,c,i,r),this.init(),p&&!0!==p&&(this.$L=this.locale(p).$L),(d||u)&&a!=this.format(c)&&(this.$d=new Date("")),s={}}else if(c instanceof Array)for(var f=c.length,h=1;h<=f;h+=1){o[1]=c[h-1];var _=r.apply(this,o);if(_.isValid()){this.$d=_.$d,this.$L=_.$L,this.init();break}h===f&&(this.$d=new Date(""))}else l.call(this,n)}}}()},197187,e=>{"use strict";let t=(0,e.i(388019).default)("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);e.s(["default",0,t])},181827,e=>{"use strict";var t=e.i(478902),n=e.i(156054);e.s(["MonacoEditor",0,({width:e,height:a,value:r,language:i,readOnly:s=!1,onChange:o,onMount:l})=>(0,t.jsx)(n.default,{width:e,height:a||"200px",theme:"supabase",wrapperProps:{className:"grid-monaco-editor-container"},className:"grid-monaco-editor",defaultLanguage:i||"plaintext",defaultValue:r,onChange:o,onMount:function(e){e.changeViewZones(e=>{e.addZone({afterLineNumber:0,heightInPx:4,domNode:document.createElement("div")})});let t=e.getModel().getPositionAt(r?.length);e.setPosition(t),setTimeout(()=>{e?.focus()},0),l&&l(e)},options:{readOnly:s,tabSize:2,fontSize:13,minimap:{enabled:!1},glyphMargin:!1,folding:!1,lineNumbers:"off",lineNumbersMinChars:0,scrollBeyondLastLine:!1,wordWrap:"on",unusualLineTerminators:"off"}})])}]);