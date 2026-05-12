(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,836764,e=>{e.v({dash:"loading-anim-module__T3MC1q__dash",loading:"loading-anim-module__T3MC1q__loading"})},724945,e=>{"use strict";var t=e.i(478902),r=e.i(836764);e.s(["default",0,()=>(0,t.jsx)("div",{className:"w-full h-full flex flex-col items-center justify-center",children:(0,t.jsx)("div",{children:(0,t.jsx)("svg",{width:"60",height:"62",viewBox:"0 0 60 62",fill:"none",xmlns:"http://www.w3.org/2000/svg",className:r.default.loading,children:(0,t.jsx)("path",{d:"M30.2571 4.12811L30.257 4.12389C30.2133 1.21067 26.5349 -0.034778 24.7224 2.24311L1.76109 31.0996C-1.21104 34.8348 1.45637 40.34 6.23131 40.34H29.4845L29.7563 58.4432C29.8 61.3564 33.4783 62.6016 35.2908 60.324L34.8996 60.0127L35.2908 60.324L58.2521 31.4674C61.2241 27.7322 58.5568 22.227 53.782 22.227H30.3762L30.2571 4.12811Z",stroke:"hsl(var(--brand-default))",strokeWidth:2,strokeLinecap:"round"})})})})])},818843,e=>{"use strict";var t=e.i(724945);e.s(["LogoLoader",()=>t.default])},71049,e=>{"use strict";var t,r=e.i(478902),o=e.i(389959),a=e.i(174617),n=e.i(274664),i=e.i(826524),s=e.i(678001),l=e.i(940051),d=e.i(839518),c=e.i(889251),u=e.i(546595),p=e.i(735343),f="HoverCard",[g,x]=(0,n.createContextScope)(f,[l.createPopperScope]),m=(0,l.createPopperScope)(),[h,b]=g(f),v=e=>{let{__scopeHoverCard:t,children:a,open:n,defaultOpen:s,onOpenChange:d,openDelay:c=700,closeDelay:u=300}=e,p=m(t),g=o.useRef(0),x=o.useRef(0),b=o.useRef(!1),v=o.useRef(!1),[w,y]=(0,i.useControllableState)({prop:n,defaultProp:s??!1,onChange:d,caller:f}),j=o.useCallback(()=>{clearTimeout(x.current),g.current=window.setTimeout(()=>y(!0),c)},[c,y]),C=o.useCallback(()=>{clearTimeout(g.current),b.current||v.current||(x.current=window.setTimeout(()=>y(!1),u))},[u,y]),_=o.useCallback(()=>y(!1),[y]);return o.useEffect(()=>()=>{clearTimeout(g.current),clearTimeout(x.current)},[]),(0,r.jsx)(h,{scope:t,open:w,onOpenChange:y,onOpen:j,onClose:C,onDismiss:_,hasSelectionRef:b,isPointerDownOnContentRef:v,children:(0,r.jsx)(l.Root,{...p,children:a})})};v.displayName=f;var w="HoverCardTrigger",y=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...n}=e,i=b(w,o),s=m(o);return(0,r.jsx)(l.Anchor,{asChild:!0,...s,children:(0,r.jsx)(u.Primitive.a,{"data-state":i.open?"open":"closed",...n,ref:t,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,T(i.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,T(i.onClose)),onFocus:(0,a.composeEventHandlers)(e.onFocus,i.onOpen),onBlur:(0,a.composeEventHandlers)(e.onBlur,i.onClose),onTouchStart:(0,a.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});y.displayName=w;var j="HoverCardPortal",[C,_]=g(j,{forceMount:void 0}),k=e=>{let{__scopeHoverCard:t,forceMount:o,children:a,container:n}=e,i=b(j,t);return(0,r.jsx)(C,{scope:t,forceMount:o,children:(0,r.jsx)(c.Presence,{present:o||i.open,children:(0,r.jsx)(d.Portal,{asChild:!0,container:n,children:a})})})};k.displayName=j;var z="HoverCardContent",N=o.forwardRef((e,t)=>{let o=_(z,e.__scopeHoverCard),{forceMount:n=o.forceMount,...i}=e,s=b(z,e.__scopeHoverCard);return(0,r.jsx)(c.Presence,{present:n||s.open,children:(0,r.jsx)(S,{"data-state":s.open?"open":"closed",...i,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,T(s.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,T(s.onClose)),ref:t})})});N.displayName=z;var S=o.forwardRef((e,n)=>{let{__scopeHoverCard:i,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:u,onInteractOutside:f,...g}=e,x=b(z,i),h=m(i),v=o.useRef(null),w=(0,s.useComposedRefs)(n,v),[y,j]=o.useState(!1);return o.useEffect(()=>{if(y){let e=document.body;return t=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=t,e.style.webkitUserSelect=t}}},[y]),o.useEffect(()=>{if(v.current){let e=()=>{j(!1),x.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(x.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),x.hasSelectionRef.current=!1,x.isPointerDownOnContentRef.current=!1}}},[x.isPointerDownOnContentRef,x.hasSelectionRef]),o.useEffect(()=>{v.current&&(function(e){let t=[],r=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;r.nextNode();)t.push(r.currentNode);return t})(v.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,r.jsx)(p.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:f,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:(0,a.composeEventHandlers)(u,e=>{e.preventDefault()}),onDismiss:x.onDismiss,children:(0,r.jsx)(l.Content,{...h,...g,onPointerDown:(0,a.composeEventHandlers)(g.onPointerDown,e=>{e.currentTarget.contains(e.target)&&j(!0),x.hasSelectionRef.current=!1,x.isPointerDownOnContentRef.current=!0}),ref:w,style:{...g.style,userSelect:y?"text":void 0,WebkitUserSelect:y?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),R=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...a}=e,n=m(o);return(0,r.jsx)(l.Arrow,{...n,...a,ref:t})});function T(e){return t=>"touch"===t.pointerType?void 0:e()}R.displayName="HoverCardArrow",e.s(["Arrow",0,R,"Content",0,N,"HoverCard",0,v,"HoverCardArrow",0,R,"HoverCardContent",0,N,"HoverCardPortal",0,k,"HoverCardTrigger",0,y,"Portal",0,k,"Root",0,v,"Trigger",0,y,"createHoverCardScope",0,x],73929);var D=e.i(73929),D=D,P=e.i(843778);let E=D.Root,H=D.Trigger,I=o.forwardRef(({className:e,align:t="center",animate:o="zoom-in",sideOffset:a=4,...n},i)=>(0,r.jsx)(D.Portal,{children:(0,r.jsx)(D.Content,{ref:i,align:t,sideOffset:a,className:(0,P.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===o?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...n})}));I.displayName=D.Content.displayName,e.s(["HoverCard",0,E,"HoverCardContent",0,I,"HoverCardTrigger",0,H],71049)},57492,e=>{"use strict";var t=e.i(130843);e.s(["SelectGroup_Shadcn_",()=>t.SelectGroup])},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),o=e.i(389959),a=e.i(837710),n=e.i(710483),i=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:o,error:n})=>(0,t.jsx)(a.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(i.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:o,error:n?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:a="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:i,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:f=!0,children:g,additionalActions:x})=>{let m=(0,s.useTrack)(),h=(0,o.useRef)(!1),b=i?.message?.includes("503")?"503 Service Temporarily Unavailable":i?.message;return(0,o.useEffect)(()=>{!h.current&&(h.current=!0,.1>Math.random()&&m("dashboard_error_created",{source:"admonition"}))},[m]),(0,t.jsx)(n.Admonition,{type:"warning",layout:x?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[i?.message&&(0,t.jsxs)("p",{children:[f&&"Error: ",b]}),p&&(0,t.jsx)("p",{children:a}),g]}),actions:x?(0,t.jsxs)(t.Fragment,{children:[x,(0,t.jsx)(l,{projectRef:e,subject:r,error:i})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:i}),className:d})};e.s(["AlertError",0,d,"default",0,d])},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),o=e.i(389959),a=e.i(843778),n=e.i(375761),i=e.i(231665),s=e.i(938933);let l=(0,o.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:p,iconContainerClassName:f,containerClassName:g,size:x="small",...m},h)=>{let[b,v]=(0,o.useState)("Copy"),[w,y]=(0,o.useState)(!0),j=(0,s.default)("input"),C=[];return x&&C.push(j.size[x]),(0,t.jsxs)(i.InputGroup,{className:g,children:[(0,t.jsx)(i.InputGroupInput,{ref:h,onFocus:e=>e.target.select(),...m,size:x,onCopy:p,type:c&&w?"password":m.type,disabled:m.disabled,className:(0,a.cn)(...C,m.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(i.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(i.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&w)?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",className:(0,a.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=m.value,void(0,n.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),p?.()})},children:b}):null,c&&w?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",onClick:function(){y(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},466472,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(837710),a=e.i(843778),n=e.i(253214),i=e.i(710483);let s=(0,r.forwardRef)(({title:e,description:s,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:p,cancelLabel:f="Cancel",confirmLabel:g="Submit",confirmLabelLoading:x,alert:m,children:h,variant:b="default",disabled:v,className:w,...y},j)=>{let[C,_]=(0,r.useState)(void 0!==p&&p);(0,r.useEffect)(()=>{d&&void 0===p&&_(!1)},[d]),(0,r.useEffect)(()=>{void 0!==p&&_(p)},[p]);let{title:k,children:z,...N}=m?.base??{},S=m?.title?{label:m.title}:{};return(0,t.jsx)(n.Dialog,{open:d,...y,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(n.DialogContent,{"aria-describedby":void 0,ref:j,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(n.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[(0,t.jsx)(n.DialogTitle,{children:e}),s&&(0,t.jsx)(n.DialogDescription,{children:s})]}),m&&(0,t.jsx)(i.Admonition,{type:b,description:m.description,...S,className:"border-x-0 rounded-none -mt-px",...N}),h&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.DialogSection,{padding:"small",className:w,children:h}),(0,t.jsx)(n.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(o.Button,{size:"medium",block:!0,type:"default",disabled:C,onClick:()=>c(),children:f}),(0,t.jsx)(o.Button,{block:!0,size:"medium",type:"destructive"===b?"danger":"warning"===b?"warning":"primary",htmlType:"submit",loading:C,disabled:C||v,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===p&&_(!0)},className:"truncate",children:C&&x?x:g})]})]})})});s.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,s,"default",0,s])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},710377,e=>{"use strict";let t=(0,e.i(388019).default)("ArrowRight",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"m12 5 7 7-7 7",key:"xquz4c"}]]);e.s(["ArrowRight",0,t],710377)},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},a={accordion:{variants:{default:{base:`
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
      `},block:"w-full flex items-center justify-center",size:{...o},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
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
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `,size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,a],305551);let n=(0,t.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(n);return r||(r=a.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},725137,e=>{"use strict";var t=e.i(478902),r=e.i(162361),o=e.i(766181),a=e.i(975924),n=e.i(389959),i=e.i(843778);let s=r.Dialog.Root,l=r.Dialog.Trigger,d=r.Dialog.Close;(0,o.cva)("fixed inset-0 z-50 flex",{variants:{side:{top:"items-start",bottom:"items-end",left:"justify-start",right:"justify-end"}},defaultVariants:{side:"right"}});let c=({side:e,children:o,...a})=>(0,t.jsx)(r.Dialog.Portal,{...a,children:o});c.displayName=r.Dialog.Portal.displayName;let u=n.forwardRef(({className:e,children:o,...a},n)=>(0,t.jsx)(r.Dialog.Overlay,{className:(0,i.cn)("fixed inset-0 z-50 bg-alternative/90 backdrop-blur-xs transition-all duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in",e),...a,ref:n}));u.displayName=r.Dialog.Overlay.displayName;let p=(0,i.cn)(["fixed z-50 scale-100 gap-4 bg-studio opacity-100 shadow-lg","data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:duration-300"]),f=(0,o.cva)(p,{variants:{side:{top:"data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top w-full border-b inset-x-0 top-0",bottom:"data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom w-full border-t inset-x-0 bottom-0",left:"data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left h-full border-r inset-y-0 left-0",right:"data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right h-full border-l inset-y-0 right-0"},size:{content:"",default:"",sm:"",lg:"",xl:"",xxl:"",full:""}},compoundVariants:[{side:["top","bottom"],size:"content",class:"max-h-screen"},{side:["top","bottom"],size:"default",class:"h-1/3"},{side:["top","bottom"],size:"sm",class:"h-1/4"},{side:["top","bottom"],size:"lg",class:"h-1/2"},{side:["top","bottom"],size:"xl",class:"h-5/6"},{side:["top","bottom"],size:"full",class:"h-screen"},{side:["right","left"],size:"content",class:"max-w-screen"},{side:["right","left"],size:"default",class:"lg:w-1/3"},{side:["right","left"],size:"sm",class:"lg:w-1/4"},{side:["right","left"],size:"lg",class:"lg:w-1/2"},{side:["right","left"],size:"xl",class:"lg:w-4/6"},{side:["right","left"],size:"xxl",class:"w-5/6"},{side:["right","left"],size:"full",class:"w-screen"}],defaultVariants:{side:"right",size:"default"}}),g=n.forwardRef(({side:e,size:o,className:n,children:s,showClose:l=!0,hasOverlay:d=!0,...p},g)=>(0,t.jsxs)(c,{side:e,children:[d&&(0,t.jsx)(u,{}),(0,t.jsxs)(r.Dialog.Content,{ref:g,className:(0,i.cn)(f({side:e,size:o}),n),...p,children:[s,l?(0,t.jsxs)(r.Dialog.Close,{className:(0,i.cn)("absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary","hit-area-6"),children:[(0,t.jsx)(a.X,{className:"h-4 w-4"}),(0,t.jsx)("span",{className:"sr-only",children:"Close"})]}):null]})]}));g.displayName=r.Dialog.Content.displayName;let x=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-4 text-center sm:text-left border-b bg-dash-sidebar",e),...r});x.displayName="SheetHeader";let m=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-4",e),...r});m.displayName="SheetSection";let h=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-3 border-t w-full","flex flex-col-reverse sm:flex-row sm:justify-end gap-2",e),...r});h.displayName="SheetFooter";let b=n.forwardRef(({className:e,...o},a)=>(0,t.jsx)(r.Dialog.Title,{ref:a,className:(0,i.cn)("text-lg text-foreground",e),...o}));b.displayName=r.Dialog.Title.displayName;let v=n.forwardRef(({className:e,...o},a)=>(0,t.jsx)(r.Dialog.Description,{ref:a,className:(0,i.cn)("text-sm text-foreground-light",e),...o}));v.displayName=r.Dialog.Description.displayName,e.s(["Sheet",0,s,"SheetClose",0,d,"SheetContent",0,g,"SheetDescription",0,v,"SheetFooter",0,h,"SheetHeader",0,x,"SheetSection",0,m,"SheetTitle",0,b,"SheetTrigger",0,l])},877555,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(843778);let a=(0,r.forwardRef)(({variant:e="default",...r},o)=>{let a;return(a="warning"===e?s:"destructive"===e?i:"success"===e?l:n)?(0,t.jsx)(a,{ref:o,...r}):null}),n=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,o.cn)(e?"w-3 h-3 text-foreground-lighter":"w-4 h-4 p-0.5 bg-foreground-lighter text-background-surface-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"})}),i=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,o.cn)(e?"w-3 h-3 text-destructive-600":"w-4 h-4 p-0.5 bg-destructive-600 text-destructive-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",clipRule:"evenodd"})}),s=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,o.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-warning-600 text-warning-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",clipRule:"evenodd"})}),l=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",...r,className:(0,o.cn)(e?"w-3 h-3 text-success-600":"w-4 h-4 p-0.5 bg-foreground text-background rounded-sm",r.className),children:(0,t.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:3,d:"m4.5 12.75 6 6 9-13.5"})});e.s(["CheckIcon",0,l,"CriticalIcon",0,i,"EyeIcon",0,({hideBackground:e=!1,...r})=>(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",...r,className:(0,o.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-warning-600 text-warning-200 rounded-sm",r.className),children:[(0,t.jsx)("path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}),(0,t.jsx)("circle",{cx:"12",cy:"12",r:"3"})]}),"EyeOffIcon",0,({hideBackground:e=!1,...r})=>(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",...r,className:(0,o.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-foreground-light text-background rounded-sm",r.className),children:[(0,t.jsx)("path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"}),(0,t.jsx)("path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242"}),(0,t.jsx)("path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"}),(0,t.jsx)("path",{d:"m2 2 20 20"})]}),"InfoIcon",0,n,"StatusIcon",0,a,"WarningIcon",0,s])},290811,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(174617),a=e.i(678001),n=e.i(274664),i=e.i(826524),s=e.i(594661),l=e.i(374251),d=e.i(546595),c="Switch",[u,p]=(0,n.createContextScope)(c),[f,g]=u(c),x=r.forwardRef((e,n)=>{let{__scopeSwitch:s,name:l,checked:u,defaultChecked:p,required:g,disabled:x,value:m="on",onCheckedChange:h,form:w,...y}=e,[j,C]=r.useState(null),_=(0,a.useComposedRefs)(n,e=>C(e)),k=r.useRef(!1),z=!j||w||!!j.closest("form"),[N,S]=(0,i.useControllableState)({prop:u,defaultProp:p??!1,onChange:h,caller:c});return(0,t.jsxs)(f,{scope:s,checked:N,disabled:x,children:[(0,t.jsx)(d.Primitive.button,{type:"button",role:"switch","aria-checked":N,"aria-required":g,"data-state":v(N),"data-disabled":x?"":void 0,disabled:x,value:m,...y,ref:_,onClick:(0,o.composeEventHandlers)(e.onClick,e=>{S(e=>!e),z&&(k.current=e.isPropagationStopped(),k.current||e.stopPropagation())})}),z&&(0,t.jsx)(b,{control:j,bubbles:!k.current,name:l,value:m,checked:N,required:g,disabled:x,form:w,style:{transform:"translateX(-100%)"}})]})});x.displayName=c;var m="SwitchThumb",h=r.forwardRef((e,r)=>{let{__scopeSwitch:o,...a}=e,n=g(m,o);return(0,t.jsx)(d.Primitive.span,{"data-state":v(n.checked),"data-disabled":n.disabled?"":void 0,...a,ref:r})});h.displayName=m;var b=r.forwardRef(({__scopeSwitch:e,control:o,checked:n,bubbles:i=!0,...d},c)=>{let u=r.useRef(null),p=(0,a.useComposedRefs)(u,c),f=(0,s.usePrevious)(n),g=(0,l.useSize)(o);return r.useEffect(()=>{let e=u.current;if(!e)return;let t=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set;if(f!==n&&t){let r=new Event("click",{bubbles:i});t.call(e,n),e.dispatchEvent(r)}},[f,n,i]),(0,t.jsx)("input",{type:"checkbox","aria-hidden":!0,defaultChecked:n,...d,tabIndex:-1,ref:p,style:{...d.style,...g,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});function v(e){return e?"checked":"unchecked"}b.displayName="SwitchBubbleInput",e.s(["Root",0,x,"Switch",0,x,"SwitchThumb",0,h,"Thumb",0,h,"createSwitchScope",0,p],736223);var w=e.i(736223),w=w,y=e.i(766181),j=e.i(843778);let C=(0,y.cva)("peer inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand data-[state=checked]:hover:bg-brand-600/90 data-[state=unchecked]:bg-control data-[state=unchecked]:hover:bg-border",{variants:{size:{small:"h-[16px] w-[28px]",medium:"h-[20px] w-[34px]",large:"h-[24px] w-[44px]"}},defaultVariants:{size:"medium"}}),_=(0,y.cva)("pointer-events-none block rounded-full bg-foreground-lighter data-[state=checked]:bg-white shadow-lg ring-0 transition-transform",{variants:{size:{small:"h-[12px] w-[12px] data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-px",medium:"h-[16px] w-[16px] data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-px",large:"h-[18px] w-[18px] data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[3px]"}},defaultVariants:{size:"medium"}}),k=r.forwardRef(({className:e,size:r,...o},a)=>(0,t.jsx)(w.Root,{className:(0,j.cn)(C({size:r}),e),tabIndex:0,...o,ref:a,children:(0,t.jsx)(w.Thumb,{className:(0,j.cn)(_({size:r}))})}));k.displayName=w.Root.displayName,e.s(["Switch",0,k],290811)},202003,e=>{"use strict";e.s(["buildStudioPageTitle",0,e=>{let t=[e.entity,e.section,e.surface,e.project,e.org,e.brand],r=[];return t.forEach(e=>{let t=(e=>{if(void 0===e)return;let t=e.trim().replace(/\s+/g," ");if(0!==t.length)return t.length<=60?t:`${t.slice(0,59).trimEnd()}…`})(e);if(!t)return;let o=r[r.length-1];(void 0===o||o.toLowerCase()!==t.toLowerCase())&&r.push(t)}),r.join(" | ")}])},980533,e=>{"use strict";e.s(["getPathSegment",0,function(e,t){return e.split("/")[t]},"getPathnameWithoutQuery",0,function(e,t){return null==e?t:e.split(/[?#]/)[0]??t}])},423782,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(843778),a=e.i(874311),n=e.i(613580);let i=(0,r.forwardRef)(({...e},r)=>(0,t.jsxs)(n.Tooltip,{children:[(0,t.jsx)(n.TooltipTrigger,{asChild:!0,children:(0,t.jsx)(a.DropdownMenuItem,{ref:r,...e,className:(0,o.cn)(e.className,"pointer-events-auto!"),onClick:t=>{!e.disabled&&e.onClick&&e.onClick(t)},children:e.children})}),e.disabled&&void 0!==e.tooltip.content.text&&(0,t.jsx)(n.TooltipContent,{...e.tooltip.content,children:e.tooltip.content.text})]}));i.displayName="DropdownMenuItemTooltip",e.s(["DropdownMenuItemTooltip",0,i])}]);