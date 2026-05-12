(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,567558,e=>{"use strict";var t=e.i(478902),a=e.i(26898),n=e.i(389959),r=e.i(837710),s=e.i(710483),i=e.i(196621),o=e.i(967052);let l=({projectRef:e,subject:n,error:s})=>(0,t.jsx)(r.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(i.SupportLink,{queryParams:{category:a.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:n,error:s?.message},children:"Contact support"})}),c=({projectRef:e,subject:a,description:r="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:i,className:c,showIcon:d=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:m=!0,children:b,additionalActions:h})=>{let f=(0,o.useTrack)(),_=(0,n.useRef)(!1),g=i?.message?.includes("503")?"503 Service Temporarily Unavailable":i?.message;return(0,n.useEffect)(()=>{!_.current&&(_.current=!0,.1>Math.random()&&f("dashboard_error_created",{source:"admonition"}))},[f]),(0,t.jsx)(s.Admonition,{type:"warning",layout:h?"vertical":u,showIcon:d,title:a,description:(0,t.jsxs)(t.Fragment,{children:[i?.message&&(0,t.jsxs)("p",{children:[m&&"Error: ",g]}),p&&(0,t.jsx)("p",{children:r}),b]}),actions:h?(0,t.jsxs)(t.Fragment,{children:[h,(0,t.jsx)(l,{projectRef:e,subject:a,error:i})]}):(0,t.jsx)(l,{projectRef:e,subject:a,error:i}),className:c})};e.s(["AlertError",0,c,"default",0,c])},707843,e=>{"use strict";var t=e.i(478902);function a({body:e,head:n,className:r,containerClassName:s,borderless:i,headTrClasses:o,bodyClassName:l,style:c}){let d=["table-container"];s&&d.push(s),i&&d.push("table-container--borderless");let u=["table"];return r&&u.push(r),(0,t.jsx)("div",{className:d.join(" "),children:(0,t.jsxs)("table",{className:u.join(" "),style:c,children:[(0,t.jsx)("thead",{children:(0,t.jsx)("tr",{className:o,children:n})}),(0,t.jsx)("tbody",{className:l,children:e})]})})}a.th=({children:e,className:a,style:n})=>{let r=["p-3 px-4 text-left"];return a&&r.push(a),(0,t.jsx)("th",{className:r.join(" "),style:n,children:e})},a.td=({children:e,colSpan:a,className:n,style:r,...s})=>(0,t.jsx)("td",{className:n,colSpan:a,style:r,...s,children:e}),a.tr=({children:e,className:a,onClick:n,style:r,hoverable:s})=>{let i=[a];return(n||s)&&i.push("tr--link"),(0,t.jsx)("tr",{className:i.join(" "),onClick:n,style:r,children:e})},e.s(["default",0,a])},170149,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(657588),n=e.i(283607),r=e.i(370410),s=e.i(816467),i=e.i(389959),o=e.i(655744),l=e.i(837710),c=e.i(843778),d=e.i(375761),u=e.i(253214),p=e.i(20482),m=e.i(378277),b=e.i(97429),h=e.i(710483);let f=(0,i.forwardRef)(({title:e,size:a="small",onConfirm:f,visible:_,onCancel:g,loading:y,cancelLabel:x="Cancel",confirmLabel:j="Submit",confirmPlaceholder:v,confirmString:w,alert:k,input:C,label:E,description:N,formMessage:T,text:F,children:S,blockDeleteButton:R=!0,variant:A="default",errorMessage:D="Value entered does not match",enableCopy:I=!1,...q},$)=>{let[z,M]=(0,i.useState)(!1),L=b.z.object({confirmValue:b.z.preprocess(e=>"string"==typeof e?e.trim():e,b.z.literal(w.trim(),{errorMap:()=>({message:D})}))}),K=(0,o.useForm)({resolver:(0,n.zodResolver)(L),reValidateMode:"onChange",defaultValues:{confirmValue:""}}),P=K.formState.isValid;(0,i.useEffect)(()=>{w&&K.reset()},[w]),(0,i.useEffect)(()=>{if(!z)return;let e=setTimeout(()=>M(!1),2e3);return()=>clearTimeout(e)},[z]);let{title:U,children:B,...O}=k?.base??{},Q=k?.title?{label:k.title}:{};return(0,t.jsx)(u.Dialog,{open:_,...q,onOpenChange:()=>{_&&g()},children:(0,t.jsxs)(u.DialogContent,{ref:$,className:"p-0 gap-0 pb-5 block!",size:a,children:[(0,t.jsx)(u.DialogHeader,{className:(0,c.cn)("border-b"),padding:"small",children:(0,t.jsx)(u.DialogTitle,{className:"",children:e})}),k&&(0,t.jsx)(h.Admonition,{type:A,description:k.description,...Q,className:"border-x-0 rounded-none -mt-px",...O}),S&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{padding:"small",children:S}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),void 0!==F&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{className:"p-5",padding:"small",children:(0,t.jsx)("p",{className:"text-foreground-light text-sm",children:F})}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),(0,t.jsx)(p.Form,{...K,children:(0,t.jsxs)("form",{autoComplete:"off",onSubmit:K.handleSubmit(function(e){f()}),className:"px-5 flex flex-col gap-y-3 pt-3",children:[(0,t.jsx)(p.FormField,{control:K.control,name:"confirmValue",render:({field:e})=>(0,t.jsxs)(p.FormItem,{className:"flex flex-col gap-y-2",children:[(0,t.jsxs)(p.FormLabel,{...E,enableSelection:!I,children:["Type"," ",I?(0,t.jsx)(l.Button,{type:"default",className:"h-[23px] px-1.5 py-0 border-muted text-sm whitespace-pre break-all",iconRight:z?(0,t.jsx)(r.Check,{strokeWidth:2,className:"text-brand"}):(0,t.jsx)(s.Copy,{}),onClick:()=>{M(!0),(0,d.copyToClipboard)(w)},children:w}):(0,t.jsx)("span",{className:"text-foreground break-all whitespace-pre",children:w})," ","to confirm."]}),(0,t.jsx)(p.FormControl,{children:(0,t.jsx)(m.Input_Shadcn_,{autoComplete:"off",placeholder:v,...C,...e})}),!!N&&(0,t.jsx)(p.FormDescription,{...N}),(0,t.jsx)(p.FormMessage,{...T})]})}),(0,t.jsxs)("div",{className:"flex gap-2",children:[!R&&(0,t.jsx)(l.Button,{size:"medium",block:!0,type:"default",disabled:y,onClick:g,children:x}),(0,t.jsx)(l.Button,{block:!0,size:"medium",type:"destructive"===A?"danger":"warning"===A?"warning":"primary",htmlType:"submit",loading:y,disabled:!P||y,className:"truncate",children:j})]})]})})]})})});f.displayName="TextConfirmModal",e.s(["TextConfirmModal",0,e=>{let n=(0,a.useFlag)("textConfirmationModalClickToCopy");return(0,t.jsx)(f,{...e,enableCopy:n})}],170149)},68205,e=>{"use strict";let t=e=>Array.from(new Set(e)).sort();e.s(["edgeFunctionsKeys",0,{list:e=>["projects",e,"edge-functions"],lastHourStats:(e,a=[])=>["projects",e,"edge-functions","last-hour-stats",t(a)],detail:(e,t)=>["projects",e,"edge-function",t,"detail"],body:(e,t)=>["projects",e,"edge-function",t,"body"]},"normalizeFunctionIds",0,t])},240788,e=>{"use strict";var t=e.i(242882),a=e.i(68205),n=e.i(234745);async function r({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:a,error:s}=await (0,n.get)("/v1/projects/{ref}/functions",{params:{path:{ref:e}},signal:t});return s&&(0,n.handleError)(s),a}e.s(["useEdgeFunctionsQuery",0,({projectRef:e},{enabled:n=!0,...s}={})=>(0,t.useQuery)({queryKey:a.edgeFunctionsKeys.list(e),queryFn:({signal:t})=>r({projectRef:e},t),enabled:n&&void 0!==e,...s})])},237002,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(678001),r=e.i(274664),s=e.i(174617),i=e.i(826524),o=e.i(594661),l=e.i(374251),c=e.i(889251),d=e.i(546595),u="Checkbox",[p,m]=(0,r.createContextScope)(u),[b,h]=p(u);function f(e){let{__scopeCheckbox:n,checked:r,children:s,defaultChecked:o,disabled:l,form:c,name:d,onCheckedChange:p,required:m,value:h="on",internal_do_not_use_render:f}=e,[_,g]=(0,i.useControllableState)({prop:r,defaultProp:o??!1,onChange:p,caller:u}),[y,x]=a.useState(null),[j,v]=a.useState(null),w=a.useRef(!1),C=!y||!!c||!!y.closest("form"),E={checked:_,disabled:l,setChecked:g,control:y,setControl:x,name:d,form:c,value:h,hasConsumerStoppedPropagationRef:w,required:m,defaultChecked:!k(o)&&o,isFormControl:C,bubbleInput:j,setBubbleInput:v};return(0,t.jsx)(b,{scope:n,...E,children:"function"==typeof f?f(E):s})}var _="CheckboxTrigger",g=a.forwardRef(({__scopeCheckbox:e,onKeyDown:r,onClick:i,...o},l)=>{let{control:c,value:u,disabled:p,checked:m,required:b,setControl:f,setChecked:g,hasConsumerStoppedPropagationRef:y,isFormControl:x,bubbleInput:j}=h(_,e),v=(0,n.useComposedRefs)(l,f),w=a.useRef(m);return a.useEffect(()=>{let e=c?.form;if(e){let t=()=>g(w.current);return e.addEventListener("reset",t),()=>e.removeEventListener("reset",t)}},[c,g]),(0,t.jsx)(d.Primitive.button,{type:"button",role:"checkbox","aria-checked":k(m)?"mixed":m,"aria-required":b,"data-state":C(m),"data-disabled":p?"":void 0,disabled:p,value:u,...o,ref:v,onKeyDown:(0,s.composeEventHandlers)(r,e=>{"Enter"===e.key&&e.preventDefault()}),onClick:(0,s.composeEventHandlers)(i,e=>{g(e=>!!k(e)||!e),j&&x&&(y.current=e.isPropagationStopped(),y.current||e.stopPropagation())})})});g.displayName=_;var y=a.forwardRef((e,a)=>{let{__scopeCheckbox:n,name:r,checked:s,defaultChecked:i,required:o,disabled:l,value:c,onCheckedChange:d,form:u,...p}=e;return(0,t.jsx)(f,{__scopeCheckbox:n,checked:s,defaultChecked:i,disabled:l,required:o,onCheckedChange:d,name:r,form:u,value:c,internal_do_not_use_render:({isFormControl:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(g,{...p,ref:a,__scopeCheckbox:n}),e&&(0,t.jsx)(w,{__scopeCheckbox:n})]})})});y.displayName=u;var x="CheckboxIndicator",j=a.forwardRef((e,a)=>{let{__scopeCheckbox:n,forceMount:r,...s}=e,i=h(x,n);return(0,t.jsx)(c.Presence,{present:r||k(i.checked)||!0===i.checked,children:(0,t.jsx)(d.Primitive.span,{"data-state":C(i.checked),"data-disabled":i.disabled?"":void 0,...s,ref:a,style:{pointerEvents:"none",...e.style}})})});j.displayName=x;var v="CheckboxBubbleInput",w=a.forwardRef(({__scopeCheckbox:e,...r},s)=>{let{control:i,hasConsumerStoppedPropagationRef:c,checked:u,defaultChecked:p,required:m,disabled:b,name:f,value:_,form:g,bubbleInput:y,setBubbleInput:x}=h(v,e),j=(0,n.useComposedRefs)(s,x),w=(0,o.usePrevious)(u),C=(0,l.useSize)(i);a.useEffect(()=>{if(!y)return;let e=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set,t=!c.current;if(w!==u&&e){let a=new Event("click",{bubbles:t});y.indeterminate=k(u),e.call(y,!k(u)&&u),y.dispatchEvent(a)}},[y,w,u,c]);let E=a.useRef(!k(u)&&u);return(0,t.jsx)(d.Primitive.input,{type:"checkbox","aria-hidden":!0,defaultChecked:p??E.current,required:m,disabled:b,name:f,value:_,form:g,...r,tabIndex:-1,ref:j,style:{...r.style,...C,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});function k(e){return"indeterminate"===e}function C(e){return k(e)?"indeterminate":e?"checked":"unchecked"}w.displayName=v,e.s(["Checkbox",0,y,"CheckboxIndicator",0,j,"Indicator",0,j,"Root",0,y,"createCheckboxScope",0,m,"unstable_BubbleInput",0,w,"unstable_CheckboxBubbleInput",0,w,"unstable_CheckboxProvider",0,f,"unstable_CheckboxTrigger",0,g,"unstable_Provider",0,f,"unstable_Trigger",0,g],361494);var E=e.i(361494),E=E,N=e.i(370410),T=e.i(843778);let F=a.forwardRef(({className:e,...a},n)=>(0,t.jsx)(E.Root,{ref:n,className:(0,T.cn)("peer flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-control bg-control/25 ring-offset-background","transition-colors duration-150 ease-in-out","hover:border-strong","focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2","disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background",e),...a,children:(0,t.jsx)(E.Indicator,{className:(0,T.cn)("flex items-center justify-center text-current"),children:(0,t.jsx)(N.Check,{className:"h-3 w-3 text-background",strokeWidth:4})})}));F.displayName=E.Root.displayName,e.s(["Checkbox",0,F],237002)},174078,(e,t,a)=>{var n=e.r(889695),r=1/0;t.exports=function(e){return e?(e=n(e))===r||e===-r?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,a)=>{var n=e.r(174078);t.exports=function(e){var t=n(e),a=t%1;return t==t?a?t-a:t:0}},141892,(e,t,a)=>{var n=e.r(924519),r=e.r(145948),s=e.r(460779);t.exports=function(e){return"string"==typeof e||!r(e)&&s(e)&&"[object String]"==n(e)}},652748,(e,t,a)=>{var n=e.r(714530),r=e.r(729077),s=e.r(352677),i=e.r(145948);t.exports=function(e,t){return(i(e)?n:s)(e,r(t,3))}},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:r,onCancel:s,title:i="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:c="Keep editing",size:d="tiny"})=>{let u=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,a.useCallback)(()=>{u.current=!0,r()},[r]),m=(0,a.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}s()}},[s]);return(0,t.jsx)(n.AlertDialog,{open:e,onOpenChange:m,children:(0,t.jsxs)(n.AlertDialogContent,{size:d,children:[(0,t.jsxs)(n.AlertDialogHeader,{children:[(0,t.jsx)(n.AlertDialogTitle,{children:i}),null!=o&&(0,t.jsx)(n.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(n.AlertDialogFooter,{children:[(0,t.jsx)(n.AlertDialogCancel,{children:c}),(0,t.jsx)(n.AlertDialogAction,{variant:"danger",onClick:p,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:n})=>{let[r,s]=(0,t.useState)(!1),i=(0,a.default)(e),o=(0,a.default)(n),l=(0,t.useCallback)(()=>{i.current()?s(!0):o.current()},[]),c=(0,t.useCallback)(e=>{e||l()},[l]),d=(0,t.useCallback)(()=>{s(!1),o.current()},[]),u=(0,t.useCallback)(()=>{s(!1)},[]),p=(0,t.useMemo)(()=>({visible:r,onClose:d,onCancel:u}),[r,d,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:c,modalProps:p}),[l,c,p])}])},418029,e=>{"use strict";var t=e.i(478902),a=e.i(837710),n=e.i(843778);e.s(["NoSearchResults",0,({searchString:e,withinTableCell:r=!1,onResetFilter:s,className:i,label:o,description:l})=>(0,t.jsxs)("div",{className:(0,n.cn)("flex items-center justify-between",!r&&"bg-surface-100 px-4 md:px-6 py-4 rounded-md border border-default",i),children:[(0,t.jsxs)("div",{className:"text-sm flex flex-col gap-y-0.5",children:[(0,t.jsx)("p",{className:"text-foreground",children:o??"No results found"}),(0,t.jsx)("p",{className:"text-foreground-lighter",children:l??`Your search for “${e}” did not return any results`})]}),void 0!==s&&(0,t.jsx)(a.Button,{type:"default",onClick:()=>s(),children:"Reset filter"})]})])},568213,e=>{"use strict";var t=e.i(478902),a=e.i(88816),n=e.i(544197),r=e.i(211570),s=e.i(389959),i=e.i(655744),o=e.i(837710),l=e.i(843778),c=e.i(874311),d=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:b,createEmptyRow:h,keyPlaceholder:f,valuePlaceholder:_,addLabel:g,addActions:y=[],disabled:x=!1,inputSize:j="small",className:v,rowsClassName:w="space-y-3 mt-1",rowClassName:k,keyInputClassName:C,valueInputClassName:E,addButtonClassName:N,removeButtonClassName:T,removeLabel:F="Remove row"})=>{let{fields:S,append:R,remove:A}=(0,i.useFieldArray)({control:e,name:p,keyName:"fieldId"}),D=y.length>0,I=`${g} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",v),children:[(0,t.jsx)("div",{className:w,children:S.map((a,n)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",k),children:[(0,t.jsx)(d.FormField,{control:e,name:`${p}.${n}.${m}`,render:({field:e})=>(0,t.jsxs)(d.FormItem,{className:"flex-1",children:[(0,t.jsx)(d.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",C),placeholder:f,disabled:x})}),(0,t.jsx)(d.FormMessage,{})]})}),(0,t.jsx)(d.FormField,{control:e,name:`${p}.${n}.${b}`,render:({field:e})=>(0,t.jsxs)(d.FormItem,{className:"flex-1",children:[(0,t.jsx)(d.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:j,className:(0,l.cn)("w-full",E),placeholder:_,disabled:x})}),(0,t.jsx)(d.FormMessage,{})]})}),(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(r.Trash,{size:12}),"aria-label":F,disabled:x,onClick:()=>A(n),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",T)})]},a.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.Plus,{}),disabled:x,onClick:()=>R(h()),className:(0,l.cn)(D&&"rounded-r-none border-r-0 px-3",N),children:g}),D&&(0,t.jsxs)(c.DropdownMenu,{children:[(0,t.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(o.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.ChevronDown,{size:14}),"aria-label":I,disabled:x,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(c.DropdownMenuContent,{align:"end",side:"bottom",children:y.map(e=>(0,t.jsxs)(s.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(c.DropdownMenuSeparator,{}),(0,t.jsx)(c.DropdownMenuItem,{onClick:()=>{var t;R(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:a,valueFieldName:n,keyRequiredMessage:r,valueRequiredMessage:s,duplicateKeyMessage:i,allowEmptyRows:o=!0,normaliseKey:l=e=>e})=>{let c=[],d=i?new Map:null;return e.forEach((e,i)=>{let u=t(e[a]),p=t(e[n]);if(!u&&!p){o||(c.push({path:[i,a],message:r}),c.push({path:[i,n],message:s}));return}if(!u)return void c.push({path:[i,a],message:r});if(!p)return void c.push({path:[i,n],message:s});if(!d)return;let m=l(u);m&&d.set(m,[...d.get(m)??[],i])}),d&&i&&d.forEach(e=>{e.length<2||e.forEach(e=>{c.push({path:[e,a],message:i})})}),c},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:a,valueFieldName:n})=>e.filter(e=>{let r=t(e[a]),s=t(e[n]);return r.length>0||s.length>0})],916800);var a=e.i(97429);let n=/^https?:\/\//,r="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",s=RegExp(`^(?:${r}\\.){3}${r}$`),i=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:r})=>a.z.string().trim().min(1,e).superRefine((e,o)=>{if(e){if(!n.test(e))return void o.addIssue({code:a.z.ZodIssueCode.custom,message:r});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:a}=t;return"localhost"===a||a.includes(".")||s.test(a)||i.test(a)}catch{return!1}})(e)||o.addIssue({code:a.z.ZodIssueCode.custom,message:t})}})],478029)},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let a=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:a,sourceTableSchema:n})=>`INSERT INTO ${(0,t.ident)(n)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(n)}.${(0,t.ident)(a)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:a,sourceTableName:n,sourceTableSchema:r})=>[`CREATE TABLE ${(0,t.ident)(r)}.${(0,t.ident)(a)} (LIKE ${(0,t.ident)(r)}.${(0,t.ident)(n)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(r)}.${(0,t.ident)(a)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,a],664304);var n=e.i(180141),r=e.i(242882),s=e.i(938343),i=e.i(714403);async function o({projectRef:e,connectionString:t,id:n},r){if(!n)throw Error("id is required");let s=a({id:n}),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:t,sql:s,queryKey:["table-editor",n]},r);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:a})=>(0,n.queryOptions)({queryKey:s.tableEditorKeys.tableEditor(e,a),queryFn:({signal:n})=>o({projectRef:e,connectionString:t,id:a},n)});e.s(["getTableEditor",0,o,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:a,id:n}){return e.fetchQuery(l({projectRef:t,connectionString:a,id:n}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...s}={})=>(0,r.useQuery)({...l({projectRef:e,connectionString:t,id:a}),enabled:n&&void 0!==e&&void 0!==a&&!isNaN(a),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...s})],34479)},64102,e=>{"use strict";var t=e.i(478902),a=e.i(389959),n=e.i(843778);let r=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:a,header:n,disabled:r,className:s})=>{let i=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${r?" opacity-30":" opacity-100"}`,`${s}`];return(0,t.jsxs)("div",{id:a,className:i.join(" "),children:[n,e]})},"FormSectionContent",0,({children:e,loading:n=!0,loaders:s,fullWidth:i,className:o})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${i&&"col-span-12!"}
        ${o}
      `,children:n?s?Array(s).fill(0).map((e,a)=>(0,t.jsx)(r,{},a)):a.Children.map(e,(e,a)=>(0,t.jsx)(r,{},a)):e}),"FormSectionLabel",0,({children:e,className:a="",description:r})=>void 0!==r?(0,t.jsxs)("div",{className:(0,n.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",a),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),r]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${a}`,children:e})])},577846,(e,t,a)=>{var n=e.r(714530);t.exports=function(e,t){return n(t,function(t){return e[t]})}},943262,(e,t,a)=>{var n=e.r(577846),r=e.r(375493);t.exports=function(e){return null==e?[]:n(e,r(e))}},333990,(e,t,a)=>{var n=e.r(491761),r=e.r(775484),s=e.r(141892),i=e.r(684912),o=e.r(943262),l=Math.max;t.exports=function(e,t,a,c){e=r(e)?e:o(e),a=a&&!c?i(a):0;var d=e.length;return a<0&&(a=l(d+a,0)),s(e)?a<=d&&e.indexOf(t,a)>-1:!!d&&n(e,t,a)>-1}},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:a})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[a("Authorization",`Bearer ${e}`),...t?[a("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>a("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},253369,e=>{"use strict";var t=e.i(850036),a=e.i(38429),n=e.i(356003),r=e.i(355901),s=e.i(878827),i=e.i(714403);async function o({trigger:e,projectRef:a,connectionString:n}){let{sql:r}=t.default.triggers.remove(e),{result:s}=await (0,i.executeSql)({projectRef:a,connectionString:n,sql:r,queryKey:["trigger","delete",e.id]});return s}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...i}={})=>{let l=(0,n.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,n){let{projectRef:r}=a;await l.invalidateQueries({queryKey:s.databaseTriggerKeys.list(r)}),await e?.(t,a,n)},async onError(e,a,n){void 0===t?r.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,a,n)},...i})}])},534587,200246,e=>{"use strict";var t=e.i(248593),a=e.i(242882),n=e.i(878827),r=e.i(234745);function s(e){return e}async function i({projectRef:e,connectionString:a},n){if(!e)throw Error("projectRef is required");let s=new Headers;a&&s.set("x-connection-encrypted",a);let{data:o,error:l}=await (0,r.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":a,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:s,signal:n});return l&&(0,r.handleError)(l),o}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...s}={})=>(0,a.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:r&&void 0!==e,...s}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:r=!0,...o}={})=>(0,a.useQuery)({queryKey:n.databaseTriggerKeys.list(e),queryFn:({signal:a})=>i({projectRef:e,connectionString:t},a).then(e=>e.map(s)),enabled:r&&void 0!==e,...o})],534587);var o=e.i(850036),l=e.i(38429),c=e.i(356003),d=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:a}){let{sql:n}=o.default.triggers.create(a),{result:r}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:n,queryKey:["trigger","create"]});return r}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...a}={})=>{let r=(0,c.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,a,s){let{projectRef:i}=a;await r.invalidateQueries({queryKey:n.databaseTriggerKeys.list(i)}),await e?.(t,a,s)},async onError(e,a,n){void 0===t?d.toast.error(`Failed to create database trigger: ${e.message}`):t(e,a,n)},...a})}],200246)}]);