(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,532480,e=>{"use strict";let t=(0,e.i(388019).default)("Info",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]]);e.s(["default",0,t])},833655,e=>{"use strict";var t=e.i(532480);e.s(["Info",()=>t.default])},331720,e=>{"use strict";var t=e.i(478902),a=e.i(837710);e.s(["FormActions",0,({form:e,hasChanges:n,handleReset:r,helper:s,disabled:l=!1,isSubmitting:i,submitText:o="Save"})=>{let c=i||l||!n&&void 0!==n;return(0,t.jsxs)("div",{className:["flex w-full items-center gap-2",s?"justify-between":"justify-end"].join(" "),children:[s&&(0,t.jsx)("span",{className:"text-sm text-foreground-lighter",children:s}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(a.Button,{disabled:c,type:"default",htmlType:"reset",onClick:()=>r(),children:"Cancel"}),(0,t.jsx)(a.Button,{form:e,type:"primary",htmlType:"submit",disabled:c,loading:i,children:o})]})]})}])},102703,e=>{"use strict";var t=e.i(478902),a=e.i(17203),n=e.i(180148),r=e.i(699879),s=e.i(345594),l=e.i(389959),i=e.i(837710);let o=(0,l.forwardRef)(({icon:e,title:o,description:c,url:d,urlLabel:p="Read more",defaultVisibility:u=!1,hideCollapse:f=!1,button:m,className:g="",block:_=!1},h)=>{let[v,b]=(0,l.useState)(u);return(0,t.jsx)("div",{ref:h,role:"alert",className:`${_?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${g}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:o})})]}),c&&!f?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>b(!v),children:v?(0,t.jsx)(r.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(n.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||d||m)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${v?"mt-3":""}`,style:{maxHeight:500*!!v},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c}),d&&(0,t.jsx)("div",{children:(0,t.jsx)(i.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(a.ExternalLink,{}),children:(0,t.jsx)(s.default,{href:d,target:"_blank",rel:"noreferrer",children:p})})}),m&&(0,t.jsx)("div",{children:m})]})]})})});o.displayName="InformationBox",e.s(["default",0,o])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},768441,757489,e=>{"use strict";e.i(850036);var t=e.i(479084);function a({search:e,ignoredSchemas:n=[]}={}){let r=(0,t.joinSqlFragments)(n.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
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
  `},"getExposedFunctionsSql",0,function({search:e,offset:a,limit:r,ignoredSchemas:s=[]}){return t.safeSql`
    with ${n({search:e,ignoredSchemas:s})}
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
  `},"getExposedTablesSql",0,function({search:e,offset:n,limit:r,ignoredSchemas:s=[]}){return t.safeSql`
    with ${a({search:e,ignoredSchemas:s})}
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
  `}],757489);var s=e.i(180141),l=e.i(818135),i=e.i(714403);async function o({projectRef:e,connectionString:t,schema:a},n){if(!e)throw Error("projectRef is required");let s=r({schema:a}),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:s,queryKey:["default-privileges-state"]},n);return 3===l[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:t,schema:a},{enabled:n=!0}={})=>(0,s.queryOptions)({queryKey:l.privilegeKeys.defaultPrivileges(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,schema:a},n),enabled:n&&void 0!==e})],768441)},996870,e=>{"use strict";var t=e.i(704598);e.s(["CircleAlert",()=>t.default])},549487,e=>{"use strict";var t=e.i(38429),a=e.i(356003),n=e.i(355901),r=e.i(78162),s=e.i(234745),l=e.i(915993);async function i({projectRef:e,dbSchema:t,maxRows:a,dbExtraSearchPath:n,dbPool:r}){let l={db_schema:t,max_rows:a,db_extra_search_path:n};r&&(l.db_pool=r);let{data:o,error:c}=await (0,s.patch)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},body:l});return c&&(0,s.handleError)(c),o}e.s(["useProjectPostgrestConfigUpdateMutation",0,({onSuccess:e,onError:s,...o}={})=>{let c=(0,a.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>i(e),async onSuccess(t,a,n){let{projectRef:s}=a;await Promise.all([c.invalidateQueries({queryKey:r.configKeys.postgrest(s)}),c.invalidateQueries({queryKey:l.lintKeys.lint(s)})]),await e?.(t,a,n)},async onError(e,t,a){void 0===s?n.toast.error(`Failed to update Postgrest config: ${e.message}`):s(e,t,a)},...o})}])},247413,e=>{"use strict";var t=e.i(462142);e.s(["useIsDataApiEnabled",0,({projectRef:e})=>{let{data:a,...n}=(0,t.useProjectPostgrestConfigQuery)({projectRef:e}),r=!!a?.db_schema?.trim();return{...n,data:r,isEnabled:r}}])},111887,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),n=e.i(867637),r=e.i(178527),s=e.i(206413),l=e.i(592360),i=e.i(937942);e.s(["DataApiDisabledState",0,({description:e})=>{let{ref:o}=(0,a.useParams)();return(0,t.jsx)("div",{className:"flex w-full flex-1 items-center justify-center p-10",children:(0,t.jsxs)(r.Alert_Shadcn_,{className:"max-w-md",children:[(0,t.jsx)(n.AlertCircle,{size:16}),(0,t.jsx)(l.AlertTitle_Shadcn_,{children:"Data API is disabled"}),(0,t.jsxs)(s.AlertDescription_Shadcn_,{children:["Enable the Data API in the"," ",(0,t.jsx)(i.InlineLink,{href:`/project/${o}/integrations/data_api/overview`,children:"Overview"})," ","tab to ",e,"."]})]})})}])}]);