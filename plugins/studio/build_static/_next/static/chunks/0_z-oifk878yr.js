(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,245049,e=>{"use strict";var t=e.i(478902),s=e.i(975924),a=e.i(505859),r=e.i(938933);function n({align:e="center",ariaLabel:s,arrow:o=!1,children:i,className:l,defaultOpen:u=!1,modal:c,onOpenChange:m,open:d,overlay:_,side:p="bottom",sideOffset:h=6,style:f,header:g,footer:y,size:b="content",disabled:x,"data-testid":v}){let S=(0,r.default)("popover"),q=[S.content,S.size[b]];return l&&q.push(l),(0,t.jsxs)(a.Popover.Root,{defaultOpen:u,modal:c,onOpenChange:m,open:d,children:[(0,t.jsx)(a.Popover.Trigger,{disabled:x,className:S.trigger,"aria-label":s,"data-testid":v,children:i}),(0,t.jsx)(a.Popover.Portal,{children:(0,t.jsxs)(a.Popover.Content,{sideOffset:h,side:p,align:e,className:q.join(" "),style:f,children:[o&&(0,t.jsx)(a.Popover.Arrow,{offset:10}),g&&(0,t.jsx)("div",{className:S.header,children:g}),_,y&&(0,t.jsx)("div",{className:S.footer,children:y})]})})]})}n.Separator=function(){let e=(0,r.default)("popover");return(0,t.jsx)("div",{className:e.separator})},n.Close=function(){let e=(0,r.default)("popover");return(0,t.jsx)(a.Popover.Close,{className:e.close,children:(0,t.jsx)(s.X,{size:14,strokeWidth:2})})},e.s(["default",0,n])},463783,e=>{"use strict";var t=e.i(245049);e.s(["Popover",()=>t.default])},1962,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(274664),r=e.i(546595),n="Progress",[o,i]=(0,a.createContextScope)(n),[l,u]=o(n),c=s.forwardRef((e,s)=>{var a,n;let{__scopeProgress:o,value:i=null,max:u,getValueLabel:c=_,...m}=e;(u||0===u)&&!f(u)&&console.error((a=`${u}`,`Invalid prop \`max\` of value \`${a}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let d=f(u)?u:100;null===i||g(i,d)||console.error((n=`${i}`,`Invalid prop \`value\` of value \`${n}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let y=g(i,d)?i:null,b=h(y)?c(y,d):void 0;return(0,t.jsx)(l,{scope:o,value:y,max:d,children:(0,t.jsx)(r.Primitive.div,{"aria-valuemax":d,"aria-valuemin":0,"aria-valuenow":h(y)?y:void 0,"aria-valuetext":b,role:"progressbar","data-state":p(y,d),"data-value":y??void 0,"data-max":d,...m,ref:s})})});c.displayName=n;var m="ProgressIndicator",d=s.forwardRef((e,s)=>{let{__scopeProgress:a,...n}=e,o=u(m,a);return(0,t.jsx)(r.Primitive.div,{"data-state":p(o.value,o.max),"data-value":o.value??void 0,"data-max":o.max,...n,ref:s})});function _(e,t){return`${Math.round(e/t*100)}%`}function p(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function h(e){return"number"==typeof e}function f(e){return h(e)&&!isNaN(e)&&e>0}function g(e,t){return h(e)&&!isNaN(e)&&e<=t&&e>=0}d.displayName=m,e.s(["Indicator",0,d,"Progress",0,c,"ProgressIndicator",0,d,"Root",0,c,"createProgressScope",0,i],386108);var y=e.i(386108),y=y,b=e.i(843778);let x=s.forwardRef(({className:e,value:s,...a},r)=>(0,t.jsx)(y.Root,{ref:r,className:(0,b.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...a,children:(0,t.jsx)(y.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(s||0)}%)`}})}));x.displayName=y.Root.displayName,e.s(["Progress",0,x],1962)},474325,e=>{"use strict";var t=e.i(478902),s=e.i(774803),a=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:r,action:n,message:o,description:i="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(s.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:o}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[r||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(a.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:i}),n]})]})]})])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(38429),a=e.i(356003),r=e.i(355901),n=e.i(667286),o=e.i(78162),i=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:o=!1,createSchema:u=!1}){let c=new Headers;s&&c.set("x-connection-encrypted",s);let m=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:o,createSchema:u}),{result:d}=await (0,i.executeSql)({projectRef:e,connectionString:s,sql:m,queryKey:["extension","create"]});return d}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...i}={})=>{let u=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([u.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),u.invalidateQueries({queryKey:o.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...i})}])},888525,760255,284399,e=>{"use strict";var t=e.i(355901),s=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:a,indexStatements:r,onSuccess:o,onError:i}){if(!e){let e=Error("Project ref is required");return i&&i(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return i&&i(e),Promise.reject(e)}try{return await (0,s.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),o&&o(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),i&&i(e),Promise.reject(e)}}function o(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!a.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=o(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,o,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var i=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,i.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=r(t??[]),n=!!s&&!!a,o=n&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:o}}],888525);var u=e.i(478902),c=e.i(389959),m=e.i(232520),d=e.i(837710),_=e.i(610144),p=e.i(967052);let h=({open:e,setOpen:s})=>{let a=(0,p.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:o}=(0,i.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:c,indexAdvisor:d}=r(o),{mutateAsync:h,isPending:f}=(0,_.useDatabaseExtensionEnableMutation)(),g=async()=>{if(void 0===n)return t.toast.error("Project is required");try{c?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:c.name,schema:c?.schema??"extensions",version:c.default_version}),d?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:d.name,schema:d?.schema??"extensions",version:d.default_version}),t.toast.success("Successfully enabled Index Advisor!"),s(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,u.jsx)(m.AlertDialog,{open:e,onOpenChange:()=>s(!e),children:(0,u.jsxs)(m.AlertDialogContent,{size:"medium",children:[(0,u.jsxs)(m.AlertDialogHeader,{children:[(0,u.jsx)(m.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,u.jsxs)(m.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,u.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,u.jsxs)("p",{children:["Enable this will install the ",(0,u.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,u.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,u.jsxs)(m.AlertDialogFooter,{children:[(0,u.jsx)(m.AlertDialogCancel,{children:"Cancel"}),(0,u.jsx)(m.AlertDialogAction,{onClick:e=>{e.preventDefault(),g(),a("index_advisor_dialog_enable_button_clicked")},disabled:f,children:f?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,p.useTrack)(),[t,s]=(0,c.useState)(!1);return(0,u.jsxs)(u.Fragment,{children:[(0,u.jsx)(d.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,u.jsx)(h,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,h],284399)},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let o=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],i={iso_timestamp_start:o[0].calcFrom(),iso_timestamp_end:o[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),o=!n&&r?e.value:`'${e.value}'`,i=!n&&String(o).toLowerCase(),l=n?e.value:i;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},u={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,i,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,u,"REPORTS_DATEPICKER_HELPERS",0,o,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},749199,e=>{"use strict";var t=e.i(242882),s=e.i(820308),a=e.i(150671),r=e.i(714403),n=e.i(635494),o=e.i(189329);e.s(["default",0,({sql:e,params:i=s.DEFAULT_QUERY_PARAMS,where:l,orderBy:u})=>{let{data:c}=(0,n.useSelectedProjectQuery)(),m=(0,o.useDatabaseSelectorStateSnapshot)(),{data:d}=(0,a.useReadReplicasQuery)({projectRef:c?.ref}),_=(d||[]).find(e=>e.identifier===m.selectedDatabaseId)?.connectionString,p=m.selectedDatabaseId,h="function"==typeof e?e([]):e,{data:f,error:g,isPending:y,isRefetching:b,refetch:x}=(0,t.useQuery)({queryKey:["projects",c?.ref,"db",{...i,sql:h,identifier:p},l,u],queryFn:({signal:e})=>(0,r.executeSql)({projectRef:c?.ref,connectionString:_||c?.connectionString,sql:h},e).then(e=>e.result),enabled:!!h,refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{error:g||("object"==typeof f?f?.error:""),data:f,isLoading:y,isRefetching:b,params:i,runQuery:x,resolvedSql:h}}])},937357,e=>{"use strict";e.s(["databaseIndexesKeys",0,{list:(e,t)=>["projects",e,"database-indexes",t].filter(Boolean)}])},503256,e=>{"use strict";var t=e.i(389959);let s=t.forwardRef(function({title:e,titleId:s,...a},r){return t.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor","aria-hidden":"true","data-slot":"icon",ref:r,"aria-labelledby":s},a),e?t.createElement("title",{id:s},e):null,t.createElement("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"}))});e.s(["InformationCircleIcon",0,s],503256)},769105,e=>{"use strict";var t=e.i(479084),s=e.i(867088),a=e.i(356003),r=e.i(820308),n=e.i(775159),o=e.i(150671),i=e.i(714403),l=e.i(749199),u=e.i(635494),c=e.i(10429),m=e.i(189329);let d=new Set(["query","rolname","total_time","prop_total_time","calls","avg_rows","max_time","mean_time","min_time"]);function _({preset:e,orderBy:s,searchQuery:a="",roles:o=[],sources:i=[],minCalls:l=0,minTotalTime:u=0,runIndexAdvisor:c=!1,filterIndexAdvisor:m=!1,page:p=1,pageSize:h=20}){let f=Number.isFinite(p)?Math.max(1,Math.floor(p)):1,g=Number.isFinite(h)?Math.min(Math.max(1,Math.floor(h)),100):20,y=r.PRESET_CONFIG[n.Presets.QUERY_PERFORMANCE].queries[e],b=null!=s&&d.has(s.column)&&("asc"===s.order||"desc"===s.order)?`ORDER BY ${(0,t.ident)(s.column)} ${s.order}`:void 0,x=[];o.length>0&&x.push(`auth.rolname in (${o.map(e=>`${(0,t.literal)(e)}`).join(", ")})`),a.length>0&&x.push(`statements.query ~* ${(0,t.literal)(a)}`),i.includes("dashboard")&&!i.includes("non-dashboard")&&x.push("statements.query ~* 'source: dashboard'"),i.includes("non-dashboard")&&!i.includes("dashboard")&&x.push("statements.query !~* 'source: dashboard'"),Number.isFinite(l)&&l>0&&x.push(`statements.calls >= ${l}`),Number.isFinite(u)&&u>0&&x.push(`(statements.total_exec_time + statements.total_plan_time) >= ${u}`);let v=x.join(" AND ");return{sql:y.sql([],v.length>0?`WHERE ${v}`:void 0,b,c,m,f,g),whereSql:v,orderBySql:b}}e.s(["useQueryPerformanceInfiniteQuery",0,e=>{let t=(0,a.useQueryClient)(),{data:r}=(0,u.useSelectedProjectQuery)(),n=(0,m.useDatabaseSelectorStateSnapshot)(),{data:l}=(0,o.useReadReplicasQuery)({projectRef:r?.ref}),d=(l||[]).find(e=>e.identifier===n.selectedDatabaseId)?.connectionString,p=e.pageSize,h=Number.isFinite(p)?Math.min(Math.max(1,Math.floor(p)),100):20,{sql:f}=_({...e,page:1,pageSize:h}),g=n.selectedDatabaseId&&n.selectedDatabaseId!==r?.ref?d:d??r?.connectionString,{data:y,isPending:b,isRefetching:x,isFetchingNextPage:v,hasNextPage:S,error:q,fetchNextPage:E}=(0,s.useInfiniteQuery)({queryKey:["projects",r?.ref,"query-performance-infinite",{...e,pageSize:h,identifier:n.selectedDatabaseId,connectionString:g}],initialPageParam:1,queryFn:({pageParam:t,signal:s})=>{let{sql:a}=_({...e,page:t,pageSize:h});return(0,i.executeSql)({projectRef:r?.ref,connectionString:g,sql:a},s).then(e=>e.result)},getNextPageParam:(e,t)=>e.length<h?void 0:t.length+1,enabled:!!r?.ref&&(!c.IS_PLATFORM||!!g),refetchOnWindowFocus:!1,refetchOnReconnect:!1});return{data:y?.pages.flatMap(e=>e)??void 0,isLoading:b,isRefetching:x,isFetchingNextPage:v,hasNextPage:S??!1,error:q,fetchNextPage:E,refetch:()=>t.resetQueries({queryKey:["projects",r?.ref,"query-performance-infinite"],exact:!1}),resolvedSql:f}},"useQueryPerformanceQuery",0,e=>{let{sql:t,whereSql:s,orderBySql:a}=_(e);return(0,l.default)({sql:t,params:void 0,where:s,orderBy:a})}])},170286,(e,t,s)=>{e.e,t.exports=function(){"use strict";var e={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},t=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,s=/\d/,a=/\d\d/,r=/\d\d?/,n=/\d*[^-_:/,()\s\d]+/,o={},i=function(e){return(e*=1)+(e>68?1900:2e3)},l=function(e){return function(t){this[e]=+t}},u=[/[+-]\d\d:?(\d\d)?|Z/,function(e){(this.zone||(this.zone={})).offset=function(e){if(!e||"Z"===e)return 0;var t=e.match(/([+-]|\d\d)/g),s=60*t[1]+(+t[2]||0);return 0===s?0:"+"===t[0]?-s:s}(e)}],c=function(e){var t=o[e];return t&&(t.indexOf?t:t.s.concat(t.f))},m=function(e,t){var s,a=o.meridiem;if(a){for(var r=1;r<=24;r+=1)if(e.indexOf(a(r,0,t))>-1){s=r>12;break}}else s=e===(t?"pm":"PM");return s},d={A:[n,function(e){this.afternoon=m(e,!1)}],a:[n,function(e){this.afternoon=m(e,!0)}],Q:[s,function(e){this.month=3*(e-1)+1}],S:[s,function(e){this.milliseconds=100*e}],SS:[a,function(e){this.milliseconds=10*e}],SSS:[/\d{3}/,function(e){this.milliseconds=+e}],s:[r,l("seconds")],ss:[r,l("seconds")],m:[r,l("minutes")],mm:[r,l("minutes")],H:[r,l("hours")],h:[r,l("hours")],HH:[r,l("hours")],hh:[r,l("hours")],D:[r,l("day")],DD:[a,l("day")],Do:[n,function(e){var t=o.ordinal,s=e.match(/\d+/);if(this.day=s[0],t)for(var a=1;a<=31;a+=1)t(a).replace(/\[|\]/g,"")===e&&(this.day=a)}],w:[r,l("week")],ww:[a,l("week")],M:[r,l("month")],MM:[a,l("month")],MMM:[n,function(e){var t=c("months"),s=(c("monthsShort")||t.map(function(e){return e.slice(0,3)})).indexOf(e)+1;if(s<1)throw Error();this.month=s%12||s}],MMMM:[n,function(e){var t=c("months").indexOf(e)+1;if(t<1)throw Error();this.month=t%12||t}],Y:[/[+-]?\d+/,l("year")],YY:[a,function(e){this.year=i(e)}],YYYY:[/\d{4}/,l("year")],Z:u,ZZ:u};return function(s,a,r){r.p.customParseFormat=!0,s&&s.parseTwoDigitYear&&(i=s.parseTwoDigitYear);var n=a.prototype,l=n.parse;n.parse=function(s){var a=s.date,n=s.utc,i=s.args;this.$u=n;var u=i[1];if("string"==typeof u){var c=!0===i[2],m=!0===i[3],_=i[2];m&&(_=i[2]),o=this.$locale(),!c&&_&&(o=r.Ls[_]),this.$d=function(s,a,r,n){try{if(["x","X"].indexOf(a)>-1)return new Date(("X"===a?1e3:1)*s);var i=(function(s){var a,r;a=s,r=o&&o.formats;for(var n=(s=a.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,function(t,s,a){var n=a&&a.toUpperCase();return s||r[a]||e[a]||r[n].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,function(e,t,s){return t||s.slice(1)})})).match(t),i=n.length,l=0;l<i;l+=1){var u=n[l],c=d[u],m=c&&c[0],_=c&&c[1];n[l]=_?{regex:m,parser:_}:u.replace(/^\[|\]$/g,"")}return function(e){for(var t={},s=0,a=0;s<i;s+=1){var r=n[s];if("string"==typeof r)a+=r.length;else{var o=r.regex,l=r.parser,u=e.slice(a),c=o.exec(u)[0];l.call(t,c),e=e.replace(c,"")}}return function(e){var t=e.afternoon;if(void 0!==t){var s=e.hours;t?s<12&&(e.hours+=12):12===s&&(e.hours=0),delete e.afternoon}}(t),t}})(a)(s),l=i.year,u=i.month,c=i.day,m=i.hours,_=i.minutes,p=i.seconds,h=i.milliseconds,f=i.zone,g=i.week,y=new Date,b=c||(l||u?1:y.getDate()),x=l||y.getFullYear(),v=0;l&&!u||(v=u>0?u-1:y.getMonth());var S,q=m||0,E=_||0,w=p||0,j=h||0;return f?new Date(Date.UTC(x,v,b,q,E,w,j+60*f.offset*1e3)):r?new Date(Date.UTC(x,v,b,q,E,w,j)):(S=new Date(x,v,b,q,E,w,j),g&&(S=n(S).week(g).toDate()),S)}catch(e){return new Date("")}}(a,u,n,r),this.init(),_&&!0!==_&&(this.$L=this.locale(_).$L),(c||m)&&a!=this.format(u)&&(this.$d=new Date("")),o={}}else if(u instanceof Array)for(var p=u.length,h=1;h<=p;h+=1){i[1]=u[h-1];var f=r.apply(this,i);if(f.isValid()){this.$d=f.$d,this.$L=f.$L,this.init();break}h===p&&(this.$d=new Date(""))}else l.call(this,s)}}}()},507648,(e,t,s)=>{var a=e.r(203941),r=e.r(297926),n=e.r(615573),o=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),s=arguments[0],i=e;i--;)t[i-1]=arguments[i];return a(o(s)?n(s):[s],r(t,1))}},707409,e=>{"use strict";var t=e.i(507648),s=e.i(827047);let a=["int2","int4","int8","float4","float8","numeric","double precision"],r=["json","jsonb"],n=["text","varchar"],o=["timestamp","timestamptz"],i=["date"],l=["time","timetz"],u=(0,t.default)(o,i,l),c=["uuid","bool","vector","bytea"],m=(0,s.default)((0,t.default)(a,r,n,u,c));e.s(["DATETIME_TYPES",0,u,"DATE_TYPES",0,i,"JSON_TYPES",0,r,"NUMERICAL_TYPES",0,a,"OTHER_DATA_TYPES",0,c,"POSTGRES_DATA_TYPES",0,m,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,n,"TIMESTAMP_TYPES",0,o,"TIME_TYPES",0,l])},438756,(e,t,s)=>{t.exports=function(e){return null===e}},197187,e=>{"use strict";let t=(0,e.i(388019).default)("Filter",[["polygon",{points:"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3",key:"1yg77f"}]]);e.s(["default",0,t])},181827,e=>{"use strict";var t=e.i(478902),s=e.i(156054);e.s(["MonacoEditor",0,({width:e,height:a,value:r,language:n,readOnly:o=!1,onChange:i,onMount:l})=>(0,t.jsx)(s.default,{width:e,height:a||"200px",theme:"supabase",wrapperProps:{className:"grid-monaco-editor-container"},className:"grid-monaco-editor",defaultLanguage:n||"plaintext",defaultValue:r,onChange:i,onMount:function(e){e.changeViewZones(e=>{e.addZone({afterLineNumber:0,heightInPx:4,domNode:document.createElement("div")})});let t=e.getModel().getPositionAt(r?.length);e.setPosition(t),setTimeout(()=>{e?.focus()},0),l&&l(e)},options:{readOnly:o,tabSize:2,fontSize:13,minimap:{enabled:!1},glyphMargin:!1,folding:!1,lineNumbers:"off",lineNumbersMinChars:0,scrollBeyondLastLine:!1,wordWrap:"on",unusualLineTerminators:"off"}})])}]);