(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,902780,e=>{"use strict";var t=e.i(478902),s=e.i(345594),a=e.i(837710),r=e.i(843778),o=e.i(710483);e.s(["UnknownInterface",0,({urlBack:e,fullHeight:i=!0})=>(0,t.jsx)("div",{className:(0,r.cn)("w-full flex items-center justify-center",i&&"h-full"),children:(0,t.jsx)(o.Admonition,{type:"note",className:"max-w-xl",title:"Looking for something?",description:"We couldn't find the page that you're looking for",children:(0,t.jsx)(a.Button,{asChild:!0,type:"default",className:"mt-2",children:(0,t.jsx)(s.default,{href:e,children:"Head back"})})})})])},853321,e=>{"use strict";let t=(0,e.i(388019).default)("Braces",[["path",{d:"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",key:"ezmyqa"}],["path",{d:"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",key:"e1hn23"}]]);e.s(["default",0,t])},223173,674742,843819,928253,993032,e=>{"use strict";var t=e.i(478902);e.i(481541);var s=e.i(33034),s=s,a=e.i(126200);e.s(["Datadog",()=>a.default],674742);var a=a,r=e.i(841231);e.s(["Grafana",()=>r.default],843819);var r=r,o=e.i(57349),o=o,i=e.i(724487),i=i,n=e.i(660253);e.s(["Sentry",()=>n.default],928253);var n=n,l=e.i(853321);e.s(["BracesIcon",()=>l.default],993032);var l=l;let d=(0,e.i(388019).default)("Cloud",[["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",key:"p7xjir"}]]);var u=e.i(992615);let c={height:24,width:24,className:"text-foreground-light"},m=[{value:"webhook",name:"Custom Endpoint",description:"Forward logs as a POST request to a custom HTTP endpoint",icon:(0,t.jsx)(l.default,{...c})},{value:"otlp",name:"OpenTelemetry Protocol (OTLP)",description:"Send logs to any OpenTelemetry Protocol (OTLP) compatible endpoint",icon:(0,t.jsx)(i.default,{...c,fill:"currentColor"})},{value:"datadog",name:"Datadog",description:"Datadog is a monitoring service for cloud-scale applications",icon:(0,t.jsx)(a.default,{...c,fill:"currentColor"})},{value:"loki",name:"Loki",description:"Loki is an open-source log aggregation system designed to store and query logs from multiple sources",icon:(0,t.jsx)(r.default,{...c,fill:"currentColor"})},{value:"s3",name:"Amazon S3",description:"Forward logs to an S3 bucket",icon:(0,t.jsx)(d,{...c})},{value:"sentry",name:"Sentry",description:"Sentry is an application monitoring service that helps developers identify and debug performance issues and errors",icon:(0,t.jsx)(n.default,{...c,fill:"currentColor"})},{value:"axiom",name:"Axiom",description:"Axiom is a data platform designed to efficiently collect, store, and analyze event and telemetry data at massive scale.",icon:(0,t.jsx)(s.default,{...c,fill:"currentColor"})},{value:"last9",name:"Last9",description:"Last9 is an observability platform for monitoring and telemetry data",icon:(0,t.jsx)(o.default,{...c,fill:"currentColor"})},{value:"syslog",name:"Syslog",description:"Forward logs to a remote Syslog receiver using TCP or TLS, adhering to RFC 5424",icon:(0,t.jsx)(u.Server,{...c})}];m.map(e=>e.value),e.s(["DATADOG_REGIONS",0,[{label:"AP1",value:"AP1"},{label:"AP2",value:"AP2"},{label:"EU",value:"EU"},{label:"US1",value:"US1"},{label:"US1-FED",value:"US1-FED"},{label:"US3",value:"US3"},{label:"US5",value:"US5"}],"LAST9_REGIONS",0,[{label:"US West 1",value:"US-WEST-1"},{label:"AP South 1",value:"AP-SOUTH-1"}],"LOG_DRAIN_TYPES",0,m,"OTLP_PROTOCOLS",0,[{label:"HTTP/Protobuf",value:"http/protobuf"}]],223173)},271332,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(843778),r=e.i(837710),o=e.i(253214);let i=(0,s.forwardRef)(({children:e,customFooter:i,description:n,hideFooter:l=!1,alignFooter:d="left",layout:u="horizontal",loading:c=!1,cancelText:m="Cancel",onConfirm:g=()=>{},onCancel:p=()=>{},confirmText:h="Confirm",showCloseButton:f=!0,footerBackground:_,variant:b="success",visible:y=!1,size:S="large",style:v,overlayStyle:E,contentStyle:x,triggerElement:T,header:j,modal:w,defaultOpen:N,...P},I)=>{let[C,R]=s.default.useState(!!y&&y);(0,s.useEffect)(()=>{R(y)},[y]);let A=i||(0,t.jsxs)("div",{className:"flex w-full space-x-2",style:{width:"100%",justifyContent:"vertical"===u?"center":"right"===d?"flex-end":"flex-start"},children:[(0,t.jsx)(r.Button,{type:"default",onClick:p,disabled:c,children:m}),(0,t.jsx)(r.Button,{onClick:g,disabled:c,loading:c,type:"danger"===b?"danger":"warning"===b?"warning":"primary",children:h})]});return(0,t.jsxs)(o.Dialog,{open:C,defaultOpen:N,onOpenChange:function(e){void 0===y||e?R(e):p()},modal:w,children:[T&&(0,t.jsx)(o.DialogTrigger,{children:T}),(0,t.jsxs)(o.DialogContent,{ref:I,hideClose:!f,...P,size:S,children:[j||n?(0,t.jsxs)(o.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[j&&(0,t.jsx)(o.DialogTitle,{children:j}),n&&(0,t.jsx)(o.DialogDescription,{children:n})]}):null,e,!l&&(0,t.jsx)(o.DialogFooter,{padding:"small",children:A})]})]})}),n=(0,s.forwardRef)(({...e},s)=>(0,t.jsx)(o.DialogSection,{ref:s,...e,padding:"small",className:(0,a.cn)(e.className)})),l=(0,s.forwardRef)(({...e},s)=>(0,t.jsx)(o.DialogSectionSeparator,{ref:s,...e}));i.Content=n,i.Separator=l,e.s(["default",0,i])},40892,e=>{"use strict";var t=e.i(271332);e.s(["Modal",()=>t.default])},420985,e=>{"use strict";var t=e.i(38429),s=e.i(356003),a=e.i(355901),r=e.i(984396),o=e.i(718727),i=e.i(234745);async function n({projectRef:e,payload:t},s){let{data:a,error:o}=await (0,i.put)("/platform/projects/{ref}/content",{params:{path:{ref:e}},body:(0,r.unmapSqlContentField)(t),headers:{Version:"2"},signal:s});return o&&(0,i.handleError)(o),a}e.s(["upsertContent",0,n,"useContentUpsertMutation",0,({onError:e,onSuccess:r,invalidateQueriesOnSuccess:i=!0,...l}={})=>{let d=(0,s.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>n(e),async onSuccess(e,t,s){let{projectRef:a}=t;i&&await Promise.all([d.invalidateQueries({queryKey:o.contentKeys.allContentLists(a)}),d.invalidateQueries({queryKey:o.contentKeys.infiniteList(a)})]),await r?.(e,t,s)},async onError(t,s,r){void 0===e?a.toast.error(`Failed to insert content: ${t.message}`):e(t,s,r)},...l})}])},586011,e=>{"use strict";var t=e.i(38429),s=e.i(356003),a=e.i(355901),r=e.i(718727),o=e.i(234745);async function i({projectRef:e,ids:t},s){let{data:a,error:r}=await (0,o.del)("/platform/projects/{ref}/content",{headers:{Version:"2"},params:{path:{ref:e},query:{ids:t.join(",")}},signal:s});return r&&(0,o.handleError)(r),a.map(e=>e.id)}e.s(["useContentDeleteMutation",0,({onSuccess:e,onError:o,...n}={})=>{let l=(0,s.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>i(e),async onSuccess(t,s,a){let{projectRef:o}=s;await Promise.all([l.invalidateQueries({queryKey:r.contentKeys.allContentLists(o)}),l.invalidateQueries({queryKey:r.contentKeys.infiniteList(o)})]),await e?.(t,s,a)},async onError(e,t,s){void 0===o?a.toast.error(`Failed to delete contents: ${e.message}`):o(e,t,s)},...n})}])},738927,e=>{"use strict";var t=e.i(242882),s=e.i(984396),a=e.i(718727),r=e.i(234745);async function o({projectRef:e,type:t,name:a,limit:i=10},n){if(void 0===e)throw Error("projectRef is required for getContent");let{data:l,error:d}=await (0,r.get)("/platform/projects/{ref}/content",{params:{path:{ref:e},query:{type:t,name:a,limit:i.toString()}},signal:n});return d&&(0,r.handleError)(d),{cursor:l.cursor,content:(0,s.remapSqlContentFields)(l.data)}}e.s(["useContentQuery",0,({projectRef:e,type:s,name:r,limit:i},{enabled:n=!0,...l}={})=>(0,t.useQuery)({queryKey:a.contentKeys.list(e,{type:s,name:r,limit:i}),queryFn:({signal:t})=>o({projectRef:e,type:s,name:r,limit:i},t),enabled:n&&void 0!==e,...l})])},993394,e=>{"use strict";e.i(128328);var t,s=e.i(86086),a=e.i(55956),r=e.i(10429);let o=`${r.DOCS_URL}/guides/platform/logs#querying-with-the-logs-explorer`,i=[{label:"Recent Errors",mode:"simple",searchString:"[Ee]rror|\\s[45][0-9][0-9]\\s",for:["api"]},{label:"Commits",mode:"simple",searchString:"COMMIT",for:["database"]},{label:"Commits By User",description:"Count of commits made by users on the database",mode:"custom",searchString:`select
  p.user_name,
  count(*) as count
from postgres_logs
  left join unnest(metadata) as m on true
  left join unnest(m.parsed) as p on true
where
  regexp_contains(event_message, 'COMMIT')
group by
  p.user_name
  `,for:["database"]},{label:"Metadata IP",description:"List all IP addresses that used the Supabase API",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  h.x_real_ip
from edge_logs
  left join unnest(metadata) as m on true
  left join unnest(m.request) as r on true
  left join unnest(r.headers) as h on true
where h.x_real_ip is not null
`,for:["api"]},{label:"Requests by Geography",description:"List all ISO 3166-1 alpha-2 country codes that used the Supabase API",mode:"custom",searchString:`select
  cf.country,
  count(*) as count
from edge_logs
  left join unnest(metadata) as m on true
  left join unnest(m.request) as r on true
  left join unnest(r.cf) as cf on true
group by
  cf.country
order by
  count desc
`,for:["api"]},{label:"Slow Response Time",mode:"custom",description:"List all Supabase API requests that are slow",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.origin_time
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.origin_time > 1000
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"500 Request Codes",description:"List all Supabase API requests that responded witha 5XX status code",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message,
  r.status_code
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.response) as r
where
  r.status_code >= 500
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"Top Paths",description:"List the most requested Supabase API paths",mode:"custom",searchString:`select
  r.path as path,
  r.search as params,
  count(timestamp) as c
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as r
group by
  path,
  params
order by
  c desc
limit 100
`,for:["api"]},{label:"REST Requests",description:"List all PostgREST requests",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as r
where
  path like '%rest/v1%'
order by
  timestamp desc
limit 100
`,for:["api"]},{label:"Errors",description:"List all Postgres error messages with ERROR, FATAL, or PANIC severity",mode:"custom",searchString:`select
  cast(t.timestamp as datetime) as timestamp,
  p.error_severity,
  event_message
from postgres_logs as t
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as p
where
  p.error_severity in ('ERROR', 'FATAL', 'PANIC')
order by
  timestamp desc
limit 100
`,for:["database"]},{label:"Error Count by User",description:"Count of errors by users",mode:"custom",searchString:`select
  count(t.timestamp) as count,
  p.user_name,
  p.error_severity
from postgres_logs as t
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as p
where
  p.error_severity in ('ERROR', 'FATAL', 'PANIC')
group by
  p.user_name,
  p.error_severity
order by
  count desc
limit 100
`,for:["database"]},{label:"Auth Endpoint Events",description:"Endpoint events filtered by path",mode:"custom",searchString:`select
  t.timestamp,
  event_message
from auth_logs as t
where
  regexp_contains(event_message,"level.{3}(info|warning||error|fatal)")
  -- and regexp_contains(event_message,"path.{3}(/token|/recover|/signup|/otp)")
limit 100
`,for:["database"]},{label:"Auth Audit Logs",description:"Audit logs for auth events",mode:"custom",searchString:`select
  cast(timestamp as datetime) as timestamp,
  event_message, metadata 
from auth_audit_logs 
limit 10
`,for:["database"]},{label:"Storage Object Requests",description:"Number of requests done on Storage Objects",mode:"custom",searchString:`select
  r.method as http_verb,
  r.path as filepath,
  count(*) as num_requests
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) AS r
  cross join unnest(r.headers) AS h
where
  path like '%storage/v1/object/%'
group by
  r.path, r.method
order by
  num_requests desc
limit 100
`,for:["api"]},{label:"Storage Egress Requests",description:"Check the number of requests done on Storage Affecting Egress",mode:"custom",searchString:`select
  request.method as http_verb,
  request.path as filepath,
  (responseHeaders.cf_cache_status = 'HIT') as cached,
  count(*) as num_requests
from
  edge_logs
  cross join unnest(metadata) as metadata
  cross join unnest(metadata.request) as request
  cross join unnest(metadata.response) as response
  cross join unnest(response.headers) as responseHeaders
where
  (path like '%storage/v1/object/%' or path like '%storage/v1/render/%')
  and request.method = 'GET'
group by 1, 2, 3
order by num_requests desc
limit 100;
`,for:["api"]},{label:"Storage Top Cache Misses",description:"The top Storage requests that miss caching",mode:"custom",searchString:`select
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
group by path, search
order by count desc
limit 100;
`,for:["api"]}],n={search_query:e=>`regexp_contains(event_message, '${e}')`},l={postgres_logs:{...n,database:e=>`identifier = '${e}'`,"severity.error":"parsed.error_severity in ('ERROR', 'FATAL', 'PANIC')","severity.noError":"parsed.error_severity not in ('ERROR', 'FATAL', 'PANIC')","severity.log":"parsed.error_severity = 'LOG'"},edge_logs:{...n,database:e=>`identifier = '${e}'`,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499","product.database":"request.path like '/rest/%' or request.path like '/graphql/%'","product.storage":"request.path like '/storage/%'","product.auth":"request.path like '/auth/%'","product.realtime":"request.path like '/realtime/%'","method.get":"request.method = 'GET'","method.post":"request.method = 'POST'","method.put":"request.method = 'PUT'","method.patch":"request.method = 'PATCH'","method.delete":"request.method = 'DELETE'","method.options":"request.method = 'OPTIONS'"},function_edge_logs:{...n,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499"},function_logs:{...n,"severity.error":"metadata.level = 'error'","severity.notError":"metadata.level != 'error'","severity.log":"metadata.level = 'log'","severity.info":"metadata.level = 'info'","severity.debug":"metadata.level = 'debug'","severity.warn":"metadata.level = 'warn'"},auth_logs:{...n,"severity.error":"metadata.level = 'error' or metadata.level = 'fatal'","severity.warning":"metadata.level = 'warning'","severity.info":"metadata.level = 'info'","status_code.server_error":"cast(metadata.status as int64) between 500 and 599","status_code.client_error":"cast(metadata.status as int64) between 400 and 499","status_code.redirection":"cast(metadata.status as int64) between 300 and 399","status_code.success":"cast(metadata.status as int64) between 200 and 299","endpoints.admin":'REGEXP_CONTAINS(metadata.path, "/admin")',"endpoints.signup":'REGEXP_CONTAINS(metadata.path, "/signup|/invite|/verify")',"endpoints.authentication":'REGEXP_CONTAINS(metadata.path, "/token|/authorize|/callback|/otp|/magiclink")',"endpoints.recover":'REGEXP_CONTAINS(metadata.path, "/recover")',"endpoints.user":'REGEXP_CONTAINS(metadata.path, "/user")',"endpoints.logout":'REGEXP_CONTAINS(metadata.path, "/logout")'},realtime_logs:{...n},storage_logs:{...n},postgrest_logs:{...n,database:e=>`identifier = '${e}'`},pgbouncer_logs:{...n},supavisor_logs:{...n,database:e=>`m.project like '${e}%'`},pg_upgrade_logs:{...n},pg_cron_logs:{...n},etl_replication_logs:{...n,pipeline_id:e=>`pipeline_id = ${e}`}};var d=((t={}).EDGE="edge_logs",t.POSTGRES="postgres_logs",t.FUNCTIONS="function_logs",t.FN_EDGE="function_edge_logs",t.AUTH="auth_logs",t.AUTH_AUDIT="auth_audit_logs",t.REALTIME="realtime_logs",t.STORAGE="storage_logs",t.POSTGREST="postgrest_logs",t.SUPAVISOR="supavisor_logs",t.PGBOUNCER="pgbouncer_logs",t.PG_UPGRADE="pg_upgrade_logs",t.PG_CRON="pg_cron_logs",t.ETL="etl_replication_logs",t);let u={postgres_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events with ERROR, PANIC, or FATAL"},{key:"noError",label:"No Error",description:"Show all non-error events"},{key:"log",label:"Log",description:"Show all events that are log severity"}]}},edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]},product:{label:"Product",key:"product",options:[{key:"database",label:"Database",description:""},{key:"auth",label:"Auth",description:""},{key:"storage",label:"Storage",description:""},{key:"realtime",label:"Realtime",description:""}]},method:{label:"Method",key:"method",options:[{key:"get",label:"GET",description:""},{key:"options",label:"OPTIONS",description:""},{key:"put",label:"PUT",description:""},{key:"post",label:"POST",description:""},{key:"patch",label:"PATCH",description:""},{key:"delete",label:"DELETE",description:""}]}},...s.IS_PLATFORM?{function_edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]}}}:{},function_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:'Show all events that are "error" severity'},{key:"warn",label:"Warning",description:'Show all events that are "warn" severity'},{key:"info",label:"Info",description:'Show all events that are "info" severity'},{key:"debug",label:"Debug",description:'Show all events that are "debug" severity'},{key:"log",label:"Log",description:'Show all events that are "log" severity'}]}},auth_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events that have error or fatal severity"},{key:"warning",label:"Warning",description:"Show all events that have warning severity"},{key:"info",label:"Info",description:"Show all events that have info severity"}]},status_code:{label:"Status Code",key:"status_code",options:[{key:"server_error",label:"Server Error",description:"Show all requests with 5XX status code"},{key:"client_error",label:"Client Error",description:"Show all requests with 4XX status code"},{key:"redirection",label:"Redirection",description:"Show all requests that have 3XX status code"},{key:"success",label:"Success",description:"Show all requests that have 2XX status code"}]},endpoints:{label:"Endpoints",key:"endpoints",options:[{key:"admin",label:"Admin",description:"Show all admin requests"},{key:"signup",label:"Sign up",description:"Show all signup and authorization requests"},{key:"recover",label:"Password Recovery",description:"Show all password recovery requests"},{key:"authentication",label:"Authentication",description:"Show all authentication flow requests (login, otp, and Oauth2)"},{key:"user",label:"User",description:"Show all user data requests"},{key:"logout",label:"Logout",description:"Show all logout requests"}]}}},c=[{text:"Last 15 minutes",calcFrom:()=>(0,a.default)().subtract(15,"minute").toISOString(),calcTo:()=>""},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>""},{text:"Last hour",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 2 days",calcFrom:()=>(0,a.default)().subtract(2,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,a.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 5 days",calcFrom:()=>(0,a.default)().subtract(5,"day").toISOString(),calcTo:()=>""}],m=[{text:"Last hour",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,a.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>""}];e.s(["EXPLORER_DATEPICKER_HELPERS",0,m,"FILTER_OPTIONS",0,u,"LOGS_EXPLORER_DOCS_URL",0,o,"LOGS_LARGE_DATE_RANGE_DAYS_THRESHOLD",0,2,"LOGS_SOURCE_DESCRIPTION",0,{edge_logs:"Logs obtained from the network edge, containing all API requests",postgres_logs:"Database logs obtained directly from Postgres",function_logs:"Function logs generated from runtime execution",function_edge_logs:"Function call logs, containing the request and response",auth_logs:"Errors, warnings, and performance details from the auth service",auth_audit_logs:"Audit records of user signups, logins, and account changes",realtime_logs:"Realtime server for Postgres logical replication broadcasting",storage_logs:"Object storage logs",postgrest_logs:"RESTful API web server logs",supavisor_logs:"Shared connection pooler logs for PostgreSQL",pgbouncer_logs:"Dedicated connection pooler for PostgreSQL",pg_upgrade_logs:"Logs generated by the Postgres version upgrade process",pg_cron_logs:"Postgres logs from pg_cron cron jobs",etl_replication_logs:"Logs from the replication process"},"LOGS_TABLES",0,{api:"edge_logs",database:"postgres_logs",functions:"function_logs",fn_edge:"function_edge_logs",auth:"auth_logs",realtime:"realtime_logs",storage:"storage_logs",postgrest:"postgrest_logs",supavisor:"supavisor_logs",pg_upgrade:"pg_upgrade_logs",pg_cron:"postgres_logs",pgbouncer:"pgbouncer_logs",etl:"etl_replication_logs"},"LOG_ROUTES_WITH_REPLICA_SUPPORT",0,["/project/[ref]/logs/edge-logs","/project/[ref]/logs/pooler-logs","/project/[ref]/logs/postgres-logs","/project/[ref]/logs/postgrest-logs"],"LogsTableName",()=>d,"PREVIEWER_DATEPICKER_HELPERS",0,c,"SQL_FILTER_TEMPLATES",0,l,"TEMPLATES",0,i,"TIER_QUERY_LIMITS",0,{FREE:{text:"1 day",value:1,unit:"day",promptUpgrade:!0},PRO:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},PAYG:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},TEAM:{text:"28 days",value:28,unit:"day",promptUpgrade:!0},ENTERPRISE:{text:"90 days",value:90,unit:"day",promptUpgrade:!1},PLATFORM:{text:"1 day",value:1,unit:"day",promptUpgrade:!1}},"getDefaultHelper",0,e=>e.find(e=>e.default)||e[0]])},884892,e=>{"use strict";let t=class{_line;_text;_lines;model;offset;lineNumber;constructor(e,t,s){this.model=e,this.offset=t,this.lineNumber=s,this._text=e.getValue(),this._lines=this._text.split(/\r?\n/g),this._line=this._lines[s]}hasNext(){return this.lineNumber>=0||this.offset>=0}isFowardDQuote(){return!!this.hasForward()&&34===this.peekForward()}isNextDQuote(){return!!this.hasNext()&&34===this.peekNext()}isNextPeriod(){return!!this.hasNext()&&46===this.peekNext()}peekNext(){return this.offset<0?10*(this.lineNumber>0):this._line.charCodeAt(this.offset)}hasForward(){return this.lineNumber<this._lines.length||this.offset<this._line.length}peekForward(){return this.offset===this._line.length?10*(this.lineNumber!==this._lines.length):this._line.charCodeAt(this.offset+1)}next(){if(this.offset<0)return this.lineNumber>0?(this.lineNumber--,this._line=this._lines[this.lineNumber],this.offset=this._line.length-1,10):(this.lineNumber=-1,0);let e=this._line.charCodeAt(this.offset);return this.offset--,e}readArguments(){let e=0,t=0,s=0,a=0;for(;this.hasNext();){let r=this.next();switch(r){case 40:if(--e<0)return a;break;case 41:e++;break;case 123:s--;break;case 125:s++;break;case 91:t--;break;case 93:t++;break;case 34:case 39:for(;this.hasNext()&&r!==this.next(););break;case 44:!e&&!t&&!s&&a++}}return -1}readIdent(){let e=!1,t=!1,s="";for(;this.hasNext();){let a=this.peekNext();if(e&&!t&&!this._isIdentPart(a))break;if(a=this.next(),!e&&t&&34===a){e=!0;continue}if(e||32!==a&&9!==a&&10!=a){if(!e&&(34===a||this._isIdentPart(a)))e=!0,t=34===a,s=String.fromCharCode(a)+s;else if(e)if(t){if(0===a||(s=String.fromCharCode(a)+s,34===a))break}else s=String.fromCharCode(a)+s}}return s}readIdents(e){let t=[];for(;e>0;){e--;let s=this.readIdent();if(!s||(t.push(s),!this.isNextPeriod()))break}return t.reverse()}_isIdentPart(e){return 95===e||e>=97&&e<=122||e>=65&&e<=90||e>=48&&e<=57}};e.s(["default",0,t])},460988,e=>{"use strict";var t=e.i(156054);e.i(128328);var s=e.i(86086),a=e.i(55956),r=e.i(691152),o=e.i(539256),i=e.i(389959),n=e.i(285006),l=e.i(993394),d=e.i(884892);let u=e=>a.default.utc(Number(e)/1e3).toISOString(),c=e=>{let t=16===String(e).length;return!Number.isNaN(Number(e))&&t},m=(e,t)=>Object.keys(e).filter(t=>e[t]).flatMap(s=>{let a=t?`${t}.${s}`:s;return"object"==typeof e[s]?m(e[s],a):[a]}),g=(e,t)=>{let s=Object.keys(t),a=l.SQL_FILTER_TEMPLATES[e],o=e=>{let s=a[e],o=(0,r.default)(t,e);if(void 0!==o&&"function"==typeof s)return s(o);if(void 0===s)if("string"==typeof o)return`${e} = '${o}'`;else return`${e} = ${o}`;return void 0===o&&"function"==typeof s?null:s&&!1===o?null:s},i=s.map(e=>{if(void 0===t[e]||"string"==typeof t[e]&&0===t[e].length)return null;if("object"==typeof t[e]){let s=m(t[e],e).map(o).filter(Boolean);return s.length>0?`(${s.join(" or ")})`:null}{let t=o(e);return null===t?null:`(${t})`}}).filter(Boolean).join(" and ");return i?"where "+i:""},p=e=>{switch(e){case"edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response`;case"pg_cron_logs":case"postgres_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed`;case"function_logs":case"auth_logs":return"cross join unnest(metadata) as metadata";case"function_edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.response) as response
  cross join unnest(m.request) as request`;case"supavisor_logs":return"cross join unnest(metadata) as m";default:return""}},h=s.IS_PLATFORM?"where ( parsed.application_name = 'pg_cron' or regexp_contains(event_message, 'cron job') )":"where ( parsed.application_name = 'pg_cron' or event_message::text LIKE '%cron job%' )",f=e=>{let t=e.reduce((e,t)=>{let s=_(t);return e[s]+=1,e},{second:0,minute:0,hour:0,day:0});return Object.keys(t).reduce((e,s)=>t[e]>t[s]?e:s)},_=e=>({0:"second",1:"minute",2:"hour",3:"day"})[["second","minute","hour"].map(t=>e.get(t)).reduce((e,t)=>(0===t&&(e+=1),e),0)];function b(e){return e.map((e,t)=>{let s=[`## Log ${t+1}`];if(e.timestamp){let t,a=Number(e.timestamp);if(isFinite(a))t=new Date(a/1e3).toISOString();else if("string"==typeof e.timestamp){let s=new Date(e.timestamp);t=isNaN(s.getTime())?e.timestamp:s.toISOString()}else t=String(e.timestamp);s.push(`**Timestamp:** ${t}`)}e.event_message&&s.push(`**Message:** ${e.event_message}`);let{id:a,timestamp:r,event_message:o,...i}=e;return Object.keys(i).length>0&&s.push("","**Details:**","```json",JSON.stringify(i,null,2),"```"),s.join("\n")}).join("\n\n---\n\n")}let y={api:"API Gateway (Edge Network)",database:"Postgres Database",functions:"Edge Functions",fn_edge:"Edge Functions (edge runtime)",auth:"Auth",realtime:"Realtime",storage:"Storage",supavisor:"Supavisor (connection pooling)",postgrest:"PostgREST",pg_upgrade:"Postgres upgrade",pg_cron:"pg_cron",pgbouncer:"PgBouncer",etl:"ETL"},S={edge_logs:"API Gateway (Edge Network)",postgres_logs:"Postgres Database",function_logs:"Edge Functions",function_edge_logs:"Edge Functions (edge runtime)",auth_logs:"Auth",auth_audit_logs:"Auth (audit)",realtime_logs:"Realtime",storage_logs:"Storage",postgrest_logs:"PostgREST",supavisor_logs:"Supavisor (connection pooling)",pgbouncer_logs:"PgBouncer",pg_upgrade_logs:"Postgres upgrade",pg_cron_logs:"pg_cron",etl_replication_logs:"ETL"};e.s(["apiKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.apikey?.[0]?.apikey?.[0];if(t)return t.error?`${t.prefix}... <invalid: ${t.error}>`:`${t.prefix}...`},"buildLogsPrompt",0,function(e,t,s){let a,r,o=(t&&t in y?y[t]:null)??(s?(a=s.match(/\bfrom\s+(\w+)/i),(r=a?.[1])&&r in S?S[r]:null):null),i=o?` from the **${o}** service`:"",n=s?`

**Query used:**
\`\`\`sql
${s.trim()}
\`\`\``:"";return`I have ${e.length} Supabase log entr${1===e.length?"y":"ies"}${i} I'd like help debugging:

`+b(e)+n+"\n\nWhat do these logs indicate? What steps can I take to resolve it? Keep your answer very concise and actionable. Max 2 or 3 bullet points."},"checkForILIKEClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(ILIKE)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"checkForWithClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(WITH)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"extractEdgeFunctionName",0,function(e){if("string"!=typeof e||!e)return"";let t=e.split("/").filter(Boolean);return t[t.length-1]??""},"fillTimeseries",0,(e,t,s,r,o,i,n=20,l)=>{let d;if(0===e.length&&!(o&&i))return[];if(e.length>n)return e.map(e=>{let s=e[t],r=c(s)?u(s):a.default.utc(s).toISOString();return e[t]=r,e});if(e.length<=1&&!(o&&i))return e;let m=e.map(e=>a.default.utc(e[t])),g=i?a.default.utc(i):a.default.utc(Math.max.apply(null,m)),p=o?a.default.utc(o):a.default.utc(Math.min.apply(null,m)),h=e.length>0?m:[p,g],_=1;if(l){let e=l.match(/^(\d+)(m|h|d|s)$/);e?(_=parseInt(e[1],10),d=({s:"second",m:"minute",h:"hour",d:"day"})[e[2]]):d=f(h)}else d=f(h);0!==e.length||l||(d="minute");let b=e.map(e=>{let r=e[t],o=c(r)?u(r):a.default.utc(r).toISOString();return Array.isArray(s)&&0===s.length?{[t]:o}:(e[t]=o,e)}),y=p;for(;y.isBefore(g)||y.isSame(g);){if(!m.find(e=>e.year()===y.year()&&e.month()===y.month()&&e.date()===y.date()&&e.hour()===y.hour()&&e.minute()===y.minute()&&e.second()===y.second())){let e=("string"==typeof s?[s]:s).reduce((e,t)=>({...e,[t]:r}),{});b.push({[t]:y.toISOString(),...e})}y=y.add(_,d)}return b},"formatLogsAsJson",0,function(e){return JSON.stringify(e,null,2)},"formatLogsAsMarkdown",0,b,"genChartQuery",0,(e,t,s)=>{let r,o,i,n,d,u,[c,m]=(r=t.iso_timestamp_end?(0,a.default)(t.iso_timestamp_end):(0,a.default)(),o=t.iso_timestamp_start?(0,a.default)(t.iso_timestamp_start):(0,a.default)(),i="minute",n=360,d=r.diff(o,"minute"),u=r.diff(o,"hour"),d>720?(i="hour",n=120):u>72&&(i="day",n=7),[o.add(-n,i),i]),f=g(e,s),_=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 500";case"postgres_logs":case"pg_cron_logs":return"parsed.error_severity IN ('ERROR', 'FATAL', 'PANIC')";case"auth_logs":return"metadata.level = 'error' OR SAFE_CAST(metadata.status AS INT64) >= 400";case"function_logs":return"metadata.level IN ('error', 'fatal')";default:return"false"}}(e),b=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 400 AND response.status_code < 500";case"postgres_logs":return"parsed.error_severity IN ('WARNING')";case"auth_logs":return"metadata.level = 'warning'";case"function_logs":return"metadata.level IN ('warning')";default:return"false"}}(e);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,f=h);let y=p(e);return`
SELECT
-- log-event-chart
  timestamp_trunc(t.timestamp, ${m}) as timestamp,
  count(CASE WHEN NOT (${_} OR ${b}) THEN 1 END) as ok_count,
  count(CASE WHEN ${_} THEN 1 END) as error_count,
  count(CASE WHEN ${b} THEN 1 END) as warning_count,
FROM
  ${e} t
  ${y}
  ${f?f+` and t.timestamp > '${c.toISOString()}'`:`where t.timestamp > '${c.toISOString()}'`}
GROUP BY
timestamp
ORDER BY
  timestamp ASC
  `},"genCountQuery",0,(e,t)=>{let s=g(e,t);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,s=h);let a=p(e);return`SELECT count(*) as count FROM ${e} ${a} ${s}`},"genDefaultQuery",0,(e,t,a=100)=>{let r=g(e,t),o=p(e),i="order by timestamp desc";switch(e){case"edge_logs":if(!s.IS_PLATFORM)return`
-- local dev edge_logs query
select id, edge_logs.timestamp, event_message, request.method, request.path, request.search, response.status_code
from edge_logs
${o}
${r}
${i}
limit ${a};
`;return`select id, identifier, timestamp, event_message, request.method, request.path, request.search, response.status_code
  from ${e}
  ${o}
  ${r}
  ${i}
  limit ${a}
  `;case"postgres_logs":if(!s.IS_PLATFORM)return`
select postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint
from postgres_logs
${o}
${r}
${i}
limit ${a}
  `;return`select identifier, postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint from ${e}
  ${o}
  ${r}
  ${i}
  limit ${a}
  `;case"function_logs":return`select id, ${e}.timestamp, event_message, metadata.event_type, metadata.function_id, metadata.execution_id, metadata.level from ${e}
  ${o}
  ${r}
  ${i}
  limit ${a}
    `;case"auth_logs":return`select id, ${e}.timestamp, event_message, metadata.level, metadata.status, metadata.path, metadata.msg as msg, metadata.error from ${e}
  ${o}
  ${r}
  ${i}
  limit ${a}
    `;case"function_edge_logs":if(!s.IS_PLATFORM)return`
select id, function_edge_logs.timestamp, event_message
from function_edge_logs
${i}
limit ${a}
`;return`select id, ${e}.timestamp, event_message, response.status_code, request.method, request.pathname, m.function_id, m.execution_id, m.execution_time_ms, m.deployment_id, m.version from ${e}
  ${o}
  ${r}
  ${i}
  limit ${a}
  `;case"supavisor_logs":return`select id, ${e}.timestamp, event_message from ${e} ${o} ${r} ${i} limit ${a}`;case"pg_upgrade_logs":return`select id, ${e}.timestamp, event_message from ${e} ${o} ${r} ${i} limit 100`;default:return`select id, ${e}.timestamp, event_message from ${e}
  ${r}
  ${i}
  limit ${a}
  `;case"pg_cron_logs":let n=r?`${h} AND ${r.substring(6)}`:h;return`select id, postgres_logs.timestamp, event_message, parsed.error_severity, parsed.query
from postgres_logs
${o}
${n}
${i}
limit ${a}
`}},"genSingleLogQuery",0,(e,t)=>`select id, timestamp, event_message, metadata from ${e} where id = '${t}' limit 1`,"isDefaultLogPreviewFormat",0,e=>e&&e.timestamp&&e.event_message&&e.id,"isUnixMicro",0,c,"jwtAPIKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.apikey?.[0];if(!t)return;if(t.invalid)return"<invalid>";let s=t?.payload?.[0];return s&&"HS256"===s.algorithm&&"supabase"===s.issuer&&["anon","service_role"].includes(s.role)&&!s.subject?s.role:"<unrecognized>"},"maybeShowUpgradePromptIfNotEntitled",0,(e,t)=>!!t&&Math.abs((0,a.default)().diff((0,a.default)(e),"day"))>t,"role",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.authorization?.[0];if(!t||t.invalid)return;let s=t?.payload?.[0];if(s&&s.role)return s.role},"unixMicroToIsoTimestamp",0,u,"useEditorHints",0,()=>{let e=(0,t.useMonaco)();(0,i.useEffect)(()=>{if(e){let t=e.languages.registerCompletionItemProvider("pgsql",{triggerCharacters:["`"," ","."],provideCompletionItems:function(t,s,a){let r=new d.default(t,s.column-2,s.lineNumber-1);if(r.isNextDQuote())return{suggestions:[]};let i=[],l=n.default.schemas.filter(e=>r._text.includes(e.reference));if(0===l.length&&(l=n.default.schemas),r.isNextPeriod()){let t=l.flatMap(e=>e.fields).flatMap(e=>{let[t,...s]=e.path.split(".");return s}).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));i=i.concat(t)}if("`"===a.triggerCharacter||" "===a.triggerCharacter){let t=n.default.schemas.map(t=>({label:t.reference,kind:e.languages.CompletionItemKind.Class,insertText:t.reference})),s=l.flatMap(e=>e.fields).flatMap(e=>e.path.split(".").slice(0,-1)).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));i=(i=i.concat(s)).concat(t)}return{suggestions:(0,o.default)(i,"label")}}});return()=>{t.dispose()}}},[e])}])},282492,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(158639),a=e.i(802715),r=e.i(370410),o=e.i(88816),i=e.i(774803),n=e.i(544197),l=e.i(345594),d=e.i(989567),u=e.i(17313),c=e.i(389959),m=e.i(837710),g=e.i(843778),p=e.i(866205),h=e.i(917007),f=e.i(549815),_=e.i(911509),b=e.i(689805),y=e.i(793912),S=e.i(135144),v=e.i(396831),E=e.i(613580),x=e.i(592383),T=e.i(72187),j=e.i(150671),w=e.i(940009),N=e.i(912793),P=e.i(10429),I=e.i(189329);e.s(["DatabaseSelector",0,({selectedDatabaseId:e,variant:C="regular",additionalOptions:R=[],onSelectId:A=a.default,buttonProps:k,align:O="end",className:$,isForm:L=!1})=>{let q=(0,d.useRouter)(),{ref:D}=(0,s.useParams)(),[F,M]=(0,c.useState)(!1),[,U]=(0,u.useQueryState)("showConnect",u.parseAsBoolean.withDefault(!1)),{infrastructureReadReplicas:G}=(0,N.useIsFeatureEnabled)(["infrastructure:read_replicas"]),H=(0,I.useDatabaseSelectorStateSnapshot)(),K=e??H.selectedDatabaseId,{data:Q,isPending:B,isSuccess:W}=(0,j.useReadReplicasQuery)({projectRef:D}),X=Q??[],z=X.sort((e,t)=>+(e.inserted_at>t.inserted_at)).sort(e=>e.identifier===D?-1:0),Y=X.find(e=>e.identifier===K),V=(0,w.formatDatabaseRegion)(Y?.region??""),J=(0,w.formatDatabaseID)(K??""),Z=R.find(e=>e.id===K),ee=`/project/${D}/database/replication?type=Read+Replica`;return(0,c.useEffect)(()=>{e&&!L&&H.setSelectedDatabaseId(e)},[e]),(0,t.jsxs)(b.Popover_Shadcn_,{open:F,onOpenChange:M,modal:!1,children:[(0,t.jsx)(S.PopoverTrigger_Shadcn_,{asChild:!0,children:(0,t.jsxs)("div",{className:(0,g.cn)("flex cursor-pointer",$),children:[!L&&(0,t.jsx)("span",{className:"flex items-center text-foreground-lighter px-3 rounded-lg rounded-r-none text-xs border border-button border-r-0",children:"Source"}),(0,t.jsx)(m.Button,{type:"default",icon:B&&(0,t.jsx)(i.Loader2,{className:"animate-spin"}),iconRight:(0,t.jsx)(o.ChevronDown,{strokeWidth:1.5,size:12}),...k,className:(0,g.cn)("justify-start",!L&&"rounded-l-none","connected-on-right"===C&&"rounded-r-none","connected-on-left"===C&&"rounded-l-none border-l-0","connected-on-both"===C&&"rounded-none border-x-0",k?.className),children:Z?(0,t.jsx)("span",{children:Z.name}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("span",{className:"capitalize",children:B||Y?.identifier===D?"Primary database":"Read replica"})," ",W&&Y?.identifier!==D&&(0,t.jsxs)("span",{children:["(",V," - ",J,")"]})]})})]})}),(0,t.jsx)(y.PopoverContent_Shadcn_,{className:"p-0 w-64",side:"bottom",align:O,children:(0,t.jsx)(p.Command_Shadcn_,{children:(0,t.jsxs)(_.CommandList_Shadcn_,{children:[R.length>0&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-b",children:R.map(e=>(0,t.jsx)(f.CommandItem_Shadcn_,{value:e.id,className:"cursor-pointer w-full",onSelect:()=>{L||H.setSelectedDatabaseId(e.id),M(!1),A(e.id)},onClick:()=>{L||H.setSelectedDatabaseId(e.id),M(!1),A(e.id)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.name}),e.id===K&&(0,t.jsx)(r.Check,{size:14})]})},e.id))}),(0,t.jsx)(h.CommandGroup_Shadcn_,{children:(0,t.jsx)(v.ScrollArea,{className:(X||[]).length>7?"h-[210px]":"",children:z?.map(e=>{let s=(0,w.formatDatabaseRegion)(e.region),a=(0,w.formatDatabaseID)(e.identifier);if("ACTIVE_HEALTHY"!==e.status){let r=[T.REPLICA_STATUS.INIT_READ_REPLICA,T.REPLICA_STATUS.COMING_UP].includes(e.status)?"coming up":"not healthy";return(0,t.jsxs)(E.Tooltip,{children:[(0,t.jsx)(E.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("div",{className:"px-2 py-1.5 w-full flex items-center justify-between",children:(0,t.jsxs)("p",{className:"text-xs text-foreground-lighter",children:["Read replica (",s," - ",a,")"]})})}),(0,t.jsx)(E.TooltipContent,{side:"right",className:"w-80",children:(0,t.jsx)(x.Markdown,{className:"text-xs text-foreground",content:`Replica unable to accept requests as its ${r}. [View infrastructure settings](/project/${D}/settings/infrastructure) for more information.`})})]},e.identifier)}return(0,t.jsx)(f.CommandItem_Shadcn_,{value:e.identifier,className:"cursor-pointer w-full",onSelect:()=>{L||H.setSelectedDatabaseId(e.identifier),M(!1),A(e.identifier)},onClick:()=>{L||H.setSelectedDatabaseId(e.identifier),M(!1),A(e.identifier)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.identifier===D?"Primary database":`Read replica (${s} - ${a})`}),e.identifier===K&&(0,t.jsx)(r.Check,{size:16})]})},e.identifier)})})}),P.IS_PLATFORM&&G&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-t",children:(0,t.jsx)(f.CommandItem_Shadcn_,{className:"cursor-pointer w-full",onSelect:()=>{M(!1),q.push(ee)},onClick:()=>M(!1),children:(0,t.jsxs)(l.default,{href:ee,onClick:async()=>{M(!1),U(!1)},className:"w-full flex items-center gap-2",children:[(0,t.jsx)(n.Plus,{size:14,strokeWidth:1.5}),(0,t.jsx)("p",{children:"Create a new read replica"})]})})})]})})})]})}])}]);