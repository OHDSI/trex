(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,667286,e=>{"use strict";e.s(["databaseExtensionsKeys",0,{list:e=>["projects",e,"database-extensions"]}])},450972,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(242882),s=e.i(667286),n=e.i(714403),r=e.i(635494);e.i(10429);var i=e.i(837508);async function o({projectRef:e,connectionString:a},s){let r=(0,t.getDatabaseExtensionsSQL)(),{result:i}=await (0,n.executeSql)({projectRef:e,connectionString:a,sql:r,queryKey:["database-extensions"]},s);return i}e.s(["useDatabaseExtensionsQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...l}={})=>{let{data:u}=(0,r.useSelectedProjectQuery)(),d=u?.status===i.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,a.useQuery)({queryKey:s.databaseExtensionsKeys.list(e),queryFn:({signal:a})=>o({projectRef:e,connectionString:t},a),enabled:n&&void 0!==e&&d,...l})}])},12214,e=>{"use strict";var t=e.i(531837),a=e.i(615515);let s=t.object({index:t.number(),columns:t.array(t.object({name:t.string(),type:t.string()})),is_new_schema:t.boolean(),schema:t.string(),schema_name:t.string(),table_name:t.string(),object:t.any().optional()}).passthrough(),n=e=>Object.fromEntries(e.map(e=>e.split("=")));function r(e,t){if("wasm_fdw_handler"===e.handlerName){let a=n(t?.server_options??[]);return e.server.options.find(e=>"fdw_package_name"===e.name)?.defaultValue===a.fdw_package_name}return e.handlerName===t?.handler}e.s(["NewTable",0,{},"convertKVStringArrayToJson",0,n,"formatWrapperTables",0,(e,t)=>(e?.tables??[]).map(s=>{let n=0,r=Object.fromEntries(s.options.map(e=>e.split("=")));switch(e.handler){case a.WRAPPER_HANDLERS.STRIPE:n=t?.tables.findIndex(e=>e.options.find(e=>"object"===e.name)?.defaultValue===r.object)??0;break;case a.WRAPPER_HANDLERS.FIREBASE:n="auth/users"===r.object?t?.tables.findIndex(e=>e.options.find(e=>"auth/users"===e.defaultValue))??0:t?.tables.findIndex(e=>"Firestore Collection"===e.label)??0;case a.WRAPPER_HANDLERS.S3:case a.WRAPPER_HANDLERS.AIRTABLE:case a.WRAPPER_HANDLERS.LOGFLARE:case a.WRAPPER_HANDLERS.BIG_QUERY:case a.WRAPPER_HANDLERS.CLICK_HOUSE:}return{...r,index:n,id:s.id,columns:s.columns??[],is_new_schema:!1,schema:s.schema,schema_name:s.schema,table_name:s.name}}),"getEditionFormSchema",0,e=>{let a={wrapper_name:t.string().min(1,"Please provide a name for your wrapper"),tables:t.array(s,{required_error:"Please provide at least one table"}).min(1,"Please provide at least one table")};return e.server.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.object(a)},"getTableFormSchema",0,e=>{let a={table_name:t.string().min(1,"Required"),schema:t.string().min(1,"Required"),schema_name:t.string().optional(),columns:t.array(t.object({name:t.string().min(1,"Required"),type:t.string().min(1,"Required")}))};return e.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.object(a).passthrough().superRefine((e,t)=>{"custom"!==e.schema||e.schema_name||t.addIssue({code:"custom",path:["schema_name"],message:"Required"})})},"getWrapperCreationFormSchema",0,e=>{let a={wrapper_name:t.string().min(1,"Please provide a name for your wrapper")};return e.server.options.forEach(e=>{if(e.required){a[e.name]=t.string().min(1,"Required");return}a[e.name]=t.string().optional()}),t.discriminatedUnion("mode",[t.object({mode:t.literal("tables"),tables:t.array(s,{required_error:"Please provide at least one table"}).min(1,"Please provide at least one table")}).merge(t.object(a)),t.object({mode:t.literal("schema"),source_schema:t.string().min(1,"Please provide a source schema"),target_schema:t.string().min(1,"Please provide an unique target schema")}).merge(t.object(a))])},"getWrapperMetaForWrapper",0,function(e){return a.WRAPPERS.find(t=>r(t,e))},"wrapperMetaComparator",0,r])},298625,33942,584258,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=()=>t.safeSql`
    select
      s.oid as "id",
      w.fdwname as "name",
      s.srvname as "server_name",
      s.srvoptions as "server_options",
      c.proname as "handler",
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.oid::bigint,
            'schema', relnamespace::regnamespace::text,
            'name', c.relname,
            'columns', (
              select jsonb_agg(
                jsonb_build_object(
                  'name', a.attname,
                  'type', pg_catalog.format_type(a.atttypid, a.atttypmod)
                )
              )
              from pg_catalog.pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            ),
            'options', t.ftoptions
          )
        )
        from pg_catalog.pg_class c
        join pg_catalog.pg_foreign_table t on c.oid = t.ftrelid
        where c.oid = any (select t.ftrelid from pg_catalog.pg_foreign_table t where t.ftserver = s.oid)
      ) as "tables"
    from pg_catalog.pg_foreign_server s
    join pg_catalog.pg_foreign_data_wrapper w on s.srvfdw = w.oid
    join pg_catalog.pg_proc c on w.fdwhandler = c.oid;
  `;function s({wrapperMeta:e,formState:a,mode:n,tables:r,sourceSchema:i,targetSchema:o,schemaOptions:l=[]}){let u=(0,t.joinSqlFragments)(r.filter(e=>e.is_new_schema).map(e=>t.safeSql`create schema if not exists ${(0,t.ident)(e.schema_name)};`),"\n"),d=t.safeSql`
    create foreign data wrapper ${(0,t.ident)(a.wrapper_name)}
    handler ${(0,t.ident)(e.handlerName)}
    validator ${(0,t.ident)(e.validatorName)};
  `,c=e.server.options.filter(e=>e.encrypted),p=e.server.options.filter(e=>!e.encrypted),m=c.map(e=>{let s=`${a.wrapper_name}_${e.name}`,n=(0,t.literal)(a[e.name]||"");return t.safeSql`
      do $$
      begin
        -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
        -- we use Vault directly.
        if (select extversion from pg_extension where extname = 'wrappers') in (
          '0.1.0',
          '0.1.1',
          '0.1.4',
          '0.1.5',
          '0.1.6',
          '0.1.7',
          '0.1.8',
          '0.1.9',
          '0.1.10',
          '0.1.11',
          '0.1.12',
          '0.1.14',
          '0.1.15',
          '0.1.16',
          '0.1.17',
          '0.1.18',
          '0.1.19',
          '0.2.0',
          '0.3.0',
          '0.3.1',
          '0.4.0',
          '0.4.1',
          '0.4.2',
          '0.4.3',
          '0.4.4',
          '0.4.5'
        ) then
          create extension if not exists pgsodium;

          perform pgsodium.create_key(
            name := ${(0,t.literal)(s)}
          );

          perform vault.create_secret(
            new_secret := ${n},
            new_name   := ${(0,t.literal)(s)},
            new_key_id := (select id from pgsodium.valid_key where name = ${(0,t.literal)(s)})
          );
        else
          perform vault.create_secret(
            new_secret := ${n},
            new_name := ${(0,t.literal)(s)}
          );
        end if;
      end $$;
    `}),_=(0,t.joinSqlFragments)(m,"\n"),g=c.filter(e=>a[e.name]).map(e=>t.safeSql`${(0,t.ident)(e.name)} ''%s''`),h=p.filter(e=>a[e.name]).map(e=>{let s=(0,t.literal)(a[e.name]).replace(/'/g,"''");return t.safeSql`${(0,t.ident)(e.name)} ${s}`}),E=(0,t.joinSqlFragments)([...g,...h],","),b=t.safeSql`
    do $$
    declare
      -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
      -- we use Vault directly.
      is_using_old_wrappers bool;
      ${(0,t.joinSqlFragments)(c.map(e=>t.safeSql`${(0,t.ident)(`v_${e.name}`)} text;`),"\n")}
    begin
      is_using_old_wrappers := (select extversion from pg_extension where extname = 'wrappers') in (
        '0.1.0',
        '0.1.1',
        '0.1.4',
        '0.1.5',
        '0.1.6',
        '0.1.7',
        '0.1.8',
        '0.1.9',
        '0.1.10',
        '0.1.11',
        '0.1.12',
        '0.1.14',
        '0.1.15',
        '0.1.16',
        '0.1.17',
        '0.1.18',
        '0.1.19',
        '0.2.0',
        '0.3.0',
        '0.3.1',
        '0.4.0',
        '0.4.1',
        '0.4.2',
        '0.4.3',
        '0.4.4',
        '0.4.5'
      );
      ${(0,t.joinSqlFragments)(c.map(e=>t.safeSql`
              if is_using_old_wrappers then
                select id into ${(0,t.ident)(`v_${e.name}`)} from pgsodium.valid_key where name = ${(0,t.literal)(`${a.wrapper_name}_${e.name}`)} limit 1;
              else
                select id into ${(0,t.ident)(`v_${e.name}`)} from vault.secrets where name = ${(0,t.literal)(`${a.wrapper_name}_${e.name}`)} limit 1;
              end if;
            `),"\n")}
    
      execute format(
        E'create server ${(0,t.ident)(a.server_name)} foreign data wrapper ${(0,t.ident)(a.wrapper_name)} options (${E});',
        ${(0,t.joinSqlFragments)(c.filter(e=>a[e.name]).map(e=>(0,t.ident)(`v_${e.name}`)),",")}
      );
    end $$;
  `,f=(0,t.joinSqlFragments)(r.map(e=>{let s=e.columns;return t.safeSql`
        create foreign table ${(0,t.ident)(e.schema_name)}.${(0,t.ident)(e.table_name)} (
          ${(0,t.joinSqlFragments)(s.map(e=>t.safeSql`${(0,t.ident)(e.name)} ${(0,t.keyword)(e.type)}`),",")}
        )
        server ${(0,t.ident)(a.server_name)}
        options (
          ${(0,t.joinSqlFragments)(Object.entries(e).filter(([e,t])=>"table_name"!==e&&"schema_name"!==e&&"columns"!==e&&"index"!==e&&"is_new_schema"!==e&&!!t).map(([e,a])=>t.safeSql`${(0,t.ident)(e)} ${(0,t.literal)(a)}`),",")}
        );
      `}),"\n\n"),S=(0,t.joinSqlFragments)([...l,t.safeSql`strict 'true'`],", ");return t.safeSql`
    ${u}

    ${d}

    ${_}

    ${b}

    ${"tables"===n?f:t.safeSql``}

    ${"schema"===n?t.safeSql`
  import foreign schema ${(0,t.ident)(i)} from server ${(0,t.ident)(a.server_name)} into ${(0,t.ident)(o)} options (${S});
`:t.safeSql``}
  `}let n=({wrapper:e,wrapperMeta:a})=>{let s=a.server.options.filter(e=>e.encrypted).map(a=>{let s=`${e.name}_${a.name}`;return t.safeSql`
      do $$
      begin
        -- Old wrappers has an implicit dependency on pgsodium. For new wrappers
        -- we use Vault directly.
        if (select extversion from pg_extension where extname = 'wrappers') in (
          '0.1.0',
          '0.1.1',
          '0.1.4',
          '0.1.5',
          '0.1.6',
          '0.1.7',
          '0.1.8',
          '0.1.9',
          '0.1.10',
          '0.1.11',
          '0.1.12',
          '0.1.14',
          '0.1.15',
          '0.1.16',
          '0.1.17',
          '0.1.18',
          '0.1.19',
          '0.2.0',
          '0.3.0',
          '0.3.1',
          '0.4.0',
          '0.4.1',
          '0.4.2',
          '0.4.3',
          '0.4.4',
          '0.4.5'
        ) then
          delete from vault.secrets where key_id = (select id from pgsodium.valid_key where name = ${(0,t.literal)(s)});

          delete from pgsodium.key where name = ${(0,t.literal)(s)};
        else
          delete from vault.secrets where name = ${(0,t.literal)(s)};
        end if;
      end $$;
    `}),n=(0,t.joinSqlFragments)(s,"\n");return t.safeSql`
    drop foreign data wrapper if exists ${(0,t.ident)(e.name)} cascade;

    ${n}
  `};e.s(["getCreateFDWSql",0,s,"getDeleteFDWSql",0,n,"getDropForeignTableSql",0,function({schema:e,table:a}){return t.safeSql`
