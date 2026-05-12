(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,774234,554855,e=>{"use strict";var t=e.i(348534);e.s(["CollapsibleContent_Shadcn_",()=>t.CollapsibleContent],774234),e.s(["CollapsibleTrigger_Shadcn_",()=>t.CollapsibleTrigger],554855)},925282,e=>{"use strict";var t=e.i(348534);e.s(["Collapsible_Shadcn_",()=>t.Collapsible])},462142,e=>{"use strict";var t=e.i(242882),a=e.i(78162),n=e.i(234745);async function s({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:a,error:l}=await (0,n.get)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},signal:t});return l&&(0,n.handleError)(l),a}e.s(["parseDbSchemaString",0,e=>e.split(",").map(e=>e.trim()).filter(e=>e.length>0),"useProjectPostgrestConfigQuery",0,({projectRef:e},{enabled:n=!0,...l}={})=>(0,t.useQuery)({queryKey:a.configKeys.postgrest(e),queryFn:({signal:t})=>s({projectRef:e},t),enabled:n&&void 0!==e,...l})])},180148,e=>{"use strict";let t=(0,e.i(388019).default)("Maximize2",[["polyline",{points:"15 3 21 3 21 9",key:"mznyad"}],["polyline",{points:"9 21 3 21 3 15",key:"1avn1i"}],["line",{x1:"21",x2:"14",y1:"3",y2:"10",key:"ota7mn"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14",key:"1atl0r"}]]);e.s(["Maximize2",0,t],180148)},699879,e=>{"use strict";let t=(0,e.i(388019).default)("Minimize2",[["polyline",{points:"4 14 10 14 10 20",key:"11kfnr"}],["polyline",{points:"20 10 14 10 14 4",key:"rlmsce"}],["line",{x1:"14",x2:"21",y1:"10",y2:"3",key:"o5lafz"}],["line",{x1:"3",x2:"10",y1:"21",y2:"14",key:"1atl0r"}]]);e.s(["Minimize2",0,t],699879)},228027,e=>{"use strict";var t=e.i(478902),a=e.i(766181),n=e.i(843778);let s=(0,a.cva)(["pt-12 last:pb-12 gap-6"],{variants:{orientation:{horizontal:"grid @3xl:grid-cols-[1fr_2fr] @3xl:gap-12",vertical:"flex flex-col"}},defaultVariants:{orientation:"vertical"}}),l=({className:e,orientation:a="vertical",children:l,...r})=>(0,t.jsx)("div",{"data-slot":"page-section","data-orientation":a,className:(0,n.cn)(s({orientation:a}),e),...r,children:l});l.displayName="PageSectionRoot";let r=({className:e,children:a,...s})=>(0,t.jsx)("div",{"data-slot":"page-section-summary",className:(0,n.cn)("flex flex-col gap-1",e),...s,children:a});r.displayName="PageSectionSummary";let i=({className:e,children:a,...s})=>(0,t.jsx)("h2",{"data-slot":"page-section-title",className:(0,n.cn)("heading-section",e),...s,children:a});i.displayName="PageSectionTitle";let o=({className:e,children:a,...s})=>(0,t.jsx)("div",{"data-slot":"page-section-description",className:(0,n.cn)("text-sm text-foreground-light",e),style:{textBoxTrim:"trim-end"},...s,children:a});o.displayName="PageSectionDescription";let c=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-aside",className:(0,n.cn)("flex items-center gap-2","@xl:self-end",e),...a});c.displayName="PageSectionAside";let d=({className:e,children:a,...s})=>(0,t.jsx)("div",{className:"@container",children:(0,t.jsx)("div",{"data-slot":"page-section-meta",className:(0,n.cn)("flex flex-col @xl:flex-row @xl:justify-between @xl:items-center gap-4",'*:data-[slot="page-section-summary"]:flex-1','*:data-[slot="page-section-summary"]:@xl:self-center','*:data-[slot="page-section-aside"]:shrink-0',e),...s,children:a})});d.displayName="PageSectionMeta";let p=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-content",className:(0,n.cn)(e),...a});p.displayName="PageSectionContent",e.s(["PageSection",0,l,"PageSectionAside",0,c,"PageSectionContent",0,p,"PageSectionDescription",0,o,"PageSectionMeta",0,d,"PageSectionSummary",0,r,"PageSectionTitle",0,i])},532480,e=>{"use strict";let t=(0,e.i(388019).default)("Info",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]]);e.s(["default",0,t])},833655,e=>{"use strict";var t=e.i(532480);e.s(["Info",()=>t.default])},331720,e=>{"use strict";var t=e.i(478902),a=e.i(837710);e.s(["FormActions",0,({form:e,hasChanges:n,handleReset:s,helper:l,disabled:r=!1,isSubmitting:i,submitText:o="Save"})=>{let c=i||r||!n&&void 0!==n;return(0,t.jsxs)("div",{className:["flex w-full items-center gap-2",l?"justify-between":"justify-end"].join(" "),children:[l&&(0,t.jsx)("span",{className:"text-sm text-foreground-lighter",children:l}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(a.Button,{disabled:c,type:"default",htmlType:"reset",onClick:()=>s(),children:"Cancel"}),(0,t.jsx)(a.Button,{form:e,type:"primary",htmlType:"submit",disabled:c,loading:i,children:o})]})]})}])},102703,e=>{"use strict";var t=e.i(478902),a=e.i(17203),n=e.i(180148),s=e.i(699879),l=e.i(345594),r=e.i(389959),i=e.i(837710);let o=(0,r.forwardRef)(({icon:e,title:o,description:c,url:d,urlLabel:p="Read more",defaultVisibility:u=!1,hideCollapse:m=!1,button:f,className:g="",block:_=!1},h)=>{let[v,x]=(0,r.useState)(u);return(0,t.jsx)("div",{ref:h,role:"alert",className:`${_?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${g}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:o})})]}),c&&!m?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>x(!v),children:v?(0,t.jsx)(s.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(n.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||d||f)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${v?"mt-3":""}`,style:{maxHeight:500*!!v},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c}),d&&(0,t.jsx)("div",{children:(0,t.jsx)(i.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(a.ExternalLink,{}),children:(0,t.jsx)(l.default,{href:d,target:"_blank",rel:"noreferrer",children:p})})}),f&&(0,t.jsx)("div",{children:f})]})]})})});o.displayName="InformationBox",e.s(["default",0,o])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},768441,757489,e=>{"use strict";e.i(850036);var t=e.i(479084);function a({search:e,ignoredSchemas:n=[]}={}){let s=(0,t.joinSqlFragments)(n.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
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
        ${s?t.safeSql`and n.nspname not in (${s})`:t.safeSql``}
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
  `}function n({search:e,ignoredSchemas:a=[]}={}){let s=(0,t.joinSqlFragments)(a.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
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
        ${s?t.safeSql`and n.nspname not in (${s})`:t.safeSql``}
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
  `}function s({schema:e="public"}={}){return t.safeSql`
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
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let a=[];for(let n of["anon","authenticated","service_role"])"grant"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,t.ident)(n)}`):a.push(t.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,t.ident)(n)}`,t.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,t.ident)(n)}`);return"revoke"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):a.push(t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),t.safeSql`${(0,t.joinSqlFragments)(a,";\n")};`},"buildFunctionPrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let n=(0,t.joinSqlFragments)(e.map(e=>{let a=e.indexOf("."),n=e.slice(0,a),s=e.slice(a+1);return t.safeSql`(${(0,t.literal)(n)},${(0,t.literal)(s)})`}),", "),s="grant"===a?t.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:t.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return t.safeSql`
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
        execute format('${s}', nspname, proname, arg_types);
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
  `},"getDefaultPrivilegesStateSql",0,s,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:a=[]}){let s=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${n({ignoredSchemas:a})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${s})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:a,limit:s,ignoredSchemas:l=[]}){return t.safeSql`
    with ${n({search:e,ignoredSchemas:l})}
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
            limit ${(0,t.literal)(s)}
          ) fg
        ),
        '[]'::jsonb
      ) as functions;
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:n=[]}){let s=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${a({ignoredSchemas:n})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${s})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:n,limit:s,ignoredSchemas:l=[]}){return t.safeSql`
    with ${a({search:e,ignoredSchemas:l})}
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
            limit ${(0,t.literal)(s)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var l=e.i(180141),r=e.i(818135),i=e.i(714403);async function o({projectRef:e,connectionString:t,schema:a},n){if(!e)throw Error("projectRef is required");let l=s({schema:a}),{result:r}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:l,queryKey:["default-privileges-state"]},n);return 3===r[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:t,schema:a},{enabled:n=!0}={})=>(0,l.queryOptions)({queryKey:r.privilegeKeys.defaultPrivileges(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,schema:a},n),enabled:n&&void 0!==e})],768441)},996870,e=>{"use strict";var t=e.i(704598);e.s(["CircleAlert",()=>t.default])},549487,e=>{"use strict";var t=e.i(38429),a=e.i(356003),n=e.i(355901),s=e.i(78162),l=e.i(234745),r=e.i(915993);async function i({projectRef:e,dbSchema:t,maxRows:a,dbExtraSearchPath:n,dbPool:s}){let r={db_schema:t,max_rows:a,db_extra_search_path:n};s&&(r.db_pool=s);let{data:o,error:c}=await (0,l.patch)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},body:r});return c&&(0,l.handleError)(c),o}e.s(["useProjectPostgrestConfigUpdateMutation",0,({onSuccess:e,onError:l,...o}={})=>{let c=(0,a.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>i(e),async onSuccess(t,a,n){let{projectRef:l}=a;await Promise.all([c.invalidateQueries({queryKey:s.configKeys.postgrest(l)}),c.invalidateQueries({queryKey:r.lintKeys.lint(l)})]),await e?.(t,a,n)},async onError(e,t,a){void 0===l?n.toast.error(`Failed to update Postgrest config: ${e.message}`):l(e,t,a)},...o})}])},247413,e=>{"use strict";var t=e.i(462142);e.s(["useIsDataApiEnabled",0,({projectRef:e})=>{let{data:a,...n}=(0,t.useProjectPostgrestConfigQuery)({projectRef:e}),s=!!a?.db_schema?.trim();return{...n,data:s,isEnabled:s}}])},111887,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),n=e.i(867637),s=e.i(178527),l=e.i(206413),r=e.i(592360),i=e.i(937942);e.s(["DataApiDisabledState",0,({description:e})=>{let{ref:o}=(0,a.useParams)();return(0,t.jsx)("div",{className:"flex w-full flex-1 items-center justify-center p-10",children:(0,t.jsxs)(s.Alert_Shadcn_,{className:"max-w-md",children:[(0,t.jsx)(n.AlertCircle,{size:16}),(0,t.jsx)(r.AlertTitle_Shadcn_,{children:"Data API is disabled"}),(0,t.jsxs)(l.AlertDescription_Shadcn_,{children:["Enable the Data API in the"," ",(0,t.jsx)(i.InlineLink,{href:`/project/${o}/integrations/data_api/overview`,children:"Overview"})," ","tab to ",e,"."]})]})})}])}]);