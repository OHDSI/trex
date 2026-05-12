(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,282492,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(158639),a=e.i(802715),r=e.i(370410),n=e.i(88816),i=e.i(774803),o=e.i(544197),l=e.i(345594),c=e.i(989567),u=e.i(17313),d=e.i(389959),m=e.i(837710),p=e.i(843778),_=e.i(866205),h=e.i(917007),f=e.i(549815),x=e.i(911509),g=e.i(689805),y=e.i(793912),b=e.i(135144),j=e.i(396831),S=e.i(613580),v=e.i(592383),E=e.i(72187),q=e.i(150671),w=e.i(940009),C=e.i(912793),A=e.i(10429),R=e.i(189329);e.s(["DatabaseSelector",0,({selectedDatabaseId:e,variant:T="regular",additionalOptions:I=[],onSelectId:N=a.default,buttonProps:D,align:k="end",className:P,isForm:O=!1})=>{let L=(0,c.useRouter)(),{ref:M}=(0,s.useParams)(),[$,F]=(0,d.useState)(!1),[,U]=(0,u.useQueryState)("showConnect",u.parseAsBoolean.withDefault(!1)),{infrastructureReadReplicas:B}=(0,C.useIsFeatureEnabled)(["infrastructure:read_replicas"]),H=(0,R.useDatabaseSelectorStateSnapshot)(),Q=e??H.selectedDatabaseId,{data:G,isPending:Y,isSuccess:z}=(0,q.useReadReplicasQuery)({projectRef:M}),K=G??[],W=K.sort((e,t)=>+(e.inserted_at>t.inserted_at)).sort(e=>e.identifier===M?-1:0),V=K.find(e=>e.identifier===Q),X=(0,w.formatDatabaseRegion)(V?.region??""),J=(0,w.formatDatabaseID)(Q??""),Z=I.find(e=>e.id===Q),ee=`/project/${M}/database/replication?type=Read+Replica`;return(0,d.useEffect)(()=>{e&&!O&&H.setSelectedDatabaseId(e)},[e]),(0,t.jsxs)(g.Popover_Shadcn_,{open:$,onOpenChange:F,modal:!1,children:[(0,t.jsx)(b.PopoverTrigger_Shadcn_,{asChild:!0,children:(0,t.jsxs)("div",{className:(0,p.cn)("flex cursor-pointer",P),children:[!O&&(0,t.jsx)("span",{className:"flex items-center text-foreground-lighter px-3 rounded-lg rounded-r-none text-xs border border-button border-r-0",children:"Source"}),(0,t.jsx)(m.Button,{type:"default",icon:Y&&(0,t.jsx)(i.Loader2,{className:"animate-spin"}),iconRight:(0,t.jsx)(n.ChevronDown,{strokeWidth:1.5,size:12}),...D,className:(0,p.cn)("justify-start",!O&&"rounded-l-none","connected-on-right"===T&&"rounded-r-none","connected-on-left"===T&&"rounded-l-none border-l-0","connected-on-both"===T&&"rounded-none border-x-0",D?.className),children:Z?(0,t.jsx)("span",{children:Z.name}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("span",{className:"capitalize",children:Y||V?.identifier===M?"Primary database":"Read replica"})," ",z&&V?.identifier!==M&&(0,t.jsxs)("span",{children:["(",X," - ",J,")"]})]})})]})}),(0,t.jsx)(y.PopoverContent_Shadcn_,{className:"p-0 w-64",side:"bottom",align:k,children:(0,t.jsx)(_.Command_Shadcn_,{children:(0,t.jsxs)(x.CommandList_Shadcn_,{children:[I.length>0&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-b",children:I.map(e=>(0,t.jsx)(f.CommandItem_Shadcn_,{value:e.id,className:"cursor-pointer w-full",onSelect:()=>{O||H.setSelectedDatabaseId(e.id),F(!1),N(e.id)},onClick:()=>{O||H.setSelectedDatabaseId(e.id),F(!1),N(e.id)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.name}),e.id===Q&&(0,t.jsx)(r.Check,{size:14})]})},e.id))}),(0,t.jsx)(h.CommandGroup_Shadcn_,{children:(0,t.jsx)(j.ScrollArea,{className:(K||[]).length>7?"h-[210px]":"",children:W?.map(e=>{let s=(0,w.formatDatabaseRegion)(e.region),a=(0,w.formatDatabaseID)(e.identifier);if("ACTIVE_HEALTHY"!==e.status){let r=[E.REPLICA_STATUS.INIT_READ_REPLICA,E.REPLICA_STATUS.COMING_UP].includes(e.status)?"coming up":"not healthy";return(0,t.jsxs)(S.Tooltip,{children:[(0,t.jsx)(S.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("div",{className:"px-2 py-1.5 w-full flex items-center justify-between",children:(0,t.jsxs)("p",{className:"text-xs text-foreground-lighter",children:["Read replica (",s," - ",a,")"]})})}),(0,t.jsx)(S.TooltipContent,{side:"right",className:"w-80",children:(0,t.jsx)(v.Markdown,{className:"text-xs text-foreground",content:`Replica unable to accept requests as its ${r}. [View infrastructure settings](/project/${M}/settings/infrastructure) for more information.`})})]},e.identifier)}return(0,t.jsx)(f.CommandItem_Shadcn_,{value:e.identifier,className:"cursor-pointer w-full",onSelect:()=>{O||H.setSelectedDatabaseId(e.identifier),F(!1),N(e.identifier)},onClick:()=>{O||H.setSelectedDatabaseId(e.identifier),F(!1),N(e.identifier)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.identifier===M?"Primary database":`Read replica (${s} - ${a})`}),e.identifier===Q&&(0,t.jsx)(r.Check,{size:16})]})},e.identifier)})})}),A.IS_PLATFORM&&B&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-t",children:(0,t.jsx)(f.CommandItem_Shadcn_,{className:"cursor-pointer w-full",onSelect:()=>{F(!1),L.push(ee)},onClick:()=>F(!1),children:(0,t.jsxs)(l.default,{href:ee,onClick:async()=>{F(!1),U(!1)},className:"w-full flex items-center gap-2",children:[(0,t.jsx)(o.Plus,{size:14,strokeWidth:1.5}),(0,t.jsx)("p",{children:"Create a new read replica"})]})})})]})})})]})}])},902780,e=>{"use strict";var t=e.i(478902),s=e.i(345594),a=e.i(837710),r=e.i(843778),n=e.i(710483);e.s(["UnknownInterface",0,({urlBack:e,fullHeight:i=!0})=>(0,t.jsx)("div",{className:(0,r.cn)("w-full flex items-center justify-center",i&&"h-full"),children:(0,t.jsx)(n.Admonition,{type:"note",className:"max-w-xl",title:"Looking for something?",description:"We couldn't find the page that you're looking for",children:(0,t.jsx)(a.Button,{asChild:!0,type:"default",className:"mt-2",children:(0,t.jsx)(s.default,{href:e,children:"Head back"})})})})])},853321,e=>{"use strict";let t=(0,e.i(388019).default)("Braces",[["path",{d:"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1",key:"ezmyqa"}],["path",{d:"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1",key:"e1hn23"}]]);e.s(["default",0,t])},223173,674742,843819,928253,993032,e=>{"use strict";var t=e.i(478902);e.i(481541);var s=e.i(33034),s=s,a=e.i(126200);e.s(["Datadog",()=>a.default],674742);var a=a,r=e.i(841231);e.s(["Grafana",()=>r.default],843819);var r=r,n=e.i(57349),n=n,i=e.i(724487),i=i,o=e.i(660253);e.s(["Sentry",()=>o.default],928253);var o=o,l=e.i(853321);e.s(["BracesIcon",()=>l.default],993032);var l=l;let c=(0,e.i(388019).default)("Cloud",[["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",key:"p7xjir"}]]);var u=e.i(992615);let d={height:24,width:24,className:"text-foreground-light"},m=[{value:"webhook",name:"Custom Endpoint",description:"Forward logs as a POST request to a custom HTTP endpoint",icon:(0,t.jsx)(l.default,{...d})},{value:"otlp",name:"OpenTelemetry Protocol (OTLP)",description:"Send logs to any OpenTelemetry Protocol (OTLP) compatible endpoint",icon:(0,t.jsx)(i.default,{...d,fill:"currentColor"})},{value:"datadog",name:"Datadog",description:"Datadog is a monitoring service for cloud-scale applications",icon:(0,t.jsx)(a.default,{...d,fill:"currentColor"})},{value:"loki",name:"Loki",description:"Loki is an open-source log aggregation system designed to store and query logs from multiple sources",icon:(0,t.jsx)(r.default,{...d,fill:"currentColor"})},{value:"s3",name:"Amazon S3",description:"Forward logs to an S3 bucket",icon:(0,t.jsx)(c,{...d})},{value:"sentry",name:"Sentry",description:"Sentry is an application monitoring service that helps developers identify and debug performance issues and errors",icon:(0,t.jsx)(o.default,{...d,fill:"currentColor"})},{value:"axiom",name:"Axiom",description:"Axiom is a data platform designed to efficiently collect, store, and analyze event and telemetry data at massive scale.",icon:(0,t.jsx)(s.default,{...d,fill:"currentColor"})},{value:"last9",name:"Last9",description:"Last9 is an observability platform for monitoring and telemetry data",icon:(0,t.jsx)(n.default,{...d,fill:"currentColor"})},{value:"syslog",name:"Syslog",description:"Forward logs to a remote Syslog receiver using TCP or TLS, adhering to RFC 5424",icon:(0,t.jsx)(u.Server,{...d})}];m.map(e=>e.value),e.s(["DATADOG_REGIONS",0,[{label:"AP1",value:"AP1"},{label:"AP2",value:"AP2"},{label:"EU",value:"EU"},{label:"US1",value:"US1"},{label:"US1-FED",value:"US1-FED"},{label:"US3",value:"US3"},{label:"US5",value:"US5"}],"LAST9_REGIONS",0,[{label:"US West 1",value:"US-WEST-1"},{label:"AP South 1",value:"AP-SOUTH-1"}],"LOG_DRAIN_TYPES",0,m,"OTLP_PROTOCOLS",0,[{label:"HTTP/Protobuf",value:"http/protobuf"}]],223173)},271332,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(843778),r=e.i(837710),n=e.i(253214);let i=(0,s.forwardRef)(({children:e,customFooter:i,description:o,hideFooter:l=!1,alignFooter:c="left",layout:u="horizontal",loading:d=!1,cancelText:m="Cancel",onConfirm:p=()=>{},onCancel:_=()=>{},confirmText:h="Confirm",showCloseButton:f=!0,footerBackground:x,variant:g="success",visible:y=!1,size:b="large",style:j,overlayStyle:S,contentStyle:v,triggerElement:E,header:q,modal:w,defaultOpen:C,...A},R)=>{let[T,I]=s.default.useState(!!y&&y);(0,s.useEffect)(()=>{I(y)},[y]);let N=i||(0,t.jsxs)("div",{className:"flex w-full space-x-2",style:{width:"100%",justifyContent:"vertical"===u?"center":"right"===c?"flex-end":"flex-start"},children:[(0,t.jsx)(r.Button,{type:"default",onClick:_,disabled:d,children:m}),(0,t.jsx)(r.Button,{onClick:p,disabled:d,loading:d,type:"danger"===g?"danger":"warning"===g?"warning":"primary",children:h})]});return(0,t.jsxs)(n.Dialog,{open:T,defaultOpen:C,onOpenChange:function(e){void 0===y||e?I(e):_()},modal:w,children:[E&&(0,t.jsx)(n.DialogTrigger,{children:E}),(0,t.jsxs)(n.DialogContent,{ref:R,hideClose:!f,...A,size:b,children:[q||o?(0,t.jsxs)(n.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[q&&(0,t.jsx)(n.DialogTitle,{children:q}),o&&(0,t.jsx)(n.DialogDescription,{children:o})]}):null,e,!l&&(0,t.jsx)(n.DialogFooter,{padding:"small",children:N})]})]})}),o=(0,s.forwardRef)(({...e},s)=>(0,t.jsx)(n.DialogSection,{ref:s,...e,padding:"small",className:(0,a.cn)(e.className)})),l=(0,s.forwardRef)(({...e},s)=>(0,t.jsx)(n.DialogSectionSeparator,{ref:s,...e}));i.Content=o,i.Separator=l,e.s(["default",0,i])},40892,e=>{"use strict";var t=e.i(271332);e.s(["Modal",()=>t.default])},420985,e=>{"use strict";var t=e.i(38429),s=e.i(356003),a=e.i(355901),r=e.i(984396),n=e.i(718727),i=e.i(234745);async function o({projectRef:e,payload:t},s){let{data:a,error:n}=await (0,i.put)("/platform/projects/{ref}/content",{params:{path:{ref:e}},body:(0,r.unmapSqlContentField)(t),headers:{Version:"2"},signal:s});return n&&(0,i.handleError)(n),a}e.s(["upsertContent",0,o,"useContentUpsertMutation",0,({onError:e,onSuccess:r,invalidateQueriesOnSuccess:i=!0,...l}={})=>{let c=(0,s.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>o(e),async onSuccess(e,t,s){let{projectRef:a}=t;i&&await Promise.all([c.invalidateQueries({queryKey:n.contentKeys.allContentLists(a)}),c.invalidateQueries({queryKey:n.contentKeys.infiniteList(a)})]),await r?.(e,t,s)},async onError(t,s,r){void 0===e?a.toast.error(`Failed to insert content: ${t.message}`):e(t,s,r)},...l})}])},586011,e=>{"use strict";var t=e.i(38429),s=e.i(356003),a=e.i(355901),r=e.i(718727),n=e.i(234745);async function i({projectRef:e,ids:t},s){let{data:a,error:r}=await (0,n.del)("/platform/projects/{ref}/content",{headers:{Version:"2"},params:{path:{ref:e},query:{ids:t.join(",")}},signal:s});return r&&(0,n.handleError)(r),a.map(e=>e.id)}e.s(["useContentDeleteMutation",0,({onSuccess:e,onError:n,...o}={})=>{let l=(0,s.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>i(e),async onSuccess(t,s,a){let{projectRef:n}=s;await Promise.all([l.invalidateQueries({queryKey:r.contentKeys.allContentLists(n)}),l.invalidateQueries({queryKey:r.contentKeys.infiniteList(n)})]),await e?.(t,s,a)},async onError(e,t,s){void 0===n?a.toast.error(`Failed to delete contents: ${e.message}`):n(e,t,s)},...o})}])},738927,e=>{"use strict";var t=e.i(242882),s=e.i(984396),a=e.i(718727),r=e.i(234745);async function n({projectRef:e,type:t,name:a,limit:i=10},o){if(void 0===e)throw Error("projectRef is required for getContent");let{data:l,error:c}=await (0,r.get)("/platform/projects/{ref}/content",{params:{path:{ref:e},query:{type:t,name:a,limit:i.toString()}},signal:o});return c&&(0,r.handleError)(c),{cursor:l.cursor,content:(0,s.remapSqlContentFields)(l.data)}}e.s(["useContentQuery",0,({projectRef:e,type:s,name:r,limit:i},{enabled:o=!0,...l}={})=>(0,t.useQuery)({queryKey:a.contentKeys.list(e,{type:s,name:r,limit:i}),queryFn:({signal:t})=>n({projectRef:e,type:s,name:r,limit:i},t),enabled:o&&void 0!==e,...l})])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),s=e.i(38429),a=e.i(356003),r=e.i(355901),n=e.i(667286),i=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:s,schema:a,name:r,version:n,cascade:i=!1,createSchema:c=!1}){let u=new Headers;s&&u.set("x-connection-encrypted",s);let d=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:r,version:n,cascade:i,createSchema:c}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:s,sql:d,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let c=(0,a.useQueryClient)();return(0,s.useMutation)({mutationFn:e=>l(e),async onSuccess(t,s,a){let{projectRef:r}=s;await Promise.all([c.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(r)}),c.invalidateQueries({queryKey:i.configKeys.upgradeEligibility(r)})]),await e?.(t,s,a)},async onError(e,s,a){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,s,a)},...o})}])},820308,775159,e=>{"use strict";var t,s,a=e.i(55956),r=((t={}).API="api",t.STORAGE="storage",t.AUTH="auth",t.QUERY_PERFORMANCE="query_performance",t.DATABASE="database",t);e.s(["Presets",()=>r],775159);var n=((s={}).LAST_10_MINUTES="Last 10 minutes",s.LAST_30_MINUTES="Last 30 minutes",s.LAST_60_MINUTES="Last 60 minutes",s.LAST_3_HOURS="Last 3 hours",s.LAST_24_HOURS="Last 24 hours",s.LAST_7_DAYS="Last 7 days",s.LAST_14_DAYS="Last 14 days",s.LAST_28_DAYS="Last 28 days",s);let i=[{text:"Last 10 minutes",calcFrom:()=>(0,a.default)().subtract(10,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 30 minutes",calcFrom:()=>(0,a.default)().subtract(30,"minute").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 60 minutes",calcFrom:()=>(0,a.default)().subtract(1,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),default:!0,availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 3 hours",calcFrom:()=>(0,a.default)().subtract(3,"hour").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 24 hours",calcFrom:()=>(0,a.default)().subtract(1,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["free","pro","team","enterprise","platform"]},{text:"Last 7 days",calcFrom:()=>(0,a.default)().subtract(7,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["pro","team","enterprise"]},{text:"Last 14 days",calcFrom:()=>(0,a.default)().subtract(14,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]},{text:"Last 28 days",calcFrom:()=>(0,a.default)().subtract(28,"day").toISOString(),calcTo:()=>(0,a.default)().toISOString(),availableIn:["team","enterprise"]}],o={iso_timestamp_start:i[0].calcFrom(),iso_timestamp_end:i[0].calcTo()},l=(e,t=!0)=>{if(0===e.length)return"";let s=e.map(e=>{let t=e.key.split("."),s=[t[t.length-2],t[t.length-1]].join("."),a=e.key.includes(".")?s:e.key,r=e.value.toString().includes('"')||e.value.toString().includes("'"),n=!isNaN(Number(e.value)),i=!n&&r?e.value:`'${e.value}'`,o=!n&&String(i).toLowerCase(),l=n?e.value:o;switch(e.compare){case"matches":return`REGEXP_CONTAINS(${a}, ${l})`;case"is":default:return`${a} = ${l}`;case"!=":return`${a} != ${l}`;case">=":return`${a} >= ${l}`;case"<=":return`${a} <= ${l}`;case">":return`${a} > ${l}`;case"<":return`${a} < ${l}`}}).filter(Boolean).join(" AND ");return""===s?"":t?"WHERE "+s:"AND "+s},c={[r.API]:{title:"API",queries:{totalRequests:{queryType:"logs",sql:e=>`
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
      LIMIT 5;`}}}};e.s(["DEFAULT_QUERY_PARAMS",0,o,"DEPRECATED_REPORTS",0,["total_realtime_ingress","total_rest_options_requests","total_auth_ingress","total_auth_get_requests","total_auth_post_requests","total_auth_patch_requests","total_auth_options_requests","total_storage_options_requests","total_storage_patch_requests","total_options_requests","total_rest_ingress","total_rest_get_requests","total_rest_post_requests","total_rest_patch_requests","total_rest_delete_requests","total_storage_get_requests","total_storage_post_requests","total_storage_delete_requests","total_auth_delete_requests","total_get_requests","total_patch_requests","total_post_requests","total_ingress","total_delete_requests"],"EDGE_FUNCTION_REGIONS",0,[{key:"ap-northeast-1",label:"Tokyo"},{key:"ap-northeast-2",label:"Seoul"},{key:"ap-south-1",label:"Mumbai"},{key:"ap-southeast-1",label:"Singapore"},{key:"ap-southeast-2",label:"Sydney"},{key:"ca-central-1",label:"Canada Central"},{key:"us-east-1",label:"N. Virginia"},{key:"us-west-1",label:"N. California"},{key:"us-west-2",label:"Oregon"},{key:"eu-central-1",label:"Frankfurt"},{key:"eu-west-1",label:"Ireland"},{key:"eu-west-2",label:"London"},{key:"eu-west-3",label:"Paris"},{key:"sa-east-1",label:"São Paulo"}],"LAYOUT_COLUMN_COUNT",0,2,"PRESET_CONFIG",0,c,"REPORTS_DATEPICKER_HELPERS",0,i,"REPORT_DATERANGE_HELPER_LABELS",()=>n,"generateRegexpWhere",0,l],820308)},888525,760255,284399,e=>{"use strict";var t=e.i(355901),s=e.i(714403),a=e.i(392491);function r(e=[]){return{hypopg:e.find(e=>"hypopg"===e.name),indexAdvisor:e.find(e=>"index_advisor"===e.name)}}async function n({projectRef:e,connectionString:a,indexStatements:r,onSuccess:i,onError:o}){if(!e){let e=Error("Project ref is required");return o&&o(e),Promise.reject(e)}if(0===r.length){let e=Error("No index statements provided");return o&&o(e),Promise.reject(e)}try{return await (0,s.executeSql)({projectRef:e,connectionString:a,sql:r.join(";\n")+";"}),t.toast.success("Successfully created index"),i&&i(),Promise.resolve()}catch(e){return t.toast.error(`Failed to create index: ${e.message}`),o&&o(e),Promise.reject(e)}}function i(e){return e&&0!==e.length?e.filter(e=>{let t=e.match(/ON\s+(?:"?(\w+)"?\.|(\w+)\.)/i);if(!t)return!0;let s=t[1]||t[2];return!s||!a.INTERNAL_SCHEMAS.includes(s.toLowerCase())}):[]}e.s(["calculateImprovement",0,function(e,t){if(void 0===e||void 0===t)return 0;let s=Number(e),a=Number(t);return s<=0||s<=a?0:(s-a)/s*100},"createIndexes",0,n,"filterProtectedSchemaIndexAdvisorResult",0,function(e){if(!e||!e.index_statements)return e??null;let t=i(e.index_statements);return 0===t.length?null:{...e,index_statements:t}},"filterProtectedSchemaIndexStatements",0,i,"getIndexAdvisorExtensions",0,r,"hasIndexRecommendations",0,function(e,t){return!!(t&&e?.index_statements&&e.index_statements.length>0)},"queryInvolvesProtectedSchemas",0,function(e){if(!e)return!1;let t=e.toLowerCase();return a.INTERNAL_SCHEMAS.some(e=>RegExp(`(?:from|join|update|insert\\s+into|delete\\s+from)\\s+(?:${e}\\.|"${e}"\\.)`,"i").test(t))}],760255);var o=e.i(450972),l=e.i(635494);e.s(["useIndexAdvisorStatus",0,function(){let{data:e}=(0,l.useSelectedProjectQuery)(),{data:t}=(0,o.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),{hypopg:s,indexAdvisor:a}=r(t??[]),n=!!s&&!!a,i=n&&null!==s.installed_version&&null!==a.installed_version;return{isIndexAdvisorAvailable:n,isIndexAdvisorEnabled:i}}],888525);var c=e.i(478902),u=e.i(389959),d=e.i(232520),m=e.i(837710),p=e.i(610144),_=e.i(967052);let h=({open:e,setOpen:s})=>{let a=(0,_.useTrack)(),{data:n}=(0,l.useSelectedProjectQuery)(),{data:i}=(0,o.useDatabaseExtensionsQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{hypopg:u,indexAdvisor:m}=r(i),{mutateAsync:h,isPending:f}=(0,p.useDatabaseExtensionEnableMutation)(),x=async()=>{if(void 0===n)return t.toast.error("Project is required");try{u?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:u.name,schema:u?.schema??"extensions",version:u.default_version}),m?.installed_version===null&&await h({projectRef:n?.ref,connectionString:n?.connectionString,name:m.name,schema:m?.schema??"extensions",version:m.default_version}),t.toast.success("Successfully enabled Index Advisor!"),s(!1)}catch(e){t.toast.error(`Failed to enable Index Advisor: ${e.message}`)}};return(0,c.jsx)(d.AlertDialog,{open:e,onOpenChange:()=>s(!e),children:(0,c.jsxs)(d.AlertDialogContent,{size:"medium",children:[(0,c.jsxs)(d.AlertDialogHeader,{children:[(0,c.jsx)(d.AlertDialogTitle,{children:"Enable Index Advisor"}),(0,c.jsxs)(d.AlertDialogDescription,{className:"flex flex-col gap-y-2",children:[(0,c.jsx)("p",{children:"The Index Advisor recommends indexes to improve query performance on your tables based on your actual query patterns."}),(0,c.jsxs)("p",{children:["Enable this will install the ",(0,c.jsx)("code",{className:"text-code-inline",children:"index_advisor"})," ","and ",(0,c.jsx)("code",{className:"text-code-inline",children:"hypopg"})," Postgres extensions so Index Advisor can analyse queries and suggest performance-improving indexes."]})]})]}),(0,c.jsxs)(d.AlertDialogFooter,{children:[(0,c.jsx)(d.AlertDialogCancel,{children:"Cancel"}),(0,c.jsx)(d.AlertDialogAction,{onClick:e=>{e.preventDefault(),x(),a("index_advisor_dialog_enable_button_clicked")},disabled:f,children:f?"Enabling...":"Enable"})]})]})})};e.s(["EnableIndexAdvisorButton",0,()=>{let e=(0,_.useTrack)(),[t,s]=(0,u.useState)(!1);return(0,c.jsxs)(c.Fragment,{children:[(0,c.jsx)(m.Button,{type:"primary",onClick:()=>{s(!0),e("index_advisor_banner_enable_button_clicked")},children:"Enable"}),(0,c.jsx)(h,{open:t,setOpen:s})]})},"EnableIndexAdvisorDialog",0,h],284399)},582391,e=>{"use strict";let t=(0,e.i(388019).default)("Pen",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]]);e.s(["Edit2",0,t],582391)},300679,258373,490058,e=>{"use strict";var t=e.i(10429);e.s(["generateObservabilityMenuItems",0,function(e){let{ref:s,preservedQueryParams:a,showOverview:r,isSupamonitorEnabled:n,storageSupported:i,isPlatform:o=t.IS_PLATFORM}=e,l=[...r?[{name:"Overview",key:"observability",url:`/project/${s}/observability${a}`}]:[],...n?[{name:"Query Insights",key:"query-insights",url:`/project/${s}/observability/query-insights${a}`}]:[{name:"Query Performance",key:"query-performance",url:`/project/${s}/observability/query-performance${a}`}],...o?[{name:"API Gateway",key:"api-overview",url:`/project/${s}/observability/api-overview${a}`}]:[]],c=[{name:"Database",key:"database",url:`/project/${s}/observability/database${a}`},{name:"Data API",key:"postgrest",url:`/project/${s}/observability/postgrest${a}`},{name:"Auth",key:"auth",url:`/project/${s}/observability/auth${a}`},{name:"Edge Functions",key:"edge-functions",url:`/project/${s}/observability/edge-functions${a}`},...i?[{name:"Storage",key:"storage",url:`/project/${s}/observability/storage${a}`}]:[],{name:"Realtime",key:"realtime",url:`/project/${s}/observability/realtime${a}`}],u=[{title:"GENERAL",key:"general-section",items:l}];return o&&u.push({title:"PRODUCT",key:"product-section",items:c}),u}],300679);var s=e.i(478902),a=e.i(26898),r=e.i(582391),n=e.i(471998),i=e.i(211570),o=e.i(345594),l=e.i(837710),c=e.i(874311),u=e.i(862326),d=e.i(2579),m=e.i(432478);e.s(["ObservabilityMenuItem",0,({item:e,pageKey:t,onSelectEdit:p,onSelectDelete:_})=>{let{profile:h}=(0,m.useProfile)(),{can:f}=(0,d.useAsyncCheckPermissions)(a.PermissionAction.UPDATE,"user_content",{resource:{type:"report",visibility:e.report.visibility,owner_id:e.report.owner_id},subject:{id:h?.id}}),x=(0,s.jsx)(u.Menu.Item,{active:e.key===t,children:(0,s.jsxs)("div",{className:"flex w-full items-center justify-between gap-1",children:[(0,s.jsx)("span",{className:"truncate",children:e.name}),f&&(0,s.jsxs)(c.DropdownMenu,{children:[(0,s.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,s.jsx)(l.Button,{type:"text",className:"px-1 opacity-50 hover:opacity-100",icon:(0,s.jsx)(n.MoreVertical,{size:12,strokeWidth:2}),onClick:e=>{e.preventDefault(),e.stopPropagation()}})}),(0,s.jsxs)(c.DropdownMenuContent,{align:"start",className:"w-32 *:gap-x-2",children:[(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&p()},children:[(0,s.jsx)(r.Edit2,{size:12}),(0,s.jsx)("div",{children:"Rename report"})]}),(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsxs)(c.DropdownMenuItem,{onClick:t=>{t.preventDefault(),t.stopPropagation(),e.id&&_()},children:[(0,s.jsx)(i.Trash,{size:12}),(0,s.jsx)("div",{children:"Delete report"})]})]})]})]})});return(0,s.jsx)(o.default,{href:e.url,className:"block",children:x},e.key+"-menukey")}],258373);var p=e.i(479084),_=e.i(242882),h=e.i(246230),f=e.i(714403),x=e.i(635494),g=e.i(837508);async function y({projectRef:e,connectionString:t}){let{result:s}=await (0,f.executeSql)({projectRef:e,connectionString:t,sql:p.safeSql`SELECT current_setting('shared_preload_libraries', true) AS libraries`});return(s[0]?.libraries??"").split(",").some(e=>"supamonitor"===e.trim())}e.s(["useSupamonitorStatus",0,function(){let{data:e}=(0,x.useSelectedProjectQuery)(),{data:t,isLoading:s}=(({projectRef:e,connectionString:t},{enabled:s=!0,...a}={})=>{let{data:r}=(0,x.useSelectedProjectQuery)(),n=r?.status===g.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,_.useQuery)({queryKey:h.databaseKeys.supamonitorEnabled(e),queryFn:()=>y({projectRef:e,connectionString:t}),enabled:s&&void 0!==e&&n,...a})})({projectRef:e?.ref,connectionString:e?.connectionString});return{isSupamonitorEnabled:t??!1,isLoading:s}}],490058)},303213,e=>{"use strict";var t=e.i(478902),s=e.i(283607),a=e.i(989567),r=e.i(389959),n=e.i(655744),i=e.i(355901),o=e.i(837710),l=e.i(20482),c=e.i(378277),u=e.i(40892),d=e.i(660908),m=e.i(538482),p=e.i(531837),_=e.i(420985),h=e.i(635494),f=e.i(48189),x=e.i(432478);let g=p.object({name:p.string().min(1,"Required"),description:p.string().optional()});e.s(["CreateReportModal",0,({visible:e,onCancel:p,afterSubmit:y})=>{let b=(0,a.useRouter)(),{profile:j}=(0,x.useProfile)(),{data:S}=(0,h.useSelectedProjectQuery)(),v=S?.ref??"default",E=(0,r.useMemo)(()=>{let{its:e,ite:t,isHelper:s,helperText:a}=b.query,r=new URLSearchParams;e&&"string"==typeof e&&r.set("its",e),t&&"string"==typeof t&&r.set("ite",t),s&&"string"==typeof s&&r.set("isHelper",s),a&&"string"==typeof a&&r.set("helperText",a);let n=r.toString();return n?`?${n}`:""},[b.query]),{mutate:q,isPending:w}=(0,_.useContentUpsertMutation)({onSuccess:(e,t)=>{i.toast.success("Successfully created new report");let s=t.payload.id;b.push(`/project/${v}/observability/${s}${E}`),y()},onError:e=>{i.toast.error(`Failed to create report: ${e.message}`)}}),C=async({name:e,description:t})=>v?j?void q({projectRef:v,payload:{id:(0,f.uuidv4)(),type:"report",name:e,description:t||"",visibility:"project",owner_id:j?.id,content:{schema_version:1,period_start:{time_period:"7d",date:""},period_end:{time_period:"today",date:""},interval:"1d",layout:[]}}}):console.error("Profile is required"):console.error("Project ref is required"),A=()=>{p(),R.reset()},R=(0,n.useForm)({resolver:(0,s.zodResolver)(g),defaultValues:{name:"",description:""}}),{isDirty:T}=R.formState;return(0,t.jsx)(u.Modal,{visible:e,onCancel:A,hideFooter:!0,header:"Create a custom report",size:"small",children:(0,t.jsx)(l.Form,{...R,children:(0,t.jsxs)("form",{onSubmit:R.handleSubmit(C),noValidate:!0,children:[(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:R.control,name:"name",render:({field:e})=>(0,t.jsx)(m.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(c.Input_Shadcn_,{...e,id:"name"})})})})}),(0,t.jsx)(u.Modal.Content,{children:(0,t.jsx)(l.FormField,{control:R.control,name:"description",render:({field:e})=>(0,t.jsx)(m.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(u.Modal.Separator,{}),(0,t.jsxs)(u.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(o.Button,{htmlType:"reset",type:"default",onClick:A,disabled:w,children:"Cancel"}),(0,t.jsx)(o.Button,{htmlType:"submit",loading:w,disabled:w||!T,children:"Create report"})]})]})})})}])},256337,e=>{"use strict";var t=e.i(478902),s=e.i(26898);e.i(128328);var a=e.i(657588),r=e.i(158639),n=e.i(544197),i=e.i(989567),o=e.i(17313),l=e.i(389959),c=e.i(355901),u=e.i(862326),d=e.i(498377),m=e.i(466472),p=e.i(108151),_=e.i(300679),h=e.i(258373),f=e.i(490058),x=e.i(303213),g=e.i(283607),y=e.i(655744),b=e.i(837710),j=e.i(20482),S=e.i(378277),v=e.i(40892),E=e.i(660908),q=e.i(538482),w=e.i(531837),C=e.i(420985);let A=w.object({name:w.string().min(1,"Required"),description:w.string().optional()}),R=({selectedReport:e,initialValues:s,onCancel:a})=>{let{ref:n}=(0,r.useParams)(),{mutate:i,isPending:o}=(0,C.useContentUpsertMutation)({onSuccess:()=>{c.toast.success("Successfully updated report"),a()},onError:e=>{c.toast.error(`Failed to update report: ${e.message}`)}}),u=()=>{a(),d.reset()},d=(0,y.useForm)({resolver:(0,g.zodResolver)(A),defaultValues:s}),{formState:m,reset:p}=d,{isDirty:_}=m;return(0,l.useEffect)(()=>{_||p(s)},[s,_,p]),(0,t.jsx)(v.Modal,{visible:void 0!==e,onCancel:u,hideFooter:!0,header:"Update custom report",size:"small",children:(0,t.jsx)(j.Form,{...d,children:(0,t.jsxs)("form",{onSubmit:d.handleSubmit(t=>n?e&&e.id?void(e.project_id&&i({projectRef:n,payload:{...e,owner_id:e.owner_id,project_id:e.project_id,id:e.id,name:t.name,description:t.description||""}})):void 0:console.error("Project ref is required")),noValidate:!0,children:[(0,t.jsx)(v.Modal.Content,{children:(0,t.jsx)(j.FormField,{control:d.control,name:"name",render:({field:e})=>(0,t.jsx)(q.FormItemLayout,{name:"name",layout:"vertical",label:"Name",children:(0,t.jsx)(j.FormControl,{children:(0,t.jsx)(S.Input_Shadcn_,{...e,id:"name"})})})})}),(0,t.jsx)(v.Modal.Content,{children:(0,t.jsx)(j.FormField,{control:d.control,name:"description",render:({field:e})=>(0,t.jsx)(q.FormItemLayout,{name:"description",layout:"vertical",label:"Description",children:(0,t.jsx)(j.FormControl,{children:(0,t.jsx)(E.Textarea,{...e,id:"description",rows:4,placeholder:"Describe your custom report",className:"resize-none"})})})})}),(0,t.jsx)(v.Modal.Separator,{}),(0,t.jsxs)(v.Modal.Content,{className:"flex items-center justify-end gap-2",children:[(0,t.jsx)(b.Button,{htmlType:"reset",type:"default",onClick:u,disabled:o,children:"Cancel"}),(0,t.jsx)(b.Button,{htmlType:"submit",loading:o,disabled:o||!_,children:"Save custom report"})]})]})})})};var T=e.i(215312),I=e.i(388147),N=e.i(586011),D=e.i(738927),k=e.i(2579),P=e.i(912793),O=e.i(10429),L=e.i(432478);e.s(["default",0,()=>{let e=(0,i.useRouter)(),{profile:g}=(0,L.useProfile)(),{ref:y,id:b}=(0,r.useParams)(),j=b||e.pathname.split("/")[4]||"observability",S=(0,a.useFlag)("observabilityOverview"),{isSupamonitorEnabled:v}=(0,f.useSupamonitorStatus)(),E=(0,P.useIsFeatureEnabled)("project_storage:all"),{can:q}=(0,k.useAsyncCheckPermissions)(s.PermissionAction.CREATE,"user_content",{resource:{type:"report",owner_id:g?.id},subject:{id:g?.id}}),w=(0,l.useMemo)(()=>{let{its:t,ite:s,isHelper:a,helperText:r}=e.query,n=new URLSearchParams;t&&"string"==typeof t&&n.set("its",t),s&&"string"==typeof s&&n.set("ite",s),a&&"string"==typeof a&&n.set("isHelper",a),r&&"string"==typeof r&&n.set("helperText",r);let i=n.toString();return i?`?${i}`:""},[e.query]),{data:C,isPending:A}=(0,D.useContentQuery)({projectRef:y,type:"report"}),{mutate:M,isPending:$}=(0,N.useContentDeleteMutation)({onSuccess:()=>{U(!1),c.toast.success("Successfully deleted report"),e.push(`/project/${y}/observability`)},onError:e=>{c.toast.error(`Failed to delete report: ${e.message}`)}}),[F,U]=(0,l.useState)(!1),[B,H]=(0,o.useQueryState)("newReport",o.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),[Q,G]=(0,l.useState)(),[Y,z]=(0,l.useState)();function K(e){return"report"===e.type}let W=function(){if(!C)return[];let e=C?.content.filter(K);return(e?.sort((e,t)=>e.name<t.name?-1:+(e.name>t.name))).map((e,t)=>({id:e.id,name:e.name,description:e.description||"",key:e.id||t+"-report",url:`/project/${y}/observability/${e.id}${w}`,hasDropdownActions:!0,report:e}))}(),V=(0,_.generateObservabilityMenuItems)({ref:y,preservedQueryParams:w,showOverview:S,isSupamonitorEnabled:v,storageSupported:E,isPlatform:O.IS_PLATFORM});return(0,t.jsx)("div",{children:A?(0,t.jsxs)("div",{className:"px-5 my-4 space-y-2",children:[(0,t.jsx)(p.ShimmeringLoader,{}),(0,t.jsx)(p.ShimmeringLoader,{className:"w-3/4"}),(0,t.jsx)(p.ShimmeringLoader,{className:"w-1/2"})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-6",children:[(0,t.jsx)(I.ProductMenu,{page:j,menu:V.map(e=>({...e,items:e.items.map(e=>({...e,items:[]}))}))}),O.IS_PLATFORM&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-px w-full bg-border-overlay"}),(0,t.jsxs)("div",{className:"mx-2",children:[(0,t.jsxs)(u.Menu,{type:"pills",children:[(0,t.jsx)(u.Menu.Group,{title:(0,t.jsxs)("span",{className:"flex w-full items-center justify-between relative h-6",children:[(0,t.jsx)("span",{className:"uppercase font-mono",children:"Custom Reports"}),W.length>0&&(0,t.jsx)(T.ButtonTooltip,{type:"default",size:"tiny",icon:(0,t.jsx)(n.Plus,{}),disabled:!q,className:"flex items-center justify-center h-6 w-6 absolute top-0 -right-1",onClick:()=>{H(!0)},tooltip:{content:{side:"bottom",text:q?void 0:"You need additional permissions to create custom reports"}}})]})}),W.length>0&&W.map(e=>(0,t.jsx)(h.ObservabilityMenuItem,{item:e,pageKey:j,onSelectEdit:()=>{z(e.report)},onSelectDelete:()=>{G(e.report),U(!0)}},e.id))]}),0===W.length?(0,t.jsx)("div",{className:"px-2",children:(0,t.jsx)(d.InnerSideBarEmptyPanel,{title:"No custom reports yet",description:"Create and save custom reports to track your project metrics",actions:(0,t.jsx)(T.ButtonTooltip,{type:"default",icon:(0,t.jsx)(n.Plus,{}),disabled:!q,onClick:()=>{H(!0)},tooltip:{content:{side:"bottom",text:q?void 0:"You need additional permissions to create custom reports"}},children:"New custom report"})})}):null]})]}),(0,t.jsx)(R,{onCancel:()=>z(void 0),selectedReport:Y,initialValues:{name:Y?.name||"",description:Y?.description||""}}),(0,t.jsx)(m.default,{title:"Delete custom report",confirmLabel:"Delete report",confirmLabelLoading:"Deleting report",size:"medium",loading:$,visible:F,onCancel:()=>U(!1),onConfirm:()=>void 0===y?console.error("Project ref is required"):Q?.id===void 0?console.error("Report ID is required"):void M({projectRef:y,ids:[Q.id]}),children:(0,t.jsx)("div",{className:"text-sm text-foreground-light grid gap-4",children:(0,t.jsx)("div",{className:"grid gap-1",children:(0,t.jsxs)("p",{children:["Are you sure you want to delete '",Q?.name,"'?"]})})})}),(0,t.jsx)(x.CreateReportModal,{visible:B,onCancel:()=>H(!1),afterSubmit:()=>H(!1)})]})})}],256337)},212846,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(86086),a=e.i(947748),r=e.i(158639),n=e.i(695047),i=e.i(389959),o=e.i(825713),l=e.i(256337),c=e.i(888525);e.i(69870);var u=e.i(924115),d=e.i(670447),m=e.i(470754),p=e.i(284399),_=e.i(124416),h=e.i(967052);let f=()=>{let e=(0,h.useTrack)(),{ref:s}=(0,r.useParams)(),{dismissBanner:n}=(0,m.useBannerStack)(),[,i]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(s??""),!1);return(0,t.jsx)(d.BannerCard,{onDismiss:()=>{i(!0),n("index-advisor-banner"),e("index_advisor_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("div",{className:"flex flex-col gap-y-2 items-start",children:(0,t.jsx)("div",{className:"p-2 rounded-lg bg-warning-300 text-warning",children:(0,t.jsx)(u.Lightbulb,{size:16})})}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Enable Index Advisor"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Recommends indexes to improve query performance."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(p.EnableIndexAdvisorButton,{})})]})})};var x=e.i(345594),g=e.i(587433),y=e.i(837710),b=e.i(223173),j=e.i(10429);let S=()=>{let{ref:e}=(0,r.useParams)(),s=(0,h.useTrack)(),{dismissBanner:n}=(0,m.useBannerStack)(),[,o]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(e??""),!1);return(0,t.jsx)(d.BannerCard,{onDismiss:()=>{o(!0),n("metrics-api-banner"),s("metrics_api_banner_dismiss_button_clicked")},children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-2 items-start",children:[(0,t.jsx)(g.Badge,{variant:"success",className:"-ml-0.5 uppercase inline-flex items-center mb-2",children:"Beta"}),(0,t.jsx)("div",{className:"flex items-center gap-4",children:b.LOG_DRAIN_TYPES.filter(e=>"sentry"!==e.value).map(e=>(0,t.jsx)(i.default.Fragment,{children:i.default.cloneElement(e.icon,{height:20,width:20})},e.value))})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1 mb-2",children:[(0,t.jsx)("p",{className:"text-sm font-medium",children:"Export Metrics to your dashboards"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Visualize over 200 database performance and health metrics with our Metrics API."})]}),(0,t.jsx)("div",{className:"flex gap-2",children:(0,t.jsx)(y.Button,{type:"default",size:"tiny",asChild:!0,children:(0,t.jsx)(x.default,{href:`${j.DOCS_URL}/guides/telemetry/metrics`,target:"_blank",onClick:()=>s("metrics_api_banner_cta_button_clicked"),children:"Get started for free"})})})]})})};var v=e.i(902780),E=e.i(912793),q=e.i(951138);let w=({title:e,children:u})=>{let{ref:d}=(0,r.useParams)(),p=(0,n.usePathname)(),{addBanner:h,dismissBanner:x}=(0,m.useBannerStack)(),{isIndexAdvisorAvailable:g,isIndexAdvisorEnabled:y}=(0,c.useIndexAdvisorStatus)(),[b]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.OBSERVABILITY_BANNER_DISMISSED(d??""),!1),[j]=(0,_.useLocalStorageQuery)(a.LOCAL_STORAGE_KEYS.INDEX_ADVISOR_NOTICE_DISMISSED(d??""),!1);(0,i.useEffect)(()=>{!b&&s.IS_PLATFORM?h({id:"metrics-api-banner",isDismissed:!1,content:(0,t.jsx)(S,{}),priority:1}):x("metrics-api-banner")},[b,h,x]);let q=(0,i.useRef)(p);(0,i.useEffect)(()=>{let e=p?.includes("/query-performance");e&&g&&!y&&!j?h({id:"index-advisor-banner",isDismissed:!1,content:(0,t.jsx)(f,{}),priority:3}):(j||!e||y)&&x("index-advisor-banner"),q.current=p},[p,g,y,j,h,x]);let{reportsAll:w}=(0,E.useIsFeatureEnabled)(["reports:all"]);return w?(0,t.jsx)(o.ProjectLayout,{product:"Observability",browserTitle:{section:e},productMenu:(0,t.jsx)(l.default,{}),isBlocking:!1,children:u}):(0,t.jsx)(v.UnknownInterface,{urlBack:`/project/${d}`})},C=(0,q.withAuth)(e=>{let{ref:s}=(0,r.useParams)(),{reportsAll:a}=(0,E.useIsFeatureEnabled)(["reports:all"]);return a?(0,t.jsx)(w,{...e}):(0,t.jsx)(v.UnknownInterface,{urlBack:`/project/${s}`})});e.s(["default",0,C],212846)}]);