(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,774234,554855,e=>{"use strict";var a=e.i(348534);e.s(["CollapsibleContent_Shadcn_",()=>a.CollapsibleContent],774234),e.s(["CollapsibleTrigger_Shadcn_",()=>a.CollapsibleTrigger],554855)},925282,e=>{"use strict";var a=e.i(348534);e.s(["Collapsible_Shadcn_",()=>a.Collapsible])},331720,e=>{"use strict";var a=e.i(478902),t=e.i(837710);e.s(["FormActions",0,({form:e,hasChanges:n,handleReset:r,helper:s,disabled:l=!1,isSubmitting:o,submitText:i="Save"})=>{let c=o||l||!n&&void 0!==n;return(0,a.jsxs)("div",{className:["flex w-full items-center gap-2",s?"justify-between":"justify-end"].join(" "),children:[s&&(0,a.jsx)("span",{className:"text-sm text-foreground-lighter",children:s}),(0,a.jsxs)("div",{className:"flex items-center gap-2",children:[(0,a.jsx)(t.Button,{disabled:c,type:"default",htmlType:"reset",onClick:()=>r(),children:"Cancel"}),(0,a.jsx)(t.Button,{form:e,type:"primary",htmlType:"submit",disabled:c,loading:o,children:i})]})]})}])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,a)=>["projects",e,"privileges","exposed-tables-infinite",...a?[{search:a}]:[]],exposedTableCounts:(e,a)=>["projects",e,"privileges","exposed-table-counts",...a?[a]:[]],exposedFunctionsInfinite:(e,a)=>["projects",e,"privileges","exposed-functions-infinite",...a?[{search:a}]:[]],exposedFunctionCounts:(e,a)=>["projects",e,"privileges","exposed-function-counts",...a?[a]:[]],defaultPrivileges:(e,a)=>["projects",e,"privileges","default-privileges",...a?[a]:[]]}])},768441,757489,e=>{"use strict";e.i(850036);var a=e.i(479084);function t({search:e,ignoredSchemas:n=[]}={}){let r=(0,a.joinSqlFragments)(n.map(e=>(0,a.literal)(e)),", ");return a.safeSql`
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
        ${r?a.safeSql`and n.nspname not in (${r})`:a.safeSql``}
        ${e?a.safeSql`and (n.nspname || '.' || c.relname) ilike ${(0,a.literal)(`%${e}%`)}`:a.safeSql``}
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
  `}function n({search:e,ignoredSchemas:t=[]}={}){let r=(0,a.joinSqlFragments)(t.map(e=>(0,a.literal)(e)),", ");return a.safeSql`
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
        ${r?a.safeSql`and n.nspname not in (${r})`:a.safeSql``}
        ${e?a.safeSql`and (n.nspname || '.' || p.proname) ilike ${(0,a.literal)(`%${e}%`)}`:a.safeSql``}
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
  `}function r({schema:e="public"}={}){return a.safeSql`
    select
      count(*)::int as grant_count
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    join pg_roles r on r.oid = d.defaclrole
    where n.nspname = ${(0,a.literal)(e)}
      and r.rolname = 'postgres'
      and d.defaclobjtype in ('r', 'f', 'S')
      and exists (
        select 1
        from aclexplode(d.defaclacl) acl
        join pg_roles gr on gr.oid = acl.grantee
        where gr.rolname in ('anon', 'authenticated', 'service_role')
      )
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let t=[];for(let n of["anon","authenticated","service_role"])"grant"===e?t.push(a.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,a.ident)(n)}`):t.push(a.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,a.ident)(n)}`);return"revoke"===e?t.push(a.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):t.push(a.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),a.safeSql`${(0,a.joinSqlFragments)(t,";\n")};`},"buildFunctionPrivilegesSql",0,(e,t)=>{if(0===e.length)return a.safeSql``;let n=(0,a.joinSqlFragments)(e.map(e=>{let t=e.indexOf("."),n=e.slice(0,t),r=e.slice(t+1);return a.safeSql`(${(0,a.literal)(n)},${(0,a.literal)(r)})`}),", "),r="grant"===t?a.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:a.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return a.safeSql`
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
  `},"buildTablePrivilegesSql",0,(e,t)=>{if(0===e.length)return a.safeSql``;let n="grant"===t?a.safeSql`grant select, insert, update, delete on table %I.%I to anon, authenticated, service_role`:a.safeSql`revoke all on table %I.%I from anon, authenticated, service_role`;return a.safeSql`
    do $$
    declare
      nspname name;
      relname name;
    begin
      for nspname, relname in
        select n.nspname, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.oid in (${(0,a.joinSqlFragments)(e.map(e=>(0,a.literal)(e)),", ")})
      loop
        execute format('${n}', nspname, relname);
      end loop;
    end $$;
  `},"getDefaultPrivilegesStateSql",0,r,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:t=[]}){let r=e.length>0?(0,a.joinSqlFragments)(e.map(e=>(0,a.literal)(e)),", "):a.safeSql`''`;return a.safeSql`
    with ${n({ignoredSchemas:t})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:t,limit:r,ignoredSchemas:s=[]}){return a.safeSql`
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
            offset ${(0,a.literal)(t)}
            limit ${(0,a.literal)(r)}
          ) fg
        ),
        '[]'::jsonb
      ) as functions;
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:n=[]}){let r=e.length>0?(0,a.joinSqlFragments)(e.map(e=>(0,a.literal)(e)),", "):a.safeSql`''`;return a.safeSql`
    with ${t({ignoredSchemas:n})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:n,limit:r,ignoredSchemas:s=[]}){return a.safeSql`
    with ${t({search:e,ignoredSchemas:s})}
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
            offset ${(0,a.literal)(n)}
            limit ${(0,a.literal)(r)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var s=e.i(180141),l=e.i(818135),o=e.i(714403);async function i({projectRef:e,connectionString:a,schema:t},n){if(!e)throw Error("projectRef is required");let s=r({schema:t}),{result:l}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:s,queryKey:["default-privileges-state"]},n);return 3===l[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:a,schema:t},{enabled:n=!0}={})=>(0,s.queryOptions)({queryKey:l.privilegeKeys.defaultPrivileges(e,t),queryFn:({signal:n})=>i({projectRef:e,connectionString:a,schema:t},n),enabled:n&&void 0!==e})],768441)},996870,e=>{"use strict";var a=e.i(704598);e.s(["CircleAlert",()=>a.default])},549487,e=>{"use strict";var a=e.i(38429),t=e.i(356003),n=e.i(355901),r=e.i(78162),s=e.i(234745),l=e.i(915993);async function o({projectRef:e,dbSchema:a,maxRows:t,dbExtraSearchPath:n,dbPool:r}){let l={db_schema:a,max_rows:t,db_extra_search_path:n};r&&(l.db_pool=r);let{data:i,error:c}=await (0,s.patch)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},body:l});return c&&(0,s.handleError)(c),i}e.s(["useProjectPostgrestConfigUpdateMutation",0,({onSuccess:e,onError:s,...i}={})=>{let c=(0,t.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(a,t,n){let{projectRef:s}=t;await Promise.all([c.invalidateQueries({queryKey:r.configKeys.postgrest(s)}),c.invalidateQueries({queryKey:l.lintKeys.lint(s)})]),await e?.(a,t,n)},async onError(e,a,t){void 0===s?n.toast.error(`Failed to update Postgrest config: ${e.message}`):s(e,a,t)},...i})}])},247413,e=>{"use strict";var a=e.i(462142);e.s(["useIsDataApiEnabled",0,({projectRef:e})=>{let{data:t,...n}=(0,a.useProjectPostgrestConfigQuery)({projectRef:e}),r=!!t?.db_schema?.trim();return{...n,data:r,isEnabled:r}}])},111887,e=>{"use strict";var a=e.i(478902);e.i(128328);var t=e.i(158639),n=e.i(867637),r=e.i(178527),s=e.i(206413),l=e.i(592360),o=e.i(937942);e.s(["DataApiDisabledState",0,({description:e})=>{let{ref:i}=(0,t.useParams)();return(0,a.jsx)("div",{className:"flex w-full flex-1 items-center justify-center p-10",children:(0,a.jsxs)(r.Alert_Shadcn_,{className:"max-w-md",children:[(0,a.jsx)(n.AlertCircle,{size:16}),(0,a.jsx)(l.AlertTitle_Shadcn_,{children:"Data API is disabled"}),(0,a.jsxs)(s.AlertDescription_Shadcn_,{children:["Enable the Data API in the"," ",(0,a.jsx)(o.InlineLink,{href:`/project/${i}/integrations/data_api/overview`,children:"Overview"})," ","tab to ",e,"."]})]})})}])}]);