(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,993394,e=>{"use strict";e.i(128328);var t,r=e.i(86086),s=e.i(55956),n=e.i(10429);let o=`${n.DOCS_URL}/guides/platform/logs#querying-with-the-logs-explorer`,a=[{label:"Recent Errors",mode:"simple",searchString:"[Ee]rror|\\s[45][0-9][0-9]\\s",for:["api"]},{label:"Commits",mode:"simple",searchString:"COMMIT",for:["database"]},{label:"Commits By User",description:"Count of commits made by users on the database",mode:"custom",searchString:`select
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
`,for:["api"]}],i={search_query:e=>`regexp_contains(event_message, '${e}')`},l={postgres_logs:{...i,database:e=>`identifier = '${e}'`,"severity.error":"parsed.error_severity in ('ERROR', 'FATAL', 'PANIC')","severity.noError":"parsed.error_severity not in ('ERROR', 'FATAL', 'PANIC')","severity.log":"parsed.error_severity = 'LOG'"},edge_logs:{...i,database:e=>`identifier = '${e}'`,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499","product.database":"request.path like '/rest/%' or request.path like '/graphql/%'","product.storage":"request.path like '/storage/%'","product.auth":"request.path like '/auth/%'","product.realtime":"request.path like '/realtime/%'","method.get":"request.method = 'GET'","method.post":"request.method = 'POST'","method.put":"request.method = 'PUT'","method.patch":"request.method = 'PATCH'","method.delete":"request.method = 'DELETE'","method.options":"request.method = 'OPTIONS'"},function_edge_logs:{...i,"status_code.error":"response.status_code between 500 and 599","status_code.success":"response.status_code between 200 and 299","status_code.warning":"response.status_code between 400 and 499"},function_logs:{...i,"severity.error":"metadata.level = 'error'","severity.notError":"metadata.level != 'error'","severity.log":"metadata.level = 'log'","severity.info":"metadata.level = 'info'","severity.debug":"metadata.level = 'debug'","severity.warn":"metadata.level = 'warn'"},auth_logs:{...i,"severity.error":"metadata.level = 'error' or metadata.level = 'fatal'","severity.warning":"metadata.level = 'warning'","severity.info":"metadata.level = 'info'","status_code.server_error":"cast(metadata.status as int64) between 500 and 599","status_code.client_error":"cast(metadata.status as int64) between 400 and 499","status_code.redirection":"cast(metadata.status as int64) between 300 and 399","status_code.success":"cast(metadata.status as int64) between 200 and 299","endpoints.admin":'REGEXP_CONTAINS(metadata.path, "/admin")',"endpoints.signup":'REGEXP_CONTAINS(metadata.path, "/signup|/invite|/verify")',"endpoints.authentication":'REGEXP_CONTAINS(metadata.path, "/token|/authorize|/callback|/otp|/magiclink")',"endpoints.recover":'REGEXP_CONTAINS(metadata.path, "/recover")',"endpoints.user":'REGEXP_CONTAINS(metadata.path, "/user")',"endpoints.logout":'REGEXP_CONTAINS(metadata.path, "/logout")'},realtime_logs:{...i},storage_logs:{...i},postgrest_logs:{...i,database:e=>`identifier = '${e}'`},pgbouncer_logs:{...i},supavisor_logs:{...i,database:e=>`m.project like '${e}%'`},pg_upgrade_logs:{...i},pg_cron_logs:{...i},etl_replication_logs:{...i,pipeline_id:e=>`pipeline_id = ${e}`}};var u=((t={}).EDGE="edge_logs",t.POSTGRES="postgres_logs",t.FUNCTIONS="function_logs",t.FN_EDGE="function_edge_logs",t.AUTH="auth_logs",t.AUTH_AUDIT="auth_audit_logs",t.REALTIME="realtime_logs",t.STORAGE="storage_logs",t.POSTGREST="postgrest_logs",t.SUPAVISOR="supavisor_logs",t.PGBOUNCER="pgbouncer_logs",t.PG_UPGRADE="pg_upgrade_logs",t.PG_CRON="pg_cron_logs",t.ETL="etl_replication_logs",t);let c={postgres_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events with ERROR, PANIC, or FATAL"},{key:"noError",label:"No Error",description:"Show all non-error events"},{key:"log",label:"Log",description:"Show all events that are log severity"}]}},edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]},product:{label:"Product",key:"product",options:[{key:"database",label:"Database",description:""},{key:"auth",label:"Auth",description:""},{key:"storage",label:"Storage",description:""},{key:"realtime",label:"Realtime",description:""}]},method:{label:"Method",key:"method",options:[{key:"get",label:"GET",description:""},{key:"options",label:"OPTIONS",description:""},{key:"put",label:"PUT",description:""},{key:"post",label:"POST",description:""},{key:"patch",label:"PATCH",description:""},{key:"delete",label:"DELETE",description:""}]}},...r.IS_PLATFORM?{function_edge_logs:{status_code:{label:"Status",key:"status_code",options:[{key:"error",label:"Error",description:"500 error codes"},{key:"success",label:"Success",description:"200 codes"},{key:"warning",label:"Warning",description:"400 codes"}]}}}:{},function_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:'Show all events that are "error" severity'},{key:"warn",label:"Warning",description:'Show all events that are "warn" severity'},{key:"info",label:"Info",description:'Show all events that are "info" severity'},{key:"debug",label:"Debug",description:'Show all events that are "debug" severity'},{key:"log",label:"Log",description:'Show all events that are "log" severity'}]}},auth_logs:{severity:{label:"Severity",key:"severity",options:[{key:"error",label:"Error",description:"Show all events that have error or fatal severity"},{key:"warning",label:"Warning",description:"Show all events that have warning severity"},{key:"info",label:"Info",description:"Show all events that have info severity"}]},status_code:{label:"Status Code",key:"status_code",options:[{key:"server_error",label:"Server Error",description:"Show all requests with 5XX status code"},{key:"client_error",label:"Client Error",description:"Show all requests with 4XX status code"},{key:"redirection",label:"Redirection",description:"Show all requests that have 3XX status code"},{key:"success",label:"Success",description:"Show all requests that have 2XX status code"}]},endpoints:{label:"Endpoints",key:"endpoints",options:[{key:"admin",label:"Admin",description:"Show all admin requests"},{key:"signup",label:"Sign up",description:"Show all signup and authorization requests"},{key:"recover",label:"Password Recovery",description:"Show all password recovery requests"},{key:"authentication",label:"Authentication",description:"Show all authentication flow requests (login, otp, and Oauth2)"},{key:"user",label:"User",description:"Show all user data requests"},{key:"logout",label:"Logout",description:"Show all logout requests"}]}}},d=[{text:"Last 15 minutes",calcFrom:()=>(0,s.default)().subtract(15,"minute").toISOString(),calcTo:()=>""},{text:"Last 30 minutes",calcFrom:()=>(0,s.default)().subtract(30,"minute").toISOString(),calcTo:()=>""},{text:"Last hour",calcFrom:()=>(0,s.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,s.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,s.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 2 days",calcFrom:()=>(0,s.default)().subtract(2,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,s.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 5 days",calcFrom:()=>(0,s.default)().subtract(5,"day").toISOString(),calcTo:()=>""}],g=[{text:"Last hour",calcFrom:()=>(0,s.default)().subtract(1,"hour").toISOString(),calcTo:()=>"",default:!0},{text:"Last 3 hours",calcFrom:()=>(0,s.default)().subtract(3,"hour").toISOString(),calcTo:()=>""},{text:"Last 24 hours",calcFrom:()=>(0,s.default)().subtract(1,"day").toISOString(),calcTo:()=>""},{text:"Last 3 days",calcFrom:()=>(0,s.default)().subtract(3,"day").toISOString(),calcTo:()=>""},{text:"Last 7 days",calcFrom:()=>(0,s.default)().subtract(7,"day").toISOString(),calcTo:()=>""}];e.s(["EXPLORER_DATEPICKER_HELPERS",0,g,"FILTER_OPTIONS",0,c,"LOGS_EXPLORER_DOCS_URL",0,o,"LOGS_LARGE_DATE_RANGE_DAYS_THRESHOLD",0,2,"LOGS_SOURCE_DESCRIPTION",0,{edge_logs:"Logs obtained from the network edge, containing all API requests",postgres_logs:"Database logs obtained directly from Postgres",function_logs:"Function logs generated from runtime execution",function_edge_logs:"Function call logs, containing the request and response",auth_logs:"Errors, warnings, and performance details from the auth service",auth_audit_logs:"Audit records of user signups, logins, and account changes",realtime_logs:"Realtime server for Postgres logical replication broadcasting",storage_logs:"Object storage logs",postgrest_logs:"RESTful API web server logs",supavisor_logs:"Shared connection pooler logs for PostgreSQL",pgbouncer_logs:"Dedicated connection pooler for PostgreSQL",pg_upgrade_logs:"Logs generated by the Postgres version upgrade process",pg_cron_logs:"Postgres logs from pg_cron cron jobs",etl_replication_logs:"Logs from the replication process"},"LOGS_TABLES",0,{api:"edge_logs",database:"postgres_logs",functions:"function_logs",fn_edge:"function_edge_logs",auth:"auth_logs",realtime:"realtime_logs",storage:"storage_logs",postgrest:"postgrest_logs",supavisor:"supavisor_logs",pg_upgrade:"pg_upgrade_logs",pg_cron:"postgres_logs",pgbouncer:"pgbouncer_logs",etl:"etl_replication_logs"},"LOG_ROUTES_WITH_REPLICA_SUPPORT",0,["/project/[ref]/logs/edge-logs","/project/[ref]/logs/pooler-logs","/project/[ref]/logs/postgres-logs","/project/[ref]/logs/postgrest-logs"],"LogsTableName",()=>u,"PREVIEWER_DATEPICKER_HELPERS",0,d,"SQL_FILTER_TEMPLATES",0,l,"TEMPLATES",0,a,"TIER_QUERY_LIMITS",0,{FREE:{text:"1 day",value:1,unit:"day",promptUpgrade:!0},PRO:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},PAYG:{text:"7 days",value:7,unit:"day",promptUpgrade:!0},TEAM:{text:"28 days",value:28,unit:"day",promptUpgrade:!0},ENTERPRISE:{text:"90 days",value:90,unit:"day",promptUpgrade:!1},PLATFORM:{text:"1 day",value:1,unit:"day",promptUpgrade:!1}},"getDefaultHelper",0,e=>e.find(e=>e.default)||e[0]])},156054,350660,e=>{"use strict";function t(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(e);t&&(s=s.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,s)}return r}function r(e){for(var r=1;r<arguments.length;r++){var s=null!=arguments[r]?arguments[r]:{};r%2?t(Object(s),!0).forEach(function(t){var r;r=s[t],t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(s)):t(Object(s)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(s,t))})}return e}function s(e,t){(null==t||t>e.length)&&(t=e.length);for(var r=0,s=Array(t);r<t;r++)s[r]=e[r];return s}function n(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var s=Object.getOwnPropertySymbols(e);t&&(s=s.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,s)}return r}function o(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?n(Object(r),!0).forEach(function(t){var s;s=r[t],t in e?Object.defineProperty(e,t,{value:s,enumerable:!0,configurable:!0,writable:!0}):e[t]=s}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):n(Object(r)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))})}return e}function a(e){return function t(){for(var r=this,s=arguments.length,n=Array(s),o=0;o<s;o++)n[o]=arguments[o];return n.length>=e.length?e.apply(this,n):function(){for(var e=arguments.length,s=Array(e),o=0;o<e;o++)s[o]=arguments[o];return t.apply(r,[].concat(n,s))}}}function i(e){return({}).toString.call(e).includes("Object")}function l(e){return"function"==typeof e}var u,c,d=a(function(e,t){throw Error(e[t]||e.default)})({initialIsRequired:"initial state is required",initialType:"initial state should be an object",initialContent:"initial state shouldn't be an empty object",handlerType:"handler should be an object or a function",handlersType:"all handlers should be a functions",selectorType:"selector should be a function",changeType:"provided value of changes should be an object",changeField:'it seams you want to change a field in the state which is not specified in the "initial" state',default:"an unknown error accured in `state-local` package"}),g=function(e,t){return i(t)||d("changeType"),Object.keys(t).some(function(t){return!Object.prototype.hasOwnProperty.call(e,t)})&&d("changeField"),t},p=function(e){l(e)||d("selectorType")},m=function(e){l(e)||i(e)||d("handlerType"),i(e)&&Object.values(e).some(function(e){return!l(e)})&&d("handlersType")},f=function(e){e||d("initialIsRequired"),i(e)||d("initialType"),Object.keys(e).length||d("initialContent")};function h(e,t){return l(t)?t(e.current):t}function _(e,t){return e.current=o(o({},e.current),t),t}function b(e,t,r){return l(t)?t(e.current):Object.keys(r).forEach(function(r){var s;return null==(s=t[r])?void 0:s.call(t,e.current[r])}),r}var y={configIsRequired:"the configuration object is required",configType:"the configuration object should be an object",default:"an unknown error accured in `@monaco-editor/loader` package",deprecation:"Deprecation warning!\n    You are using deprecated way of configuration.\n\n    Instead of using\n      monaco.config({ urls: { monacoBase: '...' } })\n    use\n      monaco.config({ paths: { vs: '...' } })\n\n    For more please check the link https://github.com/suren-atoyan/monaco-loader#config\n  "},v=(u=function(e,t){throw Error(e[t]||e.default)},function e(){for(var t=this,r=arguments.length,s=Array(r),n=0;n<r;n++)s[n]=arguments[n];return s.length>=u.length?u.apply(this,s):function(){for(var r=arguments.length,n=Array(r),o=0;o<r;o++)n[o]=arguments[o];return e.apply(t,[].concat(s,n))}})(y);let S=function(e){return(e||v("configIsRequired"),({}).toString.call(e).includes("Object")||v("configType"),e.urls)?(console.warn(y.deprecation),{paths:{vs:e.urls.monacoBase}}):e},E=function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}};var O={type:"cancelation",msg:"operation is manually canceled"};let w=function(e){var t=!1,r=new Promise(function(r,s){e.then(function(e){return t?s(O):r(e)}),e.catch(s)});return r.cancel=function(){return t=!0},r};var T=function(e){if(Array.isArray(e))return e}(c=({create:function(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};f(e),m(t);var r={current:e},s=a(b)(r,t),n=a(_)(r),o=a(g)(e),i=a(h)(r);return[function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:function(e){return e};return p(e),e(r.current)},function(e){(function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}})(s,n,o,i)(e)}]}}).create({config:{paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs"}},isInitialized:!1,resolve:null,reject:null,monaco:null}))||function(e){if("u">typeof Symbol&&Symbol.iterator in Object(e)){var t=[],r=!0,s=!1,n=void 0;try{for(var o,a=e[Symbol.iterator]();!(r=(o=a.next()).done)&&(t.push(o.value),2!==t.length);r=!0);}catch(e){s=!0,n=e}finally{try{r||null==a.return||a.return()}finally{if(s)throw n}}return t}}(c)||function(e){if(e){if("string"==typeof e)return s(e,2);var t=Object.prototype.toString.call(e).slice(8,-1);if("Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t)return Array.from(e);if("Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))return s(e,2)}}(c)||function(){throw TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),P=T[0],j=T[1];function R(e){return document.body.appendChild(e)}function I(e){var t,r,s=P(function(e){return{config:e.config,reject:e.reject}}),n=(t="".concat(s.config.paths.vs,"/loader.js"),r=document.createElement("script"),t&&(r.src=t),r);return n.onload=function(){return e()},n.onerror=s.reject,n}function k(){var e=P(function(e){return{config:e.config,resolve:e.resolve,reject:e.reject}}),t=window.require;t.config(e.config),t(["vs/editor/editor.main"],function(t){A(t),e.resolve(t)},function(t){e.reject(t)})}function A(e){P().monaco||j({monaco:e})}var N=new Promise(function(e,t){return j({resolve:e,reject:t})});let $={config:function(e){var t=S(e),s=t.monaco,n=function(e,t){if(null==e)return{};var r,s,n=function(e,t){if(null==e)return{};var r,s,n={},o=Object.keys(e);for(s=0;s<o.length;s++)r=o[s],t.indexOf(r)>=0||(n[r]=e[r]);return n}(e,t);if(Object.getOwnPropertySymbols){var o=Object.getOwnPropertySymbols(e);for(s=0;s<o.length;s++)r=o[s],!(t.indexOf(r)>=0)&&Object.prototype.propertyIsEnumerable.call(e,r)&&(n[r]=e[r])}return n}(t,["monaco"]);j(function(e){return{config:function e(t,s){return Object.keys(s).forEach(function(r){s[r]instanceof Object&&t[r]&&Object.assign(s[r],e(t[r],s[r]))}),r(r({},t),s)}(e.config,n),monaco:s}})},init:function(){var e=P(function(e){return{monaco:e.monaco,isInitialized:e.isInitialized,resolve:e.resolve}});if(!e.isInitialized){if(j({isInitialized:!0}),e.monaco)return e.resolve(e.monaco),w(N);if(window.monaco&&window.monaco.editor)return A(window.monaco),e.resolve(window.monaco),w(N);E(R,I)(k)}return w(N)},__getMonacoInstance:function(){return P(function(e){return e.monaco})}};e.s(["default",0,$],350660);var L=e.i(389959),C={display:"flex",position:"relative",textAlign:"initial"},M={width:"100%"},x={display:"none"},q={display:"flex",height:"100%",width:"100%",justifyContent:"center",alignItems:"center"},F=function({children:e}){return L.default.createElement("div",{style:q},e)},D=(0,L.memo)(function({width:e,height:t,isEditorReady:r,loading:s,_ref:n,className:o,wrapperProps:a}){return L.default.createElement("section",{style:{...C,width:e,height:t},...a},!r&&L.default.createElement(F,null,s),L.default.createElement("div",{ref:n,style:{...M,...!r&&x},className:o}))}),G=function(e){(0,L.useEffect)(e,[])},U=function(e,t,r=!0){let s=(0,L.useRef)(!0);(0,L.useEffect)(s.current||!r?()=>{s.current=!1}:e,t)};function H(){}function X(e,t,r,s){var n,o,a,i,l,u;return n=e,o=s,n.editor.getModel(B(n,o))||(a=e,i=t,l=r,u=s,a.editor.createModel(i,l,u?B(a,u):void 0))}function B(e,t){return e.Uri.parse(t)}var V=(0,L.memo)(function({original:e,modified:t,language:r,originalLanguage:s,modifiedLanguage:n,originalModelPath:o,modifiedModelPath:a,keepCurrentOriginalModel:i=!1,keepCurrentModifiedModel:l=!1,theme:u="light",loading:c="Loading...",options:d={},height:g="100%",width:p="100%",className:m,wrapperProps:f={},beforeMount:h=H,onMount:_=H}){let[b,y]=(0,L.useState)(!1),[v,S]=(0,L.useState)(!0),E=(0,L.useRef)(null),O=(0,L.useRef)(null),w=(0,L.useRef)(null),T=(0,L.useRef)(_),P=(0,L.useRef)(h),j=(0,L.useRef)(!1);G(()=>{let e=$.init();return e.then(e=>(O.current=e)&&S(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>{let t;return E.current?(t=E.current?.getModel(),void(i||t?.original?.dispose(),l||t?.modified?.dispose(),E.current?.dispose())):e.cancel()}}),U(()=>{if(E.current&&O.current){let t=E.current.getOriginalEditor(),n=X(O.current,e||"",s||r||"text",o||"");n!==t.getModel()&&t.setModel(n)}},[o],b),U(()=>{if(E.current&&O.current){let e=E.current.getModifiedEditor(),s=X(O.current,t||"",n||r||"text",a||"");s!==e.getModel()&&e.setModel(s)}},[a],b),U(()=>{let e=E.current.getModifiedEditor();e.getOption(O.current.editor.EditorOption.readOnly)?e.setValue(t||""):t!==e.getValue()&&(e.executeEdits("",[{range:e.getModel().getFullModelRange(),text:t||"",forceMoveMarkers:!0}]),e.pushUndoStop())},[t],b),U(()=>{E.current?.getModel()?.original.setValue(e||"")},[e],b),U(()=>{let{original:e,modified:t}=E.current.getModel();O.current.editor.setModelLanguage(e,s||r||"text"),O.current.editor.setModelLanguage(t,n||r||"text")},[r,s,n],b),U(()=>{O.current?.editor.setTheme(u)},[u],b),U(()=>{E.current?.updateOptions(d)},[d],b);let R=(0,L.useCallback)(()=>{if(!O.current)return;P.current(O.current);let i=X(O.current,e||"",s||r||"text",o||""),l=X(O.current,t||"",n||r||"text",a||"");E.current?.setModel({original:i,modified:l})},[r,t,n,e,s,o,a]),I=(0,L.useCallback)(()=>{!j.current&&w.current&&(E.current=O.current.editor.createDiffEditor(w.current,{automaticLayout:!0,...d}),R(),O.current?.editor.setTheme(u),y(!0),j.current=!0)},[d,u,R]);return(0,L.useEffect)(()=>{b&&T.current(E.current,O.current)},[b]),(0,L.useEffect)(()=>{v||b||I()},[v,b,I]),L.default.createElement(D,{width:p,height:g,isEditorReady:b,loading:c,_ref:w,className:m,wrapperProps:f})}),W=function(e){let t=(0,L.useRef)();return(0,L.useEffect)(()=>{t.current=e},[e]),t.current},K=new Map,Q=(0,L.memo)(function({defaultValue:e,defaultLanguage:t,defaultPath:r,value:s,language:n,path:o,theme:a="light",line:i,loading:l="Loading...",options:u={},overrideServices:c={},saveViewState:d=!0,keepCurrentModel:g=!1,width:p="100%",height:m="100%",className:f,wrapperProps:h={},beforeMount:_=H,onMount:b=H,onChange:y,onValidate:v=H}){let[S,E]=(0,L.useState)(!1),[O,w]=(0,L.useState)(!0),T=(0,L.useRef)(null),P=(0,L.useRef)(null),j=(0,L.useRef)(null),R=(0,L.useRef)(b),I=(0,L.useRef)(_),k=(0,L.useRef)(),A=(0,L.useRef)(s),N=W(o),C=(0,L.useRef)(!1),M=(0,L.useRef)(!1);G(()=>{let e=$.init();return e.then(e=>(T.current=e)&&w(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>P.current?void(k.current?.dispose(),g?d&&K.set(o,P.current.saveViewState()):P.current.getModel()?.dispose(),P.current.dispose()):e.cancel()}),U(()=>{let a=X(T.current,e||s||"",t||n||"",o||r||"");a!==P.current?.getModel()&&(d&&K.set(N,P.current?.saveViewState()),P.current?.setModel(a),d&&P.current?.restoreViewState(K.get(o)))},[o],S),U(()=>{P.current?.updateOptions(u)},[u],S),U(()=>{P.current&&void 0!==s&&(P.current.getOption(T.current.editor.EditorOption.readOnly)?P.current.setValue(s):s!==P.current.getValue()&&(M.current=!0,P.current.executeEdits("",[{range:P.current.getModel().getFullModelRange(),text:s,forceMoveMarkers:!0}]),P.current.pushUndoStop(),M.current=!1))},[s],S),U(()=>{let e=P.current?.getModel();e&&n&&T.current?.editor.setModelLanguage(e,n)},[n],S),U(()=>{void 0!==i&&P.current?.revealLine(i)},[i],S),U(()=>{T.current?.editor.setTheme(a)},[a],S);let x=(0,L.useCallback)(()=>{if(!(!j.current||!T.current)&&!C.current){I.current(T.current);let l=o||r,g=X(T.current,s||e||"",t||n||"",l||"");P.current=T.current?.editor.create(j.current,{model:g,automaticLayout:!0,...u},c),d&&P.current.restoreViewState(K.get(l)),T.current.editor.setTheme(a),void 0!==i&&P.current.revealLine(i),E(!0),C.current=!0}},[e,t,r,s,n,o,u,c,d,a,i]);return(0,L.useEffect)(()=>{S&&R.current(P.current,T.current)},[S]),(0,L.useEffect)(()=>{O||S||x()},[O,S,x]),A.current=s,(0,L.useEffect)(()=>{S&&y&&(k.current?.dispose(),k.current=P.current?.onDidChangeModelContent(e=>{M.current||y(P.current.getValue(),e)}))},[S,y]),(0,L.useEffect)(()=>{if(S){let e=T.current.editor.onDidChangeMarkers(e=>{let t=P.current.getModel()?.uri;if(t&&e.find(e=>e.path===t.path)){let e=T.current.editor.getModelMarkers({resource:t});v?.(e)}});return()=>{e?.dispose()}}return()=>{}},[S,v]),L.default.createElement(D,{width:p,height:m,isEditorReady:S,loading:l,_ref:j,className:f,wrapperProps:h})});e.s(["DiffEditor",0,V,"Editor",0,Q,"default",0,Q,"useMonaco",0,function(){let[e,t]=(0,L.useState)($.__getMonacoInstance());return G(()=>{let r;return e||(r=$.init()).then(e=>{t(e)}),()=>r?.cancel()}),e}],156054)},884892,e=>{"use strict";let t=class{_line;_text;_lines;model;offset;lineNumber;constructor(e,t,r){this.model=e,this.offset=t,this.lineNumber=r,this._text=e.getValue(),this._lines=this._text.split(/\r?\n/g),this._line=this._lines[r]}hasNext(){return this.lineNumber>=0||this.offset>=0}isFowardDQuote(){return!!this.hasForward()&&34===this.peekForward()}isNextDQuote(){return!!this.hasNext()&&34===this.peekNext()}isNextPeriod(){return!!this.hasNext()&&46===this.peekNext()}peekNext(){return this.offset<0?10*(this.lineNumber>0):this._line.charCodeAt(this.offset)}hasForward(){return this.lineNumber<this._lines.length||this.offset<this._line.length}peekForward(){return this.offset===this._line.length?10*(this.lineNumber!==this._lines.length):this._line.charCodeAt(this.offset+1)}next(){if(this.offset<0)return this.lineNumber>0?(this.lineNumber--,this._line=this._lines[this.lineNumber],this.offset=this._line.length-1,10):(this.lineNumber=-1,0);let e=this._line.charCodeAt(this.offset);return this.offset--,e}readArguments(){let e=0,t=0,r=0,s=0;for(;this.hasNext();){let n=this.next();switch(n){case 40:if(--e<0)return s;break;case 41:e++;break;case 123:r--;break;case 125:r++;break;case 91:t--;break;case 93:t++;break;case 34:case 39:for(;this.hasNext()&&n!==this.next(););break;case 44:!e&&!t&&!r&&s++}}return -1}readIdent(){let e=!1,t=!1,r="";for(;this.hasNext();){let s=this.peekNext();if(e&&!t&&!this._isIdentPart(s))break;if(s=this.next(),!e&&t&&34===s){e=!0;continue}if(e||32!==s&&9!==s&&10!=s){if(!e&&(34===s||this._isIdentPart(s)))e=!0,t=34===s,r=String.fromCharCode(s)+r;else if(e)if(t){if(0===s||(r=String.fromCharCode(s)+r,34===s))break}else r=String.fromCharCode(s)+r}}return r}readIdents(e){let t=[];for(;e>0;){e--;let r=this.readIdent();if(!r||(t.push(r),!this.isNextPeriod()))break}return t.reverse()}_isIdentPart(e){return 95===e||e>=97&&e<=122||e>=65&&e<=90||e>=48&&e<=57}};e.s(["default",0,t])},460988,e=>{"use strict";var t=e.i(156054);e.i(128328);var r=e.i(86086),s=e.i(55956),n=e.i(691152),o=e.i(539256),a=e.i(389959),i=e.i(285006),l=e.i(993394),u=e.i(884892);let c=e=>s.default.utc(Number(e)/1e3).toISOString(),d=e=>{let t=16===String(e).length;return!Number.isNaN(Number(e))&&t},g=(e,t)=>Object.keys(e).filter(t=>e[t]).flatMap(r=>{let s=t?`${t}.${r}`:r;return"object"==typeof e[r]?g(e[r],s):[s]}),p=(e,t)=>{let r=Object.keys(t),s=l.SQL_FILTER_TEMPLATES[e],o=e=>{let r=s[e],o=(0,n.default)(t,e);if(void 0!==o&&"function"==typeof r)return r(o);if(void 0===r)if("string"==typeof o)return`${e} = '${o}'`;else return`${e} = ${o}`;return void 0===o&&"function"==typeof r?null:r&&!1===o?null:r},a=r.map(e=>{if(void 0===t[e]||"string"==typeof t[e]&&0===t[e].length)return null;if("object"==typeof t[e]){let r=g(t[e],e).map(o).filter(Boolean);return r.length>0?`(${r.join(" or ")})`:null}{let t=o(e);return null===t?null:`(${t})`}}).filter(Boolean).join(" and ");return a?"where "+a:""},m=e=>{switch(e){case"edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response`;case"pg_cron_logs":case"postgres_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed`;case"function_logs":case"auth_logs":return"cross join unnest(metadata) as metadata";case"function_edge_logs":return`cross join unnest(metadata) as m
  cross join unnest(m.response) as response
  cross join unnest(m.request) as request`;case"supavisor_logs":return"cross join unnest(metadata) as m";default:return""}},f=r.IS_PLATFORM?"where ( parsed.application_name = 'pg_cron' or regexp_contains(event_message, 'cron job') )":"where ( parsed.application_name = 'pg_cron' or event_message::text LIKE '%cron job%' )",h=e=>{let t=e.reduce((e,t)=>{let r=_(t);return e[r]+=1,e},{second:0,minute:0,hour:0,day:0});return Object.keys(t).reduce((e,r)=>t[e]>t[r]?e:r)},_=e=>({0:"second",1:"minute",2:"hour",3:"day"})[["second","minute","hour"].map(t=>e.get(t)).reduce((e,t)=>(0===t&&(e+=1),e),0)];function b(e){return e.map((e,t)=>{let r=[`## Log ${t+1}`];if(e.timestamp){let t,s=Number(e.timestamp);if(isFinite(s))t=new Date(s/1e3).toISOString();else if("string"==typeof e.timestamp){let r=new Date(e.timestamp);t=isNaN(r.getTime())?e.timestamp:r.toISOString()}else t=String(e.timestamp);r.push(`**Timestamp:** ${t}`)}e.event_message&&r.push(`**Message:** ${e.event_message}`);let{id:s,timestamp:n,event_message:o,...a}=e;return Object.keys(a).length>0&&r.push("","**Details:**","```json",JSON.stringify(a,null,2),"```"),r.join("\n")}).join("\n\n---\n\n")}let y={api:"API Gateway (Edge Network)",database:"Postgres Database",functions:"Edge Functions",fn_edge:"Edge Functions (edge runtime)",auth:"Auth",realtime:"Realtime",storage:"Storage",supavisor:"Supavisor (connection pooling)",postgrest:"PostgREST",pg_upgrade:"Postgres upgrade",pg_cron:"pg_cron",pgbouncer:"PgBouncer",etl:"ETL"},v={edge_logs:"API Gateway (Edge Network)",postgres_logs:"Postgres Database",function_logs:"Edge Functions",function_edge_logs:"Edge Functions (edge runtime)",auth_logs:"Auth",auth_audit_logs:"Auth (audit)",realtime_logs:"Realtime",storage_logs:"Storage",postgrest_logs:"PostgREST",supavisor_logs:"Supavisor (connection pooling)",pgbouncer_logs:"PgBouncer",pg_upgrade_logs:"Postgres upgrade",pg_cron_logs:"pg_cron",etl_replication_logs:"ETL"};e.s(["apiKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.apikey?.[0]?.apikey?.[0];if(t)return t.error?`${t.prefix}... <invalid: ${t.error}>`:`${t.prefix}...`},"buildLogsPrompt",0,function(e,t,r){let s,n,o=(t&&t in y?y[t]:null)??(r?(s=r.match(/\bfrom\s+(\w+)/i),(n=s?.[1])&&n in v?v[n]:null):null),a=o?` from the **${o}** service`:"",i=r?`

**Query used:**
\`\`\`sql
${r.trim()}
\`\`\``:"";return`I have ${e.length} Supabase log entr${1===e.length?"y":"ies"}${a} I'd like help debugging:

`+b(e)+i+"\n\nWhat do these logs indicate? What steps can I take to resolve it? Keep your answer very concise and actionable. Max 2 or 3 bullet points."},"checkForILIKEClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(ILIKE)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"checkForWithClause",0,function(e){let t=e.replace(/--.*$/gm,"").replace(/\/\*[\s\S]*?\*\//gm,"");return/\b(WITH)\b(?=(?:[^']*'[^']*')*[^']*$)/i.test(t)},"extractEdgeFunctionName",0,function(e){if("string"!=typeof e||!e)return"";let t=e.split("/").filter(Boolean);return t[t.length-1]??""},"fillTimeseries",0,(e,t,r,n,o,a,i=20,l)=>{let u;if(0===e.length&&!(o&&a))return[];if(e.length>i)return e.map(e=>{let r=e[t],n=d(r)?c(r):s.default.utc(r).toISOString();return e[t]=n,e});if(e.length<=1&&!(o&&a))return e;let g=e.map(e=>s.default.utc(e[t])),p=a?s.default.utc(a):s.default.utc(Math.max.apply(null,g)),m=o?s.default.utc(o):s.default.utc(Math.min.apply(null,g)),f=e.length>0?g:[m,p],_=1;if(l){let e=l.match(/^(\d+)(m|h|d|s)$/);e?(_=parseInt(e[1],10),u=({s:"second",m:"minute",h:"hour",d:"day"})[e[2]]):u=h(f)}else u=h(f);0!==e.length||l||(u="minute");let b=e.map(e=>{let n=e[t],o=d(n)?c(n):s.default.utc(n).toISOString();return Array.isArray(r)&&0===r.length?{[t]:o}:(e[t]=o,e)}),y=m;for(;y.isBefore(p)||y.isSame(p);){if(!g.find(e=>e.year()===y.year()&&e.month()===y.month()&&e.date()===y.date()&&e.hour()===y.hour()&&e.minute()===y.minute()&&e.second()===y.second())){let e=("string"==typeof r?[r]:r).reduce((e,t)=>({...e,[t]:n}),{});b.push({[t]:y.toISOString(),...e})}y=y.add(_,u)}return b},"formatLogsAsJson",0,function(e){return JSON.stringify(e,null,2)},"formatLogsAsMarkdown",0,b,"genChartQuery",0,(e,t,r)=>{let n,o,a,i,u,c,[d,g]=(n=t.iso_timestamp_end?(0,s.default)(t.iso_timestamp_end):(0,s.default)(),o=t.iso_timestamp_start?(0,s.default)(t.iso_timestamp_start):(0,s.default)(),a="minute",i=360,u=n.diff(o,"minute"),c=n.diff(o,"hour"),u>720?(a="hour",i=120):c>72&&(a="day",i=7),[o.add(-i,a),a]),h=p(e,r),_=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 500";case"postgres_logs":case"pg_cron_logs":return"parsed.error_severity IN ('ERROR', 'FATAL', 'PANIC')";case"auth_logs":return"metadata.level = 'error' OR SAFE_CAST(metadata.status AS INT64) >= 400";case"function_logs":return"metadata.level IN ('error', 'fatal')";default:return"false"}}(e),b=function(e){switch(e){case"edge_logs":case"function_edge_logs":return"response.status_code >= 400 AND response.status_code < 500";case"postgres_logs":return"parsed.error_severity IN ('WARNING')";case"auth_logs":return"metadata.level = 'warning'";case"function_logs":return"metadata.level IN ('warning')";default:return"false"}}(e);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,h=f);let y=m(e);return`
SELECT
-- log-event-chart
  timestamp_trunc(t.timestamp, ${g}) as timestamp,
  count(CASE WHEN NOT (${_} OR ${b}) THEN 1 END) as ok_count,
  count(CASE WHEN ${_} THEN 1 END) as error_count,
  count(CASE WHEN ${b} THEN 1 END) as warning_count,
FROM
  ${e} t
  ${y}
  ${h?h+` and t.timestamp > '${d.toISOString()}'`:`where t.timestamp > '${d.toISOString()}'`}
GROUP BY
timestamp
ORDER BY
  timestamp ASC
  `},"genCountQuery",0,(e,t)=>{let r=p(e,t);e===l.LogsTableName.PG_CRON&&(e=l.LogsTableName.POSTGRES,r=f);let s=m(e);return`SELECT count(*) as count FROM ${e} ${s} ${r}`},"genDefaultQuery",0,(e,t,s=100)=>{let n=p(e,t),o=m(e),a="order by timestamp desc";switch(e){case"edge_logs":if(!r.IS_PLATFORM)return`
-- local dev edge_logs query
select id, edge_logs.timestamp, event_message, request.method, request.path, request.search, response.status_code
from edge_logs
${o}
${n}
${a}
limit ${s};
`;return`select id, identifier, timestamp, event_message, request.method, request.path, request.search, response.status_code
  from ${e}
  ${o}
  ${n}
  ${a}
  limit ${s}
  `;case"postgres_logs":if(!r.IS_PLATFORM)return`
select postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint
from postgres_logs
${o}
${n}
${a}
limit ${s}
  `;return`select identifier, postgres_logs.timestamp, id, event_message, parsed.error_severity, parsed.detail, parsed.hint from ${e}
  ${o}
  ${n}
  ${a}
  limit ${s}
  `;case"function_logs":return`select id, ${e}.timestamp, event_message, metadata.event_type, metadata.function_id, metadata.execution_id, metadata.level from ${e}
  ${o}
  ${n}
  ${a}
  limit ${s}
    `;case"auth_logs":return`select id, ${e}.timestamp, event_message, metadata.level, metadata.status, metadata.path, metadata.msg as msg, metadata.error from ${e}
  ${o}
  ${n}
  ${a}
  limit ${s}
    `;case"function_edge_logs":if(!r.IS_PLATFORM)return`
select id, function_edge_logs.timestamp, event_message
from function_edge_logs
${a}
limit ${s}
`;return`select id, ${e}.timestamp, event_message, response.status_code, request.method, request.pathname, m.function_id, m.execution_id, m.execution_time_ms, m.deployment_id, m.version from ${e}
  ${o}
  ${n}
  ${a}
  limit ${s}
  `;case"supavisor_logs":return`select id, ${e}.timestamp, event_message from ${e} ${o} ${n} ${a} limit ${s}`;case"pg_upgrade_logs":return`select id, ${e}.timestamp, event_message from ${e} ${o} ${n} ${a} limit 100`;default:return`select id, ${e}.timestamp, event_message from ${e}
  ${n}
  ${a}
  limit ${s}
  `;case"pg_cron_logs":let i=n?`${f} AND ${n.substring(6)}`:f;return`select id, postgres_logs.timestamp, event_message, parsed.error_severity, parsed.query
from postgres_logs
${o}
${i}
${a}
limit ${s}
`}},"genSingleLogQuery",0,(e,t)=>`select id, timestamp, event_message, metadata from ${e} where id = '${t}' limit 1`,"isDefaultLogPreviewFormat",0,e=>e&&e.timestamp&&e.event_message&&e.id,"isUnixMicro",0,d,"jwtAPIKey",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.apikey?.[0];if(!t)return;if(t.invalid)return"<invalid>";let r=t?.payload?.[0];return r&&"HS256"===r.algorithm&&"supabase"===r.issuer&&["anon","service_role"].includes(r.role)&&!r.subject?r.role:"<unrecognized>"},"maybeShowUpgradePromptIfNotEntitled",0,(e,t)=>!!t&&Math.abs((0,s.default)().diff((0,s.default)(e),"day"))>t,"role",0,function(e){let t=e?.[0]?.request?.[0]?.sb?.[0]?.jwt?.[0]?.authorization?.[0];if(!t||t.invalid)return;let r=t?.payload?.[0];if(r&&r.role)return r.role},"unixMicroToIsoTimestamp",0,c,"useEditorHints",0,()=>{let e=(0,t.useMonaco)();(0,a.useEffect)(()=>{if(e){let t=e.languages.registerCompletionItemProvider("pgsql",{triggerCharacters:["`"," ","."],provideCompletionItems:function(t,r,s){let n=new u.default(t,r.column-2,r.lineNumber-1);if(n.isNextDQuote())return{suggestions:[]};let a=[],l=i.default.schemas.filter(e=>n._text.includes(e.reference));if(0===l.length&&(l=i.default.schemas),n.isNextPeriod()){let t=l.flatMap(e=>e.fields).flatMap(e=>{let[t,...r]=e.path.split(".");return r}).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));a=a.concat(t)}if("`"===s.triggerCharacter||" "===s.triggerCharacter){let t=i.default.schemas.map(t=>({label:t.reference,kind:e.languages.CompletionItemKind.Class,insertText:t.reference})),r=l.flatMap(e=>e.fields).flatMap(e=>e.path.split(".").slice(0,-1)).map(t=>({label:t,kind:e.languages.CompletionItemKind.Property,insertText:t}));a=(a=a.concat(r)).concat(t)}return{suggestions:(0,o.default)(a,"label")}}});return()=>{t.dispose()}}},[e])}])}]);