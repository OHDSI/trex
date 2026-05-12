(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,237002,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(678001),n=e.i(274664),i=e.i(174617),o=e.i(826524),s=e.i(594661),l=e.i(374251),d=e.i(889251),c=e.i(546595),u="Checkbox",[p,m]=(0,n.createContextScope)(u),[f,g]=p(u);function b(e){let{__scopeCheckbox:a,checked:n,children:i,defaultChecked:s,disabled:l,form:d,name:c,onCheckedChange:p,required:m,value:g="on",internal_do_not_use_render:b}=e,[h,x]=(0,o.useControllableState)({prop:n,defaultProp:s??!1,onChange:p,caller:u}),[y,_]=r.useState(null),[v,w]=r.useState(null),j=r.useRef(!1),E=!y||!!d||!!y.closest("form"),C={checked:h,disabled:l,setChecked:x,control:y,setControl:_,name:c,form:d,value:g,hasConsumerStoppedPropagationRef:j,required:m,defaultChecked:!k(s)&&s,isFormControl:E,bubbleInput:v,setBubbleInput:w};return(0,t.jsx)(f,{scope:a,...C,children:"function"==typeof b?b(C):i})}var h="CheckboxTrigger",x=r.forwardRef(({__scopeCheckbox:e,onKeyDown:n,onClick:o,...s},l)=>{let{control:d,value:u,disabled:p,checked:m,required:f,setControl:b,setChecked:x,hasConsumerStoppedPropagationRef:y,isFormControl:_,bubbleInput:v}=g(h,e),w=(0,a.useComposedRefs)(l,b),j=r.useRef(m);return r.useEffect(()=>{let e=d?.form;if(e){let t=()=>x(j.current);return e.addEventListener("reset",t),()=>e.removeEventListener("reset",t)}},[d,x]),(0,t.jsx)(c.Primitive.button,{type:"button",role:"checkbox","aria-checked":k(m)?"mixed":m,"aria-required":f,"data-state":E(m),"data-disabled":p?"":void 0,disabled:p,value:u,...s,ref:w,onKeyDown:(0,i.composeEventHandlers)(n,e=>{"Enter"===e.key&&e.preventDefault()}),onClick:(0,i.composeEventHandlers)(o,e=>{x(e=>!!k(e)||!e),v&&_&&(y.current=e.isPropagationStopped(),y.current||e.stopPropagation())})})});x.displayName=h;var y=r.forwardRef((e,r)=>{let{__scopeCheckbox:a,name:n,checked:i,defaultChecked:o,required:s,disabled:l,value:d,onCheckedChange:c,form:u,...p}=e;return(0,t.jsx)(b,{__scopeCheckbox:a,checked:i,defaultChecked:o,disabled:l,required:s,onCheckedChange:c,name:n,form:u,value:d,internal_do_not_use_render:({isFormControl:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(x,{...p,ref:r,__scopeCheckbox:a}),e&&(0,t.jsx)(j,{__scopeCheckbox:a})]})})});y.displayName=u;var _="CheckboxIndicator",v=r.forwardRef((e,r)=>{let{__scopeCheckbox:a,forceMount:n,...i}=e,o=g(_,a);return(0,t.jsx)(d.Presence,{present:n||k(o.checked)||!0===o.checked,children:(0,t.jsx)(c.Primitive.span,{"data-state":E(o.checked),"data-disabled":o.disabled?"":void 0,...i,ref:r,style:{pointerEvents:"none",...e.style}})})});v.displayName=_;var w="CheckboxBubbleInput",j=r.forwardRef(({__scopeCheckbox:e,...n},i)=>{let{control:o,hasConsumerStoppedPropagationRef:d,checked:u,defaultChecked:p,required:m,disabled:f,name:b,value:h,form:x,bubbleInput:y,setBubbleInput:_}=g(w,e),v=(0,a.useComposedRefs)(i,_),j=(0,s.usePrevious)(u),E=(0,l.useSize)(o);r.useEffect(()=>{if(!y)return;let e=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set,t=!d.current;if(j!==u&&e){let r=new Event("click",{bubbles:t});y.indeterminate=k(u),e.call(y,!k(u)&&u),y.dispatchEvent(r)}},[y,j,u,d]);let C=r.useRef(!k(u)&&u);return(0,t.jsx)(c.Primitive.input,{type:"checkbox","aria-hidden":!0,defaultChecked:p??C.current,required:m,disabled:f,name:b,value:h,form:x,...n,tabIndex:-1,ref:v,style:{...n.style,...E,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});function k(e){return"indeterminate"===e}function E(e){return k(e)?"indeterminate":e?"checked":"unchecked"}j.displayName=w,e.s(["Checkbox",0,y,"CheckboxIndicator",0,v,"Indicator",0,v,"Root",0,y,"createCheckboxScope",0,m,"unstable_BubbleInput",0,j,"unstable_CheckboxBubbleInput",0,j,"unstable_CheckboxProvider",0,b,"unstable_CheckboxTrigger",0,x,"unstable_Provider",0,b,"unstable_Trigger",0,x],361494);var C=e.i(361494),C=C,N=e.i(370410),z=e.i(843778);let S=r.forwardRef(({className:e,...r},a)=>(0,t.jsx)(C.Root,{ref:a,className:(0,z.cn)("peer flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-control bg-control/25 ring-offset-background","transition-colors duration-150 ease-in-out","hover:border-strong","focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2","disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background",e),...r,children:(0,t.jsx)(C.Indicator,{className:(0,z.cn)("flex items-center justify-center text-current"),children:(0,t.jsx)(N.Check,{className:"h-3 w-3 text-background",strokeWidth:4})})}));S.displayName=C.Root.displayName,e.s(["Checkbox",0,S],237002)},236134,e=>{"use strict";var t=e.i(478902),r=e.i(162361),a=e.i(837710),n=e.i(613580),i=e.i(938933);let o=({id:e,disabled:o,className:s,children:l,header:d,visible:c,open:u,size:p="medium",loading:m,align:f="right",hideFooter:g=!1,customFooter:b,onConfirm:h,onCancel:x,confirmText:y="Confirm",cancelText:_="Cancel",triggerElement:v,defaultOpen:w,tooltip:j,...k})=>{let E=(0,i.default)("sidepanel"),C=b||(0,t.jsxs)("div",{className:E.footer,children:[(0,t.jsx)("div",{children:(0,t.jsx)(a.Button,{disabled:m,type:"default",onClick:()=>x?x():null,children:_})}),!!h&&(0,t.jsxs)(n.Tooltip,{children:[(0,t.jsx)(n.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("span",{className:"inline-block",children:(0,t.jsx)(a.Button,{htmlType:"submit",disabled:o||m,loading:m,onClick:h,children:y})})}),void 0!==j&&(0,t.jsx)(n.TooltipContent,{side:"bottom",children:j})]})]});u=u||c;let{onOpenAutoFocus:N,onCloseAutoFocus:z,onEscapeKeyDown:S,onPointerDownOutside:A,onInteractOutside:R}=k;return(0,t.jsxs)(r.Dialog.Root,{open:u,onOpenChange:function(e){void 0!==c&&!e&&x&&x()},defaultOpen:w,children:[v&&(0,t.jsx)(r.Dialog.Trigger,{asChild:!0,children:v}),(0,t.jsxs)(r.Dialog.Portal,{children:[(0,t.jsx)(r.Dialog.Overlay,{className:E.overlay}),(0,t.jsxs)(r.Dialog.Content,{className:[E.base,E.size[p],E.align[f],s&&s].join(" "),onOpenAutoFocus:N,onCloseAutoFocus:z,onEscapeKeyDown:S,onPointerDownOutside:A,onInteractOutside:e=>{e.target?.closest("#toast")&&e.preventDefault(),R&&R(e)},...k,children:[d&&(0,t.jsx)("header",{className:E.header,children:d}),(0,t.jsx)("div",{className:E.contents,children:l}),!g&&C]})]})]})};o.Content=function({children:e,className:r}){let a=(0,i.default)("sidepanel");return(0,t.jsx)("div",{className:[a.content,r].join(" ").trim(),children:e})},o.Separator=function(){let e=(0,i.default)("sidepanel");return(0,t.jsx)("div",{className:e.separator})},e.s(["default",0,o])},539013,e=>{"use strict";var t=e.i(236134);e.s(["SidePanel",()=>t.default])},707843,e=>{"use strict";var t=e.i(478902);function r({body:e,head:a,className:n,containerClassName:i,borderless:o,headTrClasses:s,bodyClassName:l,style:d}){let c=["table-container"];i&&c.push(i),o&&c.push("table-container--borderless");let u=["table"];return n&&u.push(n),(0,t.jsx)("div",{className:c.join(" "),children:(0,t.jsxs)("table",{className:u.join(" "),style:d,children:[(0,t.jsx)("thead",{children:(0,t.jsx)("tr",{className:s,children:a})}),(0,t.jsx)("tbody",{className:l,children:e})]})})}r.th=({children:e,className:r,style:a})=>{let n=["p-3 px-4 text-left"];return r&&n.push(r),(0,t.jsx)("th",{className:n.join(" "),style:a,children:e})},r.td=({children:e,colSpan:r,className:a,style:n,...i})=>(0,t.jsx)("td",{className:a,colSpan:r,style:n,...i,children:e}),r.tr=({children:e,className:r,onClick:a,style:n,hoverable:i})=>{let o=[r];return(a||i)&&o.push("tr--link"),(0,t.jsx)("tr",{className:o.join(" "),onClick:a,style:n,children:e})},e.s(["default",0,r])},68205,e=>{"use strict";let t=e=>Array.from(new Set(e)).sort();e.s(["edgeFunctionsKeys",0,{list:e=>["projects",e,"edge-functions"],lastHourStats:(e,r=[])=>["projects",e,"edge-functions","last-hour-stats",t(r)],detail:(e,t)=>["projects",e,"edge-function",t,"detail"],body:(e,t)=>["projects",e,"edge-function",t,"body"]},"normalizeFunctionIds",0,t])},240788,e=>{"use strict";var t=e.i(242882),r=e.i(68205),a=e.i(234745);async function n({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:r,error:i}=await (0,a.get)("/v1/projects/{ref}/functions",{params:{path:{ref:e}},signal:t});return i&&(0,a.handleError)(i),r}e.s(["useEdgeFunctionsQuery",0,({projectRef:e},{enabled:a=!0,...i}={})=>(0,t.useQuery)({queryKey:r.edgeFunctionsKeys.list(e),queryFn:({signal:t})=>n({projectRef:e},t),enabled:a&&void 0!==e,...i})])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},a={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},n={accordion:{variants:{default:{base:`
          flex flex-col
          space-y-3
        `,container:`
          group
          first:rounded-tl-md first:rounded-tr-md
          last:rounded-bl-md last:rounded-br-md
          overflow-hidden
          will-change-transform
        `,trigger:`
          flex flex-row
          gap-3
          items-center
          w-full
          text-left
          cursor-pointer

          outline-hidden
          focus-visible:ring-1
          focus-visible:z-10
          ring-foreground-light
        `,content:`
          data-open:animate-slide-down
          data-closed:animate-slide-up
        `,panel:`
          py-3
        `},bordered:{base:`
          flex flex-col
          -space-y-px
        `,container:`
          group
          border
          border-default

          first:rounded-tl-md first:rounded-tr-md
          last:rounded-bl-md last:rounded-br-md
        `,trigger:`
          flex flex-row
          items-center
          px-6 py-4
          w-full
          text-left
          cursor-pointer

          font-medium
          text-base
          bg-transparent

          outline-hidden
          focus-visible:ring-1
          focus-visible:z-10
          ring-foreground-light

          transition-colors
          hover:bg-background

          overflow-hidden

          group-first:rounded-tl-md group-first:rounded-tr-md
          group-last:rounded-bl-md group-last:rounded-br-md
        `,content:`
          data-open:animate-slide-down
          data-closed:animate-slide-up
        `,panel:`
          px-6 py-3
          border-t border-strong
          bg-background
        `}},justified:"justify-between",chevron:{base:`
        text-foreground-lighter
        rotate-0
        group-state-open:rotate-180
        group-data-[state=open]:rotate-180
        ease-&lsqb;cubic-bezier(0.87,_0,_0.13,_1)&rsqb;
        transition-transform duration-300
        duration-200
      `,align:{left:"order-first",right:"order-last"}},animate:{enter:"transition-max-height ease-in-out duration-700 overflow-hidden",enterFrom:"max-h-0",enterTo:"max-h-screen",leave:"transition-max-height ease-in-out duration-300 overflow-hidden",leaveFrom:"max-h-screen",leaveTo:"max-h-0"}},alert:{base:`
      relative rounded-md border py-4 px-6
      flex space-x-4 items-start
    `,header:"block text-sm font-normal mb-1",description:"text-xs",variant:{danger:{base:"bg-red-200 text-red-1200 border-red-700",icon:"text-red-900",header:"text-red-1200",description:"text-red-1100"},warning:{base:"bg-amber-200 border-amber-700",icon:"text-amber-900",header:"text-amber-1200",description:"text-amber-1100"},info:{base:"bg-alternative border",icon:"text-foreground-lighter",header:"text-foreground",description:"text-foreground-light"},success:{base:"bg-brand-300 border-brand-400",icon:"text-brand",header:"text-brand-600",description:"text-brand-600"},neutral:{base:"bg-surface-100 border-default",icon:"text-foreground-muted",header:"text-foreground",description:"text-foreground-light"}},close:`
      absolute
      right-6 top-4
      p-0 m-0
      text-foreground-muted
      cursor-pointer transition ease-in-out
      bg-transparent border-transparent focus:outline-hidden
      opacity-50 hover:opacity-100`},card:{base:`
      bg-surface-100

      border
      ${r.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${r.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${r.border.secondary}
        `,base:`
        relative
        cursor-pointer
        text-foreground-lighter
        flex
        items-center
        space-x-2
        text-center
        transition
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
      `,inactive:`
        hover:text-foreground
      `,active:`
        !text-foreground
        border-b-2 border-foreground
      `},pills:{list:"flex space-x-1",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-sm
        border
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-background
        border-strong hover:border-foreground-muted
        text-foreground-muted hover:text-foreground
      `,active:`
        bg-selection
        text-foreground
        border-stronger
      `},"rounded-pills":{list:"flex flex-wrap gap-2",base:`
        relative
        cursor-pointer
        flex
        items-center
        space-x-2
        text-center
        transition
        shadow-xs
        rounded-full
        focus:outline-hidden
        focus-visible:ring-3
        focus-visible:ring-foreground-muted
        focus-visible:border-foreground-muted
        `,inactive:`
        bg-surface-200 hover:bg-surface-300
        hover:border-foreground-lighter
        text-foreground-lighter hover:text-foreground
      `,active:`
        bg-foreground
        text-background
        border-foreground
      `},block:"w-full flex items-center justify-center",size:{...a},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${r.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${r.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...a},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
      z-50
      bg-dash-sidebar
      flex flex-col
      fixed
      inset-y-0
      h-full lg:h-screen
      border-l
      shadow-xl
    `,header:`
      flex items-center
      space-y-1 py-4 px-4 bg-dash-sidebar sm:px-6
      border-b h-(--header-height)
    `,contents:`
      relative
      flex-1
      overflow-y-auto
    `,content:`
      px-4 sm:px-6
    `,footer:`
      flex justify-end gap-2
      p-4 bg-overlay
      border-t
    `,size:{medium:"w-screen max-w-md h-full",large:"w-screen max-w-2xl h-full",xlarge:"w-screen max-w-3xl h-full",xxlarge:"w-screen max-w-4xl h-full",xxxlarge:"w-screen max-w-5xl h-full",xxxxlarge:"w-screen max-w-6xl h-full"},align:{left:`
        left-0
        data-open:animate-panel-slide-left-out
        data-closed:animate-panel-slide-left-in
      `,right:`
        right-0
        data-open:animate-panel-slide-right-out
        data-closed:animate-panel-slide-right-in
      `},separator:`
      w-full
      h-px
      my-2
      bg-border
    `,overlay:`
      z-50
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,trigger:`
      border-none bg-transparent p-0 focus:ring-0
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...r.size.text}},label_optional:{base:"text-foreground-lighter",size:{...r.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...r.size.text}},label_before:{base:"text-foreground-lighter ",size:{...r.size.text}},label_after:{base:"text-foreground-lighter",size:{...r.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...r.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
      flex
      border-none
      rounded-sm
      bg-transparent
      p-0
      outline-hidden
      outline-offset-1
      transition-all
      focus:outline-4
      focus:outline-border-control
    `,content:`
      z-40
      bg-overlay
      border border-overlay
      rounded-sm
      shadow-lg
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
      min-w-fit

      origin-popover
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
    `,size:{tiny:"w-40",small:"w-48",medium:"w-64",large:"w-80",xlarge:"w-96",content:"w-auto"},header:`
      bg-surface-200
      space-y-1 py-1.5 px-3
      border-b border-overlay
    `,footer:`
      bg-surface-200
      py-1.5 px-3
      border-t border-overlay
    `,close:`
      transition
      text-foreground-lighter
    `,separator:`
      w-full
      h-px
      my-2
      bg-border-overlay
    `},menu:{item:{base:`
        cursor-pointer
        flex space-x-3 items-center
        outline-hidden
        focus-visible:ring-1 ring-foreground-muted focus-visible:z-10
        group
      `,content:{base:"transition truncate text-sm w-full",normal:"text-foreground-light group-hover:text-foreground",active:"text-foreground font-semibold"},icon:{base:"transition truncate text-sm",normal:"text-foreground-lighter group-hover:text-foreground-light",active:"text-foreground"},variants:{text:{base:`
            py-1
          `,normal:`
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold
            text-foreground-muted
            z-10
          `},border:{base:`
            px-4 py-1
          `,normal:`
            border-l
            font-normal
            border-default
            group-hover:border-foreground-muted`,active:`
            font-semibold

            text-foreground-muted
            z-10

            border-l
            border-brand
            group-hover:border-brand
          `,rounded:"rounded-md"},pills:{base:"my-px px-3 py-[3px] rounded-md transition-colors active:bg-sidebar-accent/50",normal:`
            font-normal
            border-default
            hover:bg-sidebar-accent/50
            group-hover:border-foreground-muted`,active:`
            font-semibold
            bg-sidebar-accent
            text-foreground-lighter
            z-10 rounded-md
          `}}},group:{base:`
        flex space-x-3
        mb-2
        font-normal
      `,icon:"text-foreground-lighter",content:"text-sm text-foreground-lighter w-full",variants:{text:"",pills:"px-3",border:""}}},modal:{base:`
      relative
      bg-dash-sidebar
      my-4 max-w-screen
      border border-overlay
      rounded-md
      shadow-xl
      data-open:animate-overlay-show
      data-closed:animate-overlay-hide

    `,header:`
      bg-surface-200
      space-y-1 py-3 px-4 sm:px-5
      border-b border-overlay
      flex items-center justify-between
    `,footer:`
      flex justify-end gap-2
      py-3 px-5
      border-t border-overlay
    `,size:{tiny:"sm:align-middle sm:w-full sm:max-w-xs",small:"sm:align-middle sm:w-full sm:max-w-sm",medium:"sm:align-middle sm:w-full sm:max-w-lg",large:"sm:align-middle sm:w-full md:max-w-xl",xlarge:"sm:align-middle sm:w-full md:max-w-3xl",xxlarge:"sm:align-middle sm:w-full max-w-screen md:max-w-6xl",xxxlarge:"sm:align-middle sm:w-full md:max-w-7xl"},overlay:`
      z-40
      fixed
      bg-alternative
      h-full w-full
      left-0
      top-0
      opacity-75
      data-closed:animate-fade-out-overlay-bg
      data-open:animate-fade-in-overlay-bg
    `,scroll_overlay:`
      z-40
      fixed
      inset-0
      grid
      place-items-center
      overflow-y-auto
      data-open:animate-overlay-show data-closed:animate-overlay-hide
    `,separator:`
      w-full
      h-px
      my-2
      bg-border-overlay
    `,content:"px-5"},listbox:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      text-foreground
      border
      focus-visible:shadow-md
      ${r.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${r.placeholder}
      indent-px
      transition-all
      bg-none
    `,container:"relative",label:"truncate",variants:{standard:`
        bg-control
        border border-control

        aria-expanded:border-foreground-muted
        aria-expanded:ring-border-muted
        aria-expanded:ring-2
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},options_container_animate:`
      transition
      data-open:animate-slide-down
      data-open:opacity-1
      data-closed:animate-slide-up
      data-closed:opacity-0
    `,options_container:`
      bg-overlay
      shadow-lg
      border border-solid
      border-overlay max-h-60
      rounded-md py-1 text-base
      sm:text-sm z-10 overflow-hidden overflow-y-scroll

      origin-dropdown
      data-open:animate-dropdown-content-show
      data-closed:animate-dropdown-content-hide
    `,with_icon:"pl-2",addOnBefore:`
      w-full flex flex-row items-center space-x-3
    `,size:{...a},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
      w-listbox
      transition cursor-pointer select-none relative py-2 pl-3 pr-9
      text-foreground-light
      text-sm
      hover:bg-border-overlay
      focus:bg-border-overlay
      focus:text-foreground
      border-none
      focus:outline-hidden
    `,option_active:"text-foreground bg-selection",option_disabled:"cursor-not-allowed opacity-60",option_inner:"flex items-center space-x-3",option_check:"absolute inset-y-0 right-0 flex items-center pr-3 text-brand",option_check_active:"text-brand",option_check_icon:"h-5 w-5"},collapsible:{content:`
      data-open:animate-slide-down-normal
      data-closed:animate-slide-up-normal
    `},inputErrorIcon:{base:`
      flex items-center
      right-3 pr-2 pl-2
      inset-y-0
      pointer-events-none
      text-red-900
    `},inputIconContainer:{base:`
    absolute inset-y-0
    left-0 pl-2 flex
    items-center pointer-events-none
    text-foreground-light
    [&_svg]:stroke-[1.5]
    `,size:{tiny:"[&_svg]:h-[14px] [&_svg]:w-[14px]",small:"[&_svg]:h-[18px] [&_svg]:w-[18px]",medium:"[&_svg]:h-[20px] [&_svg]:w-[20px]",large:"[&_svg]:h-[20px] [&_svg]:w-[20px] pl-3",xlarge:"[&_svg]:h-[24px] [&_svg]:w-[24px] pl-3",xxlarge:"[&_svg]:h-[30px] [&_svg]:w-[30px] pl-3",xxxlarge:"[&_svg]:h-[42px] [&_svg]:w-[42px] pl-3"}},icon:{container:"shrink-0 flex items-center justify-center rounded-full p-3"},loading:{base:"relative",content:{base:"transition-opacity duration-300",active:"opacity-40"},spinner:`
      absolute
      text-foreground-lighter animate-spin
      inset-0
      size-5
      m-auto
    `}};e.s(["default",0,n],305551);let i=(0,t.createContext)({theme:n});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=n.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),a=e.i(389959),n=e.i(837710),i=e.i(710483),o=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:a,error:i})=>(0,t.jsx)(n.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(o.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:a,error:i?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:n="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:o,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:m=!0,children:f,additionalActions:g})=>{let b=(0,s.useTrack)(),h=(0,a.useRef)(!1),x=o?.message?.includes("503")?"503 Service Temporarily Unavailable":o?.message;return(0,a.useEffect)(()=>{!h.current&&(h.current=!0,.1>Math.random()&&b("dashboard_error_created",{source:"admonition"}))},[b]),(0,t.jsx)(i.Admonition,{type:"warning",layout:g?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[o?.message&&(0,t.jsxs)("p",{children:[m&&"Error: ",x]}),p&&(0,t.jsx)("p",{children:n}),f]}),actions:g?(0,t.jsxs)(t.Fragment,{children:[g,(0,t.jsx)(l,{projectRef:e,subject:r,error:o})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:o}),className:d})};e.s(["AlertError",0,d,"default",0,d])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},170149,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(657588),a=e.i(283607),n=e.i(370410),i=e.i(816467),o=e.i(389959),s=e.i(655744),l=e.i(837710),d=e.i(843778),c=e.i(375761),u=e.i(253214),p=e.i(20482),m=e.i(378277),f=e.i(97429),g=e.i(710483);let b=(0,o.forwardRef)(({title:e,size:r="small",onConfirm:b,visible:h,onCancel:x,loading:y,cancelLabel:_="Cancel",confirmLabel:v="Submit",confirmPlaceholder:w,confirmString:j,alert:k,input:E,label:C,description:N,formMessage:z,text:S,children:A,blockDeleteButton:R=!0,variant:T="default",errorMessage:$="Value entered does not match",enableCopy:D=!1,...F},I)=>{let[O,P]=(0,o.useState)(!1),q=f.z.object({confirmValue:f.z.preprocess(e=>"string"==typeof e?e.trim():e,f.z.literal(j.trim(),{errorMap:()=>({message:$})}))}),M=(0,s.useForm)({resolver:(0,a.zodResolver)(q),reValidateMode:"onChange",defaultValues:{confirmValue:""}}),L=M.formState.isValid;(0,o.useEffect)(()=>{j&&M.reset()},[j]),(0,o.useEffect)(()=>{if(!O)return;let e=setTimeout(()=>P(!1),2e3);return()=>clearTimeout(e)},[O]);let{title:K,children:B,...U}=k?.base??{},W=k?.title?{label:k.title}:{};return(0,t.jsx)(u.Dialog,{open:h,...F,onOpenChange:()=>{h&&x()},children:(0,t.jsxs)(u.DialogContent,{ref:I,className:"p-0 gap-0 pb-5 block!",size:r,children:[(0,t.jsx)(u.DialogHeader,{className:(0,d.cn)("border-b"),padding:"small",children:(0,t.jsx)(u.DialogTitle,{className:"",children:e})}),k&&(0,t.jsx)(g.Admonition,{type:T,description:k.description,...W,className:"border-x-0 rounded-none -mt-px",...U}),A&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{padding:"small",children:A}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),void 0!==S&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{className:"p-5",padding:"small",children:(0,t.jsx)("p",{className:"text-foreground-light text-sm",children:S})}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),(0,t.jsx)(p.Form,{...M,children:(0,t.jsxs)("form",{autoComplete:"off",onSubmit:M.handleSubmit(function(e){b()}),className:"px-5 flex flex-col gap-y-3 pt-3",children:[(0,t.jsx)(p.FormField,{control:M.control,name:"confirmValue",render:({field:e})=>(0,t.jsxs)(p.FormItem,{className:"flex flex-col gap-y-2",children:[(0,t.jsxs)(p.FormLabel,{...C,enableSelection:!D,children:["Type"," ",D?(0,t.jsx)(l.Button,{type:"default",className:"h-[23px] px-1.5 py-0 border-muted text-sm whitespace-pre break-all",iconRight:O?(0,t.jsx)(n.Check,{strokeWidth:2,className:"text-brand"}):(0,t.jsx)(i.Copy,{}),onClick:()=>{P(!0),(0,c.copyToClipboard)(j)},children:j}):(0,t.jsx)("span",{className:"text-foreground break-all whitespace-pre",children:j})," ","to confirm."]}),(0,t.jsx)(p.FormControl,{children:(0,t.jsx)(m.Input_Shadcn_,{autoComplete:"off",placeholder:w,...E,...e})}),!!N&&(0,t.jsx)(p.FormDescription,{...N}),(0,t.jsx)(p.FormMessage,{...z})]})}),(0,t.jsxs)("div",{className:"flex gap-2",children:[!R&&(0,t.jsx)(l.Button,{size:"medium",block:!0,type:"default",disabled:y,onClick:x,children:_}),(0,t.jsx)(l.Button,{block:!0,size:"medium",type:"destructive"===T?"danger":"warning"===T?"warning":"primary",htmlType:"submit",loading:y,disabled:!L||y,className:"truncate",children:v})]})]})})]})})});b.displayName="TextConfirmModal",e.s(["TextConfirmModal",0,e=>{let a=(0,r.useFlag)("textConfirmationModalClickToCopy");return(0,t.jsx)(b,{...e,enableCopy:a})}],170149)},693241,e=>{"use strict";var t=e.i(478902),r=e.i(710483);let a=({resourceText:e,isFullPage:a=!1})=>{let n=()=>(0,t.jsx)(r.Admonition,{type:"warning",title:`You need additional permissions to ${e}`,description:"Contact your organization owner or administrator for assistance."});return a?(0,t.jsx)("div",{className:"flex h-full items-center justify-center",children:(0,t.jsx)("div",{className:"max-w-lg",children:(0,t.jsx)(n,{})})}):(0,t.jsx)(n,{})};e.s(["NoPermission",0,a,"default",0,a])},174078,(e,t,r)=>{var a=e.r(889695),n=1/0;t.exports=function(e){return e?(e=a(e))===n||e===-n?(e<0?-1:1)*17976931348623157e292:e==e?e:0:0===e?e:0}},684912,(e,t,r)=>{var a=e.r(174078);t.exports=function(e){var t=a(e),r=t%1;return t==t?r?t-r:t:0}},141892,(e,t,r)=>{var a=e.r(924519),n=e.r(145948),i=e.r(460779);t.exports=function(e){return"string"==typeof e||!n(e)&&i(e)&&"[object String]"==a(e)}},652748,(e,t,r)=>{var a=e.r(714530),n=e.r(729077),i=e.r(352677),o=e.r(145948);t.exports=function(e,t){return(o(e)?a:i)(e,n(t,3))}},336908,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:n,onCancel:i,title:o="Unsaved changes",description:s="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:d="Keep editing",size:c="tiny"})=>{let u=(0,r.useRef)(!1);(0,r.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,r.useCallback)(()=>{u.current=!0,n()},[n]),m=(0,r.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}i()}},[i]);return(0,t.jsx)(a.AlertDialog,{open:e,onOpenChange:m,children:(0,t.jsxs)(a.AlertDialogContent,{size:c,children:[(0,t.jsxs)(a.AlertDialogHeader,{children:[(0,t.jsx)(a.AlertDialogTitle,{children:o}),null!=s&&(0,t.jsx)(a.AlertDialogDescription,{children:s})]}),(0,t.jsxs)(a.AlertDialogFooter,{children:[(0,t.jsx)(a.AlertDialogCancel,{children:d}),(0,t.jsx)(a.AlertDialogAction,{variant:"danger",onClick:p,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),r=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:a})=>{let[n,i]=(0,t.useState)(!1),o=(0,r.default)(e),s=(0,r.default)(a),l=(0,t.useCallback)(()=>{o.current()?i(!0):s.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{i(!1),s.current()},[]),u=(0,t.useCallback)(()=>{i(!1)},[]),p=(0,t.useMemo)(()=>({visible:n,onClose:c,onCancel:u}),[n,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:p}),[l,d,p])}])},498943,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"default",{enumerable:!0,get:function(){return z}});let a=e.r(2879),n=e.r(887602),i=e.r(478902),o=n._(e.r(389959)),s=n._(e.r(971131)),l=a._(e.r(889694)),d=e.r(692007),c=e.r(472102),u=e.r(668278),p=e.r(248905),m=e.r(458310),f=e.r(927770),g=e.r(343027);function b(e){return"/"===e[0]?e.slice(1):e}let h="function"==typeof s.preload,x={deviceSizes:[640,750,828,1080,1200,1920,2048,3840],imageSizes:[32,48,64,96,128,256,384],qualities:[75],path:"/plugins/trex/studio/_next/image/",loader:"default",dangerouslyAllowSVG:!1,unoptimized:!0},y=new Set,_="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";"u"<typeof window&&(globalThis.__NEXT_IMAGE_IMPORTED=!0);let v=new Map([["default",function({config:e,src:t,width:r,quality:a}){if(!e.dangerouslyAllowSVG&&t.split("?",1)[0].endsWith(".svg"))return t;let n=(0,g.getDeploymentId)();if(t.startsWith("/")&&!t.startsWith("//")){let e=t.indexOf("?");if(-1!==e){let r=new URLSearchParams(t.slice(e+1)),a=r.get("dpl");if(a){n=a,r.delete("dpl");let i=r.toString();t=t.slice(0,e)+(i?"?"+i:"")}}}if(t.startsWith("/")&&t.includes("?")&&e.localPatterns?.length===1&&"**"===e.localPatterns[0].pathname&&""===e.localPatterns[0].search)throw Object.defineProperty(Error(`Image with src "${t}" is using a query string which is not configured in images.localPatterns.
Read more: https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns`),"__NEXT_ERROR_CODE",{value:"E871",enumerable:!1,configurable:!0});let i=(0,f.findClosestQuality)(a,e);return`${(0,m.normalizePathTrailingSlash)(e.path)}?url=${encodeURIComponent(t)}&w=${r}&q=${i}${t.startsWith("/")&&n?`&dpl=${n}`:""}`}],["imgix",function({config:e,src:t,width:r,quality:a}){let n=new URL(`${e.path}${b(t)}`),i=n.searchParams;return i.set("auto",i.getAll("auto").join(",")||"format"),i.set("fit",i.get("fit")||"max"),i.set("w",i.get("w")||r.toString()),a&&i.set("q",a.toString()),n.href}],["cloudinary",function({config:e,src:t,width:r,quality:a}){let n=["f_auto","c_limit","w_"+r,"q_"+(a||"auto")].join(",")+"/";return`${e.path}${n}${b(t)}`}],["akamai",function({config:e,src:t,width:r}){return`${e.path}${b(t)}?imwidth=${r}`}],["custom",function({src:e}){throw Object.defineProperty(Error(`Image with src "${e}" is missing "loader" prop.
Read more: https://nextjs.org/docs/messages/next-image-missing-loader`),"__NEXT_ERROR_CODE",{value:"E252",enumerable:!1,configurable:!0})}]]);function w(e){return void 0!==e.default}function j({config:e,src:t,unoptimized:r,layout:a,width:n,quality:i,sizes:o,loader:s}){if(r){if(t.startsWith("/")&&!t.startsWith("//")){let e=(0,g.getDeploymentId)();if(e){let r=t.indexOf("?");if(-1!==r){let a=new URLSearchParams(t.slice(r+1));a.get("dpl")||(a.append("dpl",e),t=t.slice(0,r)+"?"+a.toString())}else t+=`?dpl=${e}`}}return{src:t,srcSet:void 0,sizes:void 0}}let{widths:l,kind:d}=function({deviceSizes:e,allSizes:t},r,a,n){if(n&&("fill"===a||"responsive"===a)){let r=/(^|\s)(1?\d?\d)vw/g,a=[];for(let e;e=r.exec(n);)a.push(parseInt(e[2]));if(a.length){let r=.01*Math.min(...a);return{widths:t.filter(t=>t>=e[0]*r),kind:"w"}}return{widths:t,kind:"w"}}return"number"!=typeof r||"fill"===a||"responsive"===a?{widths:e,kind:"w"}:{widths:[...new Set([r,2*r].map(e=>t.find(t=>t>=e)||t[t.length-1]))],kind:"x"}}(e,n,a,o),c=l.length-1;return{sizes:o||"w"!==d?o:"100vw",srcSet:l.map((r,a)=>`${s({config:e,src:t,quality:i,width:r})} ${"w"===d?r:a+1}${d}`).join(", "),src:s({config:e,src:t,quality:i,width:l[c]})}}function k(e){return"number"==typeof e?e:"string"==typeof e?parseInt(e,10):void 0}function E(e){let t=e.config?.loader||"default",r=v.get(t);if(r)return r(e);throw Object.defineProperty(Error(`Unknown "loader" found in "next.config.js". Expected: ${d.VALID_LOADERS.join(", ")}. Received: ${t}`),"__NEXT_ERROR_CODE",{value:"E1026",enumerable:!1,configurable:!0})}function C(e,t,r,a,n,i){e&&e.src!==_&&e["data-loaded-src"]!==t&&(e["data-loaded-src"]=t,("decode"in e?e.decode():Promise.resolve()).catch(()=>{}).then(()=>{if(e.parentNode&&(y.add(t),"blur"===a&&i(!0),n?.current)){let{naturalWidth:t,naturalHeight:r}=e;n.current({naturalWidth:t,naturalHeight:r})}}))}let N=({imgAttributes:e,heightInt:t,widthInt:r,qualityInt:a,layout:n,className:s,imgStyle:l,blurStyle:d,isLazy:c,placeholder:u,loading:p,srcString:m,config:f,unoptimized:g,loader:b,onLoadingCompleteRef:h,setBlurComplete:x,setIntersection:y,onLoad:_,onError:v,isVisible:w,noscriptSizes:k,...E})=>(p=c?"lazy":p,(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("img",{...E,...e,decoding:"async","data-nimg":n,className:s,style:{...l,...d},ref:(0,o.useCallback)(e=>{y(e),e?.complete&&C(e,m,n,u,h,x)},[y,m,n,u,h,x]),onLoad:e=>{C(e.currentTarget,m,n,u,h,x),_&&_(e)},onError:e=>{"blur"===u&&x(!0),v&&v(e)}}),(c||"blur"===u)&&(0,i.jsx)("noscript",{children:(0,i.jsx)("img",{...E,loading:p,decoding:"async","data-nimg":n,style:l,className:s,...j({config:f,src:m,unoptimized:g,layout:n,width:r,quality:a,sizes:k,loader:b})})})]}));function z({src:e,sizes:t,unoptimized:r=!1,priority:a=!1,loading:n,lazyRoot:s=null,lazyBoundary:m,className:f,quality:g,width:b,height:v,style:C,objectFit:S,objectPosition:A,onLoadingComplete:R,placeholder:T="empty",blurDataURL:$,...D}){var F;let I,O=(0,o.useContext)(u.ImageConfigContext),P=(0,o.useMemo)(()=>{let e=x||O||d.imageConfigDefault,t=[...e.deviceSizes,...e.imageSizes].sort((e,t)=>e-t),r=e.deviceSizes.sort((e,t)=>e-t),a=e.qualities?.sort((e,t)=>e-t);return{...e,allSizes:t,deviceSizes:r,qualities:a,localPatterns:"u"<typeof window?O?.localPatterns:e.localPatterns}},[O]),q=t?"responsive":"intrinsic";"layout"in D&&(D.layout&&(q=D.layout),delete D.layout);let M=E;if("loader"in D){if(D.loader){let e=D.loader;M=t=>{let{config:r,...a}=t;return e(a)}}delete D.loader}let L="";if("object"==typeof(F=e)&&(w(F)||void 0!==F.src)){let t=w(e)?e.default:e;if(!t.src)throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E460",enumerable:!1,configurable:!0});if($=$||t.blurDataURL,L=t.src,(!q||"fill"!==q)&&(v=v||t.height,b=b||t.width,!t.height||!t.width))throw Object.defineProperty(Error(`An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ${JSON.stringify(t)}`),"__NEXT_ERROR_CODE",{value:"E48",enumerable:!1,configurable:!0})}e="string"==typeof e?e:L,(0,p.warnOnce)(`Image with src "${e}" is using next/legacy/image which is deprecated and will be removed in a future version of Next.js.`);let K=!a&&("lazy"===n||void 0===n);(e.startsWith("data:")||e.startsWith("blob:"))&&(r=!0,K=!1),"u">typeof window&&y.has(e)&&(K=!1),P.unoptimized&&(r=!0);let[B,U]=(0,o.useState)(!1),[W,Q,V]=(0,c.useIntersection)({rootRef:s,rootMargin:m||"200px",disabled:!K}),H=!K||Q,G={boxSizing:"border-box",display:"block",overflow:"hidden",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},X={boxSizing:"border-box",display:"block",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},Y=!1,J=k(b),Z=k(v),ee=k(g),et=Object.assign({},C,{position:"absolute",top:0,left:0,bottom:0,right:0,boxSizing:"border-box",padding:0,border:"none",margin:"auto",display:"block",width:0,height:0,minWidth:"100%",maxWidth:"100%",minHeight:"100%",maxHeight:"100%",objectFit:S,objectPosition:A}),er="blur"!==T||B?{}:{backgroundSize:S||"cover",backgroundPosition:A||"0% 0%",filter:"blur(20px)",backgroundImage:`url("${$}")`};if("fill"===q)G.display="block",G.position="absolute",G.top=0,G.left=0,G.bottom=0,G.right=0;else if(void 0!==J&&void 0!==Z){let e=Z/J,t=isNaN(e)?"100%":`${100*e}%`;"responsive"===q?(G.display="block",G.position="relative",Y=!0,X.paddingTop=t):"intrinsic"===q?(G.display="inline-block",G.position="relative",G.maxWidth="100%",Y=!0,X.maxWidth="100%",I=`data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27${J}%27%20height=%27${Z}%27/%3e`):"fixed"===q&&(G.display="inline-block",G.position="relative",G.width=J,G.height=Z)}let ea={src:_,srcSet:void 0,sizes:void 0};H&&(ea=j({config:P,src:e,unoptimized:r,layout:q,width:J,quality:ee,sizes:t,loader:M}));let en=e,ei=h?void 0:{imageSrcSet:ea.srcSet,imageSizes:ea.sizes,crossOrigin:D.crossOrigin,referrerPolicy:D.referrerPolicy},eo="u"<typeof window?o.default.useEffect:o.default.useLayoutEffect,es=(0,o.useRef)(R),el=(0,o.useRef)(e);(0,o.useEffect)(()=>{es.current=R},[R]),eo(()=>{el.current!==e&&(V(),el.current=e)},[V,e]);let ed={isLazy:K,imgAttributes:ea,heightInt:Z,widthInt:J,qualityInt:ee,layout:q,className:f,imgStyle:et,blurStyle:er,loading:n,config:P,unoptimized:r,placeholder:T,loader:M,srcString:en,onLoadingCompleteRef:es,setBlurComplete:U,setIntersection:W,isVisible:H,noscriptSizes:t,...D};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)("span",{style:G,children:[Y?(0,i.jsx)("span",{style:X,children:I?(0,i.jsx)("img",{style:{display:"block",maxWidth:"100%",width:"initial",height:"initial",background:"none",opacity:1,border:0,margin:0,padding:0},alt:"","aria-hidden":!0,src:I}):null}):null,(0,i.jsx)(N,{...ed})]}),!h&&a?(0,i.jsx)(l.default,{children:(0,i.jsx)("link",{rel:"preload",as:"image",href:ea.srcSet?void 0:ea.src,...ei},"__nimg-"+ea.src+ea.srcSet+ea.sizes)}):null]})}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},501964,(e,t,r)=>{t.exports=e.r(498943)},418029,e=>{"use strict";var t=e.i(478902),r=e.i(837710),a=e.i(843778);e.s(["NoSearchResults",0,({searchString:e,withinTableCell:n=!1,onResetFilter:i,className:o,label:s,description:l})=>(0,t.jsxs)("div",{className:(0,a.cn)("flex items-center justify-between",!n&&"bg-surface-100 px-4 md:px-6 py-4 rounded-md border border-default",o),children:[(0,t.jsxs)("div",{className:"text-sm flex flex-col gap-y-0.5",children:[(0,t.jsx)("p",{className:"text-foreground",children:s??"No results found"}),(0,t.jsx)("p",{className:"text-foreground-lighter",children:l??`Your search for “${e}” did not return any results`})]}),void 0!==i&&(0,t.jsx)(r.Button,{type:"default",onClick:()=>i(),children:"Reset filter"})]})])},568213,e=>{"use strict";var t=e.i(478902),r=e.i(88816),a=e.i(544197),n=e.i(211570),i=e.i(389959),o=e.i(655744),s=e.i(837710),l=e.i(843778),d=e.i(874311),c=e.i(20482),u=e.i(378277);e.s(["KeyValueFieldArray",0,({control:e,name:p,keyFieldName:m,valueFieldName:f,createEmptyRow:g,keyPlaceholder:b,valuePlaceholder:h,addLabel:x,addActions:y=[],disabled:_=!1,inputSize:v="small",className:w,rowsClassName:j="space-y-3 mt-1",rowClassName:k,keyInputClassName:E,valueInputClassName:C,addButtonClassName:N,removeButtonClassName:z,removeLabel:S="Remove row"})=>{let{fields:A,append:R,remove:T}=(0,o.useFieldArray)({control:e,name:p,keyName:"fieldId"}),$=y.length>0,D=`${x} options`;return(0,t.jsxs)("div",{className:(0,l.cn)("space-y-3",w),children:[(0,t.jsx)("div",{className:j,children:A.map((r,a)=>(0,t.jsxs)("div",{className:(0,l.cn)("flex items-start space-x-2",k),children:[(0,t.jsx)(c.FormField,{control:e,name:`${p}.${a}.${m}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:v,className:(0,l.cn)("w-full",E),placeholder:b,disabled:_})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(c.FormField,{control:e,name:`${p}.${a}.${f}`,render:({field:e})=>(0,t.jsxs)(c.FormItem,{className:"flex-1",children:[(0,t.jsx)(c.FormControl,{children:(0,t.jsx)(u.Input_Shadcn_,{...e,size:v,className:(0,l.cn)("w-full",C),placeholder:h,disabled:_})}),(0,t.jsx)(c.FormMessage,{})]})}),(0,t.jsx)(s.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(n.Trash,{size:12}),"aria-label":S,disabled:_,onClick:()=>T(a),className:(0,l.cn)("h-[34px] w-[34px] shrink-0",z)})]},r.fieldId))}),(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(s.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(a.Plus,{}),disabled:_,onClick:()=>R(g()),className:(0,l.cn)($&&"rounded-r-none border-r-0 px-3",N),children:x}),$&&(0,t.jsxs)(d.DropdownMenu,{children:[(0,t.jsx)(d.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(s.Button,{type:"default",size:"tiny",htmlType:"button",icon:(0,t.jsx)(r.ChevronDown,{size:14}),"aria-label":D,disabled:_,className:"rounded-l-none px-[4px] py-[5px]"})}),(0,t.jsx)(d.DropdownMenuContent,{align:"end",side:"bottom",children:y.map(e=>(0,t.jsxs)(i.Fragment,{children:[e.separatorAbove&&(0,t.jsx)(d.DropdownMenuSeparator,{}),(0,t.jsx)(d.DropdownMenuItem,{onClick:()=>{var t;R(Array.isArray(t=e.createRows())&&1===t.length?t[0]:t)},children:e.description?(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("div",{className:"block text-foreground",children:e.label}),(0,t.jsx)("div",{className:"text-foreground-light",children:e.description})]}):e.label})]},e.key))})]})]})]})}])},916800,478029,e=>{"use strict";let t=e=>"string"==typeof e?e.trim():"";e.s(["getKeyValueFieldArrayValidationIssues",0,({rows:e,keyFieldName:r,valueFieldName:a,keyRequiredMessage:n,valueRequiredMessage:i,duplicateKeyMessage:o,allowEmptyRows:s=!0,normaliseKey:l=e=>e})=>{let d=[],c=o?new Map:null;return e.forEach((e,o)=>{let u=t(e[r]),p=t(e[a]);if(!u&&!p){s||(d.push({path:[o,r],message:n}),d.push({path:[o,a],message:i}));return}if(!u)return void d.push({path:[o,r],message:n});if(!p)return void d.push({path:[o,a],message:i});if(!c)return;let m=l(u);m&&c.set(m,[...c.get(m)??[],o])}),c&&o&&c.forEach(e=>{e.length<2||e.forEach(e=>{d.push({path:[e,r],message:o})})}),d},"stripEmptyKeyValueFieldArrayRows",0,({rows:e,keyFieldName:r,valueFieldName:a})=>e.filter(e=>{let n=t(e[r]),i=t(e[a]);return n.length>0||i.length>0})],916800);var r=e.i(97429);let a=/^https?:\/\//,n="(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)",i=RegExp(`^(?:${n}\\.){3}${n}$`),o=/^\[[0-9a-f:.]+\]$/i;e.s(["httpEndpointUrlSchema",0,({requiredMessage:e,invalidMessage:t,prefixMessage:n})=>r.z.string().trim().min(1,e).superRefine((e,s)=>{if(e){if(!a.test(e))return void s.addIssue({code:r.z.ZodIssueCode.custom,message:n});(e=>{try{let t=new URL(e);if("http:"!==t.protocol&&"https:"!==t.protocol)return!1;let{hostname:r}=t;return"localhost"===r||r.includes(".")||i.test(r)||o.test(r)}catch{return!1}})(e)||s.addIssue({code:r.z.ZodIssueCode.custom,message:t})}})],478029)},938343,e=>{"use strict";e.s(["tableEditorKeys",0,{tableEditor:(e,t)=>["projects",e,"table-editor",t].filter(Boolean)}])},34479,664304,e=>{"use strict";e.i(850036);var t=e.i(479084);let r=({id:e})=>e?`
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
  `.trim():"";e.s(["getDuplicateRowsSQL",0,({duplicatedTableName:e,sourceTableName:r,sourceTableSchema:a})=>`INSERT INTO ${(0,t.ident)(a)}.${(0,t.ident)(e)} SELECT * FROM ${(0,t.ident)(a)}.${(0,t.ident)(r)};`,"getDuplicateTableSQL",0,({comment:e,duplicatedTableName:r,sourceTableName:a,sourceTableSchema:n})=>[`CREATE TABLE ${(0,t.ident)(n)}.${(0,t.ident)(r)} (LIKE ${(0,t.ident)(n)}.${(0,t.ident)(a)} INCLUDING ALL);`,void 0!=e?`comment on table ${(0,t.ident)(n)}.${(0,t.ident)(r)} is ${(0,t.literal)(e)};`:""].join("\n"),"getTableEditorSql",0,r],664304);var a=e.i(180141),n=e.i(242882),i=e.i(938343),o=e.i(714403);async function s({projectRef:e,connectionString:t,id:a},n){if(!a)throw Error("id is required");let i=r({id:a}),{result:l}=await (0,o.executeSql)({projectRef:e,connectionString:t,sql:i,queryKey:["table-editor",a]},n);return l[0]?.entity??null}let l=({projectRef:e,connectionString:t,id:r})=>(0,a.queryOptions)({queryKey:i.tableEditorKeys.tableEditor(e,r),queryFn:({signal:a})=>s({projectRef:e,connectionString:t,id:r},a)});e.s(["getTableEditor",0,s,"prefetchTableEditor",0,function(e,{projectRef:t,connectionString:r,id:a}){return e.fetchQuery(l({projectRef:t,connectionString:r,id:a}))},"tableEditorQueryOptions",0,l,"useTableEditorQuery",0,({projectRef:e,connectionString:t,id:r},{enabled:a=!0,...i}={})=>(0,n.useQuery)({...l({projectRef:e,connectionString:t,id:r}),enabled:a&&void 0!==e&&void 0!==r&&!isNaN(r),refetchOnWindowFocus:!1,refetchOnMount:!1,staleTime:3e5,...i})],34479)},64102,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let n=()=>(0,t.jsxs)("div",{className:"flex w-full flex-col gap-2",children:[(0,t.jsx)("div",{className:"shimmering-loader h-2 w-1/3 rounded-sm"}),(0,t.jsx)("div",{className:"flex flex-col justify-between space-y-2",children:(0,t.jsx)("div",{className:"shimmering-loader h-[34px] w-2/3 rounded-sm"})})]});e.s(["FormSection",0,({children:e,id:r,header:a,disabled:n,className:i})=>{let o=["grid grid-cols-12 gap-6 px-card py-4 md:py-8",`${n?" opacity-30":" opacity-100"}`,`${i}`];return(0,t.jsxs)("div",{id:r,className:o.join(" "),children:[a,e]})},"FormSectionContent",0,({children:e,loading:a=!0,loaders:i,fullWidth:o,className:s})=>(0,t.jsx)("div",{className:`
        relative col-span-12 flex flex-col gap-6 @lg:col-span-7
        ${o&&"col-span-12!"}
        ${s}
      `,children:a?i?Array(i).fill(0).map((e,r)=>(0,t.jsx)(n,{},r)):r.Children.map(e,(e,r)=>(0,t.jsx)(n,{},r)):e}),"FormSectionLabel",0,({children:e,className:r="",description:n})=>void 0!==n?(0,t.jsxs)("div",{className:(0,a.cn)("flex flex-col space-y-2 col-span-12 lg:col-span-5",r),children:[(0,t.jsx)("label",{className:"text-foreground text-sm",children:e}),n]}):(0,t.jsx)("label",{className:`text-foreground col-span-12 text-sm lg:col-span-5 ${r}`,children:e})])},577846,(e,t,r)=>{var a=e.r(714530);t.exports=function(e,t){return a(t,function(t){return e[t]})}},943262,(e,t,r)=>{var a=e.r(577846),n=e.r(375493);t.exports=function(e){return null==e?[]:a(e,n(e))}},333990,(e,t,r)=>{var a=e.r(491761),n=e.r(775484),i=e.r(141892),o=e.r(684912),s=e.r(943262),l=Math.max;t.exports=function(e,t,r,d){e=n(e)?e:s(e),r=r&&!d?o(r):0;var c=e.length;return r<0&&(r=l(c+r,0)),i(e)?r<=c&&e.indexOf(t,r)>-1:!!c&&a(e,t,r)>-1}},878827,e=>{"use strict";e.s(["databaseTriggerKeys",0,{list:e=>["projects",e,"database-triggers"],resource:(e,t)=>["projects",e,"resources",t]}])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},563211,e=>{"use strict";e.s(["buildEdgeFunctionHeaderAddActions",0,({apiKey:e,includeApiKeyHeader:t=!1,createRow:r})=>[{key:"add-auth-header",label:"Add auth header with secret key",description:"Required if your edge function enforces JWT verification",createRows:()=>[r("Authorization",`Bearer ${e}`),...t?[r("apikey",e)]:[]]},{key:"add-source-header",label:"Add custom source header",description:"Useful to verify that the edge function was triggered from this webhook",createRows:()=>r("x-supabase-webhook-source","[Use a secret value]"),separatorAbove:!0}]])},253369,e=>{"use strict";var t=e.i(850036),r=e.i(38429),a=e.i(356003),n=e.i(355901),i=e.i(878827),o=e.i(714403);async function s({trigger:e,projectRef:r,connectionString:a}){let{sql:n}=t.default.triggers.remove(e),{result:i}=await (0,o.executeSql)({projectRef:r,connectionString:a,sql:n,queryKey:["trigger","delete",e.id]});return i}e.s(["useDatabaseTriggerDeleteMutation",0,({onSuccess:e,onError:t,...o}={})=>{let l=(0,a.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>s(e),async onSuccess(t,r,a){let{projectRef:n}=r;await l.invalidateQueries({queryKey:i.databaseTriggerKeys.list(n)}),await e?.(t,r,a)},async onError(e,r,a){void 0===t?n.toast.error(`Failed to delete database trigger: ${e.message}`):t(e,r,a)},...o})}])},534587,200246,e=>{"use strict";var t=e.i(248593),r=e.i(242882),a=e.i(878827),n=e.i(234745);function i(e){return e}async function o({projectRef:e,connectionString:r},a){if(!e)throw Error("projectRef is required");let i=new Headers;r&&i.set("x-connection-encrypted",r);let{data:s,error:l}=await (0,n.get)("/platform/pg-meta/{ref}/triggers",{params:{header:{"x-connection-encrypted":r,"x-pg-application-name":t.DEFAULT_PLATFORM_APPLICATION_NAME},path:{ref:e},query:void 0},headers:i,signal:a});return l&&(0,n.handleError)(l),s}e.s(["useDatabaseHooksQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...i}={})=>(0,r.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:r})=>o({projectRef:e,connectionString:t},r),select:e=>e.filter(e=>"supabase_functions"===e.function_schema&&("net"!==e.schema||0===e.function_args.length)),enabled:n&&void 0!==e,...i}),"useDatabaseTriggersQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...s}={})=>(0,r.useQuery)({queryKey:a.databaseTriggerKeys.list(e),queryFn:({signal:r})=>o({projectRef:e,connectionString:t},r).then(e=>e.map(i)),enabled:n&&void 0!==e,...s})],534587);var s=e.i(850036),l=e.i(38429),d=e.i(356003),c=e.i(355901),u=e.i(714403);async function p({projectRef:e,connectionString:t,payload:r}){let{sql:a}=s.default.triggers.create(r),{result:n}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:a,queryKey:["trigger","create"]});return n}e.s(["useDatabaseTriggerCreateMutation",0,({onSuccess:e,onError:t,...r}={})=>{let n=(0,d.useQueryClient)();return(0,l.useMutation)({mutationFn:e=>p(e),async onSuccess(t,r,i){let{projectRef:o}=r;await n.invalidateQueries({queryKey:a.databaseTriggerKeys.list(o)}),await e?.(t,r,i)},async onError(e,r,a){void 0===t?c.toast.error(`Failed to create database trigger: ${e.message}`):t(e,r,a)},...r})}],200246)}]);