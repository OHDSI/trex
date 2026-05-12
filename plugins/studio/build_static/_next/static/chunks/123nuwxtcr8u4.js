(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,68205,e=>{"use strict";let t=e=>Array.from(new Set(e)).sort();e.s(["edgeFunctionsKeys",0,{list:e=>["projects",e,"edge-functions"],lastHourStats:(e,a=[])=>["projects",e,"edge-functions","last-hour-stats",t(a)],detail:(e,t)=>["projects",e,"edge-function",t,"detail"],body:(e,t)=>["projects",e,"edge-function",t,"body"]},"normalizeFunctionIds",0,t])},240788,e=>{"use strict";var t=e.i(242882),a=e.i(68205),n=e.i(234745);async function i({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:a,error:r}=await (0,n.get)("/v1/projects/{ref}/functions",{params:{path:{ref:e}},signal:t});return r&&(0,n.handleError)(r),a}e.s(["useEdgeFunctionsQuery",0,({projectRef:e},{enabled:n=!0,...r}={})=>(0,t.useQuery)({queryKey:a.edgeFunctionsKeys.list(e),queryFn:({signal:t})=>i({projectRef:e},t),enabled:n&&void 0!==e,...r})])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},170149,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(657588),n=e.i(283607),i=e.i(370410),r=e.i(816467),s=e.i(389959),o=e.i(655744),l=e.i(837710),d=e.i(843778),c=e.i(375761),u=e.i(253214),p=e.i(20482),m=e.i(378277),b=e.i(97429),_=e.i(710483);let h=(0,s.forwardRef)(({title:e,size:a="small",onConfirm:h,visible:y,onCancel:g,loading:f,cancelLabel:j="Cancel",confirmLabel:x="Submit",confirmPlaceholder:w,confirmString:v,alert:k,input:E,label:C,description:T,formMessage:N,text:F,children:A,blockDeleteButton:D=!0,variant:S="default",errorMessage:R="Value entered does not match",enableCopy:q=!1,...I},M)=>{let[z,$]=(0,s.useState)(!1),K=b.z.object({confirmValue:b.z.preprocess(e=>"string"==typeof e?e.trim():e,b.z.literal(v.trim(),{errorMap:()=>({message:R})}))}),L=(0,o.useForm)({resolver:(0,n.zodResolver)(K),reValidateMode:"onChange",defaultValues:{confirmValue:""}}),U=L.formState.isValid;(0,s.useEffect)(()=>{v&&L.reset()},[v]),(0,s.useEffect)(()=>{if(!z)return;let e=setTimeout(()=>$(!1),2e3);return()=>clearTimeout(e)},[z]);let{title:Q,children:O,...B}=k?.base??{},V=k?.title?{label:k.title}:{};return(0,t.jsx)(u.Dialog,{open:y,...I,onOpenChange:()=>{y&&g()},children:(0,t.jsxs)(u.DialogContent,{ref:M,className:"p-0 gap-0 pb-5 block!",size:a,children:[(0,t.jsx)(u.DialogHeader,{className:(0,d.cn)("border-b"),padding:"small",children:(0,t.jsx)(u.DialogTitle,{className:"",children:e})}),k&&(0,t.jsx)(_.Admonition,{type:S,description:k.description,...V,className:"border-x-0 rounded-none -mt-px",...B}),A&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{padding:"small",children:A}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),void 0!==F&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{className:"p-5",padding:"small",children:(0,t.jsx)("p",{className:"text-foreground-light text-sm",children:F})}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),(0,t.jsx)(p.Form,{...L,children:(0,t.jsxs)("form",{autoComplete:"off",onSubmit:L.handleSubmit(function(e){h()}),className:"px-5 flex flex-col gap-y-3 pt-3",children:[(0,t.jsx)(p.FormField,{control:L.control,name:"confirmValue",render:({field:e})=>(0,t.jsxs)(p.FormItem,{className:"flex flex-col gap-y-2",children:[(0,t.jsxs)(p.FormLabel,{...C,enableSelection:!q,children:["Type"," ",q?(0,t.jsx)(l.Button,{type:"default",className:"h-[23px] px-1.5 py-0 border-muted text-sm whitespace-pre break-all",iconRight:z?(0,t.jsx)(i.Check,{strokeWidth:2,className:"text-brand"}):(0,t.jsx)(r.Copy,{}),onClick:()=>{$(!0),(0,c.copyToClipboard)(v)},children:v}):(0,t.jsx)("span",{className:"text-foreground break-all whitespace-pre",children:v})," ","to confirm."]}),(0,t.jsx)(p.FormControl,{children:(0,t.jsx)(m.Input_Shadcn_,{autoComplete:"off",placeholder:w,...E,...e})}),!!T&&(0,t.jsx)(p.FormDescription,{...T}),(0,t.jsx)(p.FormMessage,{...N})]})}),(0,t.jsxs)("div",{className:"flex gap-2",children:[!D&&(0,t.jsx)(l.Button,{size:"medium",block:!0,type:"default",disabled:f,onClick:g,children:j}),(0,t.jsx)(l.Button,{block:!0,size:"medium",type:"destructive"===S?"danger":"warning"===S?"warning":"primary",htmlType:"submit",loading:f,disabled:!U||f,className:"truncate",children:x})]})]})})]})})});h.displayName="TextConfirmModal",e.s(["TextConfirmModal",0,e=>{let n=(0,a.useFlag)("textConfirmationModalClickToCopy");return(0,t.jsx)(h,{...e,enableCopy:n})}],170149)},174078,(e,t,a)=>{var n=e.r(889695),i=1/0;t.exports=function(e){return e?(e=n(e))===i||e===-i?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,a)=>{var n=e.r(174078);t.exports=function(e){var t=n(e),a=t%1;return t==t?a?t-a:t:0}},141892,(e,t,a)=>{var n=e.r(924519),i=e.r(145948),r=e.r(460779);t.exports=function(e){return"string"==typeof e||!i(e)&&r(e)&&"[object String]"==n(e)}},652748,(e,t,a)=>{var n=e.r(714530),i=e.r(729077),r=e.r(352677),s=e.r(145948);t.exports=function(e,t){return(s(e)?n:r)(e,i(t,3))}},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:i,onCancel:r,title:s="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:d="Keep editing",size:c="tiny"})=>{let u=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,a.useCallback)(()=>{u.current=!0,i()},[i]),m=(0,a.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}r()}},[r]);return(0,t.jsx)(n.AlertDialog,{open:e,onOpenChange:m,children:(0,t.jsxs)(n.AlertDialogContent,{size:c,children:[(0,t.jsxs)(n.AlertDialogHeader,{children:[(0,t.jsx)(n.AlertDialogTitle,{children:s}),null!=o&&(0,t.jsx)(n.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(n.AlertDialogFooter,{children:[(0,t.jsx)(n.AlertDialogCancel,{children:d}),(0,t.jsx)(n.AlertDialogAction,{variant:"danger",onClick:p,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:n})=>{let[i,r]=(0,t.useState)(!1),s=(0,a.default)(e),o=(0,a.default)(n),l=(0,t.useCallback)(()=>{s.current()?r(!0):o.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{r(!1),o.current()},[]),u=(0,t.useCallback)(()=>{r(!1)},[]),p=(0,t.useMemo)(()=>({visible:i,onClose:c,onCancel:u}),[i,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:p}),[l,d,p])}])},418029,e=>{"use strict";var t=e.i(478902),a=e.i(837710),n=e.i(843778);e.s(["NoSearchResults",0,({searchString:e,withinTableCell:i=!1,onResetFilter:r,className:s,label:o,description:l})=>(0,t.jsxs)("div",{className:(0,n.cn)("flex items-center justify-between",!i&&"bg-surface-100 px-4 md:px-6 py-4 rounded-md border border-default",s),children:[(0,t.jsxs)("div",{className:"text-sm flex flex-col gap-y-0.5",children:[(0,t.jsx)("p",{className:"text-foreground",children:o??"No results found"}),(0,t.jsx)("p",{className:"text-foreground-lighter",children:l??`Your search for “${e}” did not return any results`})]}),void 0!==r&&(0,t.jsx)(a.Button,{type:"default",onClick:()=>r(),children:"Reset filter"})]})])},568213,e=>{"use strict";var t=e.i(478902),a=e.i(88816),n=e.i(544197),i=e.i(211570),r=e.i(389959),s=e.i(655744),o=e.i(837710),l=e.i(843778),d=e.i(874311),c=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:b,createEmptyRow:_,keyPlaceholder:h,valuePlaceholder:y,addLabel:g,addActions:f=[],disabled:j=!1,inputSize:x="small",className:w,rowsClassName:v="space-y-3 mt-1",rowClassName:k,keyInputClassName:E,valueInputClassName:C,addButtonClassName:T,removeButtonClassName:N,removeLabel:F="Remove row"})=>{let{fields:A,append:D,remove:S}=(0,s.useFieldArray)({control:e,name:p,keyName:"fieldId"}),R=f.length>0,q=`${g} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",w),children:[(0,t.jsx)("div",{className:v,children:A.map((a,n)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",k),children:[(0,t.jsx)(c.FormField,{control:e,name:`${p}.${n}.${m}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:x,className:(0,l.cn)("w-full",E),placeholder:h,disabled:j})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(c.FormField,{control:e,name:`${p}.${n}.${b}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:x,className:(0,l.cn)("w-full",C),placeholder:y,disabled:j})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(i.Trash,{size:12}),"aria-label":F,disabled:j,onClick:()=>S(n),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",N)})]},a.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.Plus,{}),disabled:j,onClick:()=>D(_()),className:(0,l.cn)(R&&"rounded-r-none border-r-0 px-3",T),children:g}),R&&(0,t.jsxs)(d.DropdownMenu,{children:[(0,t.jsx)(d.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.ChevronDown,{size:14}),"aria-label":q,disabled:j,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(d.DropdownMenuContent,{align:"end",side:"bottom",children:f.map(e=>(0,t.jsxs)(r.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(d.DropdownMenuSeparator,{}),(0,t.jsx)(d.DropdownMenuItem,{onClick:()=>{var t;D(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:a,valueFieldName:n,keyRequiredMessage:i,valueRequiredMessage:r,duplicateKeyMessage:s,allowEmptyRows:o=!0,normaliseKey:l=e=>e})=>{let d=[],c=s?new Map:null;return e.forEach((e,s)=>{let u=t(e[a]),p=t(e[n]);if(!u&&!p){o||(d.push({path:[s,a],message:i}),d.push({path:[s,n],message:r}));return}if(!u)return void d.push({path:[s,a],message:i});if(!p)return void d.push({path:[s,n],message:r});if(!c)return;let m=l(u);m&&c.set(m,[...c.get(m)??[],s])}),c&&s&&c.forEach(e=>{e.length<2||e.forEach(e=>{d.push({path:[e,a],message:s})})}),d},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:a,valueFieldName:n})=>e.filter(e=>{let i=t(e[a]),r=t(e[n]);return i.length>0||r.length>0})],916800);var a=e.i(97429);let n=/^https?:\/\//,i="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",r=RegExp(`^(?:${i}\\.){3}${i}$`),s=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:i})=>a.z.string().trim().min(1,e).superRefine((e,o)=>{if(e){if(!n.test(e))return void o.addIssue({code:a.z.ZodIssueCode.custom,message:i});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:a}=t;return"localhost"===a||a.includes(".")||r.test(a)||s.test(a)}catch{return!1}})(e)||o.addIssue({code:a.z.ZodIssueCode.custom,message:t})}})],478029)},577846,(e,t,a)=>{var n=e.r(714530);t.exports=function(e,t){return n(t,function(t){return e[t]})}},943262,(e,t,a)=>{var n=e.r(577846),i=e.r(375493);t.exports=function(e){return null==e?[]:n(e,i(e))}},333990,(e,t,a)=>{var n=e.r(491761),i=e.r(775484),r=e.r(141892),s=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,a,d){e=i(e)?e:o(e),a=a&&!d?s(a):0;var c=e.length;return a<0&&(a=l(c+a,0)),r(e)?a<=c&&e.indexOf(t,a)>-1:!!c&&n(e,t,a)>-1}},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:i})=>[`CREATE TABLE ${(0,t.ident)(i)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(i)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(i)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),i=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},i){if(!n)throw Error("id is required");let r=a({id:n}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",n]},i);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...r}={})=>(0,i.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:a})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[a("Authorization",`Bearer ${e}`),...t?[a("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>a("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},253369,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),i=e.i(355901),r=e.i(878827),s=e.i(714403);async function o({trigger:e,projectRef:a,connectionString:n}){let{sql:i}=t.default.triggers.remove(e),{result:r}=await (0,s.executeSql)({projectRef:a,connectionString:n,sql:i,queryKey:["trigger","delete",e.id]});return r}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...s}={})=>{let l=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,n){let{projectRef:i}=a;await l.invalidateQueries({queryKey:r.databaseTriggerKeys.list(i)}),await e?.(t,a,n)},async onError(e,a,n){void 0===t?i.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,a,n)},...s})}])},534587,200246,e=>{"use strict";var t=e.i(248593),a=e.i(242882),n=e.i(878827),i=e.i(234745);function r(e){return e}async function s({projectRef:e,connectionString:a},n){if(!e)throw Error("projectRef is required");let r=new Headers;a&&r.set("x-connection-encrypted",a);let{data:o,error:l}=await (0,i.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:r,signal:n});return l&&(0,i.handleError)(l),o}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...r}={})=>(0,a.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:i&&void 0!==e,...r}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...o}={})=>(0,a.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:a})=>s({projectRef:e,connectionString:t},a).then(e=>e.map(r)),enabled:i&&void 0!==e,...o})],534587);var o=e.i(850036),l=e.i(38429),d=e.i(356003),c=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:a}){let{sql:n}=o.default.triggers.create(a),{result:i}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["trigger","create"]});return i}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...a}={})=>{let i=(0,d.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,a,r){let{projectRef:s}=a;await i.invalidateQueries({queryKey:n.databaseTriggerKeys.list(s)}),await e?.(t,a,r)},async onError(e,a,n){void 0===t?c.toast.error(`Failed to create database trigger: ${e.message}`):t(e,a,n)},...a})}],200246)}]);