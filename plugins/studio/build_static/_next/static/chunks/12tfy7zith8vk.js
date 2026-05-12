(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,167892,e=>{"use strict";var a=e.i(478902),t=e.i(389959),n=e.i(843778);let l="mx-auto w-full max-w-[1200px]",r="px-4 @lg:px-6 @xl:px-10",s=(0,t.forwardRef)(({className:e,bottomPadding:t,size:l="default",...s},o)=>(0,a.jsx)("div",{ref:o,...s,className:(0,n.cn)("mx-auto w-full @container",{small:"max-w-[768px]",default:"max-w-[1200px]",large:"max-w-[1600px]",full:"max-w-none"}[l],r,t&&"pb-16",e)})),o=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("header",{...t,ref:l,className:(0,n.cn)("w-full","flex-col gap-3 py-6",e)})),i=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("h1",{ref:l,...t,className:(0,n.cn)(e)})),c=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("p",{ref:l,...t,className:(0,n.cn)("text-sm text-foreground-light",e)})),d=(0,t.forwardRef)(({className:e,isFullWidth:t,topPadding:l,...r},s)=>(0,a.jsx)("div",{ref:s,...r,className:(0,n.cn)("flex flex-col first:pt-12 py-6",t?"w-full":"gap-3 @md:grid-cols-12 @lg:grid",e)})),f=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("w-full h-px bg-border shrink-0",e)})),p=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("h3",{ref:l,...t,className:(0,n.cn)("text-foreground text-xl",e)})),u=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("p",{ref:l,...t,className:(0,n.cn)("text-sm text-foreground-light",e)})),m=(0,t.forwardRef)(({className:e,children:t,title:l,...r},s)=>(0,a.jsxs)("div",{ref:s,...r,className:(0,n.cn)("col-span-4 xl:col-span-5 prose text-sm",e),children:[l&&(0,a.jsx)("h2",{children:l}),t]})),g=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("col-span-8 xl:col-span-7","flex flex-col gap-6",e)})),_=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("flex flex-col gap-3 items-center",e)})),x=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("flex w-full items-center",e)})),h=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("flex flex-row gap-3",e)})),v=(0,t.forwardRef)(({className:e,...t},l)=>(0,a.jsx)("div",{ref:l,...t,className:(0,n.cn)("flex flex-col gap-3","min-w-[420px]",e)})),S=(0,t.forwardRef)(({className:e,...t},s)=>(0,a.jsx)("div",{ref:s,...t,className:(0,n.cn)(l,r,"my-8 flex flex-col gap-8",e)}));o.displayName="ScaffoldHeader",i.displayName="ScaffoldTitle",c.displayName="ScaffoldDescription",s.displayName="ScaffoldContainer",f.displayName="ScaffoldDivider",d.displayName="ScaffoldSection",v.displayName="ScaffoldColumn",m.displayName="ScaffoldSectionDetail",g.displayName="ScaffoldSectionContent",_.displayName="ScaffoldFilterAndContent",x.displayName="ScaffoldActionsContainer",h.displayName="ScaffoldActionsGroup",S.displayName="ScaffoldContainerLegacy",p.displayName="ScaffoldSectionTitle",u.displayName="ScaffoldSectionDescription",e.s(["MAX_WIDTH_CLASSES",0,l,"PADDING_CLASSES",0,r,"ScaffoldActionsContainer",0,x,"ScaffoldActionsGroup",0,h,"ScaffoldColumn",0,v,"ScaffoldContainer",0,s,"ScaffoldContainerLegacy",0,S,"ScaffoldDescription",0,c,"ScaffoldDivider",0,f,"ScaffoldFilterAndContent",0,_,"ScaffoldHeader",0,o,"ScaffoldSection",0,d,"ScaffoldSectionContent",0,g,"ScaffoldSectionDescription",0,u,"ScaffoldSectionDetail",0,m,"ScaffoldSectionTitle",0,p,"ScaffoldTitle",0,i])},532480,e=>{"use strict";let a=(0,e.i(388019).default)("Info",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]]);e.s(["default",0,a])},833655,e=>{"use strict";var a=e.i(532480);e.s(["Info",()=>a.default])},331720,e=>{"use strict";var a=e.i(478902),t=e.i(837710);e.s(["FormActions",0,({form:e,hasChanges:n,handleReset:l,helper:r,disabled:s=!1,isSubmitting:o,submitText:i="Save"})=>{let c=o||s||!n&&void 0!==n;return(0,a.jsxs)("div",{className:["flex w-full items-center gap-2",r?"justify-between":"justify-end"].join(" "),children:[r&&(0,a.jsx)("span",{className:"text-sm text-foreground-lighter",children:r}),(0,a.jsxs)("div",{className:"flex items-center gap-2",children:[(0,a.jsx)(t.Button,{disabled:c,type:"default",htmlType:"reset",onClick:()=>l(),children:"Cancel"}),(0,a.jsx)(t.Button,{form:e,type:"primary",htmlType:"submit",disabled:c,loading:o,children:i})]})]})}])},102703,e=>{"use strict";var a=e.i(478902),t=e.i(17203),n=e.i(180148),l=e.i(699879),r=e.i(345594),s=e.i(389959),o=e.i(837710);let i=(0,s.forwardRef)(({icon:e,title:i,description:c,url:d,urlLabel:f="Read more",defaultVisibility:p=!1,hideCollapse:u=!1,button:m,className:g="",block:_=!1},x)=>{let[h,v]=(0,s.useState)(p);return(0,a.jsx)("div",{ref:x,role:"alert",className:`${_?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${g}`,children:(0,a.jsxs)("div",{className:"flex flex-col px-4",children:[(0,a.jsxs)("div",{className:"flex items-center justify-between",children:[(0,a.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,a.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,a.jsx)("div",{className:"grow",children:(0,a.jsx)("h5",{className:"text-foreground",children:i})})]}),c&&!u?(0,a.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>v(!h),children:h?(0,a.jsx)(l.Minimize2,{size:14,strokeWidth:1.5}):(0,a.jsx)(n.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||d||m)&&(0,a.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${h?"mt-3":""}`,style:{maxHeight:500*!!h},children:[(0,a.jsx)("div",{className:"text-foreground-light text-sm",children:c}),d&&(0,a.jsx)("div",{children:(0,a.jsx)(o.Button,{asChild:!0,type:"default",icon:(0,a.jsx)(t.ExternalLink,{}),children:(0,a.jsx)(r.default,{href:d,target:"_blank",rel:"noreferrer",children:f})})}),m&&(0,a.jsx)("div",{children:m})]})]})})});i.displayName="InformationBox",e.s(["default",0,i])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,a)=>["projects",e,"privileges","exposed-tables-infinite",...a?[{search:a}]:[]],exposedTableCounts:(e,a)=>["projects",e,"privileges","exposed-table-counts",...a?[a]:[]],exposedFunctionsInfinite:(e,a)=>["projects",e,"privileges","exposed-functions-infinite",...a?[{search:a}]:[]],exposedFunctionCounts:(e,a)=>["projects",e,"privileges","exposed-function-counts",...a?[a]:[]],defaultPrivileges:(e,a)=>["projects",e,"privileges","default-privileges",...a?[a]:[]]}])},768441,757489,e=>{"use strict";e.i(850036);var a=e.i(479084);function t({search:e,ignoredSchemas:n=[]}={}){let l=(0,a.joinSqlFragments)(n.map(e=>(0,a.literal)(e)),", ");return a.safeSql`
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
        ${l?a.safeSql`and n.nspname not in (${l})`:a.safeSql``}
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
  `}function n({search:e,ignoredSchemas:t=[]}={}){let l=(0,a.joinSqlFragments)(t.map(e=>(0,a.literal)(e)),", ");return a.safeSql`
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
        ${l?a.safeSql`and n.nspname not in (${l})`:a.safeSql``}
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
  `}function l({schema:e="public"}={}){return a.safeSql`
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
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let t=[];for(let n of["anon","authenticated","service_role"])"grant"===e?t.push(a.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,a.ident)(n)}`):t.push(a.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,a.ident)(n)}`,a.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,a.ident)(n)}`);return"revoke"===e?t.push(a.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):t.push(a.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),a.safeSql`${(0,a.joinSqlFragments)(t,";\n")};`},"buildFunctionPrivilegesSql",0,(e,t)=>{if(0===e.length)return a.safeSql``;let n=(0,a.joinSqlFragments)(e.map(e=>{let t=e.indexOf("."),n=e.slice(0,t),l=e.slice(t+1);return a.safeSql`(${(0,a.literal)(n)},${(0,a.literal)(l)})`}),", "),l="grant"===t?a.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:a.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return a.safeSql`
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
        execute format('${l}', nspname, proname, arg_types);
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
  `},"getDefaultPrivilegesStateSql",0,l,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:t=[]}){let l=e.length>0?(0,a.joinSqlFragments)(e.map(e=>(0,a.literal)(e)),", "):a.safeSql`''`;return a.safeSql`
    with ${n({ignoredSchemas:t})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${l})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:t,limit:l,ignoredSchemas:r=[]}){return a.safeSql`
    with ${n({search:e,ignoredSchemas:r})}
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
            limit ${(0,a.literal)(l)}
          ) fg
        ),
        '[]'::jsonb
      ) as functions;
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:n=[]}){let l=e.length>0?(0,a.joinSqlFragments)(e.map(e=>(0,a.literal)(e)),", "):a.safeSql`''`;return a.safeSql`
    with ${t({ignoredSchemas:n})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${l})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:n,limit:l,ignoredSchemas:r=[]}){return a.safeSql`
    with ${t({search:e,ignoredSchemas:r})}
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
            limit ${(0,a.literal)(l)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var r=e.i(180141),s=e.i(818135),o=e.i(714403);async function i({projectRef:e,connectionString:a,schema:t},n){if(!e)throw Error("projectRef is required");let r=l({schema:t}),{result:s}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:r,queryKey:["default-privileges-state"]},n);return 3===s[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:a,schema:t},{enabled:n=!0}={})=>(0,r.queryOptions)({queryKey:s.privilegeKeys.defaultPrivileges(e,t),queryFn:({signal:n})=>i({projectRef:e,connectionString:a,schema:t},n),enabled:n&&void 0!==e})],768441)},996870,e=>{"use strict";var a=e.i(704598);e.s(["CircleAlert",()=>a.default])},549487,e=>{"use strict";var a=e.i(38429),t=e.i(356003),n=e.i(355901),l=e.i(78162),r=e.i(234745),s=e.i(915993);async function o({projectRef:e,dbSchema:a,maxRows:t,dbExtraSearchPath:n,dbPool:l}){let s={db_schema:a,max_rows:t,db_extra_search_path:n};l&&(s.db_pool=l);let{data:i,error:c}=await (0,r.patch)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},body:s});return c&&(0,r.handleError)(c),i}e.s(["useProjectPostgrestConfigUpdateMutation",0,({onSuccess:e,onError:r,...i}={})=>{let c=(0,t.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(a,t,n){let{projectRef:r}=t;await Promise.all([c.invalidateQueries({queryKey:l.configKeys.postgrest(r)}),c.invalidateQueries({queryKey:s.lintKeys.lint(r)})]),await e?.(a,t,n)},async onError(e,a,t){void 0===r?n.toast.error(`Failed to update Postgrest config: ${e.message}`):r(e,a,t)},...i})}])},247413,e=>{"use strict";var a=e.i(462142);e.s(["useIsDataApiEnabled",0,({projectRef:e})=>{let{data:t,...n}=(0,a.useProjectPostgrestConfigQuery)({projectRef:e}),l=!!t?.db_schema?.trim();return{...n,data:l,isEnabled:l}}])},111887,e=>{"use strict";var a=e.i(478902);e.i(128328);var t=e.i(158639),n=e.i(867637),l=e.i(178527),r=e.i(206413),s=e.i(592360),o=e.i(937942);e.s(["DataApiDisabledState",0,({description:e})=>{let{ref:i}=(0,t.useParams)();return(0,a.jsx)("div",{className:"flex w-full flex-1 items-center justify-center p-10",children:(0,a.jsxs)(l.Alert_Shadcn_,{className:"max-w-md",children:[(0,a.jsx)(n.AlertCircle,{size:16}),(0,a.jsx)(s.AlertTitle_Shadcn_,{children:"Data API is disabled"}),(0,a.jsxs)(r.AlertDescription_Shadcn_,{children:["Enable the Data API in the"," ",(0,a.jsx)(o.InlineLink,{href:`/project/${i}/integrations/data_api/overview`,children:"Overview"})," ","tab to ",e,"."]})]})})}])}]);