drop foreign table if exists ${(0,t.ident)(e)}.${(0,t.ident)(a)};
`},"getFDWsSql",0,a,"getImportForeignSchemaSql",0,function({serverName:e,sourceSchema:a,targetSchema:s,schemaOptions:n=[]}){let r=(0,t.joinSqlFragments)([...n,t.safeSql`strict 'true'`],", ");return t.safeSql`
  import foreign schema ${(0,t.ident)(a)} from server ${(0,t.ident)(e)} into ${(0,t.ident)(s)} options (${r});
`},"getUpdateFDWSql",0,({wrapper:e,wrapperMeta:a,formState:r,tables:i})=>{let o=n({wrapper:e,wrapperMeta:a}),l=s({wrapperMeta:a,formState:r,tables:i,mode:"tables",sourceSchema:"",targetSchema:""});return t.safeSql`
    ${o}

    ${l}
  `}],33942);var r=e.i(242882);let i={list:e=>["projects",e,"fdws"]};e.s(["fdwKeys",0,i],584258);var o=e.i(714403);async function l({projectRef:e,connectionString:t},s){let n=a(),{result:r}=await (0,o.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["fdws"]},s);return r}e.s(["getFDWs",0,l,"useFDWsQuery",0,({projectRef:e,connectionString:t},{enabled:a=!0,...s}={})=>(0,r.useQuery)({queryKey:i.list(e),queryFn:({signal:a})=>l({projectRef:e,connectionString:t},a),enabled:a&&void 0!==e,...s})],298625)},986261,(e,t,a)=>{var s=e.r(781125);t.exports=function(e){return e&&e.length?s(e):[]}},392491,e=>{"use strict";e.i(850036);var t=e.i(957386),a=e.i(986261),s=e.i(539256),n=e.i(389959),r=e.i(635494),i=e.i(615515),o=e.i(12214),l=e.i(298625);let u=["auth","cron","etl","extensions","information_schema","net","pgsodium","pgsodium_masks","pgbouncer","pgtle","pgmq","realtime","storage","supabase_functions","supabase_migrations","vault","graphql","graphql_public",t.QUEUES_SCHEMA],d=({excludeSchemas:e=[]}={})=>{let t=(0,n.useMemo)(()=>e,[JSON.stringify(e)]),d=(()=>{let{data:e}=(0,r.useSelectedProjectQuery)(),t=(0,l.useFDWsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),s=(0,n.useMemo)(()=>i.WRAPPERS.filter(e=>e.server.options.some(e=>e.name===i.SUPABASE_TARGET_SCHEMA_OPTION.name)),[]),u=(0,n.useMemo)(()=>(t.data?.filter(e=>s.some(t=>(0,o.wrapperMetaComparator)(t,e)))??[]).map(e=>{let t=(0,o.convertKVStringArrayToJson)(e.server_options??[]).supabase_target_schema??"",s=(0,a.default)(t.split(",").filter(Boolean));return{serverName:e.server_name,type:e.handler.replace("_fdw_handler",""),schemas:s}}),[t.data,s]);return{...t,data:u}})(),c=(0,n.useMemo)(()=>{let e=u.map(e=>({name:e,type:"internal"})),a=d.data?.flatMap(e=>e.schemas.map(t=>({name:t,type:"fdw",fdwType:e.type,serverName:e.serverName})));return(0,s.default)([...e,...a],e=>e.name).filter(e=>!t.includes(e.name))},[d.data,t]);return{...d,data:c}};e.s(["INTERNAL_SCHEMAS",0,u,"useIsProtectedSchema",0,({schema:e,excludedSchemas:t=[]})=>{let{data:a}=d({excludeSchemas:t}),s=a.find(t=>t.name===e);return s?{isSchemaLocked:!0,reason:s.type,fdwType:s.fdwType}:{isSchemaLocked:!1,reason:void 0,fdwType:void 0}},"useProtectedSchemas",0,d])},180141,e=>{"use strict";e.s(["queryOptions",0,function(e){return e}])},722310,252706,796238,e=>{"use strict";var t=e.i(388019);let a=(0,t.default)("Clock5",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 14.5 16",key:"1pcbox"}]]);e.s(["Clock5",0,a],722310);let s=(0,t.default)("CodeXml",[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]]);e.s(["Code2",0,s],252706);let n=(0,t.default)("Layers",[["path",{d:"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",key:"8b97xw"}],["path",{d:"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",key:"dd6zsq"}],["path",{d:"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",key:"ep9fru"}]]);e.s(["Layers",0,n],796238)},829298,e=>{"use strict";let t=(0,e.i(388019).default)("Vault",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}],["path",{d:"m7.9 7.9 2.7 2.7",key:"hpeyl3"}],["circle",{cx:"16.5",cy:"7.5",r:".5",fill:"currentColor",key:"w0ekpg"}],["path",{d:"m13.4 10.6 2.7-2.7",key:"264c1n"}],["circle",{cx:"7.5",cy:"16.5",r:".5",fill:"currentColor",key:"nkw3mc"}],["path",{d:"m7.9 16.1 2.7-2.7",key:"p81g5e"}],["circle",{cx:"16.5",cy:"16.5",r:".5",fill:"currentColor",key:"fubopw"}],["path",{d:"m13.4 13.4 2.7 2.7",key:"abhel3"}],["circle",{cx:"12",cy:"12",r:"2",key:"1c9p78"}]]);e.s(["Vault",0,t],829298)},880791,e=>{"use strict";let t=(0,e.i(388019).default)("Webhook",[["path",{d:"M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2",key:"q3hayz"}],["path",{d:"m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06",key:"1go1hn"}],["path",{d:"m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8",key:"qlwsc0"}]]);e.s(["Webhook",0,t],880791)},480762,e=>{"use strict";var t=e.i(479084);e.s(["getEnableWebhooksSQL",0,()=>t.safeSql`
