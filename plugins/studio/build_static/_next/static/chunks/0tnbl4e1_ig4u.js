(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,102703,e=>{"use strict";var t=e.i(478902),s=e.i(17203),a=e.i(180148),r=e.i(699879),n=e.i(345594),o=e.i(389959),i=e.i(837710);let l=(0,o.forwardRef)(({icon:e,title:l,description:u,url:c,urlLabel:m="Read more",defaultVisibility:_=!1,hideCollapse:d=!1,button:p,className:h="",block:g=!1},f)=>{let[b,y]=(0,o.useState)(_);return(0,t.jsx)("div",{ref:f,role:"alert",className:`${g?"block w-full":""}
      block w-full rounded-md border bg-surface-300/25 py-3 ${h}`,children:(0,t.jsxs)("div",{className:"flex flex-col px-4",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between",children:[(0,t.jsxs)("div",{className:"flex w-full space-x-3 items-center",children:[e&&(0,t.jsx)("span",{className:"text-foreground-lighter",children:e}),(0,t.jsx)("div",{className:"grow",children:(0,t.jsx)("h5",{className:"text-foreground",children:l})})]}),u&&!d?(0,t.jsx)("div",{className:"cursor-pointer text-foreground-lighter",onClick:()=>y(!b),children:b?(0,t.jsx)(r.Minimize2,{size:14,strokeWidth:1.5}):(0,t.jsx)(a.Maximize2,{size:14,strokeWidth:1.5})}):null]}),(u||c||p)&&(0,t.jsxs)("div",{className:`flex flex-col space-y-3 overflow-hidden transition-all ${b?"mt-3":""}`,style:{maxHeight:500*!!b},children:[(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:u}),c&&(0,t.jsx)("div",{children:(0,t.jsx)(i.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(s.ExternalLink,{}),children:(0,t.jsx)(n.default,{href:c,target:"_blank",rel:"noreferrer",children:m})})}),p&&(0,t.jsx)("div",{children:p})]})]})})});l.displayName="InformationBox",e.s(["default",0,l])},101369,e=>{"use strict";var t=e.i(478902),s=e.i(843778);let a=({max:e=100,value:a=0,barClass:r="bg-foreground",bgClass:n="",type:o="vertical",borderClass:i="",labelBottom:l="",labelBottomClass:u="tabular-nums",labelTop:c="",labelTopClass:m=""})=>{if("horizontal"===o){let o=Number(a/e*100),_=`${o}%`,d=l||c;return(0,t.jsxs)("div",{className:"flex flex-col w-full",children:[d&&(0,t.jsxs)("div",{className:"flex align-baseline justify-between pb-1 space-x-8",children:[(0,t.jsx)("p",{className:(0,s.cn)("text-foreground text-sm truncate capitalize-sentence",c.length>0&&"max-w-[75%]",u),children:l}),(0,t.jsx)("p",{className:(0,s.cn)("text-foreground-light text-sm",m),children:c})]}),(0,t.jsx)("div",{className:`relative rounded-sm h-1 overflow-hidden w-full border p-0 ${n||"bg-surface-400"} ${i||"border-none"}`,children:(0,t.jsx)("div",{className:`absolute rounded-sm inset-x-0 bottom-0 h-1 ${r} transition-all`,style:{width:_}})})]})}{let s=Number(a/e*35);return s<2&&(s=2),(0,t.jsx)("div",{className:`relative rounded-sm w-5 overflow-hidden border p-1 ${n||"bg-gray-400"} ${i||"border-none"}`,style:{height:35},children:(0,t.jsx)("div",{className:`absolute inset-x-0 bottom-0 w-5 ${r}`,style:{height:s}})})}};e.s(["SparkBar",0,a,"default",0,a])},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],i={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),o=!n&&r?e.value:`'${e.value}'`,i=!n&&String(o).toLowerCase(),l=n?e.value:i;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},u={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,i,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,u,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),o=e.i(189329);e.s(["default",0,({sql:e,params:i=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:u})=>{let{data:c}=(0,n.useSelectedProjectQuery)(),m=(0,o.useDatabaseSelectorStateSnapshot)(),{data:_}=(0,a.useReadReplicasQuery)({projectRef:c?.ref}),d=(_||[]).find(e=>e.identifier===m.selectedDatabaseId)?.connectionString,p=m.selectedDatabaseId,h="function"==typeof e?e([]):e,{data:g,error:f,isPending:b,isRefetching:y,refetch:q}=(0,t.useQuery)({queryKey:["projects",c?.ref,"db",{...i,sql:h,identifier:p},l,u],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:c?.ref,connectionString:d||c?.connectionString,sql:h},e).then(e=>e.result),enabled:!!h,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:f||("object"==typeof g?g?.error:""),data:g,isLoading:b,isRefetching:y,params:i,runQuery:q,resolvedSql:h}}])},769105,e=>{"use strict";var t=e.i(479084),s=e.i(867088),a=e.i(356003),r=e.i(820308),n=e.i(775159),o=e.i(150671),i=e.i(714403),l=e.i(749199),u=e.i(635494),c=e.i(10429),m=e.i(189329);let _=new Set(["query","rolname","total_time","prop_total_time","calls","avg_rows","max_time","mean_time","min_time"]);function d({preset:e,orderBy:s,searchQuery:a="",roles:o=[],sources:i=[],minCalls:l=0,minTotalTime:u=0,runIndexAdvisor:c=!1,filterIndexAdvisor:m=!1,page:p=1,pageSize:h=20}){let g=Number.isFinite(p)?Math.max(1,Math.floor(p)):1,f=Number.isFinite(h)?Math.min(Math.max(1,Math.floor(h)),100):20,b=r.PRESET_CONFIG[n.Presets.QUERY_PERFORMANCE].queries[e],y=null!=s&&_.has(s.column)&&("asc"===s.order||"desc"===s.order)?`ORDER BY ${(0,t.ident)(s.column)} ${s.order}`:void 0,q=[];o.length>0&&q.push(`auth.rolname in (${o.map(e=>`${(0,t.literal)(e)}`).join(", ")})`),a.length>0&&q.push(`statements.query ~* ${(0,t.literal)(a)}`),i.includes("dashboard")&&!i.includes("non-dashboard")&&q.push("statements.query ~* 'source: dashboard'"),i.includes("non-dashboard")&&!i.includes("dashboard")&&q.push("statements.query !~* 'source: dashboard'"),Number.isFinite(l)&&l>0&&q.push(`statements.calls >= ${l}`),Number.isFinite(u)&&u>0&&q.push(`(statements.total_exec_time + statements.total_plan_time) >= ${u}`);let E=q.join(" AND ");return{sql:b.sql([],E.length>0?`WHERE ${E}`:void 0,y,c,m,g,f),whereSql:E,orderBySql:y}}e.s(["useQueryPerformanceInfiniteQuery",0,e=>{let t=(0,a.useQueryClient)(),{data:r}=(0,u.useSelectedProjectQuery)(),n=(0,m.useDatabaseSelectorStateSnapshot)(),{data:l}=(0,o.useReadReplicasQuery)({projectRef:r?.ref}),_=(l||[]).find(e=>e.identifier===n.selectedDatabaseId)?.connectionString,p=e.pageSize,h=Number.isFinite(p)?Math.min(Math.max(1,Math.floor(p)),100):20,{sql:g}=d({...e,page:1,pageSize:h}),f=n.selectedDatabaseId&&n.selectedDatabaseId!==r?.ref?_:_??r?.connectionString,{data:b,isPending:y,isRefetching:q,isFetchingNextPage:E,hasNextPage:S,error:x,fetchNextPage:$}=(0,s.useInfiniteQuery)({queryKey:["projects",r?.ref,"query-performance-infinite",{...e,pageSize:h,identifier:n.selectedDatabaseId,connectionString:f}],initialPageParam:1,queryFn:({pageParam:t,signal:s})=>{let{sql:a}=d({...e,page:t,pageSize:h});return(0,i.executeSql)({projectRef:r?.ref,connectionString:f,sql:a},s).then(e=>e.result)},getNextPageParam:(e,t)=>e.length<h?void 0:t.length+1,enabled:!!r?.ref&&(!c.IS_PLATFORM||!!f),refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{data:b?.pages.flatMap(e=>e)??void 0,isLoading:y,isRefetching:q,isFetchingNextPage:E,hasNextPage:S??!1,error:x,fetchNextPage:$,refetch:()=>t.resetQueries({queryKey:["projects",r?.ref,"query-performance-infinite"],exact:!1}),resolvedSql:g}},"useQueryPerformanceQuery",0,e=>{let{sql:t,whereSql:s,orderBySql:a}=d(e);return(0,l.default)({sql:t,params:void 0,where:s,orderBy:a})}])},569033,e=>{"use strict";e.i(128328);var t=e.i(947748),s=e.i(124416);let a=()=>{let[e,a]=(0,s.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_INLINE_EDITOR,!1);return{inlineEditorEnabled:e??!1,setInlineEditorEnabled:a}},r=()=>{let[e,a]=(0,s.useLocalStorageQuery)(t.LOCAL_STORAGE_KEYS.UI_PREVIEW_QUEUE_OPERATIONS,!1);return{isQueueOperationsEnabled:e??!1,setIsQueueOperationsEnabled:a}};e.s(["useIsInlineEditorEnabled",0,()=>{let{inlineEditorEnabled:e}=a();return e??!1},"useIsInlineEditorSetting",0,a,"useIsQueueOperationsEnabled",0,()=>{let{isQueueOperationsEnabled:e}=r();return e??!1},"useIsQueueOperationsSetting",0,r])},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),s=e.i(242882),a=e.i(818135),r=e.i(714403);let n=t.default.tablePrivileges.list();async function o({projectRef:e,connectionString:t},s){let{result:a}=await (0,r.executeSql)({projectRef:e,connectionString:t,sql:n.sql,queryKey:["table-privileges"]},s);return a}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:a.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...n}={})=>(0,s.useQuery)({queryKey:a.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:s})=>o({projectRef:e,connectionString:t},s),enabled:r&&void 0!==e,...n})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],s=["SELECT","INSERT","UPDATE","DELETE"],a={anon:[...s],authenticated:[...s],service_role:[...s]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,s,"DEFAULT_DATA_API_PRIVILEGES",0,a,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>s.includes(e)])},188698,e=>{"use strict";e.s(["getConnectionStrings",0,({connectionInfo:e,poolingInfo:t,metadata:s})=>{let a=t?.connectionString.includes("options=reference"),{projectRef:r}=s,n="[YOUR-PASSWORD]",o=e.db_user,i=e.db_port,l=e.db_host,u=e.db_name,c=t?.db_user,m=t?.db_port,_=t?.db_host,d=t?.db_name,p=a?`psql "postgresql://${o}:${n}@${l}:${i}/${u}"`:`psql -h ${l} -p ${i} -d ${u} -U ${o}`,h=`postgresql://${o}:${n}@${l}:${i}/${u}`,g=`DATABASE_URL=${h}`,f=`jdbc:postgresql://${l}:${i}/${u}?user=${o}&password=${n}`,b=`{
  "ConnectionStrings": {
    "DefaultConnection": "Host=${l};Database=${u};Username=${o};Password=${n};SSL Mode=Require;Trust Server Certificate=true"
  }
}`,y=`{
  "ConnectionStrings": {
    "DefaultConnection": "User Id=${c};Password=${n};Server=${_};Port=${m};Database=${d}${a?`;Options='reference=${r}'`:""}"
  }
}`,q=`DATABASE_URL=${h}`,E=a?`psql "postgresql://${c}:${n}@${_}:${m}/${d}?options=reference%3D${r}"`:`psql -h ${_} -p ${m} -d ${d} -U ${c}`,S=t?.connectionString??"",x=`DATABASE_URL=${t?.connectionString}`,$=`user=${c} 
password=${n} 
host=${_}
port=${m}
dbname=${d}${a?`options=reference=${r}`:""}`,v=`jdbc:postgresql://${_}:${m}/${d}?user=${c}${a?`&options=reference%3D${r}`:""}&password=${n}`;return{direct:{psql:p,uri:h,golang:g,jdbc:f,dotnet:b,nodejs:q,php:g,python:g,sqlalchemy:`user=${o} 
password=${n} 
host=${l} 
port=${i} 
dbname=${u}`},pooler:{psql:E,uri:S,golang:$,jdbc:v,dotnet:y,nodejs:x,php:$,python:$,sqlalchemy:`user=${c} 
password=${n} 
host=${_} 
port=${m} 
dbname=${d}`}}}])}]);