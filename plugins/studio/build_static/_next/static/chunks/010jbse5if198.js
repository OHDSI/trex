(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(38429),a=e.i(356003),r=e.i(355901),n=e.i(667286),o=e.i(78162),i=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:o=!1,createSchema:c=!1}){let u=new Headers;s&&u.set("x-connection-encrypted",s);let m=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:o,createSchema:c}),{result:d}=await (0,i.executeSql)({projectRef:e,connectionString:s,sql:m,queryKey:["extension","create"]});return d}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...i}={})=>{let c=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([c.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:o.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...i})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),s=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:a,indexStatements:r,onSuccess:o,onError:i}){if(!e){let e=Error("Project ref is required");return i&&i(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return i&&i(e),Promise.reject(e)}try{return await (0,s.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),o&&o(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),i&&i(e),Promise.reject(e)}}function o(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!a.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=o(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,o,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var i=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,i.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=r(t??[]),n=!!s&&!!a,o=n&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:o}}],888525);var c=e.i(478902),u=e.i(389959),m=e.i(232520),d=e.i(837710),_=e.i(610144),p=e.i(967052);let h=({open:e,setOpen:s})=>{let a=(0,p.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:o}=(0,i.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:u,indexAdvisor:d}=r(o),{mutateAsync:h,isPending:y}=(0,_.useDatabaseExtensionEnableMutation)(),g=async()=>{if(void 0===n)return t.toast.error("Project is required");try{u?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:u.name,schema:u?.schema??"extensions",version:u.default_version}),d?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),t.toast.success("Successfully enabled Index Advisor!"),s(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(m.AlertDialog,{open:e,onOpenChange:()=>s(!e),children:(0,c.jsxs)(m.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(m.AlertDialogHeader,{children:[(0,c.jsx)(m.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(m.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(m.AlertDialogFooter,{children:[(0,c.jsx)(m.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(m.AlertDialogAction,{onClick:e=>{e.preventDefault(),g(),a("index_advisor_dialog_enable_button_clicked")},disabled:y,children:y?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,p.useTrack)(),[t,s]=(0,u.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(d.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(h,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,h],284399)},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],i={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),o=!n&&r?e.value:`'${e.value}'`,i=!n&&String(o).toLowerCase(),l=n?e.value:i;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},c={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
  from pg_statio_user_tables;`},unified:{queryType:"db",sql:(e,t,s,a=!1,r=!1,n=1,o=20)=>{let i=(n-1)*o,l=r&&a?i+10*o:i+o,c=a?Math.min(l,500):l;return`
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
          ${null!==c?`limit ${c}`:""}
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,i,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,c,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),o=e.i(189329);e.s(["default",0,({sql:e,params:i=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:c})=>{let{data:u}=(0,n.useSelectedProjectQuery)(),m=(0,o.useDatabaseSelectorStateSnapshot)(),{data:d}=(0,a.useReadReplicasQuery)({projectRef:u?.ref}),_=(d||[]).find(e=>e.identifier===m.selectedDatabaseId)?.connectionString,p=m.selectedDatabaseId,h="function"==typeof e?e([]):e,{data:y,error:g,isPending:x,isRefetching:f,refetch:b}=(0,t.useQuery)({queryKey:["projects",u?.ref,"db",{...i,sql:h,identifier:p},l,c],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:u?.ref,connectionString:_||u?.connectionString,sql:h},e).then(e=>e.result),enabled:!!h,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:g||("object"==typeof y?y?.error:""),data:y,isLoading:x,isRefetching:f,params:i,runQuery:b,resolvedSql:h}}])},582391,e=>{"use strict";let t=(0,e.i(388019).default)("Pen",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]]);e.s(["Edit2",0,t],582391)},300679,258373,490058,e=>{"use strict";var t=e.i(10429);e.s(["generateObservabilityMenuItems",0,function(e){let{ref:s,preservedQueryParams:a,showOverview:r,isSupamonitorEnabled:n,storageSupported:o,isPlatform:i=t.IS_PLATFORM}=e,l=[...r?[{name:"Overview",key:"observability",url:`/project/${s}/observability${a}`}]:[],...n?[{name:"Query Insights",key:"query-insights",url:`/project/${s}/observability/query-insights${a}`}]:[{name:"Query Performance",key:"query-performance",url:`/project/${s}/observability/query-performance${a}`}],...i?[{name:"API Gateway",key:"api-overview",url:`/project/${s}/observability/api-overview${a}`}]:[]],c=[{name:"Database",key:"database",url:`/project/${s}/observability/database${a}`},{name:"Data API",key:"postgrest",url:`/project/${s}/observability/postgrest${a}`},{name:"Auth",key:"auth",url:`/project/${s}/observability/auth${a}`},{name:"Edge Functions",key:"edge-functions",url:`/project/${s}/observability/edge-functions${a}`},...o?[{name:"Storage",key:"storage",url:`/project/${s}/observability/storage${a}`}]:[],{name:"Realtime",key:"realtime",url:`/project/${s}/observability/realtime${a}`}],u=[{title:"GENERAL",key:"general-section",items:l}];return i&&u.push({title:"PRODUCT",key:"product-section",items:c}),u}],300679);var s=e.i(478902),a=e.i(26898),r=e.i(582391),n=e.i(471998),o=e.i(211570),i=e.i(345594),l=e.i(837710),c=e.i(874311),u=e.i(862326),m=e.i(2579),d=e.i(432478);e.s(["ObservabilityMenuItem",0,({item:e,pageKey:t,onSelectEdit:_,onSelectDelete:p})=>{let{profile:h}=(0,d.useProfile)(),{can:y}=(0,m.useAsyncCheckPermissions)(a.PermissionAction.UPDATE,"user_content",{resource:{type:"report",visibility:e.report.visibility,owner_id:e.report.owner_id},subject:{id:h?.id}}),g=(0,s.jsx)(u.Menu.Item,{active:e.key===t,children:(0,s.jsxs)("div",{className:"flex w-full items-center justify-between gap-1",children:[(0,s.jsx)("span",{className:"truncate",children:e.name}),y&&(0,s.jsxs)(c.DropdownMenu,{children:[(0,s.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,s.jsx)(l.Button,{type:"text",className:"px-1 opacity-50 hover:opacity-100",icon:(0,s.jsx)(n.MoreVertical,{size:12,strokeWidth:2}),onClick:e=>{e.preventDefault(),e.stopPropagation()}})}),(0,s.jsxs)(c.DropdownMenuContent,{align:"start",className:"w-32 *:gap-x-2",children:[(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&_()},children:[(0,s.jsx)(r.Edit2,{size:12}),(0,s.jsx)("div",{children:"Rename report"})]}),(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&p()},children:[(0,s.jsx)(o.Trash,{size:12}),(0,s.jsx)("div",{children:"Delete report"})]})]})]})]})});return(0,s.jsx)(i.default,{href:e.url,className:"block",children:g},e.key+"-menukey")}],258373);var _=e.i(479084),p=e.i(242882),h=e.i(246230),y=e.i(714403),g=e.i(635494),x=e.i(837508);async function f({projectRef:e,connectionString:t}){let{result:s}=await (0,y.executeSql)({projectRef:e,connectionString:t,sql:_.safeSql`SELECT current_setting('shared_preload_libraries', true) AS libraries`});return(s[0]?.libraries??"").split(",").some(e=>"supamonitor"===e.trim())}e.s(["useSupamonitorStatus",0,function(){let{data:e}=(0,g.useSelectedProjectQuery)(),{data:t,isLoading:s}=(({projectRef:e,connectionString:t},{enabled:s=!0,...a}={})=>{let{data:r}=(0,g.useSelectedProjectQuery)(),n=r?.status===x.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,p.useQuery)({queryKey:h.databaseKeys.supamonitorEnabled(e),queryFn:()=>f({projectRef:e,connectionString:t}),enabled:s&&void 0!==e&&n,...a})})({projectRef:e?.ref,connectionString:e?.connectionString});return{isSupamonitorEnabled:t??!1,isLoading:s}}],490058)},303213,e=>{"use strict";var t=e.i(478902),s=e.i(283607),a=e.i(989567),r=e.i(389959),n=e.i(655744),o=e.i(355901),i=e.i(837710),l=e.i(20482),c=e.i(378277),u=e.i(40892),m=e.i(660908),d=e.i(538482),_=e.i(531837),p=e.i(420985),h=e.i(635494),y=e.i(48189),g=e.i(432478);let x=_.object({name:_.string().min(1,"Required"),description:_.string().optional()});e.s(["CreateReportModal",0,({visible:e,onCancel:_,afterSubmit:f})=>{let b=(0,a.useRouter)(),{profile:j}=(0,g.useProfile)(),{data:S}=(0,h.useSelectedProjectQuery)(),v=S?.ref??"default",E=(0,r.useMemo)(()=>{let{its:e,ite:t,isHelper:s,helperText:a}=b.query,r=new URLSearchParams;e&&"string"==typeof e&&r.set("its",e),t&&"string"==typeof t&&r.set("ite",t),s&&"string"==typeof s&&r.set("isHelper",s),a&&"string"==typeof a&&r.set("helperText",a);let n=r.toString();return n?`?${n}`:""},[b.query]),{mutate:q,isPending:A}=(0,p.useContentUpsertMutation)({onSuccess:(e,t)=>{o.toast.success("Successfully created new report");let s=t.payload.id;b.push(`/project/${v}/observability/${s}${E}`),f()},onError:e=>{o.toast.error(`Failed to create report: ${e.message}`)}}),R=async({name:e,description:t})=>v?j?void q({projectRef:v,payload:{id:(0,y.uuidv4)(),type:"report",name:e,description:t||"",visibility:"project",owner_id:j?.id,content:{schema_version:1,period_start:{time_period:"7d",date:""},period_end:{time_period:"today",date:""},interval:"1d",layout:[]}}}):console.error("Profile is required"):console.error("Project ref is required"),w=()=>{_(),T.reset()},T=(0,n.useForm)({resolver:(0,s.zodResolver)(x),defaultValues:{name:"",description:""}}),{isDirty:I}=T.formState;return(0,t.jsx)(u.Modal,{visible:e,onCancel:w,hideFooter:!0,header:"Create a custom report",size:"small",children:(0,t.jsx)(l.Form,{...T,children:(0,t.jsxs)("form",{onSubmit:T.handleSubmit(R),noValidate:!0,children:[(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:T.control,name:"name",render:({field:e})=>(0,t.jsx)(d.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(c.Input_Shadcn_,{...e,id:"name"})})})})}),(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:T.control,name:"description",render:({field:e})=>(0,t.jsx)(d.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(m.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(u.Modal.Separator,{}),(0,t.jsxs)(u.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(i.Button,{htmlType:"reset",type:"default",onClick:w,disabled:A,children:"Cancel"}),(0,t.jsx)(i.Button,{htmlType:"submit",loading:A,disabled:A||!I,children:"Create report"})]})]})})})}])},256337,e=>{"use strict";var t=e.i(478902),s=e.i(26898);e.i(128328);var a=e.i(657588),r=e.i(158639),n=e.i(544197),o=e.i(989567),i=e.i(17313),l=e.i(389959),c=e.i(355901),u=e.i(862326),m=e.i(498377),d=e.i(466472),_=e.i(108151),p=e.i(300679),h=e.i(258373),y=e.i(490058),g=e.i(303213),x=e.i(283607),f=e.i(655744),b=e.i(837710),j=e.i(20482),S=e.i(378277),v=e.i(40892),E=e.i(660908),q=e.i(538482),A=e.i(531837),R=e.i(420985);let w=A.object({name:A.string().min(1,"Required"),description:A.string().optional()}),T=({selectedReport:e,initialValues:s,onCancel:a})=>{let{ref:n}=(0,r.useParams)(),{mutate:o,isPending:i}=(0,R.useContentUpsertMutation)({onSuccess:()=>{c.toast.success("Successfully updated report"),a()},onError:e=>{c.toast.error(`Failed to update report: ${e.message}`)}}),u=()=>{a(),m.reset()},m=(0,f.useForm)({resolver:(0,x.zodResolver)(w),defaultValues:s}),{formState:d,reset:_}=m,{isDirty:p}=d;return(0,l.useEffect)(()=>{p||_(s)},[s,p,_]),(0,t.jsx)(v.Modal,{visible:void 0!==e,onCancel:u,hideFooter:!0,header:"Update custom report",size:"small",children:(0,t.jsx)(j.Form,{...m,children:(0,t.jsxs)("form",{onSubmit:m.handleSubmit(t=>n?e&&e.id?void(e.project_id&&o({projectRef:n,payload:{...e,owner_id:e.owner_id,project_id:e.project_id,id:e.id,name:t.name,description:t.description||""}})):void 0:console.error("Project ref is required")),noValidate:!0,children:[(0,t.jsx)(v.Modal.Content,{children:(0,t.jsx)(j.FormField,{control:m.control,name:"name",render:({field:e})=>(0,t.jsx)(q.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(j.FormControl,{children:(0,t.jsx)(S.Input_Shadcn_,{...e,id:"name"})})})})}),(0,t.jsx)(v.Modal.Content,{children:(0,t.jsx)(j.FormField,{control:m.control,name:"description",render:({field:e})=>(0,t.jsx)(q.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(j.FormControl,{children:(0,t.jsx)(E.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(v.Modal.Separator,{}),(0,t.jsxs)(v.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(b.Button,{htmlType:"reset",type:"default",onClick:u,disabled:i,children:"Cancel"}),(0,t.jsx)(b.Button,{htmlType:"submit",loading:i,disabled:i||!p,children:"Save custom report"})]})]})})})};var I=e.i(215312),N=e.i(388147),k=e.i(586011),C=e.i(738927),O=e.i(2579),D=e.i(912793),P=e.i(10429),L=e.i(432478);e.s(["default",0,()=>{let e=(0,o.useRouter)(),{profile:x}=(0,L.useProfile)(),{ref:f,id:b}=(0,r.useParams)(),j=b||e.pathname.split("/")[4]||"observability",S=(0,a.useFlag)("observabilityOverview"),{isSupamonitorEnabled:v}=(0,y.useSupamonitorStatus)(),E=(0,D.useIsFeatureEnabled)("project_storage:all"),{can:q}=(0,O.useAsyncCheckPermissions)(s.PermissionAction.CREATE,"user_content",{resource:{type:"report",owner_id:x?.id},subject:{id:x?.id}}),A=(0,l.useMemo)(()=>{let{its:t,ite:s,isHelper:a,helperText:r}=e.query,n=new URLSearchParams;t&&"string"==typeof t&&n.set("its",t),s&&"string"==typeof s&&n.set("ite",s),a&&"string"==typeof a&&n.set("isHelper",a),r&&"string"==typeof r&&n.set("helperText",r);let o=n.toString();return o?`?${o}`:""},[e.query]),{data:R,isPending:w}=(0,C.useContentQuery)({projectRef:f,type:"report"}),{mutate:$,isPending:M}=(0,k.useContentDeleteMutation)({onSuccess:()=>{B(!1),c.toast.success("Successfully deleted report"),e.push(`/project/${f}/observability`)},onError:e=>{c.toast.error(`Failed to delete report: ${e.message}`)}}),[F,B]=(0,l.useState)(!1),[U,H]=(0,i.useQueryState)("newReport",i.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),[Y,Q]=(0,l.useState)(),[G,W]=(0,l.useState)();function z(e){return"report"===e.type}let K=function(){if(!R)return[];let e=R?.content.filter(z);return(e?.sort((e,t)=>e.name<t.name?-1:+(e.name>t.name))).map((e,t)=>({id:e.id,name:e.name,description:e.description||"",key:e.id||t+"-report",url:`/project/${f}/observability/${e.id}${A}`,hasDropdownActions:!0,report:e}))}(),V=(0,p.generateObservabilityMenuItems)({ref:f,preservedQueryParams:A,showOverview:S,isSupamonitorEnabled:v,storageSupported:E,isPlatform:P.IS_PLATFORM});return(0,t.jsx)("div",{children:w?(0,t.jsxs)("div",{className:"px-5 my-4 space-y-2",children:[(0,t.jsx)(_.ShimmeringLoader,{}),(0,t.jsx)(_.ShimmeringLoader,{className:"w-3/4"}),(0,t.jsx)(_.ShimmeringLoader,{className:"w-1/2"})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-6",children:[(0,t.jsx)(N.ProductMenu,{page:j,menu:V.map(e=>({...e,items:e.items.map(e=>({...e,items:[]}))}))}),P.IS_PLATFORM&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-px w-full bg-border-overlay"}),(0,t.jsxs)("div",{className:"mx-2",children:[(0,t.jsxs)(u.Menu,{type:"pills",children:[(0,t.jsx)(u.Menu.Group,{title:(0,t.jsxs)("span",{className:"flex w-full items-center justify-between relative h-6",children:[(0,t.jsx)("span",{className:"uppercase font-mono",children:"Custom Reports"}),K.length>0&&(0,t.jsx)(I.ButtonTooltip,{type:"default",size:"tiny",icon:(0,t.jsx)(n.Plus,{}),disabled:!q,className:"flex items-center justify-center h-6 w-6 absolute top-0 -right-1",onClick:()=>{H(!0)},tooltip:{content:{side:"bottom",text:q?void 0:"You need additional permissions to create custom reports"}}})]})}),K.length>0&&K.map(e=>(0,t.jsx)(h.ObservabilityMenuItem,{item:e,pageKey:j,onSelectEdit:()=>{W(e.report)},onSelectDelete:()=>{Q(e.report),B(!0)}},e.id))]}),0===K.length?(0,t.jsx)("div",{className:"px-2",children:(0,t.jsx)(m.InnerSideBarEmptyPanel,{title:"No custom reports yet",description:"Create and save custom reports to track your project metrics",actions:(0,t.jsx)(I.ButtonTooltip,{type:"default",icon:(0,t.jsx)(n.Plus,{}),disabled:!q,onClick:()=>{H(!0)},tooltip:{content:{side:"bottom",text:q?void 0:"You need additional permissions to create custom reports"}},children:"New custom report"})})}):null]})]}),(0,t.jsx)(T,{onCancel:()=>W(void 0),selectedReport:G,initialValues:{name:G?.name||"",description:G?.description||""}}),(0,t.jsx)(d.default,{title:"Delete custom report",confirmLabel:"Delete report",confirmLabelLoading:"Deleting report",size:"medium",loading:M,visible:F,onCancel:()=>B(!1),onConfirm:()=>void 0===f?console.error("Project ref is required"):Y?.id===void 0?console.error("Report ID is required"):void $({projectRef:f,ids:[Y.id]}),children:(0,t.jsx)("div",{className:"text-sm text-foreground-light grid gap-4",children:(0,t.jsx)("div",{className:"grid gap-1",children:(0,t.jsxs)("p",{children:["Are you sure you want to delete '",Y?.name,"'?"]})})})}),(0,t.jsx)(g.CreateReportModal,{visible:U,onCancel:()=>H(!1),afterSubmit:()=>H(!1)})]})})}],256337)},212846,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(86086),a=e.i(947748),r=e.i(158639),n=e.i(695047),o=e.i(389959),i=e.i(825713),l=e.i(256337),c=e.i(888525);e.i(69870);var u=e.i(924115),m=e.i(670447),d=e.i(470754),_=e.i(284399),p=e.i(124416),h=e.i(967052);let y=()=>{let e=(0,h.useTrack)(),{ref:s}=(0,r.useParams)(),{dismissBanner:n}=(0,d.useBannerStack)(),[,o]=(0,p.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(s??""),!1);return(0,t.jsx)(m.BannerCard,{onDismiss:()=>{o(!0),n("index-advisor-banner"),e("index_advisor_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("div",{className:"flex flex-col gap-y-2 items-start",children:(0,t.jsx)("div",{className:"p-2 rounded-lg bg-warning-300 text-warning",children:(0,t.jsx)(u.Lightbulb,{size:16})})}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Enable Index Advisor"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Recommends indexes to improve query performance."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(_.EnableIndexAdvisorButton,{})})]})})};var g=e.i(345594),x=e.i(587433),f=e.i(837710),b=e.i(223173),j=e.i(10429);let S=()=>{let{ref:e}=(0,r.useParams)(),s=(0,h.useTrack)(),{dismissBanner:n}=(0,d.useBannerStack)(),[,i]=(0,p.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(e??""),!1);return(0,t.jsx)(m.BannerCard,{onDismiss:()=>{i(!0),n("metrics-api-banner"),s("metrics_api_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-2 items-start",children:[(0,t.jsx)(x.Badge,{variant:"success",className:"-ml-0.5 uppercase inline-flex items-center mb-2",children:"Beta"}),(0,t.jsx)("div",{className:"flex items-center gap-4",children:b.LOG_DRAIN_TYPES.filter(e=>"sentry"!==e.value).map(e=>(0,t.jsx)(o.default.Fragment,{children:o.default.cloneElement(e.icon,{height:20,width:20})},e.value))})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Export Metrics to your dashboards"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Visualize over 200 database performance and health metrics with our Metrics API."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(f.Button,{type:"default",size:"tiny",asChild:!0,children:(0,t.jsx)(g.default,{href:`${j.DOCS_URL}/guides/telemetry/metrics`,target:"_blank",onClick:()=>s("metrics_api_banner_cta_button_clicked"),children:"Get started for free"})})})]})})};var v=e.i(902780),E=e.i(912793),q=e.i(951138);let A=({title:e,children:u})=>{let{ref:m}=(0,r.useParams)(),_=(0,n.usePathname)(),{addBanner:h,dismissBanner:g}=(0,d.useBannerStack)(),{isIndexAdvisorAvailable:x,isIndexAdvisorEnabled:f}=(0,c.useIndexAdvisorStatus)(),[b]=(0,p.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(m??""),!1),[j]=(0,p.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(m??""),!1);(0,o.useEffect)(()=>{!b&&s.IS_PLATFORM?h({id:"metrics-api-banner",isDismissed:!1,content:(0,t.jsx)(S,{}),priority:1}):g("metrics-api-banner")},[b,h,g]);let q=(0,o.useRef)(_);(0,o.useEffect)(()=>{let e=_?.includes("/query-performance");e&&x&&!f&&!j?h({id:"index-advisor-banner",isDismissed:!1,content:(0,t.jsx)(y,{}),priority:3}):(j||!e||f)&&g("index-advisor-banner"),q.current=_},[_,x,f,j,h,g]);let{reportsAll:A}=(0,E.useIsFeatureEnabled)(["reports:all"]);return A?(0,t.jsx)(i.ProjectLayout,{product:"Observability",browserTitle:{section:e},productMenu:(0,t.jsx)(l.default,{}),isBlocking:!1,children:u}):(0,t.jsx)(v.UnknownInterface,{urlBack:`/project/${m}`})},R=(0,q.withAuth)(e=>{let{ref:s}=(0,r.useParams)(),{reportsAll:a}=(0,E.useIsFeatureEnabled)(["reports:all"]);return a?(0,t.jsx)(A,{...e}):(0,t.jsx)(v.UnknownInterface,{urlBack:`/project/${s}`})});e.s(["default",0,R],212846)}]);