BEGIN;
  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;
  END
  $$;

  -- Event trigger for pg_net
  CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
  RETURNS event_trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_event_trigger_ddl_commands() AS ev
      JOIN pg_extension AS ext
      ON ev.objid = ext.oid
      WHERE ext.extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

      IF EXISTS (
        SELECT FROM pg_extension
        WHERE extname = 'pg_net'
        -- all versions in use on existing projects as of 2025-02-20
        -- version 0.12.0 onwards don't need these applied
        AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
      ) THEN
        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

        REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
        REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      END IF;
    END IF;
  END;
  $$;
  COMMENT ON FUNCTION extensions.grant_pg_net_access IS 'Grants access to pg_net';

  DO
  $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_event_trigger
      WHERE evtname = 'issue_pg_net_access'
    ) THEN
      CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end WHEN TAG IN ('CREATE EXTENSION')
      EXECUTE PROCEDURE extensions.grant_pg_net_access();
    END IF;
  END
  $$;

  -- pg_net grants when extension is already enabled
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'pg_net'
    )
    THEN
      GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

      IF EXISTS (
        SELECT FROM pg_extension
        WHERE extname = 'pg_net'
        -- all versions in use on existing projects as of 2025-02-20
        -- version 0.12.0 onwards don't need these applied
        AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
      ) THEN
        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

        ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
        ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

        REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
        REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
        GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      END IF;
    END IF;
  END
  $$;

  -- Create pg_net extension
  CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

  -- Create supabase_functions schema
  CREATE SCHEMA supabase_functions AUTHORIZATION supabase_admin;

  GRANT USAGE ON SCHEMA supabase_functions TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA supabase_functions GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

  -- supabase_functions.migrations definition
  CREATE TABLE supabase_functions.migrations (
    version text PRIMARY KEY,
    inserted_at timestamptz NOT NULL DEFAULT NOW()
  );

  -- Initial supabase_functions migration
  INSERT INTO supabase_functions.migrations (version) VALUES ('initial');

  -- supabase_functions.hooks definition
  CREATE TABLE supabase_functions.hooks (
    id bigserial PRIMARY KEY,
    hook_table_id integer NOT NULL,
    hook_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    request_id bigint
  );
  CREATE INDEX supabase_functions_hooks_request_id_idx ON supabase_functions.hooks USING btree (request_id);
  CREATE INDEX supabase_functions_hooks_h_table_id_h_name_idx ON supabase_functions.hooks USING btree (hook_table_id, hook_name);
  COMMENT ON TABLE supabase_functions.hooks IS 'Supabase Functions Hooks: Audit trail for triggered hooks.';

  CREATE FUNCTION supabase_functions.http_request()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    DECLARE
      request_id bigint;
      payload jsonb;
      url text := TG_ARGV[0]::text;
      method text := TG_ARGV[1]::text;
      headers jsonb DEFAULT '{}'::jsonb;
      params jsonb DEFAULT '{}'::jsonb;
      timeout_ms integer DEFAULT 1000;
    BEGIN
      IF url IS NULL OR url = 'null' THEN
        RAISE EXCEPTION 'url argument is missing';
      END IF;

      IF method IS NULL OR method = 'null' THEN
        RAISE EXCEPTION 'method argument is missing';
      END IF;

      IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
        headers = '{"Content-Type": "application/json"}'::jsonb;
      ELSE
        headers = TG_ARGV[2]::jsonb;
      END IF;

      IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
        params = '{}'::jsonb;
      ELSE
        params = TG_ARGV[3]::jsonb;
      END IF;

      IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
        timeout_ms = 1000;
      ELSE
        timeout_ms = TG_ARGV[4]::integer;
      END IF;

      CASE
        WHEN method = 'GET' THEN
          SELECT http_get INTO request_id FROM net.http_get(
            url,
            params,
            headers,
            timeout_ms
          );
        WHEN method = 'POST' THEN
          payload = jsonb_build_object(
            'old_record', OLD,
            'record', NEW,
            'type', TG_OP,
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );

          SELECT http_post INTO request_id FROM net.http_post(
            url,
            payload,
            params,
            headers,
            timeout_ms
          );
        ELSE
          RAISE EXCEPTION 'method argument % is invalid', method;
      END CASE;

      INSERT INTO supabase_functions.hooks
        (hook_table_id, hook_name, request_id)
      VALUES
        (TG_RELID, TG_NAME, request_id);

      RETURN NEW;
    END
  $function$;

  GRANT ALL PRIVILEGES ON SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA supabase_functions TO supabase_functions_admin;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA supabase_functions TO supabase_functions_admin;
  ALTER USER supabase_functions_admin SET search_path = "supabase_functions";
  ALTER table "supabase_functions".migrations OWNER TO supabase_functions_admin;
  ALTER table "supabase_functions".hooks OWNER TO supabase_functions_admin;
  ALTER function "supabase_functions".http_request() OWNER TO supabase_functions_admin;
  GRANT supabase_functions_admin TO postgres;

  -- Remove unused supabase_pg_net_admin role
  DO
  $$
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_pg_net_admin'
    )
    THEN
      REASSIGN OWNED BY supabase_pg_net_admin TO supabase_admin;
      DROP OWNED BY supabase_pg_net_admin;
      DROP ROLE supabase_pg_net_admin;
    END IF;
  END
  $$;

  INSERT INTO supabase_functions.migrations (version) VALUES ('20210809183423_update_grants');

  ALTER function supabase_functions.http_request() SECURITY DEFINER;
  ALTER function supabase_functions.http_request() SET search_path = supabase_functions;
  REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO postgres, anon, authenticated, service_role;

  COMMIT;
