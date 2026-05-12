(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,174078,(e,t,i)=>{var a=e.r(889695),n=1/0;t.exports=function(e){return e?(e=a(e))===n||e===-n?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,i)=>{var a=e.r(174078);t.exports=function(e){var t=a(e),i=t%1;return t==t?i?t-i:t:0}},141892,(e,t,i)=>{var a=e.r(924519),n=e.r(145948),r=e.r(460779);t.exports=function(e){return"string"==typeof e||!n(e)&&r(e)&&"[object String]"==a(e)}},652748,(e,t,i)=>{var a=e.r(714530),n=e.r(729077),r=e.r(352677),s=e.r(145948);t.exports=function(e,t){return(s(e)?a:r)(e,n(t,3))}},412385,e=>{"use strict";var t=e.i(389959),i=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:a})=>{let[n,r]=(0,t.useState)(!1),s=(0,i.default)(e),o=(0,i.default)(a),l=(0,t.useCallback)(()=>{s.current()?r(!0):o.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{r(!1),o.current()},[]),u=(0,t.useCallback)(()=>{r(!1)},[]),p=(0,t.useMemo)(()=>({visible:n,onClose:c,onCancel:u}),[n,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:p}),[l,d,p])}])},498943,(e,t,i)=>{"use strict";Object.defineProperty(i,"__esModule",{value:!0}),Object.defineProperty(i,"default",{enumerable:!0,get:function(){return S}});let a=e.r(2879),n=e.r(887602),r=e.r(478902),s=n._(e.r(389959)),o=n._(e.r(971131)),l=a._(e.r(889694)),d=e.r(692007),c=e.r(472102),u=e.r(668278),p=e.r(248905),m=e.r(458310),b=e.r(927770),g=e.r(343027);function f(e){return"/"===e[0]?e.slice(1):e}let _="function"==typeof o.preload,h={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/plugins/trex/studio/_next/image/",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!0},y=new Set,w="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";"u"<typeof window&&(globalThis.__NEXT_IMAGE_IMPORTED=!0);let j=new Map([["default",function({config:e,src:t,width:i,quality:a}){if(!e.dangerouslyAllowSVG&&t.split("?",1)[0].endsWith(".svg"))return t;let n=(0,g.getDeploymentId)();if(t.startsWith("/")&&!t.startsWith("//")){let e=t.indexOf("?");if(-1!==e){let i=new URLSearchParams(t.slice(e+1)),a=i.get("dpl");if(a){n=a,i.delete("dpl");let r=i.toString();t=t.slice(0,e)+(r?"?"+r:"")}}}if(t.startsWith("/")&&t.includes("?")&&e.localPatterns?.length===1&&"**"===e.localPatterns[0].pathname&&""===e.localPatterns[0].search)throw Object.defineProperty(Error(`Image with src "${t}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),"__NEXT_ERROR_CODE",{value:"E871",enumerable:!1,configurable:!0});let r=(0,b.findClosestQuality)(a,e);return`${(0,m.normalizePathTrailingSlash)(e.path)}?url=${encodeURIComponent(t)}&w=${i}&q=${r}${t.startsWith("/")&&n?`&dpl=${n}`:""}`}],["imgix",function({config:e,src:t,width:i,quality:a}){let n=new URL(`${e.path}${f(t)}`),r=n.searchParams;return r.set("auto",r.getAll("auto").join(",")||"format"),r.set("fit",r.get("fit")||"max"),r.set("w",r.get("w")||i.toString()),a&&r.set("q",a.toString()),n.href}],["cloudinary",function({config:e,src:t,width:i,quality:a}){let n=["f_auto","c_limit","w_"+i,"q_"+(a||"auto")].join(",")+"/";return`${e.path}${n}${f(t)}`}],["akamai",function({config:e,src:t,width:i}){return`${e.path}${f(t)}?imwidth=${i}`}],["custom",function({src:e}){throw Object.defineProperty(Error(`Image with src "${e}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),"__NEXT_ERROR_CODE",{value:"E252",enumerable:!1,configurable:!0})}]]);function x(e){return void 0!==e.default}function v({config:e,src:t,unoptimized:i,layout:a,width:n,quality:r,sizes:s,loader:o}){if(i){if(t.startsWith("/")&&!t.startsWith("//")){let e=(0,g.getDeploymentId)();if(e){let i=t.indexOf("?");if(-1!==i){let a=new URLSearchParams(t.slice(i+1));a.get("dpl")||(a.append("dpl",e),t=t.slice(0,i)+"?"+a.toString())}else t+=`?dpl=${e}`}}return{src:t,srcSet:void 0,sizes:void 0}}let{widths:l,kind:d}=function({deviceSizes:e,allSizes:t},i,a,n){if(n&&("fill"===a||"responsive"===a)){let i=/(^|\s)(1?\d?\d)vw/g,a=[];for(let e;e=i.exec(n);)a.push(parseInt(e[2]));if(a.length){let i=.01*Math.min(...a);return{widths:t.filter(t=>t>=e[0]*i),kind:"w"}}return{widths:t,kind:"w"}}return"number"!=typeof i||"fill"===a||"responsive"===a?{widths:e,kind:"w"}:{widths:[...new Set([i,2*i].map(e=>t.find(t=>t>=e)||t[t.length-1]))],kind:"x"}}(e,n,a,s),c=l.length-1;return{sizes:s||"w"!==d?s:"100vw",srcSet:l.map((i,a)=>`${o({config:e,src:t,quality:r,width:i})} ${"w"===d?i:a+1}${d}`).join(", "),src:o({config:e,src:t,quality:r,width:l[c]})}}function E(e){return"number"==typeof e?e:"string"==typeof e?parseInt(e,10):void 0}function k(e){let t=e.config?.loader||"default",i=j.get(t);if(i)return i(e);throw Object.defineProperty(Error(`Unknown "loader" found in "next.config.js". Expected: ${d.VALID_LOADERS.join(", ")}. Received: ${t}`),"__NEXT_ERROR_CODE",{value:"E1026",enumerable:!1,configurable:!0})}function A(e,t,i,a,n,r){e&&e.src!==w&&e["data-loaded-src"]!==t&&(e["data-loaded-src"]=t,("decode"in e?e.decode():Promise.resolve()).catch(()=>{}).then(()=>{if(e.parentNode&&(y.add(t),"blur"===a&&r(!0),n?.current)){let{naturalWidth:t,naturalHeight:i}=e;n.current({naturalWidth:t,naturalHeight:i})}}))}let R=({imgAttributes:e,heightInt:t,widthInt:i,qualityInt:a,layout:n,className:o,imgStyle:l,blurStyle:d,isLazy:c,placeholder:u,loading:p,srcString:m,config:b,unoptimized:g,loader:f,onLoadingCompleteRef:_,setBlurComplete:h,setIntersection:y,onLoad:w,onError:j,isVisible:x,noscriptSizes:E,...k})=>(p=c?"lazy":p,(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("img",{...k,...e,decoding:"async","data-nimg":n,className:o,style:{...l,...d},ref:(0,s.useCallback)(e=>{y(e),e?.complete&&A(e,m,n,u,_,h)},[y,m,n,u,_,h]),onLoad:e=>{A(e.currentTarget,m,n,u,_,h),w&&w(e)},onError:e=>{"blur"===u&&h(!0),j&&j(e)}}),(c||"blur"===u)&&(0,r.jsx)("noscript",{children:(0,r.jsx)("img",{...k,loading:p,decoding:"async","data-nimg":n,style:l,className:o,...v({config:b,src:m,unoptimized:g,layout:n,width:i,quality:a,sizes:E,loader:f})})})]}));function S({src:e,sizes:t,unoptimized:i=!1,priority:a=!1,loading:n,lazyRoot:o=null,lazyBoundary:m,className:b,quality:g,width:f,height:j,style:A,objectFit:N,objectPosition:$,onLoadingComplete:T,placeholder:I="empty",blurDataURL:C,...O}){var z;let q,F=(0,s.useContext)(u.ImageConfigContext),D=(0,s.useMemo)(()=>{let e=h||F||d.imageConfigDefault,t=[...e.deviceSizes,...e.imageSizes].sort((e,t)=>e-t),i=e.deviceSizes.sort((e,t)=>e-t),a=e.qualities?.sort((e,t)=>e-t);return{...e,allSizes:t,deviceSizes:i,qualities:a,localPatterns:"u"<typeof window?F?.localPatterns:e.localPatterns}},[F]),P=t?"responsive":"intrinsic";"layout"in O&&(O.layout&&(P=O.layout),delete O.layout);let L=k;if("loader"in O){if(O.loader){let e=O.loader;L=t=>{let{config:i,...a}=t;return e(a)}}delete O.loader}let M="";if("object"==typeof(z=e)&&(x(z)||void 0!==z.src)){let t=x(e)?e.default:e;if(!t.src)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E460",enumerable:!1,configurable:!0});if(C=C||t.blurDataURL,M=t.src,(!P||"fill"!==P)&&(j=j||t.height,f=f||t.width,!t.height||!t.width))throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E48",enumerable:!1,configurable:!0})}e="string"==typeof e?e:M,(0,p.warnOnce)(`Image with src "${e}" is using next/legacy/image which is deprecated and will be removed in a future version of Next.js.`);let U=!a&&("lazy"===n||void 0===n);(e.startsWith("data:")||e.startsWith("blob:"))&&(i=!0,U=!1),"u">typeof window&&y.has(e)&&(U=!1),D.unoptimized&&(i=!0);let[K,W]=(0,s.useState)(!1),[Q,B,G]=(0,c.useIntersection)({rootRef:o,rootMargin:m||"200px",disabled:!U}),H=!U||B,V={boxSizing:"border-box",display:"block",overflow:"hidden",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},X={boxSizing:"border-box",display:"block",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},Y=!1,J=E(f),Z=E(j),ee=E(g),et=Object.assign({},A,{position:"absolute",top:0,left:0,bottom:0,right:0,boxSizing:"border-box",padding:0,border:"none",margin:"auto",display:"block",width:0,height:0,minWidth:"100%",maxWidth:"100%",minHeight:"100%",maxHeight:"100%",objectFit:N,objectPosition:$}),ei="blur"!==I||K?{}:{backgroundSize:N||"cover",backgroundPosition:$||"0% 0%",filter:"blur(20px)",backgroundImage:`url("${C}")`};if("fill"===P)V.display="block",V.position="absolute",V.top=0,V.left=0,V.bottom=0,V.right=0;else if(void 0!==J&&void 0!==Z){let e=Z/J,t=isNaN(e)?"100%":`${100*e}%`;"responsive"===P?(V.display="block",V.position="relative",Y=!0,X.paddingTop=t):"intrinsic"===P?(V.display="inline-block",V.position="relative",V.maxWidth="100%",Y=!0,X.maxWidth="100%",q=`data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27${J}%27%20height=%27${Z}%27/%3e`):"fixed"===P&&(V.display="inline-block",V.position="relative",V.width=J,V.height=Z)}let ea={src:w,srcSet:void 0,sizes:void 0};H&&(ea=v({config:D,src:e,unoptimized:i,layout:P,width:J,quality:ee,sizes:t,loader:L}));let en=e,er=_?void 0:{imageSrcSet:ea.srcSet,imageSizes:ea.sizes,crossOrigin:O.crossOrigin,referrerPolicy:O.referrerPolicy},es="u"<typeof window?s.default.useEffect:s.default.useLayoutEffect,eo=(0,s.useRef)(T),el=(0,s.useRef)(e);(0,s.useEffect)(()=>{eo.current=T},[T]),es(()=>{el.current!==e&&(G(),el.current=e)},[G,e]);let ed={isLazy:U,imgAttributes:ea,heightInt:Z,widthInt:J,qualityInt:ee,layout:P,className:b,imgStyle:et,blurStyle:ei,loading:n,config:D,unoptimized:i,placeholder:I,loader:L,srcString:en,onLoadingCompleteRef:eo,setBlurComplete:W,setIntersection:Q,isVisible:H,noscriptSizes:t,...O};return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)("span",{style:V,children:[Y?(0,r.jsx)("span",{style:X,children:q?(0,r.jsx)("img",{style:{display:"block",maxWidth:"100%",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},alt:"","aria-hidden":!0,src:q}):null}):null,(0,r.jsx)(R,{...ed})]}),!_&&a?(0,r.jsx)(l.default,{children:(0,r.jsx)("link",{rel:"preload",as:"image",href:ea.srcSet?void 0:ea.src,...er},"__nimg-"+ea.src+ea.srcSet+ea.sizes)}):null]})}("function"==typeof i.default||"object"==typeof i.default&&null!==i.default)&&void 0===i.default.__esModule&&(Object.defineProperty(i.default,"__esModule",{value:!0}),Object.assign(i.default,i),t.exports=i.default)},501964,(e,t,i)=>{t.exports=e.r(498943)},418029,e=>{"use strict";var t=e.i(478902),i=e.i(837710),a=e.i(843778);e.s(["NoSearchResults",0,({searchString:e,withinTableCell:n=!1,onResetFilter:r,className:s,label:o,description:l})=>(0,t.jsxs)("div",{className:(0,a.cn)("flex items-center justify-between",!n&&"bg-surface-100 px-4 md:px-6 py-4 rounded-md border border-default",s),children:[(0,t.jsxs)("div",{className:"text-sm flex flex-col gap-y-0.5",children:[(0,t.jsx)("p",{className:"text-foreground",children:o??"No results found"}),(0,t.jsx)("p",{className:"text-foreground-lighter",children:l??`Your search for “${e}” did not return any results`})]}),void 0!==r&&(0,t.jsx)(i.Button,{type:"default",onClick:()=>r(),children:"Reset filter"})]})])},568213,e=>{"use strict";var t=e.i(478902),i=e.i(88816),a=e.i(544197),n=e.i(211570),r=e.i(389959),s=e.i(655744),o=e.i(837710),l=e.i(843778),d=e.i(874311),c=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:b,createEmptyRow:g,keyPlaceholder:f,valuePlaceholder:_,addLabel:h,addActions:y=[],disabled:w=!1,inputSize:j="small",className:x,rowsClassName:v="space-y-3 mt-1",rowClassName:E,keyInputClassName:k,valueInputClassName:A,addButtonClassName:R,removeButtonClassName:S,removeLabel:N="Remove row"})=>{let{fields:$,append:T,remove:I}=(0,s.useFieldArray)({control:e,name:p,keyName:"fieldId"}),C=y.length>0,O=`${h} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",x),children:[(0,t.jsx)("div",{className:v,children:$.map((i,a)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",E),children:[(0,t.jsx)(c.FormField,{control:e,name:`${p}.${a}.${m}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",k),placeholder:f,disabled:w})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(c.FormField,{control:e,name:`${p}.${a}.${b}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",A),placeholder:_,disabled:w})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.Trash,{size:12}),"aria-label":N,disabled:w,onClick:()=>I(a),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",S)})]},i.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.Plus,{}),disabled:w,onClick:()=>T(g()),className:(0,l.cn)(C&&"rounded-r-none border-r-0 px-3",R),children:h}),C&&(0,t.jsxs)(d.DropdownMenu,{children:[(0,t.jsx)(d.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(i.ChevronDown,{size:14}),"aria-label":O,disabled:w,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(d.DropdownMenuContent,{align:"end",side:"bottom",children:y.map(e=>(0,t.jsxs)(r.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(d.DropdownMenuSeparator,{}),(0,t.jsx)(d.DropdownMenuItem,{onClick:()=>{var t;T(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:i,valueFieldName:a,keyRequiredMessage:n,valueRequiredMessage:r,duplicateKeyMessage:s,allowEmptyRows:o=!0,normaliseKey:l=e=>e})=>{let d=[],c=s?new Map:null;return e.forEach((e,s)=>{let u=t(e[i]),p=t(e[a]);if(!u&&!p){o||(d.push({path:[s,i],message:n}),d.push({path:[s,a],message:r}));return}if(!u)return void d.push({path:[s,i],message:n});if(!p)return void d.push({path:[s,a],message:r});if(!c)return;let m=l(u);m&&c.set(m,[...c.get(m)??[],s])}),c&&s&&c.forEach(e=>{e.length<2||e.forEach(e=>{d.push({path:[e,i],message:s})})}),d},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:i,valueFieldName:a})=>e.filter(e=>{let n=t(e[i]),r=t(e[a]);return n.length>0||r.length>0})],916800);var i=e.i(97429);let a=/^https?:\/\//,n="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",r=RegExp(`^(?:${n}\\.){3}${n}$`),s=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:n})=>i.z.string().trim().min(1,e).superRefine((e,o)=>{if(e){if(!a.test(e))return void o.addIssue({code:i.z.ZodIssueCode.custom,message:n});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:i}=t;return"localhost"===i||i.includes(".")||r.test(i)||s.test(i)}catch{return!1}})(e)||o.addIssue({code:i.z.ZodIssueCode.custom,message:t})}})],478029)},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let i=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:i,sourceTableSchema:a})=>`INSERT INTO ${(0,t.ident)(a)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(a)}.${(0,t.ident)(i)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:i,sourceTableName:a,sourceTableSchema:n})=>[`CREATE TABLE ${(0,t.ident)(n)}.${(0,t.ident)(i)} (LIKE ${(0,t.ident)(n)}.${(0,t.ident)(a)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(n)}.${(0,t.ident)(i)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,i],664304);var a=e.i(180141),n=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:a},n){if(!a)throw Error("id is required");let r=i({id:a}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",a]},n);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:i})=>(0,a.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,i),queryFn:({signal:a})=>o({projectRef:e,connectionString:t,id:i},a)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:i,id:a}){return e.fetchQuery(l({projectRef:t,connectionString:i,id:a}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:i},{enabled:a=!0,...r}={})=>(0,n.useQuery)({...l({projectRef:e,connectionString:t,id:i}),enabled:a&&void 0!==e&&void 0!==i&&!isNaN(i),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},64102,e=>{"use strict";var t=e.i(478902),i=e.i(389959),a=e.i(843778);let n=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:i,header:a,disabled:n,className:r})=>{let s=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${n?" opacity-30":" opacity-100"}`,`${r}`];return(0,t.jsxs)("div",{id:i,className:s.join(" "),children:[a,e]})},"FormSectionContent",0,({children:e,loading:a=!0,loaders:r,fullWidth:s,className:o})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${s&&"col-span-12!"}
        ${o}
      `,children:a?r?Array(r).fill(0).map((e,i)=>(0,t.jsx)(n,{},i)):i.Children.map(e,(e,i)=>(0,t.jsx)(n,{},i)):e}),"FormSectionLabel",0,({children:e,className:i="",description:n})=>void 0!==n?(0,t.jsxs)("div",{className:(0,a.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",i),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),n]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${i}`,children:e})])},577846,(e,t,i)=>{var a=e.r(714530);t.exports=function(e,t){return a(t,function(t){return e[t]})}},943262,(e,t,i)=>{var a=e.r(577846),n=e.r(375493);t.exports=function(e){return null==e?[]:a(e,n(e))}},333990,(e,t,i)=>{var a=e.r(491761),n=e.r(775484),r=e.r(141892),s=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,i,d){e=n(e)?e:o(e),i=i&&!d?s(i):0;var c=e.length;return i<0&&(i=l(c+i,0)),r(e)?i<=c&&e.indexOf(t,i)>-1:!!c&&a(e,t,i)>-1}},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:i})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[i("Authorization",`Bearer ${e}`),...t?[i("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>i("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},253369,e=>{"use strict";var t=e.i(850036),i=e.i(38429),a=e.i(356003),n=e.i(355901),r=e.i(878827),s=e.i(714403);async function o({trigger:e,projectRef:i,connectionString:a}){let{sql:n}=t.default.triggers.remove(e),{result:r}=await (0,s.executeSql)({projectRef:i,connectionString:a,sql:n,queryKey:["trigger","delete",e.id]});return r}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...s}={})=>{let l=(0,a.useQueryClient)();return(0,i.useMutation)({mutationFn:e=>o(e),async onSuccess(t,i,a){let{projectRef:n}=i;await l.invalidateQueries({queryKey:r.databaseTriggerKeys.list(n)}),await e?.(t,i,a)},async onError(e,i,a){void 0===t?n.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,i,a)},...s})}])},534587,200246,e=>{"use strict";var t=e.i(248593),i=e.i(242882),a=e.i(878827),n=e.i(234745);function r(e){return e}async function s({projectRef:e,connectionString:i},a){if(!e)throw Error("projectRef is required");let r=new Headers;i&&r.set("x-connection-encrypted",i);let{data:o,error:l}=await (0,n.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":i,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:r,signal:a});return l&&(0,n.handleError)(l),o}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...r}={})=>(0,i.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:i})=>s({projectRef:e,connectionString:t},i),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:n&&void 0!==e,...r}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...o}={})=>(0,i.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:i})=>s({projectRef:e,connectionString:t},i).then(e=>e.map(r)),enabled:n&&void 0!==e,...o})],534587);var o=e.i(850036),l=e.i(38429),d=e.i(356003),c=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:i}){let{sql:a}=o.default.triggers.create(i),{result:n}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:a,queryKey:["trigger","create"]});return n}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...i}={})=>{let n=(0,d.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,i,r){let{projectRef:s}=i;await n.invalidateQueries({queryKey:a.databaseTriggerKeys.list(s)}),await e?.(t,i,r)},async onError(e,i,a){void 0===t?c.toast.error(`Failed to create database trigger: ${e.message}`):t(e,i,a)},...i})}],200246)}]);