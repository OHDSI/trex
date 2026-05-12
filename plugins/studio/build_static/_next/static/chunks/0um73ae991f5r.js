(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,237002,e=>{"use strict";var t=e.i(478902),n=e.i(389959),a=e.i(678001),i=e.i(274664),r=e.i(174617),s=e.i(826524),o=e.i(594661),l=e.i(374251),c=e.i(889251),d=e.i(546595),u="Checkbox",[p,m]=(0,i.createContextScope)(u),[b,_]=p(u);function h(e){let{__scopeCheckbox:a,checked:i,children:r,defaultChecked:o,disabled:l,form:c,name:d,onCheckedChange:p,required:m,value:_="on",internal_do_not_use_render:h}=e,[f,y]=(0,s.useControllableState)({prop:i,defaultProp:o??!1,onChange:p,caller:u}),[g,x]=n.useState(null),[j,v]=n.useState(null),w=n.useRef(!1),E=!g||!!c||!!g.closest("form"),C={checked:f,disabled:l,setChecked:y,control:g,setControl:x,name:d,form:c,value:_,hasConsumerStoppedPropagationRef:w,required:m,defaultChecked:!k(o)&&o,isFormControl:E,bubbleInput:j,setBubbleInput:v};return(0,t.jsx)(b,{scope:a,...C,children:"function"==typeof h?h(C):r})}var f="CheckboxTrigger",y=n.forwardRef(({__scopeCheckbox:e,onKeyDown:i,onClick:s,...o},l)=>{let{control:c,value:u,disabled:p,checked:m,required:b,setControl:h,setChecked:y,hasConsumerStoppedPropagationRef:g,isFormControl:x,bubbleInput:j}=_(f,e),v=(0,a.useComposedRefs)(l,h),w=n.useRef(m);return n.useEffect(()=>{let e=c?.form;if(e){let t=()=>y(w.current);return e.addEventListener("reset",t),()=>e.removeEventListener("reset",t)}},[c,y]),(0,t.jsx)(d.Primitive.button,{type:"button",role:"checkbox","aria-checked":k(m)?"mixed":m,"aria-required":b,"data-state":E(m),"data-disabled":p?"":void 0,disabled:p,value:u,...o,ref:v,onKeyDown:(0,r.composeEventHandlers)(i,e=>{"Enter"===e.key&&e.preventDefault()}),onClick:(0,r.composeEventHandlers)(s,e=>{y(e=>!!k(e)||!e),j&&x&&(g.current=e.isPropagationStopped(),g.current||e.stopPropagation())})})});y.displayName=f;var g=n.forwardRef((e,n)=>{let{__scopeCheckbox:a,name:i,checked:r,defaultChecked:s,required:o,disabled:l,value:c,onCheckedChange:d,form:u,...p}=e;return(0,t.jsx)(h,{__scopeCheckbox:a,checked:r,defaultChecked:s,disabled:l,required:o,onCheckedChange:d,name:i,form:u,value:c,internal_do_not_use_render:({isFormControl:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(y,{...p,ref:n,__scopeCheckbox:a}),e&&(0,t.jsx)(w,{__scopeCheckbox:a})]})})});g.displayName=u;var x="CheckboxIndicator",j=n.forwardRef((e,n)=>{let{__scopeCheckbox:a,forceMount:i,...r}=e,s=_(x,a);return(0,t.jsx)(c.Presence,{present:i||k(s.checked)||!0===s.checked,children:(0,t.jsx)(d.Primitive.span,{"data-state":E(s.checked),"data-disabled":s.disabled?"":void 0,...r,ref:n,style:{pointerEvents:"none",...e.style}})})});j.displayName=x;var v="CheckboxBubbleInput",w=n.forwardRef(({__scopeCheckbox:e,...i},r)=>{let{control:s,hasConsumerStoppedPropagationRef:c,checked:u,defaultChecked:p,required:m,disabled:b,name:h,value:f,form:y,bubbleInput:g,setBubbleInput:x}=_(v,e),j=(0,a.useComposedRefs)(r,x),w=(0,o.usePrevious)(u),E=(0,l.useSize)(s);n.useEffect(()=>{if(!g)return;let e=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set,t=!c.current;if(w!==u&&e){let n=new Event("click",{bubbles:t});g.indeterminate=k(u),e.call(g,!k(u)&&u),g.dispatchEvent(n)}},[g,w,u,c]);let C=n.useRef(!k(u)&&u);return(0,t.jsx)(d.Primitive.input,{type:"checkbox","aria-hidden":!0,defaultChecked:p??C.current,required:m,disabled:b,name:h,value:f,form:y,...i,tabIndex:-1,ref:j,style:{...i.style,...E,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});function k(e){return"indeterminate"===e}function E(e){return k(e)?"indeterminate":e?"checked":"unchecked"}w.displayName=v,e.s(["Checkbox",0,g,"CheckboxIndicator",0,j,"Indicator",0,j,"Root",0,g,"createCheckboxScope",0,m,"unstable_BubbleInput",0,w,"unstable_CheckboxBubbleInput",0,w,"unstable_CheckboxProvider",0,h,"unstable_CheckboxTrigger",0,y,"unstable_Provider",0,h,"unstable_Trigger",0,y],361494);var C=e.i(361494),C=C,N=e.i(370410),T=e.i(843778);let R=n.forwardRef(({className:e,...n},a)=>(0,t.jsx)(C.Root,{ref:a,className:(0,T.cn)("peer flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-control bg-control/25 ring-offset-background","transition-colors duration-150 ease-in-out","hover:border-strong","focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2","disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background",e),...n,children:(0,t.jsx)(C.Indicator,{className:(0,T.cn)("flex items-center justify-center text-current"),children:(0,t.jsx)(N.Check,{className:"h-3 w-3 text-background",strokeWidth:4})})}));R.displayName=C.Root.displayName,e.s(["Checkbox",0,R],237002)},174078,(e,t,n)=>{var a=e.r(889695),i=1/0;t.exports=function(e){return e?(e=a(e))===i||e===-i?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,n)=>{var a=e.r(174078);t.exports=function(e){var t=a(e),n=t%1;return t==t?n?t-n:t:0}},141892,(e,t,n)=>{var a=e.r(924519),i=e.r(145948),r=e.r(460779);t.exports=function(e){return"string"==typeof e||!i(e)&&r(e)&&"[object String]"==a(e)}},652748,(e,t,n)=>{var a=e.r(714530),i=e.r(729077),r=e.r(352677),s=e.r(145948);t.exports=function(e,t){return(s(e)?a:r)(e,i(t,3))}},336908,e=>{"use strict";var t=e.i(478902),n=e.i(389959),a=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:i,onCancel:r,title:s="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:c="Keep editing",size:d="tiny"})=>{let u=(0,n.useRef)(!1);(0,n.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,n.useCallback)(()=>{u.current=!0,i()},[i]),m=(0,n.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}r()}},[r]);return(0,t.jsx)(a.AlertDialog,{open:e,onOpenChange:m,children:(0,t.jsxs)(a.AlertDialogContent,{size:d,children:[(0,t.jsxs)(a.AlertDialogHeader,{children:[(0,t.jsx)(a.AlertDialogTitle,{children:s}),null!=o&&(0,t.jsx)(a.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(a.AlertDialogFooter,{children:[(0,t.jsx)(a.AlertDialogCancel,{children:c}),(0,t.jsx)(a.AlertDialogAction,{variant:"danger",onClick:p,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),n=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:a})=>{let[i,r]=(0,t.useState)(!1),s=(0,n.default)(e),o=(0,n.default)(a),l=(0,t.useCallback)(()=>{s.current()?r(!0):o.current()},[]),c=(0,t.useCallback)(e=>{e||l()},[l]),d=(0,t.useCallback)(()=>{r(!1),o.current()},[]),u=(0,t.useCallback)(()=>{r(!1)},[]),p=(0,t.useMemo)(()=>({visible:i,onClose:d,onCancel:u}),[i,d,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:c,modalProps:p}),[l,c,p])}])},418029,e=>{"use strict";var t=e.i(478902),n=e.i(837710),a=e.i(843778);e.s(["NoSearchResults",0,({searchString:e,withinTableCell:i=!1,onResetFilter:r,className:s,label:o,description:l})=>(0,t.jsxs)("div",{className:(0,a.cn)("flex items-center justify-between",!i&&"bg-surface-100 px-4 md:px-6 py-4 rounded-md border border-default",s),children:[(0,t.jsxs)("div",{className:"text-sm flex flex-col gap-y-0.5",children:[(0,t.jsx)("p",{className:"text-foreground",children:o??"No results found"}),(0,t.jsx)("p",{className:"text-foreground-lighter",children:l??`Your search for “${e}” did not return any results`})]}),void 0!==r&&(0,t.jsx)(n.Button,{type:"default",onClick:()=>r(),children:"Reset filter"})]})])},568213,e=>{"use strict";var t=e.i(478902),n=e.i(88816),a=e.i(544197),i=e.i(211570),r=e.i(389959),s=e.i(655744),o=e.i(837710),l=e.i(843778),c=e.i(874311),d=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:b,createEmptyRow:_,keyPlaceholder:h,valuePlaceholder:f,addLabel:y,addActions:g=[],disabled:x=!1,inputSize:j="small",className:v,rowsClassName:w="space-y-3 mt-1",rowClassName:k,keyInputClassName:E,valueInputClassName:C,addButtonClassName:N,removeButtonClassName:T,removeLabel:R="Remove row"})=>{let{fields:A,append:D,remove:F}=(0,s.useFieldArray)({control:e,name:p,keyName:"fieldId"}),I=g.length>0,S=`${y} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",v),children:[(0,t.jsx)("div",{className:w,children:A.map((n,a)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",k),children:[(0,t.jsx)(d.FormField,{control:e,name:`${p}.${a}.${m}`,render:({field:e})=>(0,t.jsxs)(d.FormItem,{className:"flex-1",children:[(0,t.jsx)(d.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",E),placeholder:h,disabled:x})}),(0,t.jsx)(d.FormMessage,{})]})}),(0,t.jsx)(d.FormField,{control:e,name:`${p}.${a}.${b}`,render:({field:e})=>(0,t.jsxs)(d.FormItem,{className:"flex-1",children:[(0,t.jsx)(d.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",C),placeholder:f,disabled:x})}),(0,t.jsx)(d.FormMessage,{})]})}),(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(i.Trash,{size:12}),"aria-label":R,disabled:x,onClick:()=>F(a),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",T)})]},n.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.Plus,{}),disabled:x,onClick:()=>D(_()),className:(0,l.cn)(I&&"rounded-r-none border-r-0 px-3",N),children:y}),I&&(0,t.jsxs)(c.DropdownMenu,{children:[(0,t.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.ChevronDown,{size:14}),"aria-label":S,disabled:x,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(c.DropdownMenuContent,{align:"end",side:"bottom",children:g.map(e=>(0,t.jsxs)(r.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(c.DropdownMenuSeparator,{}),(0,t.jsx)(c.DropdownMenuItem,{onClick:()=>{var t;D(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:n,valueFieldName:a,keyRequiredMessage:i,valueRequiredMessage:r,duplicateKeyMessage:s,allowEmptyRows:o=!0,normaliseKey:l=e=>e})=>{let c=[],d=s?new Map:null;return e.forEach((e,s)=>{let u=t(e[n]),p=t(e[a]);if(!u&&!p){o||(c.push({path:[s,n],message:i}),c.push({path:[s,a],message:r}));return}if(!u)return void c.push({path:[s,n],message:i});if(!p)return void c.push({path:[s,a],message:r});if(!d)return;let m=l(u);m&&d.set(m,[...d.get(m)??[],s])}),d&&s&&d.forEach(e=>{e.length<2||e.forEach(e=>{c.push({path:[e,n],message:s})})}),c},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:n,valueFieldName:a})=>e.filter(e=>{let i=t(e[n]),r=t(e[a]);return i.length>0||r.length>0})],916800);var n=e.i(97429);let a=/^https?:\/\//,i="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",r=RegExp(`^(?:${i}\\.){3}${i}$`),s=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:i})=>n.z.string().trim().min(1,e).superRefine((e,o)=>{if(e){if(!a.test(e))return void o.addIssue({code:n.z.ZodIssueCode.custom,message:i});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:n}=t;return"localhost"===n||n.includes(".")||r.test(n)||s.test(n)}catch{return!1}})(e)||o.addIssue({code:n.z.ZodIssueCode.custom,message:t})}})],478029)},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let n=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:n,sourceTableSchema:a})=>`INSERT INTO ${(0,t.ident)(a)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(a)}.${(0,t.ident)(n)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:n,sourceTableName:a,sourceTableSchema:i})=>[`CREATE TABLE ${(0,t.ident)(i)}.${(0,t.ident)(n)} (LIKE ${(0,t.ident)(i)}.${(0,t.ident)(a)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(i)}.${(0,t.ident)(n)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,n],664304);var a=e.i(180141),i=e.i(242882),r=e.i(938343),s=e.i(714403);async function o({projectRef:e,connectionString:t,id:a},i){if(!a)throw Error("id is required");let r=n({id:a}),{result:l}=await (0,s.executeSql)({projectRef:e,connectionString:t,sql:r,queryKey:["table-editor",a]},i);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:n})=>(0,a.queryOptions)({queryKey:r.tableEditorKeys.tableEditor(e,n),queryFn:({signal:a})=>o({projectRef:e,connectionString:t,id:n},a)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:n,id:a}){return e.fetchQuery(l({projectRef:t,connectionString:n,id:a}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:n},{enabled:a=!0,...r}={})=>(0,i.useQuery)({...l({projectRef:e,connectionString:t,id:n}),enabled:a&&void 0!==e&&void 0!==n&&!isNaN(n),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...r})],34479)},64102,e=>{"use strict";var t=e.i(478902),n=e.i(389959),a=e.i(843778);let i=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:n,header:a,disabled:i,className:r})=>{let s=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${i?" opacity-30":" opacity-100"}`,`${r}`];return(0,t.jsxs)("div",{id:n,className:s.join(" "),children:[a,e]})},"FormSectionContent",0,({children:e,loading:a=!0,loaders:r,fullWidth:s,className:o})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${s&&"col-span-12!"}
        ${o}
      `,children:a?r?Array(r).fill(0).map((e,n)=>(0,t.jsx)(i,{},n)):n.Children.map(e,(e,n)=>(0,t.jsx)(i,{},n)):e}),"FormSectionLabel",0,({children:e,className:n="",description:i})=>void 0!==i?(0,t.jsxs)("div",{className:(0,a.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",n),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),i]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${n}`,children:e})])},577846,(e,t,n)=>{var a=e.r(714530);t.exports=function(e,t){return a(t,function(t){return e[t]})}},943262,(e,t,n)=>{var a=e.r(577846),i=e.r(375493);t.exports=function(e){return null==e?[]:a(e,i(e))}},333990,(e,t,n)=>{var a=e.r(491761),i=e.r(775484),r=e.r(141892),s=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,n,c){e=i(e)?e:o(e),n=n&&!c?s(n):0;var d=e.length;return n<0&&(n=l(d+n,0)),r(e)?n<=d&&e.indexOf(t,n)>-1:!!d&&a(e,t,n)>-1}},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:n})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[n("Authorization",`Bearer ${e}`),...t?[n("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>n("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},253369,e=>{"use strict";var t=e.i(850036),n=e.i(38429),a=e.i(356003),i=e.i(355901),r=e.i(878827),s=e.i(714403);async function o({trigger:e,projectRef:n,connectionString:a}){let{sql:i}=t.default.triggers.remove(e),{result:r}=await (0,s.executeSql)({projectRef:n,connectionString:a,sql:i,queryKey:["trigger","delete",e.id]});return r}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...s}={})=>{let l=(0,a.useQueryClient)();return(0,n.useMutation)({mutationFn:e=>o(e),async onSuccess(t,n,a){let{projectRef:i}=n;await l.invalidateQueries({queryKey:r.databaseTriggerKeys.list(i)}),await e?.(t,n,a)},async onError(e,n,a){void 0===t?i.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,n,a)},...s})}])},534587,200246,e=>{"use strict";var t=e.i(248593),n=e.i(242882),a=e.i(878827),i=e.i(234745);function r(e){return e}async function s({projectRef:e,connectionString:n},a){if(!e)throw Error("projectRef is required");let r=new Headers;n&&r.set("x-connection-encrypted",n);let{data:o,error:l}=await (0,i.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":n,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:r,signal:a});return l&&(0,i.handleError)(l),o}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...r}={})=>(0,n.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:n})=>s({projectRef:e,connectionString:t},n),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:i&&void 0!==e,...r}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:i=!0,...o}={})=>(0,n.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:n})=>s({projectRef:e,connectionString:t},n).then(e=>e.map(r)),enabled:i&&void 0!==e,...o})],534587);var o=e.i(850036),l=e.i(38429),c=e.i(356003),d=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:n}){let{sql:a}=o.default.triggers.create(n),{result:i}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:a,queryKey:["trigger","create"]});return i}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...n}={})=>{let i=(0,c.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,n,r){let{projectRef:s}=n;await i.invalidateQueries({queryKey:a.databaseTriggerKeys.list(s)}),await e?.(t,n,r)},async onError(e,n,a){void 0===t?d.toast.error(`Failed to create database trigger: ${e.message}`):t(e,n,a)},...n})}],200246)}]);