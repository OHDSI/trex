(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,878594,e=>{"use strict";var t=e.i(991435);new WeakMap,new WeakMap;let s={get url(){return`file://${e.P("node_modules/.pnpm/valtio@1.12.0_@types+react@18.3.3_react@18.3.1/node_modules/valtio/esm/vanilla/utils.mjs")}`}},a=Symbol();e.s(["devtools",0,function(e,r){let n;"string"==typeof r&&(console.warn("string name option is deprecated, use { name }. https://github.com/pmndrs/valtio/pull/400"),r={name:r});let{enabled:o,name:i="",...l}=r||{};try{n=(null!=o?o:(s.env?s.env.MODE:void 0)!=="production")&&window.__REDUX_DEVTOOLS_EXTENSION__}catch{}if(!n){(s.env?s.env.MODE:void 0)!=="production"&&o&&console.warn("[Warning] Please install/enable Redux devtools extension");return}let u=!1,c=n.connect({name:i,...l}),m=(0,t.subscribe)(e,s=>{let r=s.filter(([e,t])=>t[0]!==a).map(([e,t])=>`${e}:${t.map(String).join(".")}`).join(", ");if(r)if(u)u=!1;else{let s=Object.assign({},(0,t.snapshot)(e));delete s[a],c.send({type:r,updatedAt:new Date().toLocaleString()},s)}}),d=c.subscribe(s=>{var r,n,o,i,l,m;if("ACTION"===s.type&&s.payload)try{Object.assign(e,JSON.parse(s.payload))}catch(e){console.error("please dispatch a serializable value that JSON.parse() and proxy() support\n",e)}if("DISPATCH"===s.type&&s.state)((null==(r=s.payload)?void 0:r.type)==="JUMP_TO_ACTION"||(null==(n=s.payload)?void 0:n.type)==="JUMP_TO_STATE")&&(u=!0,Object.assign(e,JSON.parse(s.state))),e[a]=s;else if("DISPATCH"===s.type&&(null==(o=s.payload)?void 0:o.type)==="COMMIT")c.init((0,t.snapshot)(e));else if("DISPATCH"===s.type&&(null==(i=s.payload)?void 0:i.type)==="IMPORT_STATE"){let a=null==(l=s.payload.nextLiftedState)?void 0:l.actionsById,r=(null==(m=s.payload.nextLiftedState)?void 0:m.computedStates)||[];u=!0,r.forEach(({state:s},r)=>{let n=a[r]||"No action found";Object.assign(e,s),0===r?c.init((0,t.snapshot)(e)):c.send(n,(0,t.snapshot)(e))})}});return c.init((0,t.snapshot)(e)),()=>{m(),null==d||d()}},"proxyMap",0,function(e){let s=(0,t.proxy)({data:Array.from(e||[]),has(e){return this.data.some(t=>t[0]===e)},set(e,t){let s=this.data.find(t=>t[0]===e);return s?s[1]=t:this.data.push([e,t]),this},get(e){var t;return null==(t=this.data.find(t=>t[0]===e))?void 0:t[1]},delete(e){let t=this.data.findIndex(t=>t[0]===e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},toJSON(){return new Map(this.data)},forEach(e){this.data.forEach(t=>{e(t[1],t[0],this)})},keys(){return this.data.map(e=>e[0]).values()},values(){return this.data.map(e=>e[1]).values()},entries(){return new Map(this.data).entries()},get[Symbol.toStringTag](){return"Map"},[Symbol.iterator](){return this.entries()}});return Object.defineProperties(s,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(s),s},"proxySet",0,function(e){let s=(0,t.proxy)({data:Array.from(new Set(e)),has(e){return -1!==this.data.indexOf(e)},add(e){let s=!1;return"object"==typeof e&&null!==e&&(s=-1!==this.data.indexOf((0,t.proxy)(e))),-1!==this.data.indexOf(e)||s||this.data.push(e),this},delete(e){let t=this.data.indexOf(e);return -1!==t&&(this.data.splice(t,1),!0)},clear(){this.data.splice(0)},get size(){return this.data.length},forEach(e){this.data.forEach(t=>{e(t,t,this)})},get[Symbol.toStringTag](){return"Set"},toJSON(){return new Set(this.data)},[Symbol.iterator](){return this.data[Symbol.iterator]()},values(){return this.data.values()},keys(){return this.data.values()},entries(){return new Set(this.data).entries()}});return Object.defineProperties(s,{data:{enumerable:!1},size:{enumerable:!1},toJSON:{enumerable:!1}}),Object.seal(s),s}],878594)},937357,e=>{"use strict";e.s(["databaseIndexesKeys",0,{list:(e,t)=>["projects",e,"database-indexes",t].filter(Boolean)}])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(38429),a=e.i(356003),r=e.i(355901),n=e.i(667286),o=e.i(78162),i=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:o=!1,createSchema:u=!1}){let c=new Headers;s&&c.set("x-connection-encrypted",s);let m=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:o,createSchema:u}),{result:d}=await (0,i.executeSql)({projectRef:e,connectionString:s,sql:m,queryKey:["extension","create"]});return d}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...i}={})=>{let u=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([u.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),u.invalidateQueries({queryKey:o.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...i})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),s=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:a,indexStatements:r,onSuccess:o,onError:i}){if(!e){let e=Error("Project ref is required");return i&&i(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return i&&i(e),Promise.reject(e)}try{return await (0,s.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),o&&o(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),i&&i(e),Promise.reject(e)}}function o(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!a.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=o(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,o,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var i=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,i.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=r(t??[]),n=!!s&&!!a,o=n&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:o}}],888525);var u=e.i(478902),c=e.i(389959),m=e.i(232520),d=e.i(837710),_=e.i(610144),p=e.i(967052);let h=({open:e,setOpen:s})=>{let a=(0,p.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:o}=(0,i.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:c,indexAdvisor:d}=r(o),{mutateAsync:h,isPending:g}=(0,_.useDatabaseExtensionEnableMutation)(),f=async()=>{if(void 0===n)return t.toast.error("Project is required");try{c?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:c.name,schema:c?.schema??"extensions",version:c.default_version}),d?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),t.toast.success("Successfully enabled Index Advisor!"),s(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,u.jsx)(m.AlertDialog,{open:e,onOpenChange:()=>s(!e),children:(0,u.jsxs)(m.AlertDialogContent,{size:"medium",children:[(0,u.jsxs)(m.AlertDialogHeader,{children:[(0,u.jsx)(m.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,u.jsxs)(m.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,u.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,u.jsxs)("p",{children:["Enable this will install the ",(0,u.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,u.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,u.jsxs)(m.AlertDialogFooter,{children:[(0,u.jsx)(m.AlertDialogCancel,{children:"Cancel"}),(0,u.jsx)(m.AlertDialogAction,{onClick:e=>{e.preventDefault(),f(),a("index_advisor_dialog_enable_button_clicked")},disabled:g,children:g?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,p.useTrack)(),[t,s]=(0,c.useState)(!1);return(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)(d.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,u.jsx)(h,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,h],284399)},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],i={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),o=!n&&r?e.value:`'${e.value}'`,i=!n&&String(o).toLowerCase(),l=n?e.value:i;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},u={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
        -- reports-api-total-requests
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          count(t.id) as count
        FROM edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${l(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC`},topRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${l(e)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          count desc
        limit 10
        `},errorCounts:{queryType:"logs",sql:e=>`
        -- reports-api-error-counts
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          count(t.id) as count
        FROM edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        WHERE
          response.status_code >= 400
        ${l(e,!1)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
        `},topErrorRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-error-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        where
          response.status_code >= 400
        ${l(e,!1)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          count desc
        limit 10
        `},responseSpeed:{queryType:"logs",sql:e=>`
        -- reports-api-response-speed
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          avg(response.origin_time) as avg
        FROM
          edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${l(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
      `},topSlowRoutes:{queryType:"logs",sql:e=>`
        -- reports-api-top-slow-routes
        select
          request.path as path,
          request.method as method,
          request.search as search,
          response.status_code as status_code,
          count(t.id) as count,
          avg(response.origin_time) as avg
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
        ${l(e)}
        group by
          request.path, request.method, request.search, response.status_code
        order by
          avg desc
        limit 10
        `},networkTraffic:{queryType:"logs",sql:e=>`
        -- reports-api-network-traffic
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          coalesce(
            safe_divide(
              sum(
                cast(coalesce(headers.content_length, "0") as int64)
              ),
              1000000
            ),
            0
          ) as ingress_mb,
          coalesce(
            safe_divide(
              sum(
                cast(coalesce(resp_headers.content_length, "0") as int64)
              ),
              1000000
            ),
            0
          ) as egress_mb,
        FROM
          edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          cross join unnest(response.headers) as resp_headers
          ${l(e)}
        GROUP BY
          timestamp
        ORDER BY
          timestamp ASC
        `},requestsByCountry:{queryType:"logs",sql:e=>`
        -- reports-api-requests-by-country
        select
          cf.country as country,
          count(t.id) as count
        from edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          cross join unnest(request.cf) as cf
        where
          cf.country is not null
        ${l(e,!1)}
        group by
          cf.country
        `}}},[r.AUTH]:{title:"",queries:{}},[r.STORAGE]:{title:"Storage",queries:{cacheHitRate:{queryType:"logs",sql:e=>`
        -- reports-storage-cache-hit-rate
SELECT
  timestamp_trunc(timestamp, hour) as timestamp,
  countif( h.cf_cache_status in ('HIT', 'STALE', 'REVALIDATED', 'UPDATING') ) as hit_count,
  countif( h.cf_cache_status in ('MISS', 'NONE/UNKNOWN', 'EXPIRED', 'BYPASS', 'DYNAMIC') ) as miss_count
from edge_logs f
  cross join unnest(f.metadata) as m
  cross join unnest(m.request) as r
  cross join unnest(m.response) as res
  cross join unnest(res.headers) as h
where starts_with(r.path, '/storage/v1/object') and r.method = 'GET'
  ${l(e,!1)}
group by timestamp
order by timestamp desc
`},topCacheMisses:{queryType:"logs",sql:e=>`
        -- reports-storage-top-cache-misses
SELECT
  r.path as path,
  r.search as search,
  count(id) as count
from edge_logs f
  cross join unnest(f.metadata) as m
  cross join unnest(m.request) as r
  cross join unnest(m.response) as res
  cross join unnest(res.headers) as h
where starts_with(r.path, '/storage/v1/object')
  and r.method = 'GET'
  and h.cf_cache_status in ('MISS', 'NONE/UNKNOWN', 'EXPIRED', 'BYPASS', 'DYNAMIC')
  ${l(e,!1)}
group by path, search
order by count desc
limit 12
    `}}},[r.QUERY_PERFORMANCE]:{title:"Query performance",queries:{mostFrequentlyInvoked:{queryType:"db",sql:(e,t,s,a=!1,r=!1)=>`
        -- reports-query-performance-most-frequently-invoked
set search_path to public, extensions;

select
    auth.rolname,
    statements.query,
    statements.calls,
    -- -- Postgres 13, 14, 15
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.min_exec_time + statements.min_plan_time as min_time,
    statements.max_exec_time + statements.max_plan_time as max_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    -- -- Postgres <= 12
    -- total_time,
    -- min_time,
    -- max_time,
    -- mean_time,
    coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows,
    statements.rows as rows_read,
    case
      when (statements.shared_blks_hit + statements.shared_blks_read) > 0
      then round(
        (statements.shared_blks_hit * 100.0) /
        (statements.shared_blks_hit + statements.shared_blks_read),
        2
      )
      else 0
    end as cache_hit_rate${a?`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:""}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?t.replace(/^WHERE/,"AND"):""}
  ${s||"order by statements.calls desc"}
  limit 20`},mostTimeConsuming:{queryType:"db",sql:(e,t,s,a=!1,r=!1)=>`
        -- reports-query-performance-most-time-consuming
set search_path to public, extensions;

-- compute total time once up front so we don't need a window function over all rows
with grand_total as (
  select coalesce(nullif(sum(total_exec_time + total_plan_time), 0), 1) as v
  from pg_stat_statements where calls > 0
)
select
    auth.rolname,
    statements.query,
    statements.calls,
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    coalesce(
      ((statements.total_exec_time + statements.total_plan_time) /
        (select v from grand_total)) *
        100,
      0
    ) as prop_total_time${a?`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:""}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?t.replace(/^WHERE/,"AND"):""}
  ${s||"order by total_time desc"}
  limit 20`},slowestExecutionTime:{queryType:"db",sql:(e,t,s,a=!1,r=!1)=>`
        -- reports-query-performance-slowest-execution-time
set search_path to public, extensions;

select
    auth.rolname,
    statements.query,
    statements.calls,
    -- -- Postgres 13, 14, 15
    statements.total_exec_time + statements.total_plan_time as total_time,
    statements.min_exec_time + statements.min_plan_time as min_time,
    statements.max_exec_time + statements.max_plan_time as max_time,
    statements.mean_exec_time + statements.mean_plan_time as mean_time,
    -- -- Postgres <= 12
    -- total_time,
    -- min_time,
    -- max_time,
    -- mean_time,
    coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows${a?`,
    case
      when (lower(statements.query) like 'select%' or lower(statements.query) like 'with pgrst%')
      then (
        select json_build_object(
          'has_suggestion', array_length(index_statements, 1) > 0,
          'startup_cost_before', startup_cost_before,
          'startup_cost_after', startup_cost_after,
          'total_cost_before', total_cost_before,
          'total_cost_after', total_cost_after,
          'index_statements', index_statements
        )
        from index_advisor(statements.query)
      )
      else null
    end as index_advisor_result`:""}
  from pg_stat_statements as statements
    inner join pg_authid as auth on statements.userid = auth.oid
  -- skip queries that were never actually executed
  WHERE statements.calls > 0 ${t?t.replace(/^WHERE/,"AND"):""}
  ${s||"order by max_time desc"}
  limit 20`},queryHitRate:{queryType:"db",sql:e=>`-- reports-query-performance-cache-and-index-hit-rate
select
    'index hit rate' as name,
    (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read),0) as ratio
  from pg_statio_user_indexes
  union all
  select
    'table hit rate' as name,
    sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read),0) as ratio
  from pg_statio_user_tables;`},unified:{queryType:"db",sql:(e,t,s,a=!1,r=!1,n=1,o=20)=>{let i=(n-1)*o,l=r&&a?i+10*o:i+o,u=a?Math.min(l,500):l;return`
        -- reports-query-performance-unified
        set search_path to public, extensions;

        -- compute total time once up front so we don't need a window function over all rows
        with grand_total as (
          select coalesce(nullif(sum(total_exec_time + total_plan_time), 0), 1) as v
          from pg_stat_statements where calls > 0
        ),
        base as (
          select
            auth.rolname,
            statements.query,
            statements.calls,
            statements.total_exec_time + statements.total_plan_time as total_time,
            statements.min_exec_time + statements.min_plan_time as min_time,
            statements.max_exec_time + statements.max_plan_time as max_time,
            statements.mean_exec_time + statements.mean_plan_time as mean_time,
            coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows,
            statements.rows as rows_read,
            statements.shared_blks_hit as debug_hit,
            statements.shared_blks_read as debug_read,
            case
              when (statements.shared_blks_hit + statements.shared_blks_read) > 0
              then (statements.shared_blks_hit::numeric * 100.0) /
                   (statements.shared_blks_hit + statements.shared_blks_read)
              else 0
            end as cache_hit_rate,
            coalesce(
              ((statements.total_exec_time + statements.total_plan_time) /
                (select v from grand_total)) *
                100,
              0
            ) as prop_total_time
          from pg_stat_statements as statements
            inner join pg_authid as auth on statements.userid = auth.oid
          -- skip queries that were never actually executed
          WHERE statements.calls > 0 ${t?t.replace(/^WHERE/,"AND"):""}
          ${s||"order by total_time desc"}
          ${null!==u?`limit ${u}`:""}
        ),
        query_results as (
          select
            base.*${a?`,
            case
              when (lower(base.query) like 'select%' or lower(base.query) like 'with pgrst%')
              then (
                select json_build_object(
                  'has_suggestion', array_length(index_statements, 1) > 0,
                  'startup_cost_before', startup_cost_before,
                  'startup_cost_after', startup_cost_after,
                  'total_cost_before', total_cost_before,
                  'total_cost_after', total_cost_after,
                  'index_statements', index_statements
                )
                from index_advisor(base.query)
              )
              else null
            end as index_advisor_result`:""}
          from base
        )
        select *
        from query_results
        ${r&&a?"where (index_advisor_result->>'has_suggestion')::boolean = true":""}
        ${s||"order by total_time desc"}
        limit ${o} offset ${i}`}},slowQueriesCount:{queryType:"db",sql:()=>`
        -- reports-query-performance-slow-queries-count
        set search_path to public, extensions;

        -- Count of slow queries (> 1 second average)
        SELECT count(*) as slow_queries_count
        -- alias needed to reference columns in WHERE
        FROM pg_stat_statements as statements
        -- skip never-executed queries; mean_exec_time > 1000ms = avg over 1 second
        WHERE statements.calls > 0 AND statements.mean_exec_time > 1000;`},queryMetrics:{queryType:"db",sql:(e,t,s,a=!1,r=!1)=>`
        -- reports-query-performance-metrics
        set search_path to public, extensions;

        SELECT
          COALESCE(ROUND(AVG(statements.rows::numeric / NULLIF(statements.calls, 0)), 1), 0) as avg_rows_per_call,
          COUNT(*) FILTER (WHERE statements.total_exec_time + statements.total_plan_time > 1000) as slow_queries,
          COALESCE(
            ROUND(
              SUM(statements.shared_blks_hit) * 100.0 /
              NULLIF(SUM(statements.shared_blks_hit + statements.shared_blks_read), 0),
              2
            ), 0
          ) || '%' as cache_hit_rate
        FROM pg_stat_statements as statements
        -- skip queries that were never actually executed
        WHERE statements.calls > 0 ${t?t.replace(/^WHERE/,"AND"):""}
        ${s||""}`}}},[r.DATABASE]:{title:"database",queries:{largeObjects:{queryType:"db",sql:e=>`-- reports-database-large-objects
SELECT
        SCHEMA_NAME,
        relname,
        table_size
      FROM
        (SELECT
          pg_catalog.pg_namespace.nspname AS SCHEMA_NAME,
          relname,
          pg_total_relation_size(pg_catalog.pg_class.oid) AS table_size
        FROM pg_catalog.pg_class
        JOIN pg_catalog.pg_namespace ON relnamespace = pg_catalog.pg_namespace.oid
        ) t
      WHERE SCHEMA_NAME NOT LIKE 'pg_%'
      ORDER BY table_size DESC
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,i,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,u,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),o=e.i(189329);e.s(["default",0,({sql:e,params:i=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:u})=>{let{data:c}=(0,n.useSelectedProjectQuery)(),m=(0,o.useDatabaseSelectorStateSnapshot)(),{data:d}=(0,a.useReadReplicasQuery)({projectRef:c?.ref}),_=(d||[]).find(e=>e.identifier===m.selectedDatabaseId)?.connectionString,p=m.selectedDatabaseId,h="function"==typeof e?e([]):e,{data:g,error:f,isPending:y,isRefetching:b,refetch:S}=(0,t.useQuery)({queryKey:["projects",c?.ref,"db",{...i,sql:h,identifier:p},l,u],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:c?.ref,connectionString:_||c?.connectionString,sql:h},e).then(e=>e.result),enabled:!!h,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:f||("object"==typeof g?g?.error:""),data:g,isLoading:y,isRefetching:b,params:i,runQuery:S,resolvedSql:h}}])},503256,e=>{"use strict";var t=e.i(389959);let s=t.forwardRef(function({title:e,titleId:s,...a},r){return t.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:r,"aria-labelledby":s},a),e?t.createElement("title",{id:s},e):null,t.createElement("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"}))});e.s(["InformationCircleIcon",0,s],503256)},769105,e=>{"use strict";var t=e.i(479084),s=e.i(867088),a=e.i(356003),r=e.i(820308),n=e.i(775159),o=e.i(150671),i=e.i(714403),l=e.i(749199),u=e.i(635494),c=e.i(10429),m=e.i(189329);let d=new Set(["query","rolname","total_time","prop_total_time","calls","avg_rows","max_time","mean_time","min_time"]);function _({preset:e,orderBy:s,searchQuery:a="",roles:o=[],sources:i=[],minCalls:l=0,minTotalTime:u=0,runIndexAdvisor:c=!1,filterIndexAdvisor:m=!1,page:p=1,pageSize:h=20}){let g=Number.isFinite(p)?Math.max(1,Math.floor(p)):1,f=Number.isFinite(h)?Math.min(Math.max(1,Math.floor(h)),100):20,y=r.PRESET_CONFIG[n.Presets.QUERY_PERFORMANCE].queries[e],b=null!=s&&d.has(s.column)&&("asc"===s.order||"desc"===s.order)?`ORDER BY ${(0,t.ident)(s.column)} ${s.order}`:void 0,S=[];o.length>0&&S.push(`auth.rolname in (${o.map(e=>`${(0,t.literal)(e)}`).join(", ")})`),a.length>0&&S.push(`statements.query ~* ${(0,t.literal)(a)}`),i.includes("dashboard")&&!i.includes("non-dashboard")&&S.push("statements.query ~* 'source: dashboard'"),i.includes("non-dashboard")&&!i.includes("dashboard")&&S.push("statements.query !~* 'source: dashboard'"),Number.isFinite(l)&&l>0&&S.push(`statements.calls >= ${l}`),Number.isFinite(u)&&u>0&&S.push(`(statements.total_exec_time + statements.total_plan_time) >= ${u}`);let q=S.join(" AND ");return{sql:y.sql([],q.length>0?`WHERE ${q}`:void 0,b,c,m,g,f),whereSql:q,orderBySql:b}}e.s(["useQueryPerformanceInfiniteQuery",0,e=>{let t=(0,a.useQueryClient)(),{data:r}=(0,u.useSelectedProjectQuery)(),n=(0,m.useDatabaseSelectorStateSnapshot)(),{data:l}=(0,o.useReadReplicasQuery)({projectRef:r?.ref}),d=(l||[]).find(e=>e.identifier===n.selectedDatabaseId)?.connectionString,p=e.pageSize,h=Number.isFinite(p)?Math.min(Math.max(1,Math.floor(p)),100):20,{sql:g}=_({...e,page:1,pageSize:h}),f=n.selectedDatabaseId&&n.selectedDatabaseId!==r?.ref?d:d??r?.connectionString,{data:y,isPending:b,isRefetching:S,isFetchingNextPage:q,hasNextPage:x,error:E,fetchNextPage:v}=(0,s.useInfiniteQuery)({queryKey:["projects",r?.ref,"query-performance-infinite",{...e,pageSize:h,identifier:n.selectedDatabaseId,connectionString:f}],initialPageParam:1,queryFn:({pageParam:t,signal:s})=>{let{sql:a}=_({...e,page:t,pageSize:h});return(0,i.executeSql)({projectRef:r?.ref,connectionString:f,sql:a},s).then(e=>e.result)},getNextPageParam:(e,t)=>e.length<h?void 0:t.length+1,enabled:!!r?.ref&&(!c.IS_PLATFORM||!!f),refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{data:y?.pages.flatMap(e=>e)??void 0,isLoading:b,isRefetching:S,isFetchingNextPage:q,hasNextPage:x??!1,error:E,fetchNextPage:v,refetch:()=>t.resetQueries({queryKey:["projects",r?.ref,"query-performance-infinite"],exact:!1}),resolvedSql:g}},"useQueryPerformanceQuery",0,e=>{let{sql:t,whereSql:s,orderBySql:a}=_(e);return(0,l.default)({sql:t,params:void 0,where:s,orderBy:a})}])}]);