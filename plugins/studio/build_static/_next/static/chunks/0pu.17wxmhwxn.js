(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,610144,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(38429),s=e.i(356003),r=e.i(355901),n=e.i(667286),i=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:a,schema:s,name:r,version:n,cascade:i=!1,createSchema:c=!1}){let u=new Headers;a&&u.set("x-connection-encrypted",a);let d=(0,t.getEnableDatabaseExtensionSQL)({schema:s,name:r,version:n,cascade:i,createSchema:c}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:d,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let c=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,s){let{projectRef:r}=a;await Promise.all([c.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:i.configKeys.upgradeEligibility(r)})]),await e?.(t,a,s)},async onError(e,a,s){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,a,s)},...o})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),a=e.i(714403),s=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:s,indexStatements:r,onSuccess:i,onError:o}){if(!e){let e=Error("Project ref is required");return o&&o(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return o&&o(e),Promise.reject(e)}try{return await (0,a.executeSql)({projectRef:e,connectionString:s,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),i&&i(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),o&&o(e),Promise.reject(e)}}function i(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let a=t[1]||t[2];return!a||!s.INTERNAL_SCHEMAS.includes(a.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let a=Number(e),s=Number(t);return a<=0||a<=s?0:(a-s)/a*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=i(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,i,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return s.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var o=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,o.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:a,indexAdvisor:s}=r(t??[]),n=!!a&&!!s,i=n&&null!==a.installed_version&&null!==s.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:i}}],888525);var c=e.i(478902),u=e.i(389959),d=e.i(232520),m=e.i(837710),p=e.i(610144),_=e.i(967052);let f=({open:e,setOpen:a})=>{let s=(0,_.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:i}=(0,o.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:u,indexAdvisor:m}=r(i),{mutateAsync:f,isPending:h}=(0,p.useDatabaseExtensionEnableMutation)(),g=async()=>{if(void 0===n)return t.toast.error("Project is required");try{u?.installed_version===null&&await f({projectRef:n?.ref,connectionString:n?.connectionString,name:u.name,schema:u?.schema??"extensions",version:u.default_version}),m?.installed_version===null&&await f({projectRef:n?.ref,connectionString:n?.connectionString,name:m.name,schema:m?.schema??"extensions",version:m.default_version}),t.toast.success("Successfully enabled Index Advisor!"),a(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(d.AlertDialog,{open:e,onOpenChange:()=>a(!e),children:(0,c.jsxs)(d.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(d.AlertDialogHeader,{children:[(0,c.jsx)(d.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(d.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(d.AlertDialogFooter,{children:[(0,c.jsx)(d.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(d.AlertDialogAction,{onClick:e=>{e.preventDefault(),g(),s("index_advisor_dialog_enable_button_clicked")},disabled:h,children:h?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,_.useTrack)(),[t,a]=(0,u.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(m.Button,{type:"primary",onClick:()=>{a(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(f,{open:t,setOpen:a})]})},"EnableIndexAdvisorDialog",0,f],284399)},820308,775159,e=>{"use strict";var t,a,s=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((a={}).LAST_10_MINUTES="Last 10 minutes",a.LAST_30_MINUTES="Last 30 minutes",a.LAST_60_MINUTES="Last 60 minutes",a.LAST_3_HOURS="Last 3 hours",a.LAST_24_HOURS="Last 24 hours",a.LAST_7_DAYS="Last 7 days",a.LAST_14_DAYS="Last 14 days",a.LAST_28_DAYS="Last 28 days",a);let i=[{text:"Last 10 minutes",calcFrom:()=>(0,s.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,s.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,s.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,s.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,s.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,s.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,s.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,s.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,s.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["team","enterprise"]}],o={iso_timestamp_start:i[0].calcFrom(),iso_timestamp_end:i[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let a=e.map(e=>{let t=e.key.split("."),a=[t[t.length-2],t[t.length-1]].join("."),s=e.key.includes(".")?a:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),i=!n&&r?e.value:`'${e.value}'`,o=!n&&String(i).toLowerCase(),l=n?e.value:o;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${s}, ${l})`;case"is":default:return`${s} = ${l}`;case"!=":return`${s} != ${l}`;case">=":return`${s} >= ${l}`;case"<=":return`${s} <= ${l}`;case">":return`${s} > ${l}`;case"<":return`${s} < ${l}`}}).filter(Boolean).join(" AND ");return""===a?"":t?"WHERE "+a:"AND "+a},c={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
    `}}},[r.QUERY_PERFORMANCE]:{title:"Query performance",queries:{mostFrequentlyInvoked:{queryType:"db",sql:(e,t,a,s=!1,r=!1)=>`
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
    end as cache_hit_rate${s?`,
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
  ${a||"order by statements.calls desc"}
  limit 20`},mostTimeConsuming:{queryType:"db",sql:(e,t,a,s=!1,r=!1)=>`
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
    ) as prop_total_time${s?`,
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
  ${a||"order by total_time desc"}
  limit 20`},slowestExecutionTime:{queryType:"db",sql:(e,t,a,s=!1,r=!1)=>`
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
    coalesce(statements.rows::numeric / nullif(statements.calls, 0), 0) as avg_rows${s?`,
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
  ${a||"order by max_time desc"}
  limit 20`},queryHitRate:{queryType:"db",sql:e=>`-- reports-query-performance-cache-and-index-hit-rate
select
    'index hit rate' as name,
    (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read),0) as ratio
  from pg_statio_user_indexes
  union all
  select
    'table hit rate' as name,
    sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read),0) as ratio
  from pg_statio_user_tables;`},unified:{queryType:"db",sql:(e,t,a,s=!1,r=!1,n=1,i=20)=>{let o=(n-1)*i,l=r&&s?o+10*i:o+i,c=s?Math.min(l,500):l;return`
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
          ${a||"order by total_time desc"}
          ${null!==c?`limit ${c}`:""}
        ),
        query_results as (
          select
            base.*${s?`,
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
        ${r&&s?"where (index_advisor_result->>'has_suggestion')::boolean = true":""}
        ${a||"order by total_time desc"}
        limit ${i} offset ${o}`}},slowQueriesCount:{queryType:"db",sql:()=>`
        -- reports-query-performance-slow-queries-count
        set search_path to public, extensions;

        -- Count of slow queries (> 1 second average)
        SELECT count(*) as slow_queries_count
        -- alias needed to reference columns in WHERE
        FROM pg_stat_statements as statements
        -- skip never-executed queries; mean_exec_time > 1000ms = avg over 1 second
        WHERE statements.calls > 0 AND statements.mean_exec_time > 1000;`},queryMetrics:{queryType:"db",sql:(e,t,a,s=!1,r=!1)=>`
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
        ${a||""}`}}},[r.DATABASE]:{title:"database",queries:{largeObjects:{queryType:"db",sql:e=>`-- reports-database-large-objects
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,o,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,c,"REPORTS_DATEPICKER_HELPERS",0,i,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),a=e.i(820308),s=e.i(150671),r=e.i(714403),n=e.i(635494),i=e.i(189329);e.s(["default",0,({sql:e,params:o=a.DEFAULT_QUERY_PARAMS,where:l,orderBy:c})=>{let{data:u}=(0,n.useSelectedProjectQuery)(),d=(0,i.useDatabaseSelectorStateSnapshot)(),{data:m}=(0,s.useReadReplicasQuery)({projectRef:u?.ref}),p=(m||[]).find(e=>e.identifier===d.selectedDatabaseId)?.connectionString,_=d.selectedDatabaseId,f="function"==typeof e?e([]):e,{data:h,error:g,isPending:b,isRefetching:y,refetch:v}=(0,t.useQuery)({queryKey:["projects",u?.ref,"db",{...o,sql:f,identifier:_},l,c],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:u?.ref,connectionString:p||u?.connectionString,sql:f},e).then(e=>e.result),enabled:!!f,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:g||("object"==typeof h?h?.error:""),data:h,isLoading:b,isRefetching:y,params:o,runQuery:v,resolvedSql:f}}])},194576,e=>{"use strict";var t=e.i(478902),a=e.i(270740),s=e.i(938933);let r=({open:e,children:s,className:r,...n})=>(0,t.jsx)(a.Collapsible.Root,{asChild:n.asChild,defaultOpen:n.defaultOpen,open:e,onOpenChange:n.onOpenChange,disabled:n.disabled,className:r,children:s});r.Trigger=function({children:e,asChild:s}){return(0,t.jsx)(a.Collapsible.Trigger,{asChild:s,children:e})},r.Content=function({asChild:e,children:r,className:n}){let i=(0,s.default)("collapsible");return(0,t.jsx)(a.Collapsible.Content,{asChild:e,className:[i.content,n].join(" "),children:r})},e.s(["default",0,r])},58359,e=>{"use strict";var t=e.i(194576);e.s(["Collapsible",()=>t.default])},143692,e=>{"use strict";let t=(0,e.i(388019).default)("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);e.s(["default",0,t])},971687,e=>{"use strict";var t=e.i(143692);e.s(["Calendar",()=>t.default])},245049,e=>{"use strict";var t=e.i(478902),a=e.i(975924),s=e.i(505859),r=e.i(938933);function n({align:e="center",ariaLabel:a,arrow:i=!1,children:o,className:l,defaultOpen:c=!1,modal:u,onOpenChange:d,open:m,overlay:p,side:_="bottom",sideOffset:f=6,style:h,header:g,footer:b,size:y="content",disabled:v,"data-testid":x}){let S=(0,r.default)("popover"),E=[S.content,S.size[y]];return l&&E.push(l),(0,t.jsxs)(s.Popover.Root,{defaultOpen:c,modal:u,onOpenChange:d,open:m,children:[(0,t.jsx)(s.Popover.Trigger,{disabled:v,className:S.trigger,"aria-label":a,"data-testid":x,children:o}),(0,t.jsx)(s.Popover.Portal,{children:(0,t.jsxs)(s.Popover.Content,{sideOffset:f,side:_,align:e,className:E.join(" "),style:h,children:[i&&(0,t.jsx)(s.Popover.Arrow,{offset:10}),g&&(0,t.jsx)("div",{className:S.header,children:g}),p,b&&(0,t.jsx)("div",{className:S.footer,children:b})]})})]})}n.Separator=function(){let e=(0,r.default)("popover");return(0,t.jsx)("div",{className:e.separator})},n.Close=function(){let e=(0,r.default)("popover");return(0,t.jsx)(s.Popover.Close,{className:e.close,children:(0,t.jsx)(a.X,{size:14,strokeWidth:2})})},e.s(["default",0,n])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},867467,e=>{"use strict";var t=e.i(389959);e.s(["useChanged",0,function(e){let a=(0,t.useRef)(),s=a.current!==e;return(0,t.useEffect)(()=>{a.current=e}),s},"useChangedSync",0,function(e){let a=(0,t.useRef)(),s=a.current!==e;return a.current=e,s}])},999918,e=>{"use strict";let t=(0,e.i(388019).default)("ShieldOff",[["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .67.01c2.35-.82 4.48-1.97 5.9-3.71",key:"1jlk70"}],["path",{d:"M9.309 3.652A12.252 12.252 0 0 0 11.24 2.28a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7a9.784 9.784 0 0 1-.08 1.264",key:"18rp1v"}]]);e.s(["ShieldOff",0,t],999918)},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:r,onCancel:n,title:i="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:c="Keep editing",size:u="tiny"})=>{let d=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(d.current=!1)},[e]);let m=(0,a.useCallback)(()=>{d.current=!0,r()},[r]),p=(0,a.useCallback)(e=>{if(!e){if(d.current){d.current=!1;return}n()}},[n]);return(0,t.jsx)(s.AlertDialog,{open:e,onOpenChange:p,children:(0,t.jsxs)(s.AlertDialogContent,{size:u,children:[(0,t.jsxs)(s.AlertDialogHeader,{children:[(0,t.jsx)(s.AlertDialogTitle,{children:i}),null!=o&&(0,t.jsx)(s.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(s.AlertDialogFooter,{children:[(0,t.jsx)(s.AlertDialogCancel,{children:c}),(0,t.jsx)(s.AlertDialogAction,{variant:"danger",onClick:m,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:s})=>{let[r,n]=(0,t.useState)(!1),i=(0,a.default)(e),o=(0,a.default)(s),l=(0,t.useCallback)(()=>{i.current()?n(!0):o.current()},[]),c=(0,t.useCallback)(e=>{e||l()},[l]),u=(0,t.useCallback)(()=>{n(!1),o.current()},[]),d=(0,t.useCallback)(()=>{n(!1)},[]),m=(0,t.useMemo)(()=>({visible:r,onClose:u,onCancel:d}),[r,u,d]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:c,modalProps:m}),[l,c,m])}])},931078,(e,t,a)=>{var s=e.r(358849),r=e.r(854059),n=e.r(225083),i=e.r(145948),o=e.r(775484),l=e.r(904216),c=e.r(85057),u=e.r(562081),d=Object.prototype.hasOwnProperty;t.exports=function(e){if(null==e)return!0;if(o(e)&&(i(e)||"string"==typeof e||"function"==typeof e.splice||l(e)||u(e)||n(e)))return!e.length;var t=r(e);if("[object Map]"==t||"[object Set]"==t)return!e.size;if(c(e))return!s(e).length;for(var a in e)if(d.call(e,a))return!1;return!0}},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},847278,e=>{"use strict";var t=e.i(850036),a=e.i(38429),s=e.i(356003),r=e.i(355901),n=e.i(138658),i=e.i(915993),o=e.i(714403),l=e.i(938343);async function c({projectRef:e,connectionString:a,id:s,name:r,schema:n,payload:i}){let{sql:l}=t.default.tables.update({id:s,name:r,schema:n},i),{result:u}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:l,queryKey:["table","update",s]});return u}e.s(["updateTable",0,c,"useTableUpdateMutation",0,({onSuccess:e,onError:t,...o}={})=>{let u=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>c(e),async onSuccess(t,a,s){let{projectRef:r,schema:o,id:c}=a;await Promise.all([u.invalidateQueries({queryKey:l.tableEditorKeys.tableEditor(r,c)}),u.invalidateQueries({queryKey:n.tableKeys.list(r,o)}),u.invalidateQueries({queryKey:i.lintKeys.lint(r)})]),await e?.(t,a,s)},async onError(e,a,s){void 0===t?r.toast.error(`Failed to update database table: ${e.message}`):t(e,a,s)},...o})}])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),a=e.i(242882),s=e.i(818135),r=e.i(714403);let n=t.default.tablePrivileges.list();async function i({projectRef:e,connectionString:t},a){let{result:s}=await (0,r.executeSql)({projectRef:e,connectionString:t,sql:n.sql,queryKey:["table-privileges"]},a);return s}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:s.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...n}={})=>(0,a.useQuery)({queryKey:s.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...n})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],a=["SELECT","INSERT","UPDATE","DELETE"],s={anon:[...a],authenticated:[...a],service_role:[...a]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,a,"DEFAULT_DATA_API_PRIVILEGES",0,s,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>a.includes(e)])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:s})=>`INSERT INTO ${(0,t.ident)(s)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(s)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:s,sourceTableSchema:r})=>[`CREATE TABLE ${(0,t.ident)(r)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(r)}.${(0,t.ident)(s)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(r)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var s=e.i(180141),r=e.i(242882),n=e.i(938343),i=e.i(714403);async function o({projectRef:e,connectionString:t,id:s},r){if(!s)throw Error("id is required");let n=a({id:s}),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["table-editor",s]},r);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,s.queryOptions)({queryKey:n.tableEditorKeys.tableEditor(e,a),queryFn:({signal:s})=>o({projectRef:e,connectionString:t,id:a},s)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:s}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:s}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:s=!0,...n}={})=>(0,r.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:s&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...n})],34479)},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:a,...s}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:a?.role,...s}],tableRowsCount:(e,{table:t,...a}={})=>["projects",e,"table-rows",t?.id,"count",a],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),a=e.i(962217);e.s(["formatFilterValue",0,function(e,a){let s=e.columns.find(e=>e.name==a.column);if(s&&(0,t.isNumericalColumn)(s.format)){let e=Number(a.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(a.value)}return a.value},"getPrimaryKeys",0,function({table:e}){if(!(0,a.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},310959,e=>{"use strict";var t=e.i(479084),a=e.i(721490);let s=10240,r=50,n=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],i=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(i),l=new Set([...n,...i,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,r,"MAX_CHARACTERS",0,s,"getTableRowsSql",0,({table:e,filters:i=[],sorts:c=[],page:u,limit:d,maxCharacters:m=s,maxArraySize:p=r,sortExcludedColumns:_=[]})=>{if(!e||!e.columns)return t.safeSql``;let f=new a.Query().from(e.name,e.schema).select();i.forEach(t=>{let a=e.columns?.find(e=>e.name===t.column),s=!a||n.includes(a.format);f=f.filter(t.column,t.operator,s||""!==t.value?t.value:null)});let h=e.live_rows_estimate||0;if(0===c.length&&h<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let a=e.primary_keys?.map(e=>e.name);if(a&&a.length>0&&!a.every(e=>t.includes(e)))return a;if(e.columns&&e.columns.length>0){let a=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(a.length>0)return[a[0].name]}return[]})(e,{excludedColumns:_});t.length>0&&t.forEach(t=>{f=f.order(e.name,t)})}else c.forEach(e=>{f=f.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:g,to:b}=function(e,t=100){let a=e?e*t:0;return{from:a,to:e?a+t-1:t-1}}((u??1)-1,d),y=t.safeSql`with _base_query as (${f.range(g,b).toSql({isCTE:!1,isFinal:!1})})`,v=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),x=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),S=v.map(({name:e})=>{let a=(0,t.ident)(e);return x.includes(e)?t.safeSql`case
        when octet_length(${a}::text) > ${(0,t.literal)(m)} 
        then left(${a}::text, ${(0,t.literal)(m)}) || '...'
        else ${a}::text
      end as ${a}`:a});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:a})=>{let s=S.findIndex(a=>a===(0,t.ident)(e)),r=o.has(a),n=r?t.safeSql`::${(0,t.keyword)(a)}[]`:t.safeSql`::text[]`,i=r?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);s>=0&&(S[s]=t.safeSql`
        case 
          when octet_length(${l}::text) > ${(0,t.literal)(m)} 
          then
            case
              when array_ndims(${l}) = 1
              then
                (select array_cat(${l}[1:${(0,t.literal)(p)}]${n}, ${i}${n}))${n}
              else
                ${l}[1:${(0,t.literal)(p)}]${n}
            end
          else ${l}${n}
        end
      `)});let E=(0,t.joinSqlFragments)(S,","),j=new a.Query().from("_base_query").select(E);return t.safeSql`${y}
  ${j.toSql({isCTE:!0,isFinal:!0})}`}])},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),a=e.i(356003),s=e.i(989567),r=e.i(389959),n=e.i(85626),i=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),u=e.i(940562),d=e.i(721490),m=e.i(310959),p=e.i(242882);e.i(128328);var _=e.i(86086),f=e.i(790819),h=e.i(46974),g=e.i(311827),b=e.i(234745),y=e.i(714403),v=e.i(962217),x=e.i(48189),S=e.i(908937),E=e.i(201461),j=e.i(237948);async function q(e,t=3,a=1e3){for(let s=0;s<=t;s++)try{return await e()}catch(e){if(429===(e instanceof j.ResponseError?e.code:e.status)&&s<t){let t=function(e){if(e instanceof j.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),r=t?1e3*t:a*Math.pow(2,s);await (0,x.timeout)(r);continue}throw e}throw Error("Max retries reached without success")}let w=({table:e,filters:t=[],sorts:a=[]})=>{let s,r,n,i,o,l=new d.Query,u=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),m=l.from(e.name,e.schema??void 0).select(u.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...u],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let a=(0,h.formatFilterValue)(e,t);m=m.filter(t.column,t.operator,a)});let p=!1,{cursorPaginationEligible:_,cursorPaginationNonEligible:f}=(s=[],r=[],(n=e.primaryKey)&&s.push(n),i=e.uniqueIndexes,(o=i?.filter(t=>t.every(t=>{let a=e.columns.find(e=>e.name===t);return!!a&&!a.isNullable})))&&s.push(...o),r.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:s,cursorPaginationNonEligible:r}),b=e.type===g.ENTITY_TYPE.TABLE||e.type===g.ENTITY_TYPE.PARTITIONED_TABLE||e.type===g.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===a.length)_.length>0?(p=_[0],_[0].forEach(t=>{m=m.order(e.name,t)})):(f.length>0&&(m=m.order(e.name,f[0])),b&&(m=m.order(e.name,"ctid")));else{a.forEach(e=>{m=m.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=_[0];if(t){let s=new Set(a.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!s.has(e)).forEach(t=>{m=m.order(e.name,t)})}else b&&(m=m.order(e.name,"ctid"))}return{sql:m,cursorColumns:p}},T=async({projectRef:e,connectionString:t,table:a,filters:s=[],sorts:r=[],roleImpersonationState:n,progressCallback:i})=>{if(_.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=w({table:a,sorts:r,filters:s});if(c){let a=null;for(;;){let s=l.clone();a&&(s=s.filter(c,">",c.map(e=>a[e])));let r=(0,S.wrapWithRoleImpersonation)(s.range(0,499).toSql(),n);try{let{result:s}=await q(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:r}));for(let e of(o.push(...s),i?.(o.length),a={},c))a[e]=s[s.length-1]?.[e];if(s.length<500)break;await (0,x.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let a=-1;for(;;){let s=500*(a+=1),r=(a+1)*500-1,c=(0,S.wrapWithRoleImpersonation)(l.range(s,r).toSql(),n);try{let{result:a}=await q(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...a),i?.(o.length),a.length<500)break;await (0,x.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[u.ROLE_IMPERSONATION_NO_RESULTS])};async function A({queryClient:e,projectRef:t,connectionString:a,tableId:s,roleImpersonationState:r,filters:n,sorts:o,limit:c,page:u,preflightCheck:d=!1},p){let _=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:s});if(!_)throw Error("Table not found");let f=(0,i.parseSupaTable)(_),h=n?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),g=(0,v.isMsSqlForeignTable)(_)?Array.from(new Set(h)):void 0,x=(0,S.wrapWithRoleImpersonation)((0,m.getTableRowsSql)({table:_,filters:n,sorts:o,limit:c,page:u,sortExcludedColumns:g}),r);try{let{result:e}=await (0,y.executeSql)({projectRef:t,connectionString:a,sql:x,queryKey:["table-rows",f?.id],isRoleImpersonationEnabled:(0,E.isRoleImpersonationEnabled)(r?.role),preflightCheck:d},p);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,b.handleError)(e)}}function R(e,{projectRef:t,connectionString:a,tableId:s,readReplicaIdentifier:r,...n}){return e.fetchQuery({queryKey:f.tableRowKeys.tableRows(t,{table:{id:s},readReplicaIdentifier:r,...n}),queryFn:({signal:r})=>A({queryClient:e,projectRef:t,connectionString:a,tableId:s,...n},r)})}e.s(["executeWithRetry",0,q,"fetchAllTableRows",0,T,"getAllTableRowsSql",0,w,"prefetchTableRows",0,R,"useTableRowsQuery",0,({projectRef:e,tableId:t,...s},{enabled:r=!0,...n}={})=>{let i=(0,a.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:u,...d}=s;return(0,p.useQuery)({queryKey:f.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...d}),queryFn:({signal:a})=>A({queryClient:i,projectRef:e,connectionString:l,tableId:t,...s},a),enabled:r&&void 0!==e&&void 0!==t&&(!_.IS_PLATFORM||void 0!==l),...n})}],70756);var k=e.i(635494),N=e.i(636047);function P({queryClient:e,projectRef:t,connectionString:a,readReplicaIdentifier:s,id:r,sorts:n,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:a,id:r}).then(l=>{if(l){let u=(0,i.parseSupaTable)(l),{sorts:d=[],filters:m=[]}=(0,i.loadTableEditorStateFromLocalStorage)(t,l.id)??{};R(e,{projectRef:t,connectionString:a,readReplicaIdentifier:s,tableId:r,sorts:n??(0,i.formatSortURLParams)(u.name,d),filters:o??(0,i.formatFilterURLParams)(m),page:1,limit:N.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function I(){let e=(0,s.useRouter)(),t=(0,a.useQueryClient)(),{data:n}=(0,k.useSelectedProjectQuery)(),{connectionString:i,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,E.useRoleImpersonationStateSnapshot)();return(0,r.useCallback)(({id:a,filters:s,sorts:r})=>{let o=a?Number(a):void 0;!n||!o||isNaN(o)||(e.prefetch(`/project/${n.ref}/editor/${o}`),P({queryClient:t,projectRef:n.ref,connectionString:i,readReplicaIdentifier:l,id:o,sorts:r,filters:s,roleImpersonationState:c}).catch(()=>{}))},[i,l,n,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:a,sorts:s,filters:r,href:i,children:o,...l}){let c=I();return(0,t.jsx)(n.default,{href:i||`/project/${e}/editor/${a}`,prefetcher:()=>c({id:a,sorts:s,filters:r}),...l,children:o})},"prefetchEditorTablePage",0,P,"usePrefetchEditorTablePage",0,I],941381);var C=e.i(972089),$=e.i(462142);let O=({projectRef:e,schemaName:t},{enabled:a=!0}={})=>{let s=a&&!!e&&!!t,{data:n,isPending:i,isError:o}=(0,$.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:s,select:({db_schema:e})=>e}),l=(0,r.useMemo)(()=>n?(0,$.parseDbSchemaString)(n):[],[n]);return!s||i?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,O],963203);var L=e.i(84001);let D=[],M={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:a,tableNames:s=D},{enabled:n=!0,...i}={})=>{let o=(0,r.useMemo)(()=>new Set(s.filter(e=>"string"==typeof e&&e.length>0)),[s]),l=o.size>0,c=O({projectRef:e,schemaName:a},{enabled:n}),u=c.isSuccess&&!0===c.data,d=n&&l,m=(0,C.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:d,...i});return(0,r.useMemo)(()=>{if(!n||"pending"===c.status||d&&m.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||d&&m.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:M,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=u?((e,t,a)=>{if(!e)return{};let s={};return e.forEach(e=>{if(e.schema===t&&a.has(e.name)){var r;let t;s[e.name]=(r=e.privileges,t={anon:[],authenticated:[],service_role:[]},r.forEach(e=>{let{grantee:a,privilege_type:s}=e;(0,L.isApiAccessRole)(a)&&(0,L.isApiPrivilegeType)(s)&&t[a].push(s)}),t)}}),s})(m.data,a,o):{};return o.forEach(a=>{if(!u){e[a]={apiAccessType:"none"};return}let s=t[a]??{anon:[],authenticated:[],service_role:[]},r=s.anon.length>0||s.authenticated.length>0||s.service_role.length>0;e[a]=r?{apiAccessType:"access",grantStatus:L.API_ACCESS_ROLES.every(e=>L.API_PRIVILEGE_TYPES.every(t=>s[e].includes(t)))?"granted":"custom",privileges:s}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[n,d,l,c.status,u,m.isPending,m.isError,m.data,a,o])}],954707)},507648,(e,t,a)=>{var s=e.r(203941),r=e.r(297926),n=e.r(615573),i=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),a=arguments[0],o=e;o--;)t[o-1]=arguments[o];return s(i(a)?n(a):[a],r(t,1))}},707409,e=>{"use strict";var t=e.i(507648),a=e.i(827047);let s=["int2","int4","int8","float4","float8","numeric","double precision"],r=["json","jsonb"],n=["text","varchar"],i=["timestamp","timestamptz"],o=["date"],l=["time","timetz"],c=(0,t.default)(i,o,l),u=["uuid","bool","vector","bytea"],d=(0,a.default)((0,t.default)(s,r,n,c,u));e.s(["DATETIME_TYPES",0,c,"DATE_TYPES",0,o,"JSON_TYPES",0,r,"NUMERICAL_TYPES",0,s,"OTHER_DATA_TYPES",0,u,"POSTGRES_DATA_TYPES",0,d,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,n,"TIMESTAMP_TYPES",0,i,"TIME_TYPES",0,l])},647307,e=>{"use strict";var t=e.i(850036),a=e.i(38429),s=e.i(356003),r=e.i(355901),n=e.i(801834),i=e.i(714403);async function o({name:e,projectRef:a,connectionString:s}){let r=t.default.schemas.create({name:e,owner:"postgres"}).sql,{result:n}=await (0,i.executeSql)({projectRef:a,connectionString:s,sql:r,queryKey:["schema","create"]});return n}e.s(["useSchemaCreateMutation",0,({onSuccess:e,onError:t,...i}={})=>{let l=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,s){let{projectRef:r}=a;await (0,n.invalidateSchemasQuery)(l,r),await e?.(t,a,s)},async onError(e,a,s){void 0===t?r.toast.error(`Failed to create schema: ${e.message}`):t(e,a,s)},...i})}])},433857,e=>{"use strict";let t=(0,e.i(388019).default)("ListPlus",[["path",{d:"M11 12H3",key:"51ecnj"}],["path",{d:"M16 6H3",key:"1wxfjs"}],["path",{d:"M16 18H3",key:"12xzn7"}],["path",{d:"M18 9v6",key:"1twb98"}],["path",{d:"M21 12h-6",key:"bt1uis"}]]);e.s(["ListPlus",0,t],433857)},973512,e=>{"use strict";var t=e.i(478902),a=e.i(802715),s=e.i(389959),r=e.i(837710),n=e.i(788070),i=e.i(368136),o=e.i(194125);e.s(["ActionBar",0,({loading:e=!1,disableApply:l=!1,hideApply:c=!1,children:u,applyButtonLabel:d="Apply",backButtonLabel:m="Back",applyFunction:p,closePanel:_=a.default,formId:f,visible:h=!0})=>{let[g,b]=(0,s.useState)(!1),y=(0,s.useCallback)(async()=>{b(!0),await new Promise(e=>p?.(e)),b(!1)},[p]),v=(0,s.useCallback)(()=>{if(!g&&!e&&!l&&!c)if(f){let e=document.getElementById(f);e&&e.requestSubmit()}else p&&y()},[g,e,l,c,f,p,y]);return(0,o.useShortcut)(i.SHORTCUT_IDS.ACTION_BAR_SAVE,v,{enabled:h}),(0,t.jsxs)("div",{className:"flex w-full items-center gap-3 border-t border-default px-3 py-4",children:[u,(0,t.jsxs)("div",{className:"flex items-center gap-3 ml-auto",children:[(0,t.jsx)(r.Button,{type:"default",htmlType:"button",onClick:_,disabled:g||e,children:m}),void 0!==p?(0,t.jsx)(r.Button,{onClick:y,disabled:l||g||e,loading:g||e,iconRight:g||e?void 0:(0,t.jsx)(n.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:d}):c?(0,t.jsx)("div",{}):(0,t.jsx)(r.Button,{disabled:e||l,loading:e,"data-testid":"action-bar-save-row",htmlType:"submit",form:f,iconRight:e?void 0:(0,t.jsx)(n.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:d})]})]})}])},272299,257320,e=>{"use strict";var t=e.i(388019);let a=(0,t.default)("ToggleRight",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"6",ry:"6",key:"f2vt7d"}],["circle",{cx:"16",cy:"12",r:"2",key:"4ma0v8"}]]);e.s(["ToggleRight",0,a],272299);let s=(0,t.default)("Type",[["polyline",{points:"4 7 4 4 20 4 20 7",key:"1nosan"}],["line",{x1:"9",x2:"15",y1:"20",y2:"20",key:"swin9y"}],["line",{x1:"12",x2:"12",y1:"4",y2:"20",key:"1tx1rr"}]]);e.s(["Type",0,s],257320)},1962,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(274664),r=e.i(546595),n="Progress",[i,o]=(0,s.createContextScope)(n),[l,c]=i(n),u=a.forwardRef((e,a)=>{var s,n;let{__scopeProgress:i,value:o=null,max:c,getValueLabel:u=p,...d}=e;(c||0===c)&&!h(c)&&console.error((s=`${c}`,`Invalid prop \`max\` of value \`${s}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let m=h(c)?c:100;null===o||g(o,m)||console.error((n=`${o}`,`Invalid prop \`value\` of value \`${n}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let b=g(o,m)?o:null,y=f(b)?u(b,m):void 0;return(0,t.jsx)(l,{scope:i,value:b,max:m,children:(0,t.jsx)(r.Primitive.div,{"aria-valuemax":m,"aria-valuemin":0,"aria-valuenow":f(b)?b:void 0,"aria-valuetext":y,role:"progressbar","data-state":_(b,m),"data-value":b??void 0,"data-max":m,...d,ref:a})})});u.displayName=n;var d="ProgressIndicator",m=a.forwardRef((e,a)=>{let{__scopeProgress:s,...n}=e,i=c(d,s);return(0,t.jsx)(r.Primitive.div,{"data-state":_(i.value,i.max),"data-value":i.value??void 0,"data-max":i.max,...n,ref:a})});function p(e,t){return`${Math.round(e/t*100)}%`}function _(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function f(e){return"number"==typeof e}function h(e){return f(e)&&!isNaN(e)&&e>0}function g(e,t){return f(e)&&!isNaN(e)&&e<=t&&e>=0}m.displayName=d,e.s(["Indicator",0,m,"Progress",0,u,"ProgressIndicator",0,m,"Root",0,u,"createProgressScope",0,o],386108);var b=e.i(386108),b=b,y=e.i(843778);let v=a.forwardRef(({className:e,value:a,...s},r)=>(0,t.jsx)(b.Root,{ref:r,className:(0,y.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...s,children:(0,t.jsx)(b.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(a||0)}%)`}})}));v.displayName=b.Root.displayName,e.s(["Progress",0,v],1962)},474325,e=>{"use strict";var t=e.i(478902),a=e.i(774803),s=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:r,action:n,message:i,description:o="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(a.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:i}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[r||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(s.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:o}),n]})]})]})])},509847,e=>{"use strict";e.s(["databasePoliciesKeys",0,{list:(e,t)=>["projects",e,"database-policies",t].filter(Boolean)}])},929486,(e,t,a)=>{var s=Object.prototype.hasOwnProperty;t.exports=function(e,t){return null!=e&&s.call(e,t)}},460224,(e,t,a)=>{var s=e.r(929486),r=e.r(129718);t.exports=function(e,t){return null!=e&&r(e,t,s)}},461250,(e,t,a)=>{var s=e.r(291996),r=e.r(949667),n=e.r(684912),i=Math.ceil,o=Math.max;t.exports=function(e,t,a){t=(a?r(e,t,a):void 0===t)?1:o(n(t),0);var l=null==e?0:e.length;if(!l||t<1)return[];for(var c=0,u=0,d=Array(i(l/t));c<l;)d[u++]=s(e,c,c+=t);return d}},321605,25912,e=>{"use strict";var t=e.i(248593),a=e.i(242882);let s={list:e=>["projects",e,"database-publications"]};e.s(["databasePublicationsKeys",0,s],25912);var r=e.i(234745),n=e.i(635494);async function i({projectRef:e,connectionString:a},s){if(!e)throw Error("projectRef is required");let n=new Headers;a&&n.set("x-connection-encrypted",a);let{data:o,error:l}=await (0,r.get)("/platform/pg-meta/{ref}/publications",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:n,signal:s});return l&&(0,r.handleError)(l),o}let o=({projectRef:e,connectionString:t},{enabled:r=!0,...n}={})=>(0,a.useQuery)({queryKey:s.list(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...n});e.s(["useDatabasePublicationsQuery",0,o,"useIsTableRealtimeEnabled",0,({id:e})=>{let{data:t}=(0,n.useSelectedProjectQuery)(),{data:a}=o({projectRef:t?.ref,connectionString:t?.connectionString}),s=(a??[]).find(e=>"supabase_realtime"===e.name);return(s?.tables??[]).some(t=>t.id===e)}],321605)},587768,e=>{"use strict";var t=e.i(850036),a=e.i(38429),s=e.i(356003),r=e.i(355901),n=e.i(25912),i=e.i(714403);async function o({projectRef:e,connectionString:a,id:s,tables:r,publish_insert:n,publish_update:l,publish_delete:c,publish_truncate:u}){let{sql:d}=t.default.publications.update(s,{tables:r,publish_insert:n,publish_update:l,publish_delete:c,publish_truncate:u}),{result:m}=await (0,i.executeSql)({projectRef:e,connectionString:a,sql:d,queryKey:["publication","update",s]});return m}e.s(["useDatabasePublicationUpdateMutation",0,({onSuccess:e,onError:t,...i}={})=>{let l=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,s){let{projectRef:r}=a;await l.invalidateQueries({queryKey:n.databasePublicationsKeys.list(r)}),await e?.(t,a,s)},async onError(e,a,s){void 0===t?r.toast.error(`Failed to update database publication: ${e.message}`):t(e,a,s)},...i})}])},102703,e=>{"use strict";var t=e.i(478902),a=e.i(17203),s=e.i(180148),r=e.i(699879),n=e.i(345594),i=e.i(389959),o=e.i(837710);let l=(0,i.forwardRef)(({icon:e,title:l,description:c,url:u,urlLabel:d="Read more",defaultVisibility:m=!1,hideCollapse:p=!1,button:_,className:f="",block:h=!1},g)=>{let[b,y]=(0,i.useState)(m);return(0,t.jsx)("div",{ref:g,role:"alert",className:`${h?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${f}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:l})})]}),c&&!p?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>y(!b),children:b?(0,t.jsx)(r.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(s.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(c||u||_)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${b?"mt-3":""}`,style:{maxHeight:500*!!b},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c}),u&&(0,t.jsx)("div",{children:(0,t.jsx)(o.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(a.ExternalLink,{}),children:(0,t.jsx)(n.default,{href:u,target:"_blank",rel:"noreferrer",children:d})})}),_&&(0,t.jsx)("div",{children:_})]})]})})});l.displayName="InformationBox",e.s(["default",0,l])},768441,757489,e=>{"use strict";e.i(850036);var t=e.i(479084);function a({search:e,ignoredSchemas:s=[]}={}){let r=(0,t.joinSqlFragments)(s.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
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
  `}function s({search:e,ignoredSchemas:a=[]}={}){let r=(0,t.joinSqlFragments)(a.map(e=>(0,t.literal)(e)),", ");return t.safeSql`
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
  `}e.s(["buildDefaultPrivilegesSql",0,function(e){let a=[];for(let s of["anon","authenticated","service_role"])"grant"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to ${(0,t.ident)(s)}`,t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to ${(0,t.ident)(s)}`,t.safeSql`alter default privileges for role postgres in schema public grant usage, select on sequences to ${(0,t.ident)(s)}`):a.push(t.safeSql`alter default privileges for role postgres in schema public revoke select, insert, update, delete on tables from ${(0,t.ident)(s)}`,t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from ${(0,t.ident)(s)}`,t.safeSql`alter default privileges for role postgres in schema public revoke usage, select on sequences from ${(0,t.ident)(s)}`);return"revoke"===e?a.push(t.safeSql`alter default privileges for role postgres in schema public revoke execute on functions from public`):a.push(t.safeSql`alter default privileges for role postgres in schema public grant execute on functions to public`),t.safeSql`${(0,t.joinSqlFragments)(a,";\n")};`},"buildFunctionPrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let s=(0,t.joinSqlFragments)(e.map(e=>{let a=e.indexOf("."),s=e.slice(0,a),r=e.slice(a+1);return t.safeSql`(${(0,t.literal)(s)},${(0,t.literal)(r)})`}),", "),r="grant"===a?t.safeSql`grant execute on function %I.%I(%s) to anon, authenticated, service_role`:t.safeSql`revoke all on function %I.%I(%s) from anon, authenticated, service_role`;return t.safeSql`
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
        where (n.nspname, p.proname) in (${s})
      loop
        execute format('${r}', nspname, proname, arg_types);
      end loop;
    end $$;
  `},"buildTablePrivilegesSql",0,(e,a)=>{if(0===e.length)return t.safeSql``;let s="grant"===a?t.safeSql`grant select, insert, update, delete on table %I.%I to anon, authenticated, service_role`:t.safeSql`revoke all on table %I.%I from anon, authenticated, service_role`;return t.safeSql`
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
        execute format('${s}', nspname, relname);
      end loop;
    end $$;
  `},"getDefaultPrivilegesStateSql",0,r,"getExposedFunctionCountsSql",0,function({selectedSchemas:e,ignoredSchemas:a=[]}){let r=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${s({ignoredSchemas:a})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from function_grants
  `},"getExposedFunctionsSql",0,function({search:e,offset:a,limit:r,ignoredSchemas:n=[]}){return t.safeSql`
    with ${s({search:e,ignoredSchemas:n})}
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
  `},"getExposedTableCountsSql",0,function({selectedSchemas:e,ignoredSchemas:s=[]}){let r=e.length>0?(0,t.joinSqlFragments)(e.map(e=>(0,t.literal)(e)),", "):t.safeSql`''`;return t.safeSql`
    with ${a({ignoredSchemas:s})}
    select
      count(*)::int as total_count,
      (count(*) filter (where status = 'granted' and schema_name in (${r})))::int as grants_count
    from table_grants
  `},"getExposedTablesSql",0,function({search:e,offset:s,limit:r,ignoredSchemas:n=[]}){return t.safeSql`
    with ${a({search:e,ignoredSchemas:n})}
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
            offset ${(0,t.literal)(s)}
            limit ${(0,t.literal)(r)}
          ) tg
        ),
        '[]'::jsonb
      ) as tables;
  `}],757489);var n=e.i(180141),i=e.i(818135),o=e.i(714403);async function l({projectRef:e,connectionString:t,schema:a},s){if(!e)throw Error("projectRef is required");let n=r({schema:a}),{result:i}=await (0,o.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["default-privileges-state"]},s);return 3===i[0].grant_count}e.s(["defaultPrivilegesQueryOptions",0,({projectRef:e,connectionString:t,schema:a},{enabled:s=!0}={})=>(0,n.queryOptions)({queryKey:i.privilegeKeys.defaultPrivileges(e,a),queryFn:({signal:s})=>l({projectRef:e,connectionString:t,schema:a},s),enabled:s&&void 0!==e})],768441)},93472,165610,e=>{"use strict";var t=e.i(478902);let a=(0,e.i(388019).default)("OctagonAlert",[["path",{d:"M12 16h.01",key:"1drbdi"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",key:"1fd625"}]]);e.s(["AlertOctagon",0,a],165610);var s=e.i(217444),r=e.i(872646),n=e.i(833655),i=e.i(975924),o=e.i(389959),l=e.i(938933);let c={danger:(0,t.jsx)(a,{strokeWidth:1.5,size:18}),success:(0,t.jsx)(r.CheckCircle,{strokeWidth:1.5,size:18}),warning:(0,t.jsx)(s.AlertTriangle,{strokeWidth:1.5,size:18}),info:(0,t.jsx)(n.Info,{strokeWidth:1.5,size:18}),neutral:(0,t.jsx)(t.Fragment,{})};e.s(["Alert",0,function({variant:e="neutral",className:a,title:s,withIcon:r,closable:n,children:u,icon:d,actions:m}){let p=(0,l.default)("alert"),[_,f]=(0,o.useState)(!0),h=[p.base];h.push(p.variant[e].base),a&&h.push(a);let g=[p.description,p.variant[e].description],b=[p.close];return(0,t.jsx)(t.Fragment,{children:_&&(0,t.jsxs)("div",{className:h.join(" "),children:[r?(0,t.jsx)("div",{className:p.variant[e].icon,children:r&&c[e]}):null,d&&d,(0,t.jsxs)("div",{className:"flex flex-1 items-center justify-between",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:[p.variant[e].header,p.header].join(" "),children:s}),(0,t.jsx)("div",{className:g.join(" "),children:u})]}),m]}),n&&(0,t.jsx)("button",{"aria-label":"Close alert",onClick:()=>f(!1),className:b.join(" "),children:(0,t.jsx)(i.X,{strokeWidth:2,size:16})})]})})}],93472)},64102,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(843778);let r=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:a,header:s,disabled:r,className:n})=>{let i=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${r?" opacity-30":" opacity-100"}`,`${n}`];return(0,t.jsxs)("div",{id:a,className:i.join(" "),children:[s,e]})},"FormSectionContent",0,({children:e,loading:s=!0,loaders:n,fullWidth:i,className:o})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${i&&"col-span-12!"}
        ${o}
      `,children:s?n?Array(n).fill(0).map((e,a)=>(0,t.jsx)(r,{},a)):a.Children.map(e,(e,a)=>(0,t.jsx)(r,{},a)):e}),"FormSectionLabel",0,({children:e,className:a="",description:r})=>void 0!==r?(0,t.jsxs)("div",{className:(0,s.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",a),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),r]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${a}`,children:e})])},101369,e=>{"use strict";var t=e.i(478902),a=e.i(843778);let s=({max:e=100,value:s=0,barClass:r="bg-foreground",bgClass:n="",type:i="vertical",borderClass:o="",labelBottom:l="",labelBottomClass:c="tabular-nums",labelTop:u="",labelTopClass:d=""})=>{if("horizontal"===i){let i=Number(s/e*100),m=`${i}%`,p=l||u;return(0,t.jsxs)("div",{className:"flex flex-col w-full",children:[p&&(0,t.jsxs)("div",{className:"flex align-baseline justify-between pb-1 space-x-8",children:[(0,t.jsx)("p",{className:(0,a.cn)("text-foreground text-sm truncate capitalize-sentence",u.length>0&&"max-w-[75%]",c),children:l}),(0,t.jsx)("p",{className:(0,a.cn)("text-foreground-light text-sm",d),children:u})]}),(0,t.jsx)("div",{className:`relative rounded-sm h-1 overflow-hidden w-full border p-0 ${n||"bg-surface-400"} ${o||"border-none"}`,children:(0,t.jsx)("div",{className:`absolute rounded-sm inset-x-0 bottom-0 h-1 ${r} transition-all`,style:{width:m}})})]})}{let a=Number(s/e*35);return a<2&&(a=2),(0,t.jsx)("div",{className:`relative rounded-sm w-5 overflow-hidden border p-1 ${n||"bg-gray-400"} ${o||"border-none"}`,style:{height:35},children:(0,t.jsx)("div",{className:`absolute inset-x-0 bottom-0 w-5 ${r}`,style:{height:a}})})}};e.s(["SparkBar",0,s,"default",0,s])},577846,(e,t,a)=>{var s=e.r(714530);t.exports=function(e,t){return s(t,function(t){return e[t]})}},943262,(e,t,a)=>{var s=e.r(577846),r=e.r(375493);t.exports=function(e){return null==e?[]:s(e,r(e))}},333990,(e,t,a)=>{var s=e.r(491761),r=e.r(775484),n=e.r(141892),i=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,a,c){e=r(e)?e:o(e),a=a&&!c?i(a):0;var u=e.length;return a<0&&(a=l(u+a,0)),n(e)?a<=u&&e.indexOf(t,a)>-1:!!u&&s(e,t,a)>-1}},291969,e=>{"use strict";let t=(0,e.i(388019).default)("FileText",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]]);e.s(["FileText",0,t],291969)},152285,e=>{"use strict";var t=e.i(478902),a=e.i(974331),s=e.i(389959),r=e.i(938933);let n=({defaultActiveId:e,activeId:n,type:i="pills",size:o="tiny",block:l,onChange:c,onClick:u,scrollable:d,wrappable:m,addOnBefore:p,addOnAfter:_,listClassNames:f,baseClassNames:h,refs:g,children:b})=>{let y=[];s.Children.forEach(b,e=>{(0,s.isValidElement)(e)&&y.push(e)});let[v,x]=(0,s.useState)(n??e??y?.[0]?.props?.id);(0,s.useMemo)(()=>{n&&n!==v&&x(n)},[n]);let S=(0,r.default)("tabs");function E(e){u?.(e),e!==v&&(c?.(e),x(e))}let j=[S[i].list];return d&&j.push(S.scrollable),m&&j.push(S.wrappable),f&&j.push(f),(0,t.jsxs)(a.Tabs.Root,{value:v,className:[S.base,h].join(" "),ref:g?.base,children:[(0,t.jsxs)(a.Tabs.List,{className:j.join(" "),ref:g?.list,children:[p,y.map(e=>{let s=v===e.props.id,r=[S[i].base,S.size[o]];return s?r.push(S[i].active):r.push(S[i].inactive),l&&r.push(S.block),(0,t.jsxs)(a.Tabs.Trigger,{onKeyDown:t=>{"Enter"===t.key&&(t.preventDefault(),E(e.props.id))},onClick:()=>E(e.props.id),value:e.props.id,className:r.join(" "),children:[e.props.icon,(0,t.jsx)("span",{children:e.props.label}),e.props.iconRight]},`${e.props.id}-tab-button`)}),_]}),y]})};n.Panel=({children:e,id:s,className:n})=>{let i=(0,r.default)("tabs");return(0,t.jsx)(a.Tabs.Content,{value:s,className:[i.content,n].join(" "),children:e})},e.s(["default",0,n])},200409,e=>{"use strict";var t=e.i(152285);e.s(["Tabs",()=>t.default])},238944,e=>{"use strict";var t=e.i(989567),a=e.i(389959),s=e.i(323796);e.s(["useUrlState",0,function({replace:e=!0,arrayKeys:r=[]}={}){let n=JSON.stringify(r),i=(0,a.useMemo)(()=>new Set(r),[n]),o=(0,t.useRouter)(),l=(0,a.useMemo)(()=>Object.fromEntries(Object.entries(o.query).map(([e,t])=>i.has(e)?Array.isArray(t)?[e,t]:[e,[t]]:[e,t])),[i,o.query]),c=(0,s.default)(l);return[l,(0,a.useCallback)(t=>{let a=c.current,s="function"==typeof t?t(a):t,r=Object.fromEntries(Object.entries({...a,...s}).filter(([,e])=>!!e));(e?o.replace:o.push)({pathname:o.pathname,query:r},void 0,{shallow:!0,scroll:!1})},[o,e])]}])},419524,e=>{"use strict";let t=(0,e.i(388019).default)("AlignLeft",[["line",{x1:"21",x2:"3",y1:"6",y2:"6",key:"1fp77t"}],["line",{x1:"15",x2:"3",y1:"12",y2:"12",key:"v6grx8"}],["line",{x1:"17",x2:"3",y1:"18",y2:"18",key:"1awlsn"}]]);e.s(["AlignLeft",0,t],419524)},554222,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(355901),r=e.i(171997),n=e.i(539013),i=e.i(647307),o=e.i(635494);e.s(["SchemaEditor",0,({visible:e,onSuccess:l,closePanel:c})=>{let{data:u}=(0,o.useSelectedProjectQuery)(),[d,m]=(0,a.useState)({name:void 0}),[p,_]=(0,a.useState)(""),{mutateAsync:f,isPending:h}=(0,i.useSchemaCreateMutation)();(0,a.useEffect)(()=>{e&&(_(""),m({name:void 0}))},[e]);let g=async()=>{let e={};if(0===p.length&&(e.name="Please provide a name for your schema"),Object.keys(e).length>0)return m(e);if(void 0===u)return console.error("Project is required");try{await f({projectRef:u.ref,connectionString:u.connectionString,name:p}),l(p),s.toast.success(`Successfully created schema "${p}"`)}catch(e){s.toast.error(`Failed to create schema: ${e}`)}};return(0,t.jsx)(n.SidePanel,{size:"medium",visible:e,header:"Create a new schema",className:"transition-all duration-100 ease-in",onCancel:c,onConfirm:g,loading:h,cancelText:"Cancel",confirmText:"Save",children:(0,t.jsx)(t.Fragment,{children:(0,t.jsx)(n.SidePanel.Content,{children:(0,t.jsx)("div",{className:"space-y-10 py-6",children:(0,t.jsx)(r.Input,{label:"Schema name",layout:"vertical",type:"text",error:d?.name,value:p,onChange:e=>_(e.target.value)})})})})},"SchemaEditor")}])},569033,e=>{"use strict";e.i(128328);var t=e.i(947748),a=e.i(124416);let s=()=>{let[e,s]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_INLINE_EDITOR,!1);return{inlineEditorEnabled:e??!1,setInlineEditorEnabled:s}},r=()=>{let[e,s]=(0,a.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_QUEUE_OPERATIONS,!1);return{isQueueOperationsEnabled:e??!1,setIsQueueOperationsEnabled:s}};e.s(["useIsInlineEditorEnabled",0,()=>{let{inlineEditorEnabled:e}=s();return e??!1},"useIsInlineEditorSetting",0,s,"useIsQueueOperationsEnabled",0,()=>{let{isQueueOperationsEnabled:e}=r();return e??!1},"useIsQueueOperationsSetting",0,r])},438756,(e,t,a)=>{t.exports=function(e){return null===e}},199327,e=>{"use strict";let t=(0,e.i(388019).default)("House",[["path",{d:"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",key:"5wwlr5"}],["path",{d:"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",key:"1d0kgt"}]]);e.s(["Home",0,t],199327)},686255,e=>{"use strict";e.s(["enumeratedTypesKeys",0,{list:e=>["projects",e,"enumerated-types"]}])},155482,e=>{"use strict";var t=e.i(248593),a=e.i(242882),s=e.i(686255),r=e.i(234745);async function n({projectRef:e,connectionString:a},s){if(!e)throw Error("projectRef is required");let i=new Headers;a&&i.set("x-connection-encrypted",a);let{data:o,error:l}=await (0,r.get)("/platform/pg-meta/{ref}/types",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e}},headers:Object.fromEntries(i),signal:s});return l&&(0,r.handleError)(l),o}e.s(["useEnumeratedTypesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...i}={})=>(0,a.useQuery)({queryKey:s.enumeratedTypesKeys.list(e),queryFn:({signal:a})=>n({projectRef:e,connectionString:t},a),enabled:r&&void 0!==e,...i})])},691337,e=>{"use strict";var t=e.i(850036),a=e.i(38429),s=e.i(356003),r=e.i(355901),n=e.i(509847),i=e.i(714403);async function o({projectRef:e,connectionString:a,payload:s}){let r=new Headers;a&&r.set("x-connection-encrypted",a);let{sql:n}=t.default.policies.create(s),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:a,sql:n,queryKey:["policy","create"]});return l}e.s(["createDatabasePolicy",0,o,"useDatabasePolicyCreateMutation",0,({onSuccess:e,onError:t,...i}={})=>{let l=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,s){let{projectRef:r}=a;await l.invalidateQueries({queryKey:n.databasePoliciesKeys.list(r)}),await e?.(t,a,s)},async onError(e,a,s){void 0===t?r.toast.error(`Failed to create database policy: ${e.message}`):t(e,a,s)},...i})}])}]);