`])},74244,e=>{"use strict";let t=(0,e.i(388019).default)("Timer",[["line",{x1:"10",x2:"14",y1:"2",y2:"2",key:"14vaq8"}],["line",{x1:"12",x2:"15",y1:"14",y2:"11",key:"17fdiu"}],["circle",{cx:"12",cy:"14",r:"8",key:"1e1u0o"}]]);e.s(["Timer",0,t],74244)},933275,297808,232622,e=>{"use strict";var t=e.i(478902);e.i(850036);var a=e.i(480762),s=e.i(722310),n=e.i(252706),r=e.i(796238),i=e.i(74244),o=e.i(829298),l=e.i(880791),u=e.i(940412),d=e.i(111508),c=e.i(843778),p=e.i(108151),m=e.i(345594),_=e.i(837710),g=e.i(710483),h=e.i(635494);let E=({minimumVersion:e="15.6"})=>{let{data:a}=(0,h.useSelectedProjectQuery)();return(0,t.jsxs)(g.Admonition,{type:"default",title:"Database upgrade needed",childProps:{description:{className:"flex flex-col gap-y-2"}},children:[(0,t.jsx)("div",{className:"prose text-sm max-w-full",children:(0,t.jsxs)("p",{children:["This integration requires the ",(0,t.jsx)("code",{children:"pgmq"})," extension which is not available on this version of Postgres. The extension is available on version ",e," and higher."]})}),(0,t.jsx)(_.Button,{color:"primary",className:"w-fit",children:(0,t.jsx)(m.default,{href:`/project/${a?.ref}/settings/infrastructure`,children:"Upgrade database"})})]})};var b=e.i(559398),f=e.i(615515),S=e.i(918018),T=e.i(38429),v=e.i(356003);e.i(128328);var N=e.i(704206),y=e.i(355901),A=e.i(246230),R=e.i(10429),w=e.i(967052);async function I({projectRef:e,stripeSecretKey:t,startTime:a}){let s=await (0,N.getAccessToken)(),n=await fetch(`${R.BASE_PATH}/api/integrations/stripe-sync`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${s}`},body:JSON.stringify({projectRef:e,stripeSecretKey:t,startTime:a})}),r=await n.json();if(!n.ok)throw Error(r.error?.message||"Failed to install Stripe Sync");return r}e.s(["installStripeSync",0,I,"useStripeSyncInstallMutation",0,({onSuccess:e,onError:t,...a}={})=>{let s=(0,v.useQueryClient)(),n=(0,w.useTrack)();return(0,T.useMutation)({mutationFn:e=>I(e),async onSuccess(t,a,r){let{projectRef:i}=a;n("integration_install_submitted",{integrationName:"stripe_sync_engine",method:"template"}),await s.invalidateQueries({queryKey:A.databaseKeys.schemas(i)}),await s.invalidateQueries({queryKey:S.stripeSyncKeys.all}),await e?.(t,a,r)},async onError(e,a,s){void 0===t?y.toast.error(`Failed to install Stripe Sync: ${e.message}`):t(e,a,s)},...a})}],297808);var O=e.i(801834),L=e.i(234745);async function x({ref:e}){let{data:t,error:a}=await (0,L.post)("/platform/database/{ref}/hook-enable",{params:{path:{ref:e}}});return a&&(0,L.handleError)(a),t}e.s(["enableDatabaseWebhooks",0,x,"useHooksEnableMutation",0,({onSuccess:e,onError:t,...a}={})=>{let s=(0,v.useQueryClient)();return(0,T.useMutation)({mutationFn:e=>x(e),async onSuccess(t,a,n){let{ref:r}=a;await e?.(t,a,n),await (0,O.invalidateSchemasQuery)(s,r)},async onError(e,a,s){void 0===t?y.toast.error(`Failed to enable webhooks: ${e.message}`):t(e,a,s)},...a})}],232622);var C=e.i(741391);let j={name:"Supabase",websiteUrl:"https://supabase.com"},q=[{id:"queues",type:"postgres_extension",requiredExtensions:["pgmq"],missingExtensionsAlert:(0,t.jsx)(E,{minimumVersion:"15.6.1.143"}),name:"Queues",icon:({className:e,...a}={})=>(0,t.jsx)(r.Layers,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Lightweight message queue in Postgres",docsUrl:"https://github.com/tembo-io/pgmq",author:{name:"pgmq",websiteUrl:"https://github.com/tembo-io/pgmq"},navigation:[{route:"overview",label:"Overview"},{route:"queues",label:"Queues",hasChild:!0,childIcon:(0,t.jsx)(r.Layers,{size:12,strokeWidth:1.5,className:(0,c.cn)("text-foreground w-full h-full")})},{route:"settings",label:"Settings"}],navigate:({pageId:t="overview",childId:a})=>{if(a)return(0,u.default)(()=>e.A(274794).then(e=>e.QueuePage),{loadableGenerated:{modules:[571538]},loading:F});switch(t){case"overview":return(0,u.default)(()=>e.A(909495).then(e=>e.QueuesOverviewTab),{loadableGenerated:{modules:[698380]},loading:F});case"queues":return(0,u.default)(()=>e.A(548863).then(e=>e.QueuesTab),{loadableGenerated:{modules:[79703]},loading:F});case"settings":return(0,u.default)(()=>e.A(283398).then(e=>e.QueuesSettings),{loadableGenerated:{modules:[541970]},loading:F})}return null}},{id:"cron",type:"postgres_extension",requiredExtensions:["pg_cron"],name:"Cron",icon:({className:e,...a}={})=>(0,t.jsx)(s.Clock5,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Schedule recurring Jobs in Postgres",docsUrl:"https://github.com/citusdata/pg_cron",author:{name:"Citus Data",websiteUrl:"https://github.com/citusdata/pg_cron"},navigation:[{route:"overview",label:"Overview"},{route:"jobs",label:"Jobs",hasChild:!0,childIcon:(0,t.jsx)(i.Timer,{size:12,strokeWidth:1.5,className:(0,c.cn)("text-foreground w-full h-full")})}],navigate:({pageId:t="overview",childId:a})=>{if(a)return(0,u.default)(()=>e.A(609157).then(e=>e.CronJobPage),{loadableGenerated:{modules:[323205]},loading:F});switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"jobs":return(0,u.default)(()=>e.A(579437).then(e=>e.CronjobsTab),{loadableGenerated:{modules:[524943]},loading:F})}return null}},{id:"vault",type:"postgres_extension",requiredExtensions:["supabase_vault"],missingExtensionsAlert:(0,t.jsx)(E,{}),name:"Vault",status:"beta",icon:({className:e,...a}={})=>(0,t.jsx)(o.Vault,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Application level encryption for your project",docsUrl:`${R.DOCS_URL}/guides/database/vault`,author:j,navigation:[{route:"overview",label:"Overview"},{route:"secrets",label:"Secrets"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"secrets":return(0,u.default)(()=>e.A(707643).then(e=>e.SecretsManagement),{loadableGenerated:{modules:[935100]},loading:F})}return null}},{id:"webhooks",type:"postgres_extension",name:"Database Webhooks",icon:({className:e,...a}={})=>(0,t.jsx)(l.Webhook,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Send real-time data from your database to another system when a table event occurs",docsUrl:`${R.DOCS_URL}/guides/database/webhooks`,author:j,requiredExtensions:["pg_net"],navigation:[{route:"overview",label:"Overview"},{route:"webhooks",label:"Webhooks"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(467186).then(e=>e.WebhooksOverviewTab),{loadableGenerated:{modules:[6777]},loading:F});case"webhooks":return(0,u.default)(()=>e.A(639206).then(e=>e.WebhooksListTab),{loadableGenerated:{modules:[791713]},loading:F})}return null},installationSql:(0,a.getEnableWebhooksSQL)(),installationCommand:async({ref:e})=>{let t=(0,C.getQueryClient)();await x({ref:e}),await (0,O.invalidateSchemasQuery)(t,e)}},{id:"data_api",type:"custom",requiredExtensions:[],name:"Data API",icon:({className:e,...a}={})=>(0,t.jsx)(n.Code2,{className:(0,c.cn)("inset-0 p-2 text-black w-full h-full",e),...a}),description:"Auto-generate an API directly from your database schema",docsUrl:`${R.DOCS_URL}/guides/api`,author:j,navigation:[{route:"overview",label:"Overview"},{route:"settings",label:"Settings"},{route:"docs",label:"Docs"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(250577).then(e=>e.DataApiOverviewTab),{loadableGenerated:{modules:[429091]},loading:F});case"settings":return(0,u.default)(()=>e.A(610764).then(e=>e.DataApiSettingsTab),{loadableGenerated:{modules:[247311]},loading:F});case"docs":return(0,u.default)(()=>e.A(818633).then(e=>e.DataApiDocsTab),{loadableGenerated:{modules:[338481]},loading:F})}return null}},{id:"graphiql",type:"postgres_extension",requiredExtensions:["pg_graphql"],name:"GraphQL",icon:({className:e,...a}={})=>(0,t.jsx)(d.default,{fill:!0,src:`${R.BASE_PATH}/img/graphql.svg`,alt:"GraphiQL",className:(0,c.cn)("p-2",e),...a}),description:"Run GraphQL queries through our interactive in-browser IDE",docsUrl:`${R.DOCS_URL}/guides/database/extensions/pg_graphql`,author:j,navigation:[{route:"overview",label:"Overview"},{route:"graphiql",label:"GraphiQL"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(248383).then(e=>e.IntegrationOverviewTabWrapper),{loadableGenerated:{modules:[136003]},loading:F});case"graphiql":return(0,u.default)(()=>e.A(500556).then(e=>e.GraphiQLTab),{loadableGenerated:{modules:[321608]},loading:F})}return null}}],$=[...f.WRAPPERS.map(a=>({id:a.name,type:"wrapper",name:`${a.label} Wrapper`,icon:({className:e,...s}={})=>(0,t.jsx)(d.default,{fill:!0,src:a.icon,alt:a.name,className:(0,c.cn)("p-2",e),...s}),requiredExtensions:["wrappers","supabase_vault"],description:a.description,docsUrl:a.docsUrl,meta:a,author:j,navigation:[{route:"overview",label:"Overview"},{route:"wrappers",label:"Wrappers"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(596207).then(e=>e.WrapperOverviewTab),{loadableGenerated:{modules:[865243]},loading:F});case"wrappers":return(0,u.default)(()=>e.A(354946).then(e=>e.WrappersTab),{loadableGenerated:{modules:[674412]},loading:F})}return null}})),...q,{id:"stripe_sync_engine",type:"template",requiredExtensions:["pgmq","supabase_vault","pg_cron","pg_net"],missingExtensionsAlert:(0,t.jsx)(E,{minimumVersion:"15.6.1.143"}),name:"Stripe Sync Engine",status:"alpha",icon:({className:e,...a}={})=>(0,t.jsx)(d.default,{fill:!0,src:`${R.BASE_PATH}/img/icons/stripe-icon.svg`,alt:"Stripe Logo",className:(0,c.cn)("p-2",e),...a}),description:"Continuously sync your payments, customer, and other data from Stripe to your Postgres database",docsUrl:"https://github.com/stripe-experiments/sync-engine/",author:{name:"Stripe",websiteUrl:"https://www.stripe.com"},navigation:[{route:"overview",label:"Overview"},{route:"settings",label:"Settings"}],navigate:({pageId:t="overview"})=>{switch(t){case"overview":return(0,u.default)(()=>e.A(943222).then(e=>e.StripeSyncEngineOverviewTab),{loadableGenerated:{modules:[140017]},loading:F});case"settings":return(0,u.default)(()=>e.A(98740).then(e=>e.StripeSyncSettingsPage),{loadableGenerated:{modules:[795776]},loading:F})}return null},inputs:{stripe_api_key:{type:"password",required:!0,label:"Stripe API secret key",description:"Requires write access to Webhook Endpoints and read-only access to all other categories.",actions:[{label:"Get API key",href:"https://dashboard.stripe.com/apikeys"},{label:"What are Stripe API keys?",href:"https://support.stripe.com/questions/what-are-stripe-api-keys-and-how-to-find-them"}]}},steps:[{label:"Creates a new database schema named `stripe`"},{label:"Creates tables and views in the `stripe` schema for synced Stripe data"},{label:"Deploys Edge Functions to handle incoming webhooks from Stripe"},{label:"Schedules automatic Stripe data syncs using Supabase Queues"}],installationCommand:async({ref:e,track:t,stripe_api_key:a})=>{let s=Date.now();await I({projectRef:e,startTime:s,stripeSecretKey:a}),t&&t("integration_install_submitted",{integrationName:"stripe_sync_engine",method:"template"});let n=(0,C.getQueryClient)();await n.invalidateQueries({queryKey:S.stripeSyncKeys.all})},checkInstallationStatus:async e=>{let t=(0,C.getQueryClient)(),{projectRef:a,connectionString:s}=e||{},n=await (0,O.getSchemas)({projectRef:a,connectionString:s}),{status:r,errorMessage:i}=(0,b.getStripeSyncSchemaComment)(n);if("install error"===r)throw Error(i??"Stripe Sync installation failed");return"installed"===r&&await t.invalidateQueries({queryKey:A.databaseKeys.schemas(a)}),"installed"===r?"installed":"installing"}}],F=()=>(0,t.jsx)("div",{className:"p-10",children:(0,t.jsx)(p.GenericSkeletonLoader,{})});e.s(["INTEGRATIONS",0,$,"Loading",0,F],933275)},375890,e=>{"use strict";var t=e.i(242882),a=e.i(142119),s=e.i(234745),n=e.i(10429);async function r(){try{return await (0,s.fetchHandler)(`${n.BASE_PATH}/api/cli-release-version`).then(e=>e.json())}catch(e){throw e}}e.s(["useCLIReleaseVersionQuery",0,({enabled:e=!0,...s}={})=>(0,t.useQuery)({queryKey:a.miscKeys.cliReleaseVersion(),queryFn:()=>r(),enabled:e&&!n.IS_PLATFORM,...s})])},462531,757670,353917,e=>{"use strict";var t=e.i(180141),a=e.i(866644),s=e.i(726950);let n=()=>{let e=a.default.env.NEXT_PUBLIC_MARKETPLACE_API_URL||"",t=a.default.env.NEXT_PUBLIC_MARKETPLACE_PUBLISHABLE_KEY||"";return(0,s.createClient)(e,t,{auth:{persistSession:!1,autoRefreshToken:!1,detectSessionInUrl:!1,storage:{getItem:e=>null,setItem:(e,t)=>{},removeItem:e=>{}}}})};e.s(["createMarketplaceClient",0,n],757670);let r={list:()=>["marketplace","integrations"],categories:()=>["marketplace","categories"]};e.s(["marketplaceIntegrationsKeys",0,r],353917);var i=e.i(234745);async function o(){let e=n(),{data:t,error:a}=await e.from("listings").select("*").is("publish_dashboard",!0);return a&&(0,i.handleError)(a),t??[]}e.s(["marketplaceIntegrationsQueryOptions",0,({enabled:e=!0}={})=>(0,t.queryOptions)({queryKey:r.list(),queryFn:()=>o(),enabled:e})],462531)},79745,e=>{"use strict";var t=e.i(866644),a=e.i(478902),s=e.i(242882);e.i(128328);var n=e.i(657588),r=e.i(86086),i=e.i(466266),o=e.i(940412),l=e.i(111508),u=e.i(389959),d=e.i(843778),c=e.i(933275),p=e.i(462531),m=e.i(375890),_=e.i(912793);let g=e=>{let a=t.default.env.NEXT_PUBLIC_MARKETPLACE_API_URL||"";return`${a}${e}`};e.s(["useAvailableIntegrations",0,()=>{let{hasLoaded:t}=(0,u.useContext)(n.FeatureFlagContext),h=(0,n.useFlag)("marketplaceIntegrations"),{integrationsWrappers:E}=(0,_.useIsFeatureEnabled)(["integrations:wrappers"]),{data:b}=(0,m.useCLIReleaseVersionQuery)(),f=!!b?.current,{data:S,error:T}=(0,s.useQuery)({...(0,p.marketplaceIntegrationsQueryOptions)(),enabled:h}),v=r.IS_PLATFORM&&(!t||h&&!S&&!T),N=!r.IS_PLATFORM||t&&(!h||!!S&&!T),y=r.IS_PLATFORM&&h&&!!T,A=(0,u.useMemo)(()=>(S??[])?.map(t=>{let{id:s,slug:n,categories:r,title:u,description:p,documentation_url:m,website_url:_,installation_url:h,installation_url_type:E,installation_identification_method:b,secret_key_prefix:f,images:S,content:T,partner_name:v,listing_logo:N}=t;return{id:n??"",name:u??"",status:void 0,type:"oauth",categories:Array.isArray(r)?r.map(e=>e.slug):[],content:T,files:S?.map(e=>g(e)),description:p,docsUrl:m,siteUrl:_,installUrl:h,installUrlType:E??void 0,installIdentificationMethod:b??void 0,secretKeyPrefix:f??void 0,listingId:s??void 0,author:{name:v??"",websiteUrl:""},requiredExtensions:[],icon:({className:e,...t}={})=>(0,a.jsx)("div",{className:"relative w-full h-full",children:N?(0,a.jsx)(l.default,{fill:!0,src:g(N),alt:"",className:(0,d.cn)("p-2",e),...t}):(0,a.jsx)(i.Boxes,{className:(0,d.cn)("inset-0 p-2 text-black w-full h-full",e),...t})}),navigation:[{route:"overview",label:"Overview"}],navigate:({pageId:t="overview"})=>"overview"===t?(0,o.default)(()=>e.A(356631).then(e=>e.IntegrationOverviewTabV2),{loadableGenerated:{modules:[157592]},loading:c.Loading}):null}}),[S]),R=(0,u.useMemo)(()=>c.INTEGRATIONS.filter(e=>!(!E&&("wrapper"===e.type||e.id.endsWith("_wrapper")))&&("stripe_sync_engine"!==e.id||!f)),[E,f]);return{data:(0,u.useMemo)(()=>[...A,...R].sort((e,t)=>e.name.localeCompare(t.name)),[A,R]),error:T,isPending:v,isSuccess:N,isError:y}}])}]);