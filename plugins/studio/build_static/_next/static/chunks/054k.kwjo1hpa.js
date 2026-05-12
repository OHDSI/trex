(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,245049,e=>{"use strict";var t=e.i(478902),s=e.i(975924),a=e.i(505859),r=e.i(938933);function n({align:e="center",ariaLabel:s,arrow:i=!1,children:o,className:l,defaultOpen:c=!1,modal:u,onOpenChange:d,open:m,overlay:_,side:p="bottom",sideOffset:f=6,style:h,header:g,footer:b,size:y="content",disabled:E,"data-testid":v}){let S=(0,r.default)("popover"),q=[S.content,S.size[y]];return l&&q.push(l),(0,t.jsxs)(a.Popover.Root,{defaultOpen:c,modal:u,onOpenChange:d,open:m,children:[(0,t.jsx)(a.Popover.Trigger,{disabled:E,className:S.trigger,"aria-label":s,"data-testid":v,children:o}),(0,t.jsx)(a.Popover.Portal,{children:(0,t.jsxs)(a.Popover.Content,{sideOffset:f,side:p,align:e,className:q.join(" "),style:h,children:[i&&(0,t.jsx)(a.Popover.Arrow,{offset:10}),g&&(0,t.jsx)("div",{className:S.header,children:g}),_,b&&(0,t.jsx)("div",{className:S.footer,children:b})]})})]})}n.Separator=function(){let e=(0,r.default)("popover");return(0,t.jsx)("div",{className:e.separator})},n.Close=function(){let e=(0,r.default)("popover");return(0,t.jsx)(a.Popover.Close,{className:e.close,children:(0,t.jsx)(s.X,{size:14,strokeWidth:2})})},e.s(["default",0,n])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},1962,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(274664),r=e.i(546595),n="Progress",[i,o]=(0,a.createContextScope)(n),[l,c]=i(n),u=s.forwardRef((e,s)=>{var a,n;let{__scopeProgress:i,value:o=null,max:c,getValueLabel:u=_,...d}=e;(c||0===c)&&!h(c)&&console.error((a=`${c}`,`Invalid prop \`max\` of value \`${a}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let m=h(c)?c:100;null===o||g(o,m)||console.error((n=`${o}`,`Invalid prop \`value\` of value \`${n}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let b=g(o,m)?o:null,y=f(b)?u(b,m):void 0;return(0,t.jsx)(l,{scope:i,value:b,max:m,children:(0,t.jsx)(r.Primitive.div,{"aria-valuemax":m,"aria-valuemin":0,"aria-valuenow":f(b)?b:void 0,"aria-valuetext":y,role:"progressbar","data-state":p(b,m),"data-value":b??void 0,"data-max":m,...d,ref:s})})});u.displayName=n;var d="ProgressIndicator",m=s.forwardRef((e,s)=>{let{__scopeProgress:a,...n}=e,i=c(d,a);return(0,t.jsx)(r.Primitive.div,{"data-state":p(i.value,i.max),"data-value":i.value??void 0,"data-max":i.max,...n,ref:s})});function _(e,t){return`${Math.round(e/t*100)}%`}function p(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function f(e){return"number"==typeof e}function h(e){return f(e)&&!isNaN(e)&&e>0}function g(e,t){return f(e)&&!isNaN(e)&&e<=t&&e>=0}m.displayName=d,e.s(["Indicator",0,m,"Progress",0,u,"ProgressIndicator",0,m,"Root",0,u,"createProgressScope",0,o],386108);var b=e.i(386108),b=b,y=e.i(843778);let E=s.forwardRef(({className:e,value:s,...a},r)=>(0,t.jsx)(b.Root,{ref:r,className:(0,y.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...a,children:(0,t.jsx)(b.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(s||0)}%)`}})}));E.displayName=b.Root.displayName,e.s(["Progress",0,E],1962)},474325,e=>{"use strict";var t=e.i(478902),s=e.i(774803),a=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:r,action:n,message:i,description:o="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(s.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:i}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[r||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(a.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:o}),n]})]})]})])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(38429),a=e.i(356003),r=e.i(355901),n=e.i(667286),i=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:i=!1,createSchema:c=!1}){let u=new Headers;s&&u.set("x-connection-encrypted",s);let d=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:i,createSchema:c}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:s,sql:d,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let c=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([c.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:i.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...o})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),s=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:a,indexStatements:r,onSuccess:i,onError:o}){if(!e){let e=Error("Project ref is required");return o&&o(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return o&&o(e),Promise.reject(e)}try{return await (0,s.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),i&&i(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),o&&o(e),Promise.reject(e)}}function i(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!a.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=i(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,i,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var o=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,o.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=r(t??[]),n=!!s&&!!a,i=n&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:i}}],888525);var c=e.i(478902),u=e.i(389959),d=e.i(232520),m=e.i(837710),_=e.i(610144),p=e.i(967052);let f=({open:e,setOpen:s})=>{let a=(0,p.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:i}=(0,o.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:u,indexAdvisor:m}=r(i),{mutateAsync:f,isPending:h}=(0,_.useDatabaseExtensionEnableMutation)(),g=async()=>{if(void 0===n)return t.toast.error("Project is required");try{u?.installed_version===null&&await f({projectRef:n?.ref,connectionString:n?.connectionString,name:u.name,schema:u?.schema??"extensions",version:u.default_version}),m?.installed_version===null&&await f({projectRef:n?.ref,connectionString:n?.connectionString,name:m.name,schema:m?.schema??"extensions",version:m.default_version}),t.toast.success("Successfully enabled Index Advisor!"),s(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(d.AlertDialog,{open:e,onOpenChange:()=>s(!e),children:(0,c.jsxs)(d.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(d.AlertDialogHeader,{children:[(0,c.jsx)(d.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(d.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(d.AlertDialogFooter,{children:[(0,c.jsx)(d.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(d.AlertDialogAction,{onClick:e=>{e.preventDefault(),g(),a("index_advisor_dialog_enable_button_clicked")},disabled:h,children:h?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,p.useTrack)(),[t,s]=(0,u.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(m.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(f,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,f],284399)},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let i=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],o={iso_timestamp_start:i[0].calcFrom(),iso_timestamp_end:i[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),i=!n&&r?e.value:`'${e.value}'`,o=!n&&String(i).toLowerCase(),l=n?e.value:o;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},c={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
  from pg_statio_user_tables;`},unified:{queryType:"db",sql:(e,t,s,a=!1,r=!1,n=1,i=20)=>{let o=(n-1)*i,l=r&&a?o+10*i:o+i,c=a?Math.min(l,500):l;return`
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
        limit ${i} offset ${o}`}},slowQueriesCount:{queryType:"db",sql:()=>`
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,o,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,c,"REPORTS_DATEPICKER_HELPERS",0,i,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),i=e.i(189329);e.s(["default",0,({sql:e,params:o=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:c})=>{let{data:u}=(0,n.useSelectedProjectQuery)(),d=(0,i.useDatabaseSelectorStateSnapshot)(),{data:m}=(0,a.useReadReplicasQuery)({projectRef:u?.ref}),_=(m||[]).find(e=>e.identifier===d.selectedDatabaseId)?.connectionString,p=d.selectedDatabaseId,f="function"==typeof e?e([]):e,{data:h,error:g,isPending:b,isRefetching:y,refetch:E}=(0,t.useQuery)({queryKey:["projects",u?.ref,"db",{...o,sql:f,identifier:p},l,c],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:u?.ref,connectionString:_||u?.connectionString,sql:f},e).then(e=>e.result),enabled:!!f,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:g||("object"==typeof h?h?.error:""),data:h,isLoading:b,isRefetching:y,params:o,runQuery:E,resolvedSql:f}}])},937357,e=>{"use strict";e.s(["databaseIndexesKeys",0,{list:(e,t)=>["projects",e,"database-indexes",t].filter(Boolean)}])},503256,e=>{"use strict";var t=e.i(389959);let s=t.forwardRef(function({title:e,titleId:s,...a},r){return t.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:r,"aria-labelledby":s},a),e?t.createElement("title",{id:s},e):null,t.createElement("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"}))});e.s(["InformationCircleIcon",0,s],503256)},769105,e=>{"use strict";var t=e.i(479084),s=e.i(867088),a=e.i(356003),r=e.i(820308),n=e.i(775159),i=e.i(150671),o=e.i(714403),l=e.i(749199),c=e.i(635494),u=e.i(10429),d=e.i(189329);let m=new Set(["query","rolname","total_time","prop_total_time","calls","avg_rows","max_time","mean_time","min_time"]);function _({preset:e,orderBy:s,searchQuery:a="",roles:i=[],sources:o=[],minCalls:l=0,minTotalTime:c=0,runIndexAdvisor:u=!1,filterIndexAdvisor:d=!1,page:p=1,pageSize:f=20}){let h=Number.isFinite(p)?Math.max(1,Math.floor(p)):1,g=Number.isFinite(f)?Math.min(Math.max(1,Math.floor(f)),100):20,b=r.PRESET_CONFIG[n.Presets.QUERY_PERFORMANCE].queries[e],y=null!=s&&m.has(s.column)&&("asc"===s.order||"desc"===s.order)?`ORDER BY ${(0,t.ident)(s.column)} ${s.order}`:void 0,E=[];i.length>0&&E.push(`auth.rolname in (${i.map(e=>`${(0,t.literal)(e)}`).join(", ")})`),a.length>0&&E.push(`statements.query ~* ${(0,t.literal)(a)}`),o.includes("dashboard")&&!o.includes("non-dashboard")&&E.push("statements.query ~* 'source: dashboard'"),o.includes("non-dashboard")&&!o.includes("dashboard")&&E.push("statements.query !~* 'source: dashboard'"),Number.isFinite(l)&&l>0&&E.push(`statements.calls >= ${l}`),Number.isFinite(c)&&c>0&&E.push(`(statements.total_exec_time + statements.total_plan_time) >= ${c}`);let v=E.join(" AND ");return{sql:b.sql([],v.length>0?`WHERE ${v}`:void 0,y,u,d,h,g),whereSql:v,orderBySql:y}}e.s(["useQueryPerformanceInfiniteQuery",0,e=>{let t=(0,a.useQueryClient)(),{data:r}=(0,c.useSelectedProjectQuery)(),n=(0,d.useDatabaseSelectorStateSnapshot)(),{data:l}=(0,i.useReadReplicasQuery)({projectRef:r?.ref}),m=(l||[]).find(e=>e.identifier===n.selectedDatabaseId)?.connectionString,p=e.pageSize,f=Number.isFinite(p)?Math.min(Math.max(1,Math.floor(p)),100):20,{sql:h}=_({...e,page:1,pageSize:f}),g=n.selectedDatabaseId&&n.selectedDatabaseId!==r?.ref?m:m??r?.connectionString,{data:b,isPending:y,isRefetching:E,isFetchingNextPage:v,hasNextPage:S,error:q,fetchNextPage:x}=(0,s.useInfiniteQuery)({queryKey:["projects",r?.ref,"query-performance-infinite",{...e,pageSize:f,identifier:n.selectedDatabaseId,connectionString:g}],initialPageParam:1,queryFn:({pageParam:t,signal:s})=>{let{sql:a}=_({...e,page:t,pageSize:f});return(0,o.executeSql)({projectRef:r?.ref,connectionString:g,sql:a},s).then(e=>e.result)},getNextPageParam:(e,t)=>e.length<f?void 0:t.length+1,enabled:!!r?.ref&&(!u.IS_PLATFORM||!!g),refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{data:b?.pages.flatMap(e=>e)??void 0,isLoading:y,isRefetching:E,isFetchingNextPage:v,hasNextPage:S??!1,error:q,fetchNextPage:x,refetch:()=>t.resetQueries({queryKey:["projects",r?.ref,"query-performance-infinite"],exact:!1}),resolvedSql:h}},"useQueryPerformanceQuery",0,e=>{let{sql:t,whereSql:s,orderBySql:a}=_(e);return(0,l.default)({sql:t,params:void 0,where:s,orderBy:a})}])},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let s=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:s,sourceTableSchema:a})=>`INSERT INTO ${(0,t.ident)(a)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(a)}.${(0,t.ident)(s)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:s,sourceTableName:a,sourceTableSchema:r})=>[`CREATE TABLE ${(0,t.ident)(r)}.${(0,t.ident)(s)} (LIKE ${(0,t.ident)(r)}.${(0,t.ident)(a)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(r)}.${(0,t.ident)(s)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,s],664304);var a=e.i(180141),r=e.i(242882),n=e.i(938343),i=e.i(714403);async function o({projectRef:e,connectionString:t,id:a},r){if(!a)throw Error("id is required");let n=s({id:a}),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["table-editor",a]},r);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:s})=>(0,a.queryOptions)({queryKey:n.tableEditorKeys.tableEditor(e,s),queryFn:({signal:a})=>o({projectRef:e,connectionString:t,id:s},a)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:s,id:a}){return e.fetchQuery(l({projectRef:t,connectionString:s,id:a}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:s},{enabled:a=!0,...n}={})=>(0,r.useQuery)({...l({projectRef:e,connectionString:t,id:s}),enabled:a&&void 0!==e&&void 0!==s&&!isNaN(s),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...n})],34479)},818135,e=>{"use strict";e.s(["privilegeKeys",0,{tablePrivilegesList:e=>["projects",e,"database","table-privileges"],columnPrivilegesList:e=>["projects",e,"database","column-privileges"],exposedTablesInfinite:(e,t)=>["projects",e,"privileges","exposed-tables-infinite",...t?[{search:t}]:[]],exposedTableCounts:(e,t)=>["projects",e,"privileges","exposed-table-counts",...t?[t]:[]],exposedFunctionsInfinite:(e,t)=>["projects",e,"privileges","exposed-functions-infinite",...t?[{search:t}]:[]],exposedFunctionCounts:(e,t)=>["projects",e,"privileges","exposed-function-counts",...t?[t]:[]],defaultPrivileges:(e,t)=>["projects",e,"privileges","default-privileges",...t?[t]:[]]}])},972089,e=>{"use strict";var t=e.i(850036),s=e.i(242882),a=e.i(818135),r=e.i(714403);let n=t.default.tablePrivileges.list();async function i({projectRef:e,connectionString:t},s){let{result:a}=await (0,r.executeSql)({projectRef:e,connectionString:t,sql:n.sql,queryKey:["table-privileges"]},s);return a}e.s(["invalidateTablePrivilegesQuery",0,function(e,t){return e.invalidateQueries({queryKey:a.privilegeKeys.tablePrivilegesList(t)})},"useTablePrivilegesQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...n}={})=>(0,s.useQuery)({queryKey:a.privilegeKeys.tablePrivilegesList(e),queryFn:({signal:s})=>i({projectRef:e,connectionString:t},s),enabled:r&&void 0!==e,...n})])},84001,e=>{"use strict";let t=["anon","authenticated","service_role"],s=["SELECT","INSERT","UPDATE","DELETE"],a={anon:[...s],authenticated:[...s],service_role:[...s]};e.s(["API_ACCESS_ROLES",0,t,"API_PRIVILEGE_TYPES",0,s,"DEFAULT_DATA_API_PRIVILEGES",0,a,"EMPTY_DATA_API_PRIVILEGES",0,{anon:[],authenticated:[],service_role:[]},"checkDataApiPrivilegesNonEmpty",0,e=>!!e&&Object.values(e).some(e=>e.length>0),"isApiAccessRole",0,e=>t.includes(e),"isApiPrivilegeType",0,e=>s.includes(e)])},310959,e=>{"use strict";var t=e.i(479084),s=e.i(721490);let a=10240,r=50,n=[t.safeSql`text`,t.safeSql`varchar`,t.safeSql`char`,t.safeSql`character varying`,t.safeSql`character`],i=[t.safeSql`json`,t.safeSql`jsonb`],o=new Set(i),l=new Set([...n,...i,t.safeSql`bytea`,t.safeSql`xml`,t.safeSql`hstore`,t.safeSql`clob`,t.safeSql`vector`,t.safeSql`geometry`,t.safeSql`geography`,t.safeSql`tsvector`,t.safeSql`tsquery`,t.safeSql`daterange`,t.safeSql`tsrange`,t.safeSql`tstzrange`,t.safeSql`numrange`,t.safeSql`int4range`,t.safeSql`int8range`,t.safeSql`cube`,t.safeSql`ltree`,t.safeSql`lquery`,t.safeSql`jsonpath`,t.safeSql`citext`]);e.s(["MAX_ARRAY_SIZE",0,r,"MAX_CHARACTERS",0,a,"getTableRowsSql",0,({table:e,filters:i=[],sorts:c=[],page:u,limit:d,maxCharacters:m=a,maxArraySize:_=r,sortExcludedColumns:p=[]})=>{if(!e||!e.columns)return t.safeSql``;let f=new s.Query().from(e.name,e.schema).select();i.forEach(t=>{let s=e.columns?.find(e=>e.name===t.column),a=!s||n.includes(s.format);f=f.filter(t.column,t.operator,a||""!==t.value?t.value:null)});let h=e.live_rows_estimate||0;if(0===c.length&&h<=1e5&&e.columns.length>0){let t=((e,{excludedColumns:t=[]}={})=>{let s=e.primary_keys?.map(e=>e.name);if(s&&s.length>0&&!s.every(e=>t.includes(e)))return s;if(e.columns&&e.columns.length>0){let s=e.columns.filter(e=>!e.data_type.includes("json")&&!t.includes(e.name));if(s.length>0)return[s[0].name]}return[]})(e,{excludedColumns:p});t.length>0&&t.forEach(t=>{f=f.order(e.name,t)})}else c.forEach(e=>{f=f.order(e.table,e.column,e.ascending,e.nullsFirst)});let{from:g,to:b}=function(e,t=100){let s=e?e*t:0;return{from:s,to:e?s+t-1:t-1}}((u??1)-1,d),y=t.safeSql`with _base_query as (${f.range(g,b).toSql({isCTE:!1,isFinal:!1})})`,E=e.columns.sort((e,t)=>e.ordinal_position-t.ordinal_position).map(e=>({name:e.name,format:e.format.toLowerCase()})),v=e.columns.filter(e=>{let t;return t=e.format,l.has(t.toLowerCase())}).map(e=>e.name),S=E.map(({name:e})=>{let s=(0,t.ident)(e);return v.includes(e)?t.safeSql`case
        when octet_length(${s}::text) > ${(0,t.literal)(m)} 
        then left(${s}::text, ${(0,t.literal)(m)}) || '...'
        else ${s}::text
      end as ${s}`:s});e.columns.filter(e=>"array"===e.data_type.toLowerCase()).map(e=>({name:e.name,format:e.format.toLowerCase().slice(1)})).forEach(({name:e,format:s})=>{let a=S.findIndex(s=>s===(0,t.ident)(e)),r=o.has(s),n=r?t.safeSql`::${(0,t.keyword)(s)}[]`:t.safeSql`::text[]`,i=r?t.safeSql`array['{"truncated": true}'::json]`:t.safeSql`array['...']`,l=(0,t.ident)(e);a>=0&&(S[a]=t.safeSql`
        case 
          when octet_length(${l}::text) > ${(0,t.literal)(m)} 
          then
            case
              when array_ndims(${l}) = 1
              then
                (select array_cat(${l}[1:${(0,t.literal)(_)}]${n}, ${i}${n}))${n}
              else
                ${l}[1:${(0,t.literal)(_)}]${n}
            end
          else ${l}${n}
        end
      `)});let q=(0,t.joinSqlFragments)(S,","),x=new s.Query().from("_base_query").select(q);return t.safeSql`${y}
  ${x.toSql({isCTE:!0,isFinal:!0})}`}])},790819,46974,e=>{"use strict";e.s(["tableRowKeys",0,{tableRows:(e,{table:t,roleImpersonationState:s,...a}={})=>["projects",e,"table-rows",t?.id,"rows",{roleImpersonation:s?.role,...a}],tableRowsCount:(e,{table:t,...s}={})=>["projects",e,"table-rows",t?.id,"count",s],tableRowsAndCount:(e,t)=>["projects",e,"table-rows",t]}],790819);var t=e.i(585673),s=e.i(962217);e.s(["formatFilterValue",0,function(e,s){let a=e.columns.find(e=>e.name==s.column);if(a&&(0,t.isNumericalColumn)(a.format)){let e=Number(s.value);if(!Number.isNaN(e)&&!(e>Number.MAX_SAFE_INTEGER))return Number(s.value)}return s.value},"getPrimaryKeys",0,function({table:e}){if(!(0,s.isTableLike)(e))return{error:{message:"Only table rows can be updated or deleted"}};let t=e.primary_keys;return t&&0!=t.length?{primaryKeys:t.map(e=>e.name)}:{error:{message:"Please add a primary key column to your table to update or delete rows"}}}],46974)},941381,70756,963203,954707,e=>{"use strict";var t=e.i(478902),s=e.i(356003),a=e.i(989567),r=e.i(389959),n=e.i(85626),i=e.i(19583),o=e.i(150671),l=e.i(34479);e.i(850036);var c=e.i(479084),u=e.i(940562),d=e.i(721490),m=e.i(310959),_=e.i(242882);e.i(128328);var p=e.i(86086),f=e.i(790819),h=e.i(46974),g=e.i(311827),b=e.i(234745),y=e.i(714403),E=e.i(962217),v=e.i(48189),S=e.i(908937),q=e.i(201461),x=e.i(237948);async function w(e,t=3,s=1e3){for(let a=0;a<=t;a++)try{return await e()}catch(e){if(429===(e instanceof x.ResponseError?e.code:e.status)&&a<t){let t=function(e){if(e instanceof x.ResponseError)return e.retryAfter;let t=e.headers?.get("retry-after");if(t)return parseInt(t)}(e),r=t?1e3*t:s*Math.pow(2,a);await (0,v.timeout)(r);continue}throw e}throw Error("Max retries reached without success")}let j=({table:e,filters:t=[],sorts:s=[]})=>{let a,r,n,i,o,l=new d.Query,u=e.columns.filter(e=>(e?.enum??[]).length>0&&"array"===e.dataType.toLowerCase()).map(e=>c.safeSql`${(0,c.ident)(e.name)}::text[]`),m=l.from(e.name,e.schema??void 0).select(u.length>0?(0,c.joinSqlFragments)([c.safeSql`*`,...u],","):c.safeSql`*`);t.filter(e=>e.value&&""!==e.value).forEach(t=>{let s=(0,h.formatFilterValue)(e,t);m=m.filter(t.column,t.operator,s)});let _=!1,{cursorPaginationEligible:p,cursorPaginationNonEligible:f}=(a=[],r=[],(n=e.primaryKey)&&a.push(n),i=e.uniqueIndexes,(o=i?.filter(t=>t.every(t=>{let s=e.columns.find(e=>e.name===t);return!!s&&!s.isNullable})))&&a.push(...o),r.push(...e.columns.filter(e=>!e.dataType.includes("json")).map(e=>e.name)),{cursorPaginationEligible:a,cursorPaginationNonEligible:r}),b=e.type===g.ENTITY_TYPE.TABLE||e.type===g.ENTITY_TYPE.PARTITIONED_TABLE||e.type===g.ENTITY_TYPE.MATERIALIZED_VIEW;if(0===s.length)p.length>0?(_=p[0],p[0].forEach(t=>{m=m.order(e.name,t)})):(f.length>0&&(m=m.order(e.name,f[0])),b&&(m=m.order(e.name,"ctid")));else{s.forEach(e=>{m=m.order(e.table,e.column,e.ascending,e.nullsFirst)});let t=p[0];if(t){let a=new Set(s.filter(t=>t.table===e.name).map(e=>e.column));t.filter(e=>!a.has(e)).forEach(t=>{m=m.order(e.name,t)})}else b&&(m=m.order(e.name,"ctid"))}return{sql:m,cursorColumns:_}},R=async({projectRef:e,connectionString:t,table:s,filters:a=[],sorts:r=[],roleImpersonationState:n,progressCallback:i})=>{if(p.IS_PLATFORM&&!t)return console.error("Connection string is required"),[];let o=[],{sql:l,cursorColumns:c}=j({table:s,sorts:r,filters:a});if(c){let s=null;for(;;){let a=l.clone();s&&(a=a.filter(c,">",c.map(e=>s[e])));let r=(0,S.wrapWithRoleImpersonation)(a.range(0,499).toSql(),n);try{let{result:a}=await w(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:r}));for(let e of(o.push(...a),i?.(o.length),s={},c))s[e]=a[a.length-1]?.[e];if(a.length<500)break;await (0,v.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}else{let s=-1;for(;;){let a=500*(s+=1),r=(s+1)*500-1,c=(0,S.wrapWithRoleImpersonation)(l.range(a,r).toSql(),n);try{let{result:s}=await w(async()=>(0,y.executeSql)({projectRef:e,connectionString:t,sql:c}));if(o.push(...s),i?.(o.length),s.length<500)break;await (0,v.timeout)(500)}catch(e){throw Error(`Error fetching all table rows: ${e instanceof Error?e.message:"Unknown error"}`)}}}return o.filter(e=>1!==e[u.ROLE_IMPERSONATION_NO_RESULTS])};async function T({queryClient:e,projectRef:t,connectionString:s,tableId:a,roleImpersonationState:r,filters:n,sorts:o,limit:c,page:u,preflightCheck:d=!1},_){let p=await (0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:s,id:a});if(!p)throw Error("Table not found");let f=(0,i.parseSupaTable)(p),h=n?.filter(e=>"="===e.operator||"is"===e.operator).flatMap(e=>e.column),g=(0,E.isMsSqlForeignTable)(p)?Array.from(new Set(h)):void 0,v=(0,S.wrapWithRoleImpersonation)((0,m.getTableRowsSql)({table:p,filters:n,sorts:o,limit:c,page:u,sortExcludedColumns:g}),r);try{let{result:e}=await (0,y.executeSql)({projectRef:t,connectionString:s,sql:v,queryKey:["table-rows",f?.id],isRoleImpersonationEnabled:(0,q.isRoleImpersonationEnabled)(r?.role),preflightCheck:d},_);return{rows:e.map((e,t)=>({idx:t,...e}))}}catch(e){throw(0,b.handleError)(e)}}function A(e,{projectRef:t,connectionString:s,tableId:a,readReplicaIdentifier:r,...n}){return e.fetchQuery({queryKey:f.tableRowKeys.tableRows(t,{table:{id:a},readReplicaIdentifier:r,...n}),queryFn:({signal:r})=>T({queryClient:e,projectRef:t,connectionString:s,tableId:a,...n},r)})}e.s(["executeWithRetry",0,w,"fetchAllTableRows",0,R,"getAllTableRowsSql",0,j,"prefetchTableRows",0,A,"useTableRowsQuery",0,({projectRef:e,tableId:t,...a},{enabled:r=!0,...n}={})=>{let i=(0,s.useQueryClient)(),{connectionString:l,identifier:c}=(0,o.useConnectionStringForReadOps)(),{preflightCheck:u,...d}=a;return(0,_.useQuery)({queryKey:f.tableRowKeys.tableRows(e,{table:{id:t},readReplicaIdentifier:c,...d}),queryFn:({signal:s})=>T({queryClient:i,projectRef:e,connectionString:l,tableId:t,...a},s),enabled:r&&void 0!==e&&void 0!==t&&(!p.IS_PLATFORM||void 0!==l),...n})}],70756);var I=e.i(635494),P=e.i(636047);function N({queryClient:e,projectRef:t,connectionString:s,readReplicaIdentifier:a,id:r,sorts:n,filters:o,roleImpersonationState:c}){return(0,l.prefetchTableEditor)(e,{projectRef:t,connectionString:s,id:r}).then(l=>{if(l){let u=(0,i.parseSupaTable)(l),{sorts:d=[],filters:m=[]}=(0,i.loadTableEditorStateFromLocalStorage)(t,l.id)??{};A(e,{projectRef:t,connectionString:s,readReplicaIdentifier:a,tableId:r,sorts:n??(0,i.formatSortURLParams)(u.name,d),filters:o??(0,i.formatFilterURLParams)(m),page:1,limit:P.TABLE_EDITOR_DEFAULT_ROWS_PER_PAGE,roleImpersonationState:c})}})}function L(){let e=(0,a.useRouter)(),t=(0,s.useQueryClient)(),{data:n}=(0,I.useSelectedProjectQuery)(),{connectionString:i,identifier:l}=(0,o.useConnectionStringForReadOps)(),c=(0,q.useRoleImpersonationStateSnapshot)();return(0,r.useCallback)(({id:s,filters:a,sorts:r})=>{let o=s?Number(s):void 0;!n||!o||isNaN(o)||(e.prefetch(`/project/${n.ref}/editor/${o}`),N({queryClient:t,projectRef:n.ref,connectionString:i,readReplicaIdentifier:l,id:o,sorts:r,filters:a,roleImpersonationState:c}).catch(()=>{}))},[i,l,n,t,c,e])}e.s(["EditorTablePageLink",0,function({projectRef:e,id:s,sorts:a,filters:r,href:i,children:o,...l}){let c=L();return(0,t.jsx)(n.default,{href:i||`/project/${e}/editor/${s}`,prefetcher:()=>c({id:s,sorts:a,filters:r}),...l,children:o})},"prefetchEditorTablePage",0,N,"usePrefetchEditorTablePage",0,L],941381);var k=e.i(972089),$=e.i(462142);let D=({projectRef:e,schemaName:t},{enabled:s=!0}={})=>{let a=s&&!!e&&!!t,{data:n,isPending:i,isError:o}=(0,$.useProjectPostgrestConfigQuery)({projectRef:e},{enabled:a,select:({db_schema:e})=>e}),l=(0,r.useMemo)(()=>n?(0,$.parseDbSchemaString)(n):[],[n]);return!a||i?{status:"pending",data:void 0,isPending:!0,isError:!1,isSuccess:!1}:o?{status:"error",data:void 0,isPending:!1,isError:!0,isSuccess:!1}:{status:"success",data:l.includes(t),isPending:!1,isError:!1,isSuccess:!0}};e.s(["useIsSchemaExposed",0,D],963203);var M=e.i(84001);let O=[],C={};e.s(["useTableApiAccessQuery",0,({projectRef:e,connectionString:t,schemaName:s,tableNames:a=O},{enabled:n=!0,...i}={})=>{let o=(0,r.useMemo)(()=>new Set(a.filter(e=>"string"==typeof e&&e.length>0)),[a]),l=o.size>0,c=D({projectRef:e,schemaName:s},{enabled:n}),u=c.isSuccess&&!0===c.data,d=n&&l,m=(0,k.useTablePrivilegesQuery)({projectRef:e,connectionString:t},{enabled:d,...i});return(0,r.useMemo)(()=>{if(!n||"pending"===c.status||d&&m.isPending)return{data:void 0,status:"pending",isSuccess:!1,isPending:!0,isError:!1};if("error"===c.status||d&&m.isError)return{data:void 0,status:"error",isSuccess:!1,isPending:!1,isError:!0};if(!l)return{data:C,status:"success",isSuccess:!0,isPending:!1,isError:!1};let e={},t=u?((e,t,s)=>{if(!e)return{};let a={};return e.forEach(e=>{if(e.schema===t&&s.has(e.name)){var r;let t;a[e.name]=(r=e.privileges,t={anon:[],authenticated:[],service_role:[]},r.forEach(e=>{let{grantee:s,privilege_type:a}=e;(0,M.isApiAccessRole)(s)&&(0,M.isApiPrivilegeType)(a)&&t[s].push(a)}),t)}}),a})(m.data,s,o):{};return o.forEach(s=>{if(!u){e[s]={apiAccessType:"none"};return}let a=t[s]??{anon:[],authenticated:[],service_role:[]},r=a.anon.length>0||a.authenticated.length>0||a.service_role.length>0;e[s]=r?{apiAccessType:"access",grantStatus:M.API_ACCESS_ROLES.every(e=>M.API_PRIVILEGE_TYPES.every(t=>a[e].includes(t)))?"granted":"custom",privileges:a}:{apiAccessType:"exposed-schema-no-grants"}}),{data:e,status:"success",isSuccess:!0,isPending:!1,isError:!1}},[n,d,l,c.status,u,m.isPending,m.isError,m.data,s,o])}],954707)},170286,(e,t,s)=>{e.e,t.exports=function(){"use strict";var e={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},t=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,s=/\d/,a=/\d\d/,r=/\d\d?/,n=/\d*[^-_:/,()\s\d]+/,i={},o=function(e){return(e*=1)+(e>68?1900:2e3)},l=function(e){return function(t){this[e]=+t}},c=[/[+-]\d\d:?(\d\d)?|Z/,function(e){(this.zone||(this.zone={})).offset=function(e){if(!e||"Z"===e)return 0;var t=e.match(/([+-]|\d\d)/g),s=60*t[1]+(+t[2]||0);return 0===s?0:"+"===t[0]?-s:s}(e)}],u=function(e){var t=i[e];return t&&(t.indexOf?t:t.s.concat(t.f))},d=function(e,t){var s,a=i.meridiem;if(a){for(var r=1;r<=24;r+=1)if(e.indexOf(a(r,0,t))>-1){s=r>12;break}}else s=e===(t?"pm":"PM");return s},m={A:[n,function(e){this.afternoon=d(e,!1)}],a:[n,function(e){this.afternoon=d(e,!0)}],Q:[s,function(e){this.month=3*(e-1)+1}],S:[s,function(e){this.milliseconds=100*e}],SS:[a,function(e){this.milliseconds=10*e}],SSS:[/\d{3}/,function(e){this.milliseconds=+e}],s:[r,l("seconds")],ss:[r,l("seconds")],m:[r,l("minutes")],mm:[r,l("minutes")],H:[r,l("hours")],h:[r,l("hours")],HH:[r,l("hours")],hh:[r,l("hours")],D:[r,l("day")],DD:[a,l("day")],Do:[n,function(e){var t=i.ordinal,s=e.match(/\d+/);if(this.day=s[0],t)for(var a=1;a<=31;a+=1)t(a).replace(/\[|\]/g,"")===e&&(this.day=a)}],w:[r,l("week")],ww:[a,l("week")],M:[r,l("month")],MM:[a,l("month")],MMM:[n,function(e){var t=u("months"),s=(u("monthsShort")||t.map(function(e){return e.slice(0,3)})).indexOf(e)+1;if(s<1)throw Error();this.month=s%12||s}],MMMM:[n,function(e){var t=u("months").indexOf(e)+1;if(t<1)throw Error();this.month=t%12||t}],Y:[/[+-]?\d+/,l("year")],YY:[a,function(e){this.year=o(e)}],YYYY:[/\d{4}/,l("year")],Z:c,ZZ:c};return function(s,a,r){r.p.customParseFormat=!0,s&&s.parseTwoDigitYear&&(o=s.parseTwoDigitYear);var n=a.prototype,l=n.parse;n.parse=function(s){var a=s.date,n=s.utc,o=s.args;this.$u=n;var c=o[1];if("string"==typeof c){var u=!0===o[2],d=!0===o[3],_=o[2];d&&(_=o[2]),i=this.$locale(),!u&&_&&(i=r.Ls[_]),this.$d=function(s,a,r,n){try{if(["x","X"].indexOf(a)>-1)return new Date(("X"===a?1e3:1)*s);var o=(function(s){var a,r;a=s,r=i&&i.formats;for(var n=(s=a.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,function(t,s,a){var n=a&&a.toUpperCase();return s||r[a]||e[a]||r[n].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,function(e,t,s){return t||s.slice(1)})})).match(t),o=n.length,l=0;l<o;l+=1){var c=n[l],u=m[c],d=u&&u[0],_=u&&u[1];n[l]=_?{regex:d,parser:_}:c.replace(/^\[|\]$/g,"")}return function(e){for(var t={},s=0,a=0;s<o;s+=1){var r=n[s];if("string"==typeof r)a+=r.length;else{var i=r.regex,l=r.parser,c=e.slice(a),u=i.exec(c)[0];l.call(t,u),e=e.replace(u,"")}}return function(e){var t=e.afternoon;if(void 0!==t){var s=e.hours;t?s<12&&(e.hours+=12):12===s&&(e.hours=0),delete e.afternoon}}(t),t}})(a)(s),l=o.year,c=o.month,u=o.day,d=o.hours,_=o.minutes,p=o.seconds,f=o.milliseconds,h=o.zone,g=o.week,b=new Date,y=u||(l||c?1:b.getDate()),E=l||b.getFullYear(),v=0;l&&!c||(v=c>0?c-1:b.getMonth());var S,q=d||0,x=_||0,w=p||0,j=f||0;return h?new Date(Date.UTC(E,v,y,q,x,w,j+60*h.offset*1e3)):r?new Date(Date.UTC(E,v,y,q,x,w,j)):(S=new Date(E,v,y,q,x,w,j),g&&(S=n(S).week(g).toDate()),S)}catch(e){return new Date("")}}(a,c,n,r),this.init(),_&&!0!==_&&(this.$L=this.locale(_).$L),(u||d)&&a!=this.format(c)&&(this.$d=new Date("")),i={}}else if(c instanceof Array)for(var p=c.length,f=1;f<=p;f+=1){o[1]=c[f-1];var h=r.apply(this,o);if(h.isValid()){this.$d=h.$d,this.$L=h.$L,this.init();break}f===p&&(this.$d=new Date(""))}else l.call(this,s)}}}()},197187,e=>{"use strict";let t=(0,e.i(388019).default)("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);e.s(["default",0,t])},181827,e=>{"use strict";var t=e.i(478902),s=e.i(156054);e.s(["MonacoEditor",0,({width:e,height:a,value:r,language:n,readOnly:i=!1,onChange:o,onMount:l})=>(0,t.jsx)(s.default,{width:e,height:a||"200px",theme:"supabase",wrapperProps:{className:"grid-monaco-editor-container"},className:"grid-monaco-editor",defaultLanguage:n||"plaintext",defaultValue:r,onChange:o,onMount:function(e){e.changeViewZones(e=>{e.addZone({afterLineNumber:0,heightInPx:4,domNode:document.createElement("div")})});let t=e.getModel().getPositionAt(r?.length);e.setPosition(t),setTimeout(()=>{e?.focus()},0),l&&l(e)},options:{readOnly:i,tabSize:2,fontSize:13,minimap:{enabled:!1},glyphMargin:!1,folding:!1,lineNumbers:"off",lineNumbersMinChars:0,scrollBeyondLastLine:!1,wordWrap:"on",unusualLineTerminators:"off"}})])}]);