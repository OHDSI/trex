(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,610144,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(38429),s=e.i(356003),n=e.i(355901),r=e.i(667286),o=e.i(78162),l=e.i(714403);async function i({projectRef:e,connectionString:a,schema:s,name:n,version:r,cascade:o=!1,createSchema:c=!1}){let d=new Headers;a&&d.set("x-connection-encrypted",a);let m=(0,t.getEnableDatabaseExtensionSQL)({schema:s,name:n,version:r,cascade:o,createSchema:c}),{result:u}=await (0,l.executeSql)({projectRef:e,connectionString:a,sql:m,queryKey:["extension","create"]});return u}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...l}={})=>{let c=(0,s.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>i(e),async onSuccess(t,a,s){let{projectRef:n}=a;await Promise.all([c.invalidateQueries({queryKey:r.databaseExtensionsKeys.list(n)}),c.invalidateQueries({queryKey:o.configKeys.upgradeEligibility(n)})]),await e?.(t,a,s)},async onError(e,a,s){void 0===t?n.toast.error(`Failed to enable database extension: ${e.message}`):t(e,a,s)},...l})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),a=e.i(714403),s=e.i(392491);function n(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function r({projectRef:e,connectionString:s,indexStatements:n,onSuccess:o,onError:l}){if(!e){let e=Error("Project ref is required");return l&&l(e),Promise.reject(e)}if(0===n.length){let e=Error("No index statements provided");return l&&l(e),Promise.reject(e)}try{return await (0,a.executeSql)({projectRef:e,connectionString:s,sql:n.join(";\n")+";"}),t.toast.success("Successfully created index"),o&&o(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),l&&l(e),Promise.reject(e)}}function o(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let a=t[1]||t[2];return!a||!s.INTERNAL_SCHEMAS.includes(a.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let a=Number(e),s=Number(t);return a<=0||a<=s?0:(a-s)/a*100},"createIndexes",0,r,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=o(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,o,"getIndexAdvisorExtensions",0,n,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return s.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var l=e.i(450972),i=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,i.useSelectedProjectQuery)(),{data:t}=(0,l.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:a,indexAdvisor:s}=n(t??[]),r=!!a&&!!s,o=r&&null!==a.installed_version&&null!==s.installed_version;return{isIndexAdvisorAvailable:r,isIndexAdvisorEnabled:o}}],888525);var c=e.i(478902),d=e.i(389959),m=e.i(232520),u=e.i(837710),p=e.i(610144),h=e.i(967052);let _=({open:e,setOpen:a})=>{let s=(0,h.useTrack)(),{data:r}=(0,i.useSelectedProjectQuery)(),{data:o}=(0,l.useDatabaseExtensionsQuery)({projectRef:r?.ref,connectionString:r?.connectionString}),{hypopg:d,indexAdvisor:u}=n(o),{mutateAsync:_,isPending:g}=(0,p.useDatabaseExtensionEnableMutation)(),x=async()=>{if(void 0===r)return t.toast.error("Project is required");try{d?.installed_version===null&&await _({projectRef:r?.ref,connectionString:r?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),u?.installed_version===null&&await _({projectRef:r?.ref,connectionString:r?.connectionString,name:u.name,schema:u?.schema??"extensions",version:u.default_version}),t.toast.success("Successfully enabled Index Advisor!"),a(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(m.AlertDialog,{open:e,onOpenChange:()=>a(!e),children:(0,c.jsxs)(m.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(m.AlertDialogHeader,{children:[(0,c.jsx)(m.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(m.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(m.AlertDialogFooter,{children:[(0,c.jsx)(m.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(m.AlertDialogAction,{onClick:e=>{e.preventDefault(),x(),s("index_advisor_dialog_enable_button_clicked")},disabled:g,children:g?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,h.useTrack)(),[t,a]=(0,d.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(u.Button,{type:"primary",onClick:()=>{a(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(_,{open:t,setOpen:a})]})},"EnableIndexAdvisorDialog",0,_],284399)},820308,775159,e=>{"use strict";var t,a,s=e.i(55956),n=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>n],775159);var r=((a={}).LAST_10_MINUTES="Last 10 minutes",a.LAST_30_MINUTES="Last 30 minutes",a.LAST_60_MINUTES="Last 60 minutes",a.LAST_3_HOURS="Last 3 hours",a.LAST_24_HOURS="Last 24 hours",a.LAST_7_DAYS="Last 7 days",a.LAST_14_DAYS="Last 14 days",a.LAST_28_DAYS="Last 28 days",a);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,s.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,s.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,s.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,s.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,s.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,s.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,s.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,s.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,s.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,s.default)().toISOString(),availableIn:["team","enterprise"]}],l={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()},i=(e,t=!0)=>{if(0===e.length)return"";let a=e.map(e=>{let t=e.key.split("."),a=[t[t.length-2],t[t.length-1]].join("."),s=e.key.includes(".")?a:e.key,n=e.value.toString().includes('"')||e.value.toString().includes("'"),r=!isNaN(Number(e.value)),o=!r&&n?e.value:`'${e.value}'`,l=!r&&String(o).toLowerCase(),i=r?e.value:l;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${s}, ${i})`;case"is":default:return`${s} = ${i}`;case"!=":return`${s} != ${i}`;case">=":return`${s} >= ${i}`;case"<=":return`${s} <= ${i}`;case">":return`${s} > ${i}`;case"<":return`${s} < ${i}`}}).filter(Boolean).join(" AND ");return""===a?"":t?"WHERE "+a:"AND "+a},c={[n.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
        -- reports-api-total-requests
        select
          cast(timestamp_trunc(t.timestamp, hour) as datetime) as timestamp,
          count(t.id) as count
        FROM edge_logs t
          cross join unnest(metadata) as m
          cross join unnest(m.response) as response
          cross join unnest(m.request) as request
          cross join unnest(request.headers) as headers
          ${i(e)}
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
          ${i(e)}
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
        ${i(e,!1)}
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
        ${i(e,!1)}
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
          ${i(e)}
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
        ${i(e)}
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
          ${i(e)}
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
        ${i(e,!1)}
        group by
          cf.country
        `}}},[n.AUTH]:{title:"",queries:{}},[n.STORAGE]:{title:"Storage",queries:{cacheHitRate:{queryType:"logs",sql:e=>`
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
  ${i(e,!1)}
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
  ${i(e,!1)}
group by path, search
order by count desc
limit 12
    `}}},[n.QUERY_PERFORMANCE]:{title:"Query performance",queries:{mostFrequentlyInvoked:{queryType:"db",sql:(e,t,a,s=!1,n=!1)=>`
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
  limit 20`},mostTimeConsuming:{queryType:"db",sql:(e,t,a,s=!1,n=!1)=>`
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
  limit 20`},slowestExecutionTime:{queryType:"db",sql:(e,t,a,s=!1,n=!1)=>`
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
  from pg_statio_user_tables;`},unified:{queryType:"db",sql:(e,t,a,s=!1,n=!1,r=1,o=20)=>{let l=(r-1)*o,i=n&&s?l+10*o:l+o,c=s?Math.min(i,500):i;return`
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
        ${n&&s?"where (index_advisor_result->>'has_suggestion')::boolean = true":""}
        ${a||"order by total_time desc"}
        limit ${o} offset ${l}`}},slowQueriesCount:{queryType:"db",sql:()=>`
        -- reports-query-performance-slow-queries-count
        set search_path to public, extensions;

        -- Count of slow queries (> 1 second average)
        SELECT count(*) as slow_queries_count
        -- alias needed to reference columns in WHERE
        FROM pg_stat_statements as statements
        -- skip never-executed queries; mean_exec_time > 1000ms = avg over 1 second
        WHERE statements.calls > 0 AND statements.mean_exec_time > 1000;`},queryMetrics:{queryType:"db",sql:(e,t,a,s=!1,n=!1)=>`
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
        ${a||""}`}}},[n.DATABASE]:{title:"database",queries:{largeObjects:{queryType:"db",sql:e=>`-- reports-database-large-objects
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,l,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,c,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>r,"generateRegexpWhere",0,i],820308)},749199,e=>{"use strict";var t=e.i(242882),a=e.i(820308),s=e.i(150671),n=e.i(714403),r=e.i(635494),o=e.i(189329);e.s(["default",0,({sql:e,params:l=a.DEFAULT_QUERY_PARAMS,where:i,orderBy:c})=>{let{data:d}=(0,r.useSelectedProjectQuery)(),m=(0,o.useDatabaseSelectorStateSnapshot)(),{data:u}=(0,s.useReadReplicasQuery)({projectRef:d?.ref}),p=(u||[]).find(e=>e.identifier===m.selectedDatabaseId)?.connectionString,h=m.selectedDatabaseId,_="function"==typeof e?e([]):e,{data:g,error:x,isPending:f,isRefetching:y,refetch:b}=(0,t.useQuery)({queryKey:["projects",d?.ref,"db",{...l,sql:_,identifier:h},i,c],queryFn:({signal:e})=>(0,n.executeSql)({projectRef:d?.ref,connectionString:p||d?.connectionString,sql:_},e).then(e=>e.result),enabled:!!_,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:x||("object"==typeof g?g?.error:""),data:g,isLoading:f,isRefetching:y,params:l,runQuery:b,resolvedSql:_}}])},194576,e=>{"use strict";var t=e.i(478902),a=e.i(270740),s=e.i(938933);let n=({open:e,children:s,className:n,...r})=>(0,t.jsx)(a.Collapsible.Root,{asChild:r.asChild,defaultOpen:r.defaultOpen,open:e,onOpenChange:r.onOpenChange,disabled:r.disabled,className:n,children:s});n.Trigger=function({children:e,asChild:s}){return(0,t.jsx)(a.Collapsible.Trigger,{asChild:s,children:e})},n.Content=function({asChild:e,children:n,className:r}){let o=(0,s.default)("collapsible");return(0,t.jsx)(a.Collapsible.Content,{asChild:e,className:[o.content,r].join(" "),children:n})},e.s(["default",0,n])},58359,e=>{"use strict";var t=e.i(194576);e.s(["Collapsible",()=>t.default])},725990,e=>{"use strict";let t=(0,e.i(388019).default)("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);e.s(["Minus",0,t],725990)},42592,e=>{"use strict";var t=e.i(337277),a=e.i(847240);e.s(["default",0,function(e){(0,a.default)(1,arguments);var s=(0,t.default)(e);return s.setHours(0,0,0,0),s}])},135890,641228,e=>{"use strict";var t=e.i(478902),a=e.i(725990),s=e.i(843778),n=e.i(337277),r=e.i(847240),o=e.i(42592);function l(e){return!!Array.isArray(e)&&e.every(e=>e instanceof Date)}let i=(e,t,a)=>{let s=new Date(e.getValue(t)),[l,i]=a;return!isNaN(s.getTime())&&(i?function(e,t){(0,r.default)(2,arguments);var a=(0,n.default)(e),s=(0,n.default)(t);return a.getTime()>s.getTime()}(s,l)&&function(e,t){(0,r.default)(2,arguments);var a=(0,n.default)(e),s=(0,n.default)(t);return a.getTime()<s.getTime()}(s,i):function(e,t){(0,r.default)(2,arguments);var a=(0,o.default)(e),s=(0,o.default)(t);return a.getTime()===s.getTime()}(s,l))};i.autoRemove=e=>!Array.isArray(e)||!e.length||!l(e);let c=(e,t,a)=>!!Array.isArray(a)&&a.some(a=>e.getValue(t)===a);function d(e){switch(e){case"1":case"info":return{text:"text-blue-500",bg:"",border:"border-blue-200 dark:border-blue-800"};case"2":case"success":return{text:"text-foreground-lighter",bg:"",border:"border-green-200 dark:border-green-800"};case"4":case"warning":case"redirect":return{text:"text-warning",bg:"bg-warning-300 dark:bg-warning-200",border:"border border-warning-400/50 dark:border-warning-400/50"};case"5":case"error":return{text:"text-destructive",bg:"bg-destructive-300 dark:bg-destructive-300/50",border:"border border-destructive-400/50 dark:border-destructive-400/50"};default:return{text:"text-foreground-lighter",bg:"",border:""}}}c.autoRemove=e=>!Array.isArray(e)||!e?.length,e.s(["arrSome",0,c,"formatCompactNumber",0,function(e){return e>=100&&e<1e3?e.toString():e>=1e3&&e<1e6?(e/1e3).toFixed(1)+"k":e>=1e6?(e/1e6).toFixed(1)+"M":e.toString()},"getLevelColor",0,function(e){switch(e){case"success":return{text:"text-muted",bg:"bg-muted",border:"border-muted"};case"warning":return{text:"text-warning",bg:"bg-warning",border:"border-warning"};case"error":return{text:"text-destructive",bg:"bg-destructive",border:"border-destructive"};default:return{text:"text-info",bg:"bg-info",border:"border-info"}}},"getStatusColor",0,d,"inDateRange",0,i,"isArrayOfDates",0,l,"isArrayOfNumbers",0,function(e){return!!Array.isArray(e)&&e.every(e=>"number"==typeof e)}],641228),e.s(["DataTableColumnStatusCode",0,({value:e,level:n,className:r})=>{let o=d(n);return e?(0,t.jsx)("div",{className:(0,s.cn)("flex items-center relative",r),children:(0,t.jsx)("div",{className:(0,s.cn)("px-1 py-[0.03rem] rounded-md","flex items-center justify-center relative font-mono",o.text,o.bg,o.border),children:e})}):(0,t.jsx)(a.Minus,{className:"h-4 w-4 text-muted-foreground/50"})}],135890)},886554,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(151675),n=e.i(799108),r=e.i(942032),o=e.i(831266),l=e.i(30772),i=e.i(625198),c=e.i(214765),d=e.i(941327),m=e.i(682679),u=e.i(940336),p=e.i(414833),h=e.i(150401),_=e.i(834869),g=e.i(844048);e.s(["default",0,function({data:e,yAxisKey:x,xAxisKey:f,format:y,customDateFormat:b=_.DateTimeFormats.FULL,title:S,highlightedValue:j,highlightedLabel:v,displayDateInUtc:A,minimalHeader:C,valuePrecision:T,className:N="",size:E="normal",emptyStateMessage:q,onBarClick:R,showLegend:M=!1,xAxisIsDate:w=!0,XAxisProps:I,YAxisProps:k,showGrid:L=!1,syncId:O}){let{hoveredIndex:D,isHovered:F,isCurrentChart:P,setHover:B,clearHover:G}=(0,h.useChartHoverState)("default"),{Container:K}=(0,u.useChartSize)(E),[H,U]=(0,a.useState)(null),$=(0,a.useMemo)(()=>e.map(e=>({...e,[x]:"string"==typeof e[x]?Number(e[x]):e[x]})),[e,x]),V=I||{interval:e.length-2,angle:0,tick:!1},Y=k||{tickFormatter:e=>(0,u.numberFormatter)(e,T),tick:!1,width:0},W=(0,g.useFormatDateTime)(),z=e=>A?(0,g.formatDateTime)(e,{tz:"UTC",format:b}):W(e,b),Q=w?null!==H&&e&&void 0!==e[H]&&z(e[H][f])||v:H?e[H]?.[f]:v,X=null!==H?e[H]?.[x]:j;return 0===e.length?(0,t.jsx)(p.default,{message:q,description:"It may take up to 24 hours for data to refresh",size:E,className:N,attribute:S,format:y}):(0,t.jsxs)("div",{className:["flex flex-col gap-y-3",N].join(" "),children:[(0,t.jsx)(m.ChartHeader,{title:S,format:y,customDateFormat:b,highlightedValue:X,highlightedLabel:Q,minimalHeader:C,syncId:O,data:e,xAxisKey:f,yAxisKey:x,xAxisIsDate:w,displayDateInUtc:A,valuePrecision:T,attributes:[]}),(0,t.jsx)(K,{children:(0,t.jsxs)(l.BarChart,{data:$,className:"overflow-visible",onMouseMove:e=>{e.activeTooltipIndex!==H&&U(e.activeTooltipIndex),B(e.activeTooltipIndex)},onMouseLeave:()=>{U(null),G()},onClick:e=>{let t=e?.activePayload?.[0]?.payload;R&&R(t,e)},children:[M&&(0,t.jsx)(o.Legend,{}),L&&(0,t.jsx)(n.CartesianGrid,{stroke:_.CHART_COLORS.AXIS}),(0,a.createElement)(d.YAxis,{...Y,axisLine:{stroke:_.CHART_COLORS.AXIS},tickLine:{stroke:_.CHART_COLORS.AXIS},key:x}),(0,a.createElement)(c.XAxis,{...V,axisLine:{stroke:_.CHART_COLORS.AXIS},tickLine:{stroke:_.CHART_COLORS.AXIS},key:f}),(0,t.jsx)(i.Tooltip,{content:a=>O&&F&&P&&null!==D?(0,t.jsxs)("div",{className:"bg-black/90 text-white p-2 rounded-sm text-xs",children:[(0,t.jsx)("div",{className:"font-medium",children:z(e[D]?.[f])}),(0,t.jsxs)("div",{children:[(0,u.numberFormatter)(Number(e[D]?.[x])||0,T),"string"==typeof y?y:""]})]}):null}),(0,t.jsx)(s.Bar,{dataKey:x,fill:_.CHART_COLORS.GREEN_1,animationDuration:300,maxBarSize:48,children:e?.map((e,a)=>(0,t.jsx)(r.Cell,{className:`transition-all duration-300 ${R?"cursor-pointer":""}`,fill:H===a||null===H?_.CHART_COLORS.GREEN_1:_.CHART_COLORS.GREEN_2,enableBackground:12},`cell-${a}`))})]})}),e&&(0,t.jsxs)("div",{className:"text-foreground-lighter -mt-10 flex items-center justify-between text-[10px] font-mono",children:[(0,t.jsx)("span",{children:w?z(e[0][f]):e[0][f]}),(0,t.jsx)("span",{children:w?z(e[e?.length-1]?.[f]):e[e?.length-1]?.[f]})]})]})}])},604499,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),s=e.i(17203),n=e.i(382490),r=e.i(989567),o=e.i(837710),l=e.i(843778),i=e.i(787902),c=e.i(613580),d=e.i(368315);e.s(["default",0,e=>{let m=(0,r.useRouter)(),{ref:u}=(0,a.useParams)();return(0,t.jsxs)(d.default,{noMargin:!0,noHideOverflow:!0,className:(0,l.cn)("pb-0",e.className),wrapWithLoading:!1,children:[(0,t.jsxs)(d.default.Content,{className:(0,l.cn)("space-y-4",e.contentClassName),children:[(0,t.jsxs)("div",{className:(0,l.cn)("flex flex-row items-start justify-between",e.headerClassName),children:[(0,t.jsxs)("div",{className:"gap-2",children:[(0,t.jsxs)("div",{className:"flex flex-row gap-2",children:[(0,t.jsx)("h3",{className:"w-full h-6",children:e.title})," ",e?.tooltip&&(0,t.jsxs)(c.Tooltip,{children:[(0,t.jsx)(c.TooltipTrigger,{children:(0,t.jsx)(n.HelpCircle,{className:"text-foreground-light",size:14,strokeWidth:1.5})}),(0,t.jsx)(c.TooltipContent,{side:"bottom",children:e.tooltip})]})]}),(0,t.jsx)("p",{className:"text-sm text-foreground-light",children:e.description})]}),e.params&&(0,t.jsxs)(c.Tooltip,{children:[(0,t.jsx)(c.TooltipTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",icon:(0,t.jsx)(s.ExternalLink,{}),className:"px-1",onClick:()=>{let t="db"===e.queryType,a=t?`/project/${u}/sql/new`:`/project/${u}/logs/explorer`,s={};t?s.content=e.resolvedSql:(s.q=e.params?.sql,s.its=e.params?.iso_timestamp_start||"",s.ite=e.params?.iso_timestamp_end||""),m.push({pathname:a,query:s})}})}),(0,t.jsx)(c.TooltipContent,{side:"left",children:"db"===e.queryType?"Open in SQL Editor":"Open in Logs Explorer"})]})]}),(0,t.jsx)(i.Loading,{active:e.isLoading,children:void 0===e.data?null:e.renderer({...e,router:m,projectRef:u})})]}),e.append&&(0,t.jsx)(t.Fragment,{children:e.append({...e,...e.appendProps||{},router:m,projectRef:u})})]})}])},171096,e=>{"use strict";e.s(["COUNTRY_LAT_LON",0,{AF:{lat:33,lon:65},AX:{lat:60.116667,lon:19.9},AL:{lat:41,lon:20},DZ:{lat:28,lon:3},AS:{lat:-14.3333,lon:-170},AD:{lat:42.5,lon:1.6},AO:{lat:-12.5,lon:18.5},AI:{lat:18.25,lon:-63.1667},AQ:{lat:-90,lon:0},AG:{lat:17.05,lon:-61.8},AR:{lat:-34,lon:-64},AM:{lat:40,lon:45},AW:{lat:12.5,lon:-69.9667},AU:{lat:-27,lon:133},AT:{lat:47.3333,lon:13.3333},AZ:{lat:40.5,lon:47.5},BS:{lat:24.25,lon:-76},BH:{lat:26,lon:50.55},BD:{lat:24,lon:90},BB:{lat:13.1667,lon:-59.5333},BY:{lat:53,lon:28},BE:{lat:50.8333,lon:4},BZ:{lat:17.25,lon:-88.75},BJ:{lat:9.5,lon:2.25},BM:{lat:32.3333,lon:-64.75},BT:{lat:27.5,lon:90.5},BO:{lat:-17,lon:-65},BQ:{lat:12.183333,lon:-68.233333},BA:{lat:44,lon:18},BW:{lat:-22,lon:24},BV:{lat:-54.4333,lon:3.4},BR:{lat:-10,lon:-55},IO:{lat:-6,lon:71.5},BN:{lat:4.5,lon:114.6667},BG:{lat:43,lon:25},BF:{lat:13,lon:-2},MM:{lat:22,lon:98},BI:{lat:-3.5,lon:30},KH:{lat:13,lon:105},CM:{lat:6,lon:12},CA:{lat:60,lon:-95},CV:{lat:16,lon:-24},KY:{lat:19.5,lon:-80.5},CF:{lat:7,lon:21},TD:{lat:15,lon:19},CL:{lat:-30,lon:-71},CN:{lat:35,lon:105},CX:{lat:-10.5,lon:105.6667},CC:{lat:-12.5,lon:96.8333},CO:{lat:4,lon:-72},KM:{lat:-12.1667,lon:44.25},CD:{lat:0,lon:25},CG:{lat:-1,lon:15},CK:{lat:-21.2333,lon:-159.7667},CR:{lat:10,lon:-84},CI:{lat:8,lon:-5},HR:{lat:45.1667,lon:15.5},CU:{lat:21.5,lon:-80},CW:{lat:12.166667,lon:-68.966667},CY:{lat:35,lon:33},CZ:{lat:49.75,lon:15.5},DK:{lat:56,lon:10},DJ:{lat:11.5,lon:43},DM:{lat:15.4167,lon:-61.3333},DO:{lat:19,lon:-70.6667},EC:{lat:-2,lon:-77.5},EG:{lat:27,lon:30},SV:{lat:13.8333,lon:-88.9167},GQ:{lat:2,lon:10},ER:{lat:15,lon:39},EE:{lat:59,lon:26},ET:{lat:8,lon:38},FK:{lat:-51.75,lon:-59},FO:{lat:62,lon:-7},FJ:{lat:-18,lon:175},FI:{lat:64,lon:26},FR:{lat:46,lon:2},GF:{lat:4,lon:-53},PF:{lat:-15,lon:-140},TF:{lat:-43,lon:67},GA:{lat:-1,lon:11.75},GM:{lat:13.4667,lon:-16.5667},GE:{lat:42,lon:43.5},DE:{lat:51,lon:9},GH:{lat:8,lon:-2},GI:{lat:36.1833,lon:-5.3667},GR:{lat:39,lon:22},GL:{lat:72,lon:-40},GD:{lat:12.1167,lon:-61.6667},GP:{lat:16.25,lon:-61.5833},GU:{lat:13.4667,lon:144.7833},GT:{lat:15.5,lon:-90.25},GG:{lat:49.5,lon:-2.56},GW:{lat:12,lon:-15},GN:{lat:11,lon:-10},GY:{lat:5,lon:-59},HT:{lat:19,lon:-72.4167},HM:{lat:-53.1,lon:72.5167},VA:{lat:41.9,lon:12.45},HN:{lat:15,lon:-86.5},HK:{lat:22.25,lon:114.1667},HU:{lat:47,lon:20},IS:{lat:65,lon:-18},IN:{lat:20,lon:77},ID:{lat:-5,lon:120},IR:{lat:32,lon:53},IQ:{lat:33,lon:44},IE:{lat:53,lon:-8},IM:{lat:54.23,lon:-4.55},IL:{lat:31.5,lon:34.75},IT:{lat:42.8333,lon:12.8333},JM:{lat:18.25,lon:-77.5},JP:{lat:36,lon:138},JE:{lat:49.21,lon:-2.13},JO:{lat:31,lon:36},KZ:{lat:48,lon:68},KE:{lat:1,lon:38},KI:{lat:1.4167,lon:173},KP:{lat:40,lon:127},KR:{lat:37,lon:127.5},XK:{lat:42.583333,lon:21},KW:{lat:29.3375,lon:47.6581},KG:{lat:41,lon:75},LA:{lat:18,lon:105},LV:{lat:57,lon:25},LB:{lat:33.8333,lon:35.8333},LS:{lat:-29.5,lon:28.5},LR:{lat:6.5,lon:-9.5},LY:{lat:25,lon:17},LI:{lat:47.1667,lon:9.5333},LT:{lat:56,lon:24},LU:{lat:49.75,lon:6.1667},MO:{lat:22.1667,lon:113.55},MK:{lat:41.8333,lon:22},MG:{lat:-20,lon:47},MW:{lat:-13.5,lon:34},MY:{lat:2.5,lon:112.5},MV:{lat:3.25,lon:73},ML:{lat:17,lon:-4},MT:{lat:35.8333,lon:14.5833},MH:{lat:9,lon:168},MQ:{lat:14.6667,lon:-61},MR:{lat:20,lon:-12},MU:{lat:-20.2833,lon:57.55},YT:{lat:-12.8333,lon:45.1667},MX:{lat:23,lon:-102},FM:{lat:6.9167,lon:158.25},MD:{lat:47,lon:29},MC:{lat:43.7333,lon:7.4},MN:{lat:46,lon:105},ME:{lat:42,lon:19},MS:{lat:16.75,lon:-62.2},MA:{lat:32,lon:-5},MZ:{lat:-18.25,lon:35},NA:{lat:-22,lon:17},NR:{lat:-.5333,lon:166.9167},NP:{lat:28,lon:84},AN:{lat:12.25,lon:-68.75},NL:{lat:52.5,lon:5.75},NC:{lat:-21.5,lon:165.5},NZ:{lat:-41,lon:174},NI:{lat:13,lon:-85},NE:{lat:16,lon:8},NG:{lat:10,lon:8},NU:{lat:-19.0333,lon:-169.8667},NF:{lat:-29.0333,lon:167.95},MP:{lat:15.2,lon:145.75},NO:{lat:62,lon:10},OM:{lat:21,lon:57},PK:{lat:30,lon:70},PW:{lat:7.5,lon:134.5},PS:{lat:32,lon:35.25},PA:{lat:9,lon:-80},PG:{lat:-6,lon:147},PY:{lat:-23,lon:-58},PE:{lat:-10,lon:-76},PH:{lat:13,lon:122},PN:{lat:-24.7,lon:-127.4},PL:{lat:52,lon:20},PT:{lat:39.5,lon:-8},PR:{lat:18.25,lon:-66.5},QA:{lat:25.5,lon:51.25},RE:{lat:-21.1,lon:55.6},RO:{lat:46,lon:25},RU:{lat:60,lon:100},RW:{lat:-2,lon:30},BL:{lat:17.897728,lon:-62.834244},SH:{lat:-15.9333,lon:-5.7},KN:{lat:17.3333,lon:-62.75},LC:{lat:13.8833,lon:-61.1333},MF:{lat:18.075278,lon:-63.06},PM:{lat:46.8333,lon:-56.3333},VC:{lat:13.25,lon:-61.2},WS:{lat:-13.5833,lon:-172.3333},SM:{lat:43.7667,lon:12.4167},ST:{lat:1,lon:7},SA:{lat:25,lon:45},SN:{lat:14,lon:-14},RS:{lat:44,lon:21},SC:{lat:-4.5833,lon:55.6667},SL:{lat:8.5,lon:-11.5},SG:{lat:1.3667,lon:103.8},SX:{lat:18.033333,lon:-63.05},SK:{lat:48.6667,lon:19.5},SI:{lat:46,lon:15},SB:{lat:-8,lon:159},SO:{lat:10,lon:49},ZA:{lat:-29,lon:24},GS:{lat:-54.5,lon:-37},SS:{lat:8,lon:30},ES:{lat:40,lon:-4},LK:{lat:7,lon:81},SD:{lat:15,lon:30},SR:{lat:4,lon:-56},SJ:{lat:78,lon:20},SZ:{lat:-26.5,lon:31.5},SE:{lat:62,lon:15},CH:{lat:47,lon:8},SY:{lat:35,lon:38},TW:{lat:23.5,lon:121},TJ:{lat:39,lon:71},TZ:{lat:-6,lon:35},TH:{lat:15,lon:100},TL:{lat:-8.55,lon:125.5167},TG:{lat:8,lon:1.1667},TK:{lat:-9,lon:-172},TO:{lat:-20,lon:-175},TT:{lat:11,lon:-61},TN:{lat:34,lon:9},TR:{lat:39,lon:35},TM:{lat:40,lon:60},TC:{lat:21.75,lon:-71.5833},TV:{lat:-8,lon:178},UG:{lat:1,lon:32},UA:{lat:49,lon:32},AE:{lat:24,lon:54},GB:{lat:54,lon:-2},UM:{lat:19.2833,lon:166.6},US:{lat:38,lon:-97},UY:{lat:-33,lon:-56},UZ:{lat:41,lon:64},VU:{lat:-16,lon:167},VE:{lat:8,lon:-66},VN:{lat:16,lon:106},VG:{lat:18.5,lon:-64.5},VI:{lat:18.3333,lon:-64.8333},WF:{lat:-13.3,lon:-176.2},EH:{lat:24.5,lon:-13},YE:{lat:15,lon:48},ZM:{lat:-15,lon:30},ZW:{lat:-20,lon:30}},"DATABASE_PASSWORD_REGEX",0,/^[^@:\/]*$/,"sizes",0,["micro","small","medium"]])},529620,e=>{"use strict";var t=e.i(478902),a=e.i(865490),a=a,s=e.i(816046),n=e.i(416050),r=e.i(116317),o=e.i(389959),l=e.i(863805),i=e.i(178527),c=e.i(206413),d=e.i(592360),m=e.i(837710),u=e.i(58359),p=e.i(925282),h=e.i(774234),_=e.i(554855),g=e.i(877555),x=e.i(531837),f=e.i(554344),y=e.i(171096);let b=[{code:"AF",name:"Afghanistan"},{code:"AL",name:"Albania"},{code:"DZ",name:"Algeria"},{code:"AS",name:"American Samoa"},{code:"AD",name:"Andorra"},{code:"AO",name:"Angola"},{code:"AI",name:"Anguilla"},{code:"AQ",name:"Antarctica"},{code:"AG",name:"Antigua and Barbuda"},{code:"AR",name:"Argentina"},{code:"AM",name:"Armenia"},{code:"AW",name:"Aruba"},{code:"AU",name:"Australia"},{code:"AT",name:"Austria"},{code:"AZ",name:"Azerbaijan"},{code:"BS",name:"Bahamas"},{code:"BH",name:"Bahrain"},{code:"BD",name:"Bangladesh"},{code:"BB",name:"Barbados"},{code:"BY",name:"Belarus"},{code:"BE",name:"Belgium"},{code:"BZ",name:"Belize"},{code:"BJ",name:"Benin"},{code:"BM",name:"Bermuda"},{code:"BT",name:"Bhutan"},{code:"BO",name:"Bolivia"},{code:"BA",name:"Bosnia and Herzegovina"},{code:"BW",name:"Botswana"},{code:"BV",name:"Bouvet Island"},{code:"BR",name:"Brazil"},{code:"IO",name:"British Indian Ocean Territory"},{code:"VG",name:"British Virgin Islands"},{code:"BN",name:"Brunei Darussalam"},{code:"BG",name:"Bulgaria"},{code:"BF",name:"Burkina Faso"},{code:"BI",name:"Burundi"},{code:"KH",name:"Cambodia"},{code:"CM",name:"Cameroon"},{code:"CA",name:"Canada"},{code:"CV",name:"Cape Verde"},{code:"KY",name:"Cayman Islands"},{code:"CF",name:"Central African Republic"},{code:"TD",name:"Chad"},{code:"CL",name:"Chile"},{code:"CN",name:"China"},{code:"CX",name:"Christmas Island"},{code:"CC",name:"Cocos (Keeling) Islands"},{code:"CO",name:"Colombia"},{code:"KM",name:"Comoros"},{code:"CG",name:"Congo"},{code:"CK",name:"Cook Islands"},{code:"CR",name:"Costa Rica"},{code:"HR",name:"Croatia"},{code:"CU",name:"Cuba"},{code:"CW",name:"Curaçao"},{code:"CY",name:"Cyprus"},{code:"CZ",name:"Czech Republic"},{code:"CI",name:"Côte d'Ivoire"},{code:"DK",name:"Denmark"},{code:"DJ",name:"Djibouti"},{code:"DM",name:"Dominica"},{code:"DO",name:"Dominican Republic"},{code:"EC",name:"Ecuador"},{code:"EG",name:"Egypt"},{code:"SV",name:"El Salvador"},{code:"GQ",name:"Equatorial Guinea"},{code:"ER",name:"Eritrea"},{code:"EE",name:"Estonia"},{code:"SZ",name:"Eswatini"},{code:"ET",name:"Ethiopia"},{code:"FK",name:"Falkland Islands"},{code:"FO",name:"Faroe Islands"},{code:"FJ",name:"Fiji"},{code:"FI",name:"Finland"},{code:"FR",name:"France"},{code:"GF",name:"French Guiana"},{code:"PF",name:"French Polynesia"},{code:"TF",name:"French Southern Territories"},{code:"GA",name:"Gabon"},{code:"GM",name:"Gambia"},{code:"GE",name:"Georgia"},{code:"DE",name:"Germany"},{code:"GH",name:"Ghana"},{code:"GI",name:"Gibraltar"},{code:"GR",name:"Greece"},{code:"GL",name:"Greenland"},{code:"GD",name:"Grenada"},{code:"GP",name:"Guadeloupe"},{code:"GU",name:"Guam"},{code:"GT",name:"Guatemala"},{code:"GG",name:"Guernsey"},{code:"GN",name:"Guinea"},{code:"GW",name:"Guinea-Bissau"},{code:"GY",name:"Guyana"},{code:"HT",name:"Haiti"},{code:"HM",name:"Heard & McDonald Islands"},{code:"HN",name:"Honduras"},{code:"HK",name:"Hong Kong"},{code:"HU",name:"Hungary"},{code:"IS",name:"Iceland"},{code:"IN",name:"India"},{code:"ID",name:"Indonesia"},{code:"IR",name:"Iran"},{code:"IQ",name:"Iraq"},{code:"IE",name:"Ireland"},{code:"IM",name:"Isle of Man"},{code:"IL",name:"Israel"},{code:"IT",name:"Italy"},{code:"JM",name:"Jamaica"},{code:"JP",name:"Japan"},{code:"JE",name:"Jersey"},{code:"JO",name:"Jordan"},{code:"KZ",name:"Kazakhstan"},{code:"KE",name:"Kenya"},{code:"KI",name:"Kiribati"},{code:"KW",name:"Kuwait"},{code:"KG",name:"Kyrgyzstan"},{code:"LA",name:"Laos"},{code:"LV",name:"Latvia"},{code:"LB",name:"Lebanon"},{code:"LS",name:"Lesotho"},{code:"LR",name:"Liberia"},{code:"LY",name:"Libya"},{code:"LI",name:"Liechtenstein"},{code:"LT",name:"Lithuania"},{code:"LU",name:"Luxembourg"},{code:"MO",name:"Macao"},{code:"MG",name:"Madagascar"},{code:"MW",name:"Malawi"},{code:"MY",name:"Malaysia"},{code:"MV",name:"Maldives"},{code:"ML",name:"Mali"},{code:"MT",name:"Malta"},{code:"MH",name:"Marshall Islands"},{code:"MQ",name:"Martinique"},{code:"MR",name:"Mauritania"},{code:"MU",name:"Mauritius"},{code:"YT",name:"Mayotte"},{code:"MX",name:"Mexico"},{code:"FM",name:"Micronesia"},{code:"MD",name:"Moldova"},{code:"MC",name:"Monaco"},{code:"MN",name:"Mongolia"},{code:"ME",name:"Montenegro"},{code:"MS",name:"Montserrat"},{code:"MA",name:"Morocco"},{code:"MZ",name:"Mozambique"},{code:"MM",name:"Myanmar"},{code:"NA",name:"Namibia"},{code:"NR",name:"Nauru"},{code:"NP",name:"Nepal"},{code:"NL",name:"Netherlands"},{code:"NC",name:"New Caledonia"},{code:"NZ",name:"New Zealand"},{code:"NI",name:"Nicaragua"},{code:"NE",name:"Niger"},{code:"NG",name:"Nigeria"},{code:"NU",name:"Niue"},{code:"NF",name:"Norfolk Island"},{code:"KP",name:"North Korea"},{code:"MK",name:"North Macedonia"},{code:"MP",name:"Northern Mariana Islands"},{code:"NO",name:"Norway"},{code:"OM",name:"Oman"},{code:"PK",name:"Pakistan"},{code:"PW",name:"Palau"},{code:"PS",name:"Palestinian Territories"},{code:"PA",name:"Panama"},{code:"PG",name:"Papua New Guinea"},{code:"PY",name:"Paraguay"},{code:"PE",name:"Peru"},{code:"PH",name:"Philippines"},{code:"PN",name:"Pitcairn Islands"},{code:"PL",name:"Poland"},{code:"PT",name:"Portugal"},{code:"PR",name:"Puerto Rico"},{code:"QA",name:"Qatar"},{code:"RO",name:"Romania"},{code:"RU",name:"Russia"},{code:"RW",name:"Rwanda"},{code:"RE",name:"Réunion"},{code:"BL",name:"Saint Barthélemy"},{code:"WS",name:"Samoa"},{code:"SM",name:"San Marino"},{code:"ST",name:"Sao Tome and Principe"},{code:"SA",name:"Saudi Arabia"},{code:"SN",name:"Senegal"},{code:"RS",name:"Serbia"},{code:"SC",name:"Seychelles"},{code:"SL",name:"Sierra Leone"},{code:"SG",name:"Singapore"},{code:"SX",name:"Sint Maarten"},{code:"SK",name:"Slovakia"},{code:"SI",name:"Slovenia"},{code:"SB",name:"Solomon Islands"},{code:"SO",name:"Somalia"},{code:"ZA",name:"South Africa"},{code:"GS",name:"South Georgia and the South Sandwich Islands"},{code:"KR",name:"South Korea"},{code:"SS",name:"South Sudan"},{code:"ES",name:"Spain"},{code:"LK",name:"Sri Lanka"},{code:"SH",name:"St Helena"},{code:"KN",name:"St Kitts and Nevis"},{code:"LC",name:"St Lucia"},{code:"MF",name:"St Martin"},{code:"PM",name:"St Pierre and Miquelon"},{code:"VC",name:"St Vincent and the Grenadines"},{code:"SD",name:"Sudan"},{code:"SR",name:"Suriname"},{code:"SJ",name:"Svalbard & Jan Mayen"},{code:"SE",name:"Sweden"},{code:"CH",name:"Switzerland"},{code:"SY",name:"Syria"},{code:"TW",name:"Taiwan"},{code:"TJ",name:"Tajikistan"},{code:"TZ",name:"Tanzania"},{code:"TH",name:"Thailand"},{code:"TL",name:"Timor-Leste"},{code:"TG",name:"Togo"},{code:"TK",name:"Tokelau"},{code:"TO",name:"Tonga"},{code:"TT",name:"Trinidad & Tobago"},{code:"TN",name:"Tunisia"},{code:"TR",name:"Turkey"},{code:"TM",name:"Turkmenistan"},{code:"TC",name:"Turks & Caicos Islands"},{code:"TV",name:"Tuvalu"},{code:"VI",name:"US Virgin Islands"},{code:"UG",name:"Uganda"},{code:"UA",name:"Ukraine"},{code:"AE",name:"United Arab Emirates"},{code:"GB",name:"United Kingdom"},{code:"US",name:"United States of America"},{code:"UY",name:"Uruguay"},{code:"UZ",name:"Uzbekistan"},{code:"VU",name:"Vanuatu"},{code:"VA",name:"Vatican City"},{code:"VE",name:"Venezuela"},{code:"VN",name:"Vietnam"},{code:"WF",name:"Wallis & Futuna"},{code:"EH",name:"Western Sahara"},{code:"YE",name:"Yemen"},{code:"ZM",name:"Zambia"},{code:"ZW",name:"Zimbabwe"},{code:"AX",name:"Åland Islands"}],S={zeroFill:"hsl(var(--background-surface-400))",brandFill:"hsl(var(--brand-default))",opacityScale:[.18,.32,.5,.68,.86],boundaryStroke:"hsla(var(--brand-300), 0.6)",boundaryStrokeHover:"hsl(var(--brand-500))",markerFill:"hsl(var(--brand-default))",oceanFill:"transparent"},j={zeroFill:"hsl(var(--background-selection))",brandFill:"hsl(var(--brand-default))",opacityScale:[.18,.32,.5,.68,.86],boundaryStroke:"hsla(var(--brand-300), 0.6)",boundaryStrokeHover:"hsl(var(--brand-500))",markerFill:"hsl(var(--brand-default))",oceanFill:"transparent"},v=(e,t,a=j)=>t<=0||!e?a.zeroFill:a.brandFill,A=new Set(["Singapore","Monaco","Andorra","Liechtenstein","San Marino","Vatican","Vatican City","Luxembourg","Malta","Bahrain","Brunei","Qatar","Kuwait","Hong Kong","Macau"]),C=e=>Object.prototype.hasOwnProperty.call(y.COUNTRY_LAT_LON,e),T=(e,t)=>t<=0?2:Math.max(1.5,Math.min(4,e/t*4)),N=e=>{if(!e)return;for(let t of["ISO_A2_EH","ISO_A2","iso_a2","ADMIN_ISO_A2","WB_A2","ADM0_A3_IS","ADM0_A3","ISO_N3","id"]){let a=e[t];if("string"==typeof a&&2===a.length)return a.toUpperCase()}let t=e.name||e.NAME||void 0;if(!t)return;let a=b.find(e=>e.name===t);return a?.code},E=e=>{let t=e.toUpperCase(),a=b.find(e=>e.code===t);return a?.name??t};var q=e.i(218786),R=e.i(707843),M=e.i(567558),w=e.i(886554),I=e.i(135890),k=e.i(520124),L=e.i(10429);let O=e=>(0,t.jsxs)(p.Collapsible_Shadcn_,{children:[(0,t.jsx)(_.CollapsibleTrigger_Shadcn_,{asChild:!0,children:(0,t.jsxs)("div",{className:"flex gap-2 items-center",children:[(0,t.jsx)(m.Button,{asChild:!0,type:"text",className:" py-0! p-1!",title:"Show more route details",children:(0,t.jsx)("span",{children:(0,t.jsx)(n.ChevronRight,{size:14,className:"transition data-open-parent:rotate-90 data-closed-parent:rotate-0"})})}),(0,t.jsx)(q.TextFormatter,{className:"w-10 h-4 text-center rounded-sm bg-surface-300",value:e.method}),e.status_code&&(0,t.jsx)(I.DataTableColumnStatusCode,{value:e.status_code,level:String(Math.floor(e.status_code/100))}),(0,t.jsxs)("div",{className:" truncate max-w-sm lg:max-w-lg",children:[(0,t.jsx)(q.TextFormatter,{className:"text-foreground-light",value:e.path}),(0,t.jsx)(q.TextFormatter,{className:"max-w-sm text-foreground-lighter truncate ",value:decodeURIComponent(e.search||"")})]})]})}),(0,t.jsx)(h.CollapsibleContent_Shadcn_,{className:"pt-2",children:e.search?(0,t.jsx)("pre",{className:"syntax-highlight overflow-auto whitespace-pre-wrap wrap-break-word rounded-sm bg-surface-100 p-2 text-xs! [&_span]:whitespace-pre-wrap!",children:(0,t.jsx)("div",{className:"text-wrap",dangerouslySetInnerHTML:{__html:(0,q.jsonSyntaxHighlight)((0,f.queryParamsToObject)(e.search))}})}):(0,t.jsx)("p",{className:"text-xs text-foreground-lighter",children:"No query parameters in this request"})})]});e.s(["ErrorCountsChartRenderer",0,e=>{let a=e.data.reduce((e,t)=>e+t.count,0),{data:s,error:n,isError:r}=(0,k.useFillTimeseriesSorted)({data:e.data,timestampKey:"timestamp",valueKey:"count",defaultValue:0,startDate:e.params?.iso_timestamp_start,endDate:e.params?.iso_timestamp_end});if(e.error){let a="string"==typeof e.error?{message:e.error}:e.error;return(0,t.jsx)(M.default,{subject:"Failed to retrieve request errors",error:a})}return r?(0,t.jsxs)(i.Alert_Shadcn_,{variant:"warning",children:[(0,t.jsx)(g.WarningIcon,{}),(0,t.jsx)(d.AlertTitle_Shadcn_,{children:"Failed to retrieve request errors"}),(0,t.jsx)(c.AlertDescription_Shadcn_,{children:n?.message??"Unknown error"})]}):(0,t.jsx)(w.default,{size:"small",minimalHeader:!0,className:"w-full",highlightedValue:a,data:s,yAxisKey:"count",xAxisKey:"timestamp",displayDateInUtc:!0})},"NetworkTrafficRenderer",0,e=>{let{data:a,error:n,isError:r}=(0,k.useFillTimeseriesSorted)({data:e.data,timestampKey:"timestamp",valueKey:["ingress_mb","egress_mb"],defaultValue:0,startDate:e.params?.iso_timestamp_start,endDate:e.params?.iso_timestamp_end}),o=(0,s.default)(e.data,"ingress_mb"),l=(0,s.default)(e.data,"egress_mb");function m(e){return e<.001?7:o>1?2:4}if(e.error){let a="string"==typeof e.error?{message:e.error}:e.error;return(0,t.jsx)(M.default,{subject:"Failed to retrieve network traffic",error:a})}return r?(0,t.jsxs)(i.Alert_Shadcn_,{variant:"warning",children:[(0,t.jsx)(g.WarningIcon,{}),(0,t.jsx)(d.AlertTitle_Shadcn_,{children:"Failed to retrieve network traffic"}),(0,t.jsx)(c.AlertDescription_Shadcn_,{children:n?.message??"Unknown error"})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-12 w-full",children:[(0,t.jsx)(w.default,{size:"small",title:"Ingress",highlightedValue:(0,s.default)(e.data,"ingress_mb"),format:"MB",className:"w-full",valuePrecision:m(o),data:a,yAxisKey:"ingress_mb",xAxisKey:"timestamp",displayDateInUtc:!0}),(0,t.jsx)(w.default,{size:"small",title:"Egress",highlightedValue:l,format:"MB",valuePrecision:m(l),className:"w-full",data:a,yAxisKey:"egress_mb",xAxisKey:"timestamp",displayDateInUtc:!0})]})},"RequestsByCountryMapRenderer",0,e=>{let s=`${L.BASE_PATH}/json/worldmap.json`,n=(0,o.useRef)(null),[i,c]=(0,o.useState)({x:0,y:0,title:"",subtitle:"",visible:!1}),d=(e=>{let t={};for(let a of e){if(!a.country)continue;let e=a.country.toUpperCase(),s="number"==typeof a.count?a.count:Number(a.count);Number.isFinite(s)&&(t[e]=(t[e]||0)+s)}return t})(e.data),m=Object.values(d).reduce((e,t)=>t>e?t:e,0),{resolvedTheme:u}=(0,r.useTheme)(),p="dark"===u?j:S;if(e.error){let a=x.object({message:x.string()}),s="string"==typeof e.error?{success:!0,data:{message:e.error}}:a.safeParse(e.error),n=s.success?s.data:null;return(0,t.jsx)(M.default,{subject:"Failed to retrieve requests by geography",error:n})}return(0,t.jsxs)("div",{ref:n,className:"w-full h-[420px] relative border-t",children:[(0,t.jsx)(l.ComposableMap,{projection:"geoMercator",projectionConfig:{scale:155},className:"w-full h-full",style:{backgroundColor:p.oceanFill},children:(0,t.jsx)(l.ZoomableGroup,{minZoom:1,maxZoom:5,zoom:1.3,children:(0,t.jsx)(l.Geographies,{geography:s,children:({geographies:e})=>(0,t.jsxs)(t.Fragment,{children:[e.map(e=>{let a=e.properties?.name||e.properties?.NAME||"Unknown",s=N(e.properties||void 0),r=s&&d[s]||0,o=((e,t,a=j)=>{if(t<=0||!e)return 1;let s=e/t;return s>.8?a.opacityScale[4]:s>.6?a.opacityScale[3]:s>.4?a.opacityScale[2]:s>.2?a.opacityScale[1]:a.opacityScale[0]})(r,m,p),i=`${r.toLocaleString()} requests`;return(0,t.jsx)(l.Geography,{geography:e,onMouseMove:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:a,subtitle:i,visible:!0})},onMouseEnter:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:a,subtitle:i,visible:!0})},onMouseLeave:()=>c(e=>({...e,visible:!1})),style:{default:{fill:v(r,m,p),stroke:p.boundaryStroke,strokeWidth:.4,opacity:o,outline:"none",cursor:"default"},hover:{fill:v(r,m,p),stroke:"transparent",strokeWidth:0,opacity:Math.max(0,.8*o),outline:"none",cursor:"default"},pressed:{fill:v(r,m,p),stroke:"transparent",strokeWidth:0,opacity:Math.max(0,.8*o),outline:"none",cursor:"default"}},"aria-label":`${a} — ${i}`},e.rsmKey)}),e.map(e=>{let s=e.properties?.name||e.properties?.NAME||"Unknown";if(!A.has(s))return null;let r=N(e.properties||void 0),o=r&&d[r]||0;if(o<=0)return null;let[i,u]=(0,a.default)(e),h=T(o,m),_=`${o.toLocaleString()} requests`;return(0,t.jsx)(l.Marker,{coordinates:[i,u],onMouseMove:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:s,subtitle:_,visible:!0})},onMouseEnter:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:s,subtitle:_,visible:!0})},onMouseLeave:()=>c(e=>({...e,visible:!1})),children:(0,t.jsx)("circle",{r:h,fill:p.markerFill})},`marker-${e.rsmKey}`)}),(()=>{let a=new Set;for(let t of e){let e=N(t.properties||void 0);e&&a.add(e)}let s=[];for(let e in d){let r=d[e];if(r<=0||"AQ"===e.toUpperCase()||a.has(e)||!C(e))continue;let o=y.COUNTRY_LAT_LON[e],i=T(r,m),u=E(e),h=`${r.toLocaleString()} requests`;s.push((0,t.jsx)(l.Marker,{coordinates:[o.lon,o.lat],onMouseMove:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:u,subtitle:h,visible:!0})},onMouseEnter:e=>{let t=n.current?.getBoundingClientRect();c({x:(t?e.clientX-t.left:e.clientX)+12,y:(t?e.clientY-t.top:e.clientY)+12,title:u,subtitle:h,visible:!0})},onMouseLeave:()=>c(e=>({...e,visible:!1})),children:(0,t.jsx)("circle",{r:i,fill:p.markerFill})},`fallback-${e}`))}return s})()]})})})}),i.visible&&(0,t.jsxs)("div",{className:"pointer-events-none absolute z-10 rounded-sm bg-surface-100 p-1.5 border border-surface-200 text-sm",style:{left:i.x,top:i.y},children:[(0,t.jsx)("h3",{className:"text-foreground-lighter text-sm",children:i.title}),(0,t.jsx)("p",{className:"text-foreground text-sm",children:i.subtitle})]})]})},"ResponseSpeedChartRenderer",0,e=>{let a=e.data.map(e=>({timestamp:e.timestamp,avg:e.avg})),{data:s,error:n,isError:r}=(0,k.useFillTimeseriesSorted)({data:a,timestampKey:"timestamp",valueKey:"avg",defaultValue:0,startDate:e.params?.iso_timestamp_start,endDate:e.params?.iso_timestamp_end}),o=e.data[e.data.length-1]?.avg;if(e.error){let a="string"==typeof e.error?{message:e.error}:e.error;return(0,t.jsx)(M.default,{subject:"Failed to retrieve response speeds",error:a})}return r?(0,t.jsxs)(i.Alert_Shadcn_,{variant:"warning",children:[(0,t.jsx)(g.WarningIcon,{}),(0,t.jsx)(d.AlertTitle_Shadcn_,{children:"Failed to retrieve response speeds"}),(0,t.jsx)(c.AlertDescription_Shadcn_,{children:n?.message??"Unknown error"})]}):(0,t.jsx)(w.default,{size:"small",highlightedValue:o,format:"ms",minimalHeader:!0,className:"w-full",data:s,yAxisKey:"avg",xAxisKey:"timestamp",displayDateInUtc:!0})},"TopApiRoutesRenderer",0,e=>{let[a,s]=(0,o.useState)(!1),n="text-xs! py-2! p-0 font-bold bg-surface-200! border-x-0! rounded-none!",r="text-xs! py-2! border-x-0! rounded-none! align-middle";return 0===e.data.length?null:(0,t.jsxs)(u.Collapsible,{children:[(0,t.jsx)(R.default,{className:"rounded-t-none",head:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(R.default.th,{className:n,children:"Request"}),(0,t.jsx)(R.default.th,{className:n+" text-right",children:"Count"}),void 0!==e.data[0].avg&&(0,t.jsx)(R.default.th,{className:n+" text-right",children:"Avg"})]}),body:(0,t.jsx)(t.Fragment,{children:e.data.map((s,n)=>(0,t.jsx)(o.Fragment,{children:(0,t.jsx)(R.default.tr,{className:["p-0 transition transform cursor-pointer hover:bg-surface-200",a&&n>=3?"w-full h-full opacity-100":"",!a&&n>=3?" w-0 h-0 translate-y-10 opacity-0":""].join(" "),children:!a&&n<3||a?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(R.default.td,{className:[r].join(" "),children:(0,t.jsx)(O,{...s})}),(0,t.jsx)(R.default.td,{className:[r,"text-right align-top"].join(" "),children:s.count}),void 0!==e.data[0].avg&&(0,t.jsxs)(R.default.td,{className:[r,"text-right align-top"].join(" "),children:[Number(s.avg).toFixed(2),"ms"]})]}):null})},n+s.method+s.path+(s.search||"")))})}),(0,t.jsx)(u.Collapsible.Trigger,{asChild:!0,children:(0,t.jsx)("div",{className:"flex flex-row justify-end w-full gap-2 p-1",children:(0,t.jsx)(m.Button,{type:"text",onClick:()=>s(!a),className:["transition",a?"text-foreground":"text-foreground-lighter",e.data.length<=3?"hidden":""].join(" "),children:a?"Show less":"Show more"})})})]})},"TotalRequestsChartRenderer",0,e=>{let a=e.data.reduce((e,t)=>e+t.count,0),{data:s,error:n,isError:r}=(0,k.useFillTimeseriesSorted)({data:e.data,timestampKey:"timestamp",valueKey:"count",defaultValue:0,startDate:e.params?.iso_timestamp_start,endDate:e.params?.iso_timestamp_end});if(e.error){let a="string"==typeof e.error?{message:e.error}:e.error;return(0,t.jsx)(M.default,{subject:"Failed to retrieve total requests",error:a})}return r?(0,t.jsxs)(i.Alert_Shadcn_,{variant:"warning",children:[(0,t.jsx)(g.WarningIcon,{}),(0,t.jsx)(d.AlertTitle_Shadcn_,{children:"Failed to retrieve total requests"}),(0,t.jsx)(c.AlertDescription_Shadcn_,{children:n?.message??"Unknown error"})]}):(0,t.jsx)(w.default,{size:"small",minimalHeader:!0,highlightedValue:a,className:"w-full",data:s,yAxisKey:"count",xAxisKey:"timestamp",displayDateInUtc:!0})}],529620)},768162,e=>{"use strict";var t=e.i(478902),a=e.i(767073);e.i(128328);var s=e.i(158639);e.i(481541);var n=e.i(755191),r=e.i(41941),o=e.i(499536),l=e.i(88816),i=e.i(667042),c=e.i(952786),d=e.i(544197),m=e.i(61187),u=e.i(975924),p=e.i(389959),h=e.i(310474),_=e.i(837710),g=e.i(843778),x=e.i(874311),f=e.i(378277),y=e.i(449123),b=e.i(451031),S=e.i(57492),j=e.i(831927),v=e.i(156722),A=e.i(719754),C=e.i(538482),T=e.i(748356),N=e.i(215312),E=e.i(282492),q=e.i(330287),R=e.i(10429);let M=[{key:"rest",filterKey:"request.path",filterValue:"/rest",label:"Data API (PostgREST)",icon:i.Database},{key:"auth",filterKey:"request.path",filterValue:"/auth",label:"Auth",icon:n.Auth},{key:"storage",filterKey:"request.path",filterValue:"/storage",label:"Storage",icon:o.Storage},{key:"realtime",filterKey:"request.path",filterValue:"/realtime",label:"Realtime",icon:r.Realtime},{key:"graphql",filterKey:"request.path",filterValue:"/graphql",label:"GraphQL (pg_graphql)",icon:null}];e.s(["default",0,({filters:e,isLoading:n=!1,onAddFilter:r,onDatepickerChange:o,hideDatepicker:i=!1,onRemoveFilters:w,onRefresh:I,datepickerHelpers:k,initialDatePickerValue:L,className:O,selectedProduct:D,showDatabaseSelector:F=!0})=>{let{ref:P}=(0,s.useParams)(),{data:B}=(0,q.useLoadBalancersQuery)({projectRef:P}),G=["request.path","request.method","request.search","request.headers.x_client_info","request.headers.user_agent","response.status_code"],[K,H]=(0,p.useState)(!1),[U,$]=(0,p.useState)(null),[V,Y]=(0,p.useState)({key:G[0],compare:"is",value:""}),W=async e=>{w(M.map(e=>({key:e.filterKey,compare:"matches",value:e.filterValue}))),e&&r({key:e.filterKey,compare:"matches",value:e.filterValue}),$(e)};(0,p.useEffect)(()=>{D&&W(M.find(e=>e.key===D)??null)},[]);let[z,Q]=(0,p.useState)((()=>{if(L)return L;let e=k.find(e=>e.default)||k[0];return{to:e.calcTo(),from:e.calcFrom(),isHelper:!0,text:e.text}})());return(0,p.useEffect)(()=>{L&&Q(L)},[L]),(0,t.jsxs)("div",{className:(0,g.cn)("flex items-center justify-between",O),children:[(0,t.jsxs)("div",{className:"flex flex-row justify-start items-center flex-wrap gap-2",children:[I&&(0,t.jsx)(N.ButtonTooltip,{type:"default",disabled:n,icon:(0,t.jsx)(m.RefreshCw,{className:n?"animate-spin":""}),className:"w-7",tooltip:{content:{side:"bottom",text:"Refresh report"}},onClick:()=>I()}),!i&&(0,t.jsx)(T.LogsDatePicker,{onSubmit:e=>{o&&o(e),Q(e)},value:z,helpers:k}),!D&&(0,t.jsxs)(x.DropdownMenu,{children:[(0,t.jsx)(x.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(_.Button,{type:"default",className:"inline-flex flex-row gap-2",iconRight:(0,t.jsx)(l.ChevronDown,{size:14}),children:(0,t.jsx)("span",{children:null===U?"All Requests":U.label})})}),(0,t.jsxs)(x.DropdownMenuContent,{side:"bottom",align:"start",children:[(0,t.jsxs)(x.DropdownMenuItem,{onClick:()=>W(null),children:[(0,t.jsx)(c.Network,{size:14,strokeWidth:1.5,className:"mr-2"}),"All Requests"]}),(0,t.jsx)(x.DropdownMenuSeparator,{}),M.map(e=>{let a=e.icon;return(0,t.jsxs)(x.DropdownMenuItem,{className:"space-x-2",disabled:e.key===U?.key,onClick:()=>W(e),children:["graphql"===e.key?(0,t.jsx)(h.default,{src:`${R.BASE_PATH}/img/graphql.svg`,className:"w-[14px] h-[14px] mr-2",preProcessor:e=>e.replace(/svg/,'svg class="m-auto text-color-inherit"')}):null!==a?(0,t.jsx)(a,{size:14,strokeWidth:1.5,className:"mr-2"}):null,(0,t.jsx)("div",{className:"flex flex-col",children:(0,t.jsx)("p",{className:(0,g.cn)(e.key===U?.key?"font-bold":"","inline-block"),children:e.label})})]},e.key)})]})]}),e.filter(e=>e.value!==U?.filterValue||e.key!==U?.filterKey).map(e=>(0,t.jsxs)("div",{className:"text-xs rounded-md font-mono bg-surface-300 px-2 h-[26px] flex flex-row justify-center gap-1 items-center",children:[(0,t.jsx)("span",{className:"",children:e.key}),(0,t.jsx)("span",{className:"text-foreground-lighter",children:e.compare}),(0,t.jsx)("span",{className:"",children:e.value}),(0,t.jsx)(_.Button,{type:"text",size:"tiny",className:"p-0! space-x-0!",onClick:()=>w([e]),icon:(0,t.jsx)(u.X,{className:"text-foreground-light"}),children:(0,t.jsx)("span",{className:"sr-only",children:"Remove"})})]},`${e.key}-${e.compare}-${e.value}`)),(0,t.jsxs)(a.Popover,{open:K,onOpenChange:e=>H(e),children:[(0,t.jsx)(a.PopoverTrigger,{children:(0,t.jsx)(_.Button,{asChild:!0,type:"default",size:"tiny",icon:(0,t.jsx)(d.Plus,{className:"text-foreground-light "}),children:(0,t.jsx)("span",{children:"Add filter"})})}),(0,t.jsxs)(a.PopoverContent,{align:e.length>0?"end":"start",className:"p-0 w-60",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-3 p-3",children:[(0,t.jsx)(C.FormItemLayout,{isReactForm:!1,layout:"vertical",label:"Attribute Filter",className:"gap-[2px]",size:"tiny",children:(0,t.jsxs)(y.Select_Shadcn_,{value:V.key,onValueChange:e=>Y(t=>({...t,key:e})),children:[(0,t.jsx)(v.SelectTrigger_Shadcn_,{children:(0,t.jsx)(A.SelectValue_Shadcn_,{placeholder:"---"})}),(0,t.jsx)(b.SelectContent_Shadcn_,{children:(0,t.jsx)(S.SelectGroup_Shadcn_,{children:G.map(e=>(0,t.jsx)(j.SelectItem_Shadcn_,{value:e,children:e},e))})})]})}),(0,t.jsx)(C.FormItemLayout,{isReactForm:!1,layout:"vertical",label:"Comparison",className:"gap-[2px]",size:"tiny",children:(0,t.jsxs)(y.Select_Shadcn_,{value:V.compare,onValueChange:e=>Y(t=>({...t,compare:e})),children:[(0,t.jsx)(v.SelectTrigger_Shadcn_,{children:(0,t.jsx)(A.SelectValue_Shadcn_,{placeholder:"---"})}),(0,t.jsx)(b.SelectContent_Shadcn_,{children:(0,t.jsx)(S.SelectGroup_Shadcn_,{children:["is","matches"].map(e=>(0,t.jsx)(j.SelectItem_Shadcn_,{value:e,children:e},e))})})]})}),(0,t.jsx)(C.FormItemLayout,{isReactForm:!1,layout:"vertical",label:"Value",className:"gap-[2px]",size:"tiny",children:(0,t.jsx)(f.Input_Shadcn_,{placeholder:"matches"===V.compare?"Provide a regex expression":"Provide a string",value:V.value,onChange:e=>{Y(t=>({...t,value:e.target.value}))}})})]}),(0,t.jsx)("div",{className:"flex items-center justify-end gap-2 border-t border-default p-2",children:(0,t.jsx)(_.Button,{type:"primary",size:"tiny",onClick:()=>{r(V),H(!1),Y({key:G[0],compare:"is",value:""})},children:"Add filter"})})]})]})]}),F&&(0,t.jsx)(E.DatabaseSelector,{additionalOptions:(B??[]).length>0?[{id:`${P}-all`,name:"API Load Balancer"}]:[]})]})}])}]);