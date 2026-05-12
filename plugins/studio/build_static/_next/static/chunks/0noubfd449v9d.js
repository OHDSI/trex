(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,693241,e=>{"use strict";var t=e.i(478902),i=e.i(710483);let n=({resourceText:e,isFullPage:n=!1})=>{let a=()=>(0,t.jsx)(i.Admonition,{type:"warning",title:`You need additional permissions to ${e}`,description:"Contact your organization owner or administrator for assistance."});return n?(0,t.jsx)("div",{className:"flex h-full items-center justify-center",children:(0,t.jsx)("div",{className:"max-w-lg",children:(0,t.jsx)(a,{})})}):(0,t.jsx)(a,{})};e.s(["NoPermission",0,n,"default",0,n])},174078,(e,t,i)=>{var n=e.r(889695),a=1/0;t.exports=function(e){return e?(e=n(e))===a||e===-a?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,i)=>{var n=e.r(174078);t.exports=function(e){var t=n(e),i=t%1;return t==t?i?t-i:t:0}},141892,(e,t,i)=>{var n=e.r(924519),a=e.r(145948),r=e.r(460779);t.exports=function(e){return"string"==typeof e||!a(e)&&r(e)&&"[object String]"==n(e)}},652748,(e,t,i)=>{var n=e.r(714530),a=e.r(729077),r=e.r(352677),s=e.r(145948);t.exports=function(e,t){return(s(e)?n:r)(e,a(t,3))}},498943,(e,t,i)=>{"use strict";Object.defineProperty(i,"__esModule",{value:!0}),Object.defineProperty(i,"default",{enumerable:!0,get:function(){return S}});let n=e.r(2879),a=e.r(887602),r=e.r(478902),s=a._(e.r(389959)),o=a._(e.r(971131)),l=n._(e.r(889694)),d=e.r(692007),c=e.r(472102),u=e.r(668278),p=e.r(248905),m=e.r(458310),b=e.r(927770),g=e.r(343027);function _(e){return"/"===e[0]?e.slice(1):e}let f="function"==typeof o.preload,h={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/plugins/trex/studio/_next/image/",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!0},y=new Set,w="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";"u"<typeof window&&(globalThis.__NEXT_IMAGE_IMPORTED=!0);let j=new Map([["default",function({config:e,src:t,width:i,quality:n}){if(!e.dangerouslyAllowSVG&&t.split("?",1)[0].endsWith(".svg"))return t;let a=(0,g.getDeploymentId)();if(t.startsWith("/")&&!t.startsWith("//")){let e=t.indexOf("?");if(-1!==e){let i=new URLSearchParams(t.slice(e+1)),n=i.get("dpl");if(n){a=n,i.delete("dpl");let r=i.toString();t=t.slice(0,e)+(r?"?"+r:"")}}}if(t.startsWith("/")&&t.includes("?")&&e.localPatterns?.length===1&&"**"===e.localPatterns[0].pathname&&""===e.localPatterns[0].search)throw Object.defineProperty(Error(`Image with src "${t}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),"__NEXT_ERROR_CODE",{value:"E871",enumerable:!1,configurable:!0});let r=(0,b.findClosestQuality)(n,e);return`${(0,m.normalizePathTrailingSlash)(e.path)}?url=${encodeURIComponent(t)}&w=${i}&q=${r}${t.startsWith("/")&&a?`&dpl=${a}`:""}`}],["imgix",function({config:e,src:t,width:i,quality:n}){let a=new URL(`${e.path}${_(t)}`),r=a.searchParams;return r.set("auto",r.getAll("auto").join(",")||"format"),r.set("fit",r.get("fit")||"max"),r.set("w",r.get("w")||i.toString()),n&&r.set("q",n.toString()),a.href}],["cloudinary",function({config:e,src:t,width:i,quality:n}){let a=["f_auto","c_limit","w_"+i,"q_"+(n||"auto")].join(",")+"/";return`${e.path}${a}${_(t)}`}],["akamai",function({config:e,src:t,width:i}){return`${e.path}${_(t)}?imwidth=${i}`}],["custom",function({src:e}){throw Object.defineProperty(Error(`Image with src "${e}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),"__NEXT_ERROR_CODE",{value:"E252",enumerable:!1,configurable:!0})}]]);function x(e){return void 0!==e.default}function v({config:e,src:t,unoptimized:i,layout:n,width:a,quality:r,sizes:s,loader:o}){if(i){if(t.startsWith("/")&&!t.startsWith("//")){let e=(0,g.getDeploymentId)();if(e){let i=t.indexOf("?");if(-1!==i){let n=new URLSearchParams(t.slice(i+1));n.get("dpl")||(n.append("dpl",e),t=t.slice(0,i)+"?"+n.toString())}else t+=`?dpl=${e}`}}return{src:t,srcSet:void 0,sizes:void 0}}let{widths:l,kind:d}=function({deviceSizes:e,allSizes:t},i,n,a){if(a&&("fill"===n||"responsive"===n)){let i=/(^|\s)(1?\d?\d)vw/g,n=[];for(let e;e=i.exec(a);)n.push(parseInt(e[2]));if(n.length){let i=.01*Math.min(...n);return{widths:t.filter(t=>t>=e[0]*i),kind:"w"}}return{widths:t,kind:"w"}}return"number"!=typeof i||"fill"===n||"responsive"===n?{widths:e,kind:"w"}:{widths:[...new Set([i,2*i].map(e=>t.find(t=>t>=e)||t[t.length-1]))],kind:"x"}}(e,a,n,s),c=l.length-1;return{sizes:s||"w"!==d?s:"100vw",srcSet:l.map((i,n)=>`${o({config:e,src:t,quality:r,width:i})} ${"w"===d?i:n+1}${d}`).join(", "),src:o({config:e,src:t,quality:r,width:l[c]})}}function E(e){return"number"==typeof e?e:"string"==typeof e?parseInt(e,10):void 0}function k(e){let t=e.config?.loader||"default",i=j.get(t);if(i)return i(e);throw Object.defineProperty(Error(`Unknown "loader" found in "next.config.js". Expected: ${d.VALID_LOADERS.join(", ")}. Received: ${t}`),"__NEXT_ERROR_CODE",{value:"E1026",enumerable:!1,configurable:!0})}function A(e,t,i,n,a,r){e&&e.src!==w&&e["data-loaded-src"]!==t&&(e["data-loaded-src"]=t,("decode"in e?e.decode():Promise.resolve()).catch(()=>{}).then(()=>{if(e.parentNode&&(y.add(t),"blur"===n&&r(!0),a?.current)){let{naturalWidth:t,naturalHeight:i}=e;a.current({naturalWidth:t,naturalHeight:i})}}))}let R=({imgAttributes:e,heightInt:t,widthInt:i,qualityInt:n,layout:a,className:o,imgStyle:l,blurStyle:d,isLazy:c,placeholder:u,loading:p,srcString:m,config:b,unoptimized:g,loader:_,onLoadingCompleteRef:f,setBlurComplete:h,setIntersection:y,onLoad:w,onError:j,isVisible:x,noscriptSizes:E,...k})=>(p=c?"lazy":p,(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("img",{...k,...e,decoding:"async","data-nimg":a,className:o,style:{...l,...d},ref:(0,s.useCallback)(e=>{y(e),e?.complete&&A(e,m,a,u,f,h)},[y,m,a,u,f,h]),onLoad:e=>{A(e.currentTarget,m,a,u,f,h),w&&w(e)},onError:e=>{"blur"===u&&h(!0),j&&j(e)}}),(c||"blur"===u)&&(0,r.jsx)("noscript",{children:(0,r.jsx)("img",{...k,loading:p,decoding:"async","data-nimg":a,style:l,className:o,...v({config:b,src:m,unoptimized:g,layout:a,width:i,quality:n,sizes:E,loader:_})})})]}));function S({src:e,sizes:t,unoptimized:i=!1,priority:n=!1,loading:a,lazyRoot:o=null,lazyBoundary:m,className:b,quality:g,width:_,height:j,style:A,objectFit:$,objectPosition:N,onLoadingComplete:T,placeholder:I="empty",blurDataURL:z,...O}){var q;let C,F=(0,s.useContext)(u.ImageConfigContext),D=(0,s.useMemo)(()=>{let e=h||F||d.imageConfigDefault,t=[...e.deviceSizes,...e.imageSizes].sort((e,t)=>e-t),i=e.deviceSizes.sort((e,t)=>e-t),n=e.qualities?.sort((e,t)=>e-t);return{...e,allSizes:t,deviceSizes:i,qualities:n,localPatterns:"u"<typeof window?F?.localPatterns:e.localPatterns}},[F]),P=t?"responsive":"intrinsic";"layout"in O&&(O.layout&&(P=O.layout),delete O.layout);let L=k;if("loader"in O){if(O.loader){let e=O.loader;L=t=>{let{config:i,...n}=t;return e(n)}}delete O.loader}let M="";if("object"==typeof(q=e)&&(x(q)||void 0!==q.src)){let t=x(e)?e.default:e;if(!t.src)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E460",enumerable:!1,configurable:!0});if(z=z||t.blurDataURL,M=t.src,(!P||"fill"!==P)&&(j=j||t.height,_=_||t.width,!t.height||!t.width))throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E48",enumerable:!1,configurable:!0})}e="string"==typeof e?e:M,(0,p.warnOnce)(`Image with src "${e}" is using next/legacy/image which is deprecated and will be removed in a future version of Next.js.`);let U=!n&&("lazy"===a||void 0===a);(e.startsWith("data:")||e.startsWith("blob:"))&&(i=!0,U=!1),"u">typeof window&&y.has(e)&&(U=!1),D.unoptimized&&(i=!0);let[K,W]=(0,s.useState)(!1),[Q,B,G]=(0,c.useIntersection)({rootRef:o,rootMargin:m||"200px",disabled:!U}),H=!U||B,V={boxSizing:"border-box",display:"block",overflow:"hidden",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},X={boxSizing:"border-box",display:"block",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},Y=!1,J=E(_),Z=E(j),ee=E(g),et=Object.assign({},A,{position:"absolute",top:0,left:0,bottom:0,right:0,boxSizing:"border-box",padding:0,border:"none",margin:"auto",display:"block",width:0,height:0,minWidth:"100%",maxWidth:"100%",minHeight:"100%",maxHeight:"100%",objectFit:$,objectPosition:N}),ei="blur"!==I||K?{}:{backgroundSize:$||"cover",backgroundPosition:N||"0% 0%",filter:"blur(20px)",backgroundImage:`url("${z}")`};if("fill"===P)V.display="block",V.position="absolute",V.top=0,V.left=0,V.bottom=0,V.right=0;else if(void 0!==J&&void 0!==Z){let e=Z/J,t=isNaN(e)?"100%":`${100*e}%`;"responsive"===P?(V.display="block",V.position="relative",Y=!0,X.paddingTop=t):"intrinsic"===P?(V.display="inline-block",V.position="relative",V.maxWidth="100%",Y=!0,X.maxWidth="100%",C=`data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27${J}%27%20height=%27${Z}%27/%3e`):"fixed"===P&&(V.display="inline-block",V.position="relative",V.width=J,V.height=Z)}let en={src:w,srcSet:void 0,sizes:void 0};H&&(en=v({config:D,src:e,unoptimized:i,layout:P,width:J,quality:ee,sizes:t,loader:L}));let ea=e,er=f?void 0:{imageSrcSet:en.srcSet,imageSizes:en.sizes,crossOrigin:O.crossOrigin,referrerPolicy:O.referrerPolicy},es="u"<typeof window?s.default.useEffect:s.default.useLayoutEffect,eo=(0,s.useRef)(T),el=(0,s.useRef)(e);(0,s.useEffect)(()=>{eo.current=T},[T]),es(()=>{el.current!==e&&(G(),el.current=e)},[G,e]);let ed={isLazy:U,imgAttributes:en,heightInt:Z,widthInt:J,qualityInt:ee,layout:P,className:b,imgStyle:et,blurStyle:ei,loading:a,config:D,unoptimized:i,placeholder:I,loader:L,srcString:ea,onLoadingCompleteRef:eo,setBlurComplete:W,setIntersection:Q,isVisible:H,noscriptSizes:t,...O};return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)("span",{style:V,children:[Y?(0,r.jsx)("span",{style:X,children:C?(0,r.jsx)("img",{style:{display:"block",maxWidth:"100%",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},alt:"","aria-hidden":!0,src:C}):null}):null,(0,r.jsx)(R,{...ed})]}),!f&&n?(0,r.jsx)(l.default,{children:(0,r.jsx)("link",{rel:"preload",as:"image",href:en.srcSet?void 0:en.src,...er},"__nimg-"+en.src+en.srcSet+en.sizes)}):null]})}("function"==typeof i.default||"object"==typeof i.default&&null!==i.default)&&void 0===i.default.__esModule&&(Object.defineProperty(i.default,"__esModule",{value:!0}),Object.assign(i.default,i),t.exports=i.default)},501964,(e,t,i)=>{t.exports=e.r(498943)},568213,e=>{"use strict";var t=e.i(478902),i=e.i(88816),n=e.i(544197),a=e.i(211570),r=e.i(389959),s=e.i(655744),o=e.i(837710),l=e.i(843778),d=e.i(874311),c=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:b,createEmptyRow:g,keyPlaceholder:_,valuePlaceholder:f,addLabel:h,addActions:y=[],disabled:w=!1,inputSize:j="small",className:x,rowsClassName:v="space-y-3 mt-1",rowClassName:E,keyInputClassName:k,valueInputClassName:A,addButtonClassName:R,removeButtonClassName:S,removeLabel:$="Remove row"})=>{let{fields:N,append:T,remove:I}=(0,s.useFieldArray)({control:e,name:p,keyName:"fieldId"}),z=y.length>0,O=`${h} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",x),children:[(0,t.jsx)("div",{className:v,children:N.map((i,n)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",E),children:[(0,t.jsx)(c.FormField,{control:e,name:`${p}.${n}.${m}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",k),placeholder:_,disabled:w})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(c.FormField,{control:e,name:`${p}.${n}.${b}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",A),placeholder:f,disabled:w})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.Trash,{size:12}),"aria-label":$,disabled:w,onClick:()=>I(n),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",S)})]},i.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.Plus,{}),disabled:w,onClick:()=>T(g()),className:(0,l.cn)(z&&"rounded-r-none border-r-0 px-3",R),children:h}),z&&(0,t.jsxs)(d.DropdownMenu,{children:[(0,t.jsx)(d.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(i.ChevronDown,{size:14}),"aria-label":O,disabled:w,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(d.DropdownMenuContent,{align:"end",side:"bottom",children:y.map(e=>(0,t.jsxs)(r.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(d.DropdownMenuSeparator,{}),(0,t.jsx)(d.DropdownMenuItem,{onClick:()=>{var t;T(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:i,valueFieldName:n,keyRequiredMessage:a,valueRequiredMessage:r,duplicateKeyMessage:s,allowEmptyRows:o=!0,normaliseKey:l=e=>e})=>{let d=[],c=s?new Map:null;return e.forEach((e,s)=>{let u=t(e[i]),p=t(e[n]);if(!u&&!p){o||(d.push({path:[s,i],message:a}),d.push({path:[s,n],message:r}));return}if(!u)return void d.push({path:[s,i],message:a});if(!p)return void d.push({path:[s,n],message:r});if(!c)return;let m=l(u);m&&c.set(m,[...c.get(m)??[],s])}),c&&s&&c.forEach(e=>{e.length<2||e.forEach(e=>{d.push({path:[e,i],message:s})})}),d},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:i,valueFieldName:n})=>e.filter(e=>{let a=t(e[i]),r=t(e[n]);return a.length>0||r.length>0})],916800);var i=e.i(97429);let n=/^https?:\/\//,a="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",r=RegExp(`^(?:${a}\\.){3}${a}$`),s=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:a})=>i.z.string().trim().min(1,e).superRefine((e,o)=>{if(e){if(!n.test(e))return void o.addIssue({code:i.z.ZodIssueCode.custom,message:a});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:i}=t;return"localhost"===i||i.includes(".")||r.test(i)||s.test(i)}catch{return!1}})(e)||o.addIssue({code:i.z.ZodIssueCode.custom,message:t})}})],478029)},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let i=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:i,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(i)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:i,sourceTableName:n,sourceTableSchema:a})=>[`CREATE TABLE ${(0,t.ident)(a)}.${(0,t.ident)(i)} (LIKE ${(0,t.ident)(a)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(a)}.${(0,t.ident)(i)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,i],664304);var n=e.i(180141),a=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},a){if(!n)throw Error("id is required");let r=i({id:n}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",n]},a);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:i})=>(0,n.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,i),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:i},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:i,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:i,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:i},{enabled:n=!0,...r}={})=>(0,a.useQuery)({...l({projectRef:e,connectionString:t,id:i}),enabled:n&&void 0!==e&&void 0!==i&&!isNaN(i),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},64102,e=>{"use strict";var t=e.i(478902),i=e.i(389959),n=e.i(843778);let a=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:i,header:n,disabled:a,className:r})=>{let s=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${a?" opacity-30":" opacity-100"}`,`${r}`];return(0,t.jsxs)("div",{id:i,className:s.join(" "),children:[n,e]})},"FormSectionContent",0,({children:e,loading:n=!0,loaders:r,fullWidth:s,className:o})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${s&&"col-span-12!"}
        ${o}
      `,children:n?r?Array(r).fill(0).map((e,i)=>(0,t.jsx)(a,{},i)):i.Children.map(e,(e,i)=>(0,t.jsx)(a,{},i)):e}),"FormSectionLabel",0,({children:e,className:i="",description:a})=>void 0!==a?(0,t.jsxs)("div",{className:(0,n.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",i),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),a]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${i}`,children:e})])},577846,(e,t,i)=>{var n=e.r(714530);t.exports=function(e,t){return n(t,function(t){return e[t]})}},943262,(e,t,i)=>{var n=e.r(577846),a=e.r(375493);t.exports=function(e){return null==e?[]:n(e,a(e))}},333990,(e,t,i)=>{var n=e.r(491761),a=e.r(775484),r=e.r(141892),s=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,i,d){e=a(e)?e:o(e),i=i&&!d?s(i):0;var c=e.length;return i<0&&(i=l(c+i,0)),r(e)?i<=c&&e.indexOf(t,i)>-1:!!c&&n(e,t,i)>-1}},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:i})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[i("Authorization",`Bearer ${e}`),...t?[i("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>i("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},253369,e=>{"use strict";var t=e.i(850036),i=e.i(38429),n=e.i(356003),a=e.i(355901),r=e.i(878827),s=e.i(714403);async function o({trigger:e,projectRef:i,connectionString:n}){let{sql:a}=t.default.triggers.remove(e),{result:r}=await (0,s.executeSql)({projectRef:i,connectionString:n,sql:a,queryKey:["trigger","delete",e.id]});return r}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...s}={})=>{let l=(0,n.useQueryClient)();return(0,i.useMutation)({mutationFn:e=>o(e),async onSuccess(t,i,n){let{projectRef:a}=i;await l.invalidateQueries({queryKey:r.databaseTriggerKeys.list(a)}),await e?.(t,i,n)},async onError(e,i,n){void 0===t?a.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,i,n)},...s})}])},534587,200246,e=>{"use strict";var t=e.i(248593),i=e.i(242882),n=e.i(878827),a=e.i(234745);function r(e){return e}async function s({projectRef:e,connectionString:i},n){if(!e)throw Error("projectRef is required");let r=new Headers;i&&r.set("x-connection-encrypted",i);let{data:o,error:l}=await (0,a.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":i,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:r,signal:n});return l&&(0,a.handleError)(l),o}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:a=!0,...r}={})=>(0,i.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:i})=>s({projectRef:e,connectionString:t},i),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:a&&void 0!==e,...r}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:a=!0,...o}={})=>(0,i.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:i})=>s({projectRef:e,connectionString:t},i).then(e=>e.map(r)),enabled:a&&void 0!==e,...o})],534587);var o=e.i(850036),l=e.i(38429),d=e.i(356003),c=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:i}){let{sql:n}=o.default.triggers.create(i),{result:a}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["trigger","create"]});return a}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...i}={})=>{let a=(0,d.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,i,r){let{projectRef:s}=i;await a.invalidateQueries({queryKey:n.databaseTriggerKeys.list(s)}),await e?.(t,i,r)},async onError(e,i,n){void 0===t?c.toast.error(`Failed to create database trigger: ${e.message}`):t(e,i,n)},...i})}],200246)}]);