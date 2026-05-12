(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,836764,e=>{e.v({dash:"loading-anim-module__T3MC1q__dash",loading:"loading-anim-module__T3MC1q__loading"})},724945,e=>{"use strict";var t=e.i(478902),r=e.i(836764);e.s(["default",0,()=>(0,t.jsx)("div",{className:"w-full h-full flex flex-col items-center justify-center",children:(0,t.jsx)("div",{children:(0,t.jsx)("svg",{width:"60",height:"62",viewBox:"0 0 60 62",fill:"none",xmlns:"http://www.w3.org/2000/svg",className:r.default.loading,children:(0,t.jsx)("path",{d:"M30.2571 4.12811L30.257 4.12389C30.2133 1.21067 26.5349 -0.034778 24.7224 2.24311L1.76109 31.0996C-1.21104 34.8348 1.45637 40.34 6.23131 40.34H29.4845L29.7563 58.4432C29.8 61.3564 33.4783 62.6016 35.2908 60.324L34.8996 60.0127L35.2908 60.324L58.2521 31.4674C61.2241 27.7322 58.5568 22.227 53.782 22.227H30.3762L30.2571 4.12811Z",stroke:"hsl(var(--brand-default))",strokeWidth:2,strokeLinecap:"round"})})})})])},71049,e=>{"use strict";var t,r=e.i(478902),o=e.i(389959),a=e.i(174617),n=e.i(274664),i=e.i(826524),l=e.i(678001),s=e.i(940051),d=e.i(839518),c=e.i(889251),u=e.i(546595),p=e.i(735343),f="HoverCard",[m,g]=(0,n.createContextScope)(f,[s.createPopperScope]),x=(0,s.createPopperScope)(),[h,v]=m(f),b=e=>{let{__scopeHoverCard:t,children:a,open:n,defaultOpen:l,onOpenChange:d,openDelay:c=700,closeDelay:u=300}=e,p=x(t),m=o.useRef(0),g=o.useRef(0),v=o.useRef(!1),b=o.useRef(!1),[w,y]=(0,i.useControllableState)({prop:n,defaultProp:l??!1,onChange:d,caller:f}),j=o.useCallback(()=>{clearTimeout(g.current),m.current=window.setTimeout(()=>y(!0),c)},[c,y]),C=o.useCallback(()=>{clearTimeout(m.current),v.current||b.current||(g.current=window.setTimeout(()=>y(!1),u))},[u,y]),N=o.useCallback(()=>y(!1),[y]);return o.useEffect(()=>()=>{clearTimeout(m.current),clearTimeout(g.current)},[]),(0,r.jsx)(h,{scope:t,open:w,onOpenChange:y,onOpen:j,onClose:C,onDismiss:N,hasSelectionRef:v,isPointerDownOnContentRef:b,children:(0,r.jsx)(s.Root,{...p,children:a})})};b.displayName=f;var w="HoverCardTrigger",y=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...n}=e,i=v(w,o),l=x(o);return(0,r.jsx)(s.Anchor,{asChild:!0,...l,children:(0,r.jsx)(u.Primitive.a,{"data-state":i.open?"open":"closed",...n,ref:t,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,T(i.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,T(i.onClose)),onFocus:(0,a.composeEventHandlers)(e.onFocus,i.onOpen),onBlur:(0,a.composeEventHandlers)(e.onBlur,i.onClose),onTouchStart:(0,a.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});y.displayName=w;var j="HoverCardPortal",[C,N]=m(j,{forceMount:void 0}),k=e=>{let{__scopeHoverCard:t,forceMount:o,children:a,container:n}=e,i=v(j,t);return(0,r.jsx)(C,{scope:t,forceMount:o,children:(0,r.jsx)(c.Presence,{present:o||i.open,children:(0,r.jsx)(d.Portal,{asChild:!0,container:n,children:a})})})};k.displayName=j;var R="HoverCardContent",_=o.forwardRef((e,t)=>{let o=N(R,e.__scopeHoverCard),{forceMount:n=o.forceMount,...i}=e,l=v(R,e.__scopeHoverCard);return(0,r.jsx)(c.Presence,{present:n||l.open,children:(0,r.jsx)(P,{"data-state":l.open?"open":"closed",...i,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,T(l.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,T(l.onClose)),ref:t})})});_.displayName=R;var P=o.forwardRef((e,n)=>{let{__scopeHoverCard:i,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:u,onInteractOutside:f,...m}=e,g=v(R,i),h=x(i),b=o.useRef(null),w=(0,l.useComposedRefs)(n,b),[y,j]=o.useState(!1);return o.useEffect(()=>{if(y){let e=document.body;return t=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=t,e.style.webkitUserSelect=t}}},[y]),o.useEffect(()=>{if(b.current){let e=()=>{j(!1),g.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(g.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!1}}},[g.isPointerDownOnContentRef,g.hasSelectionRef]),o.useEffect(()=>{b.current&&(function(e){let t=[],r=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;r.nextNode();)t.push(r.currentNode);return t})(b.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,r.jsx)(p.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:f,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:(0,a.composeEventHandlers)(u,e=>{e.preventDefault()}),onDismiss:g.onDismiss,children:(0,r.jsx)(s.Content,{...h,...m,onPointerDown:(0,a.composeEventHandlers)(m.onPointerDown,e=>{e.currentTarget.contains(e.target)&&j(!0),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!0}),ref:w,style:{...m.style,userSelect:y?"text":void 0,WebkitUserSelect:y?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),S=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...a}=e,n=x(o);return(0,r.jsx)(s.Arrow,{...n,...a,ref:t})});function T(e){return t=>"touch"===t.pointerType?void 0:e()}S.displayName="HoverCardArrow",e.s(["Arrow",0,S,"Content",0,_,"HoverCard",0,b,"HoverCardArrow",0,S,"HoverCardContent",0,_,"HoverCardPortal",0,k,"HoverCardTrigger",0,y,"Portal",0,k,"Root",0,b,"Trigger",0,y,"createHoverCardScope",0,g],73929);var E=e.i(73929),E=E,z=e.i(843778);let I=E.Root,M=E.Trigger,O=o.forwardRef(({className:e,align:t="center",animate:o="zoom-in",sideOffset:a=4,...n},i)=>(0,r.jsx)(E.Portal,{children:(0,r.jsx)(E.Content,{ref:i,align:t,sideOffset:a,className:(0,z.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===o?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...n})}));O.displayName=E.Content.displayName,e.s(["HoverCard",0,I,"HoverCardContent",0,O,"HoverCardTrigger",0,M],71049)},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,a],305551);let n=(0,t.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(n);return r||(r=a.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},236134,e=>{"use strict";var t=e.i(478902),r=e.i(162361),o=e.i(837710),a=e.i(613580),n=e.i(938933);let i=({id:e,disabled:i,className:l,children:s,header:d,visible:c,open:u,size:p="medium",loading:f,align:m="right",hideFooter:g=!1,customFooter:x,onConfirm:h,onCancel:v,confirmText:b="Confirm",cancelText:w="Cancel",triggerElement:y,defaultOpen:j,tooltip:C,...N})=>{let k=(0,n.default)("sidepanel"),R=x||(0,t.jsxs)("div",{className:k.footer,children:[(0,t.jsx)("div",{children:(0,t.jsx)(o.Button,{disabled:f,type:"default",onClick:()=>v?v():null,children:w})}),!!h&&(0,t.jsxs)(a.Tooltip,{children:[(0,t.jsx)(a.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("span",{className:"inline-block",children:(0,t.jsx)(o.Button,{htmlType:"submit",disabled:i||f,loading:f,onClick:h,children:b})})}),void 0!==C&&(0,t.jsx)(a.TooltipContent,{side:"bottom",children:C})]})]});u=u||c;let{onOpenAutoFocus:_,onCloseAutoFocus:P,onEscapeKeyDown:S,onPointerDownOutside:T,onInteractOutside:E}=N;return(0,t.jsxs)(r.Dialog.Root,{open:u,onOpenChange:function(e){void 0!==c&&!e&&v&&v()},defaultOpen:j,children:[y&&(0,t.jsx)(r.Dialog.Trigger,{asChild:!0,children:y}),(0,t.jsxs)(r.Dialog.Portal,{children:[(0,t.jsx)(r.Dialog.Overlay,{className:k.overlay}),(0,t.jsxs)(r.Dialog.Content,{className:[k.base,k.size[p],k.align[m],l&&l].join(" "),onOpenAutoFocus:_,onCloseAutoFocus:P,onEscapeKeyDown:S,onPointerDownOutside:T,onInteractOutside:e=>{e.target?.closest("#toast")&&e.preventDefault(),E&&E(e)},...N,children:[d&&(0,t.jsx)("header",{className:k.header,children:d}),(0,t.jsx)("div",{className:k.contents,children:s}),!g&&R]})]})]})};i.Content=function({children:e,className:r}){let o=(0,n.default)("sidepanel");return(0,t.jsx)("div",{className:[o.content,r].join(" ").trim(),children:e})},i.Separator=function(){let e=(0,n.default)("sidepanel");return(0,t.jsx)("div",{className:e.separator})},e.s(["default",0,i])},872646,e=>{"use strict";let t=(0,e.i(388019).default)("CircleCheckBig",[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);e.s(["CheckCircle",0,t],872646)},744061,e=>{"use strict";var t=e.i(478902),r=e.i(938933),o=e.i(843778);function a({children:e,tag:r="div",style:o}){let n=`${r}`;return(0,t.jsx)(n,{style:o,children:e})}a.Title=function({level:e=1,children:r,style:o}){let a=`h${e}`;return(0,t.jsx)(a,{style:o,children:r})},a.Text=function({children:e,style:r,mark:o,code:a,keyboard:n,strong:i}){return a?(0,t.jsx)("code",{style:r,children:e}):o?(0,t.jsx)("mark",{style:r,children:e}):n?(0,t.jsx)("kbd",{style:r,children:e}):i?(0,t.jsx)("strong",{style:r,children:e}):(0,t.jsx)("span",{style:r,children:e})},a.Link=function({children:e,target:r="_blank",href:o,onClick:a,style:n}){return(0,t.jsx)("a",{onClick:a,href:o,target:r,rel:"noopener noreferrer",style:n,children:e})};var n=e.i(389959);let i=(0,n.createContext)({type:"text"}),l=e=>{let{type:r}=e;return(0,t.jsx)(i.Provider,{value:{type:r},children:e.children})},s=()=>{let e=(0,n.useContext)(i);if(void 0===e)throw Error("MenuContext must be used within a MenuContextProvider.");return e};function d({children:e,className:r,ulClassName:o,style:a,type:n="text"}){return(0,t.jsx)("nav",{role:"menu","aria-label":"Sidebar","aria-orientation":"vertical","aria-labelledby":"options-menu",className:r,style:a,children:(0,t.jsx)(l,{type:n,children:(0,t.jsx)("ul",{className:o,children:e})})})}d.Item=function({children:e,icon:a,active:n,onClick:i,style:l}){let d=(0,r.default)("menu"),{type:c}=s(),u=[d.item.base];u.push(d.item.variants[c].base),n?u.push(d.item.variants[c].active):u.push(d.item.variants[c].normal);let p=[d.item.content.base];n?p.push(d.item.content.active):p.push(d.item.content.normal);let f=[d.item.icon.base];return n?f.push(d.item.icon.active):f.push(d.item.icon.normal),(0,t.jsxs)("li",{role:"menuitem",className:(0,o.cn)("outline-hidden",u),style:l,onClick:i,"aria-current":n?"page":void 0,children:[a&&(0,t.jsx)("div",{className:`${f.join(" ")} min-w-fit`,children:a}),(0,t.jsx)("span",{className:p.join(" "),children:e})]})},d.Group=function({children:e,icon:o,title:a}){let n=(0,r.default)("menu"),{type:i}=s();return(0,t.jsxs)("div",{className:[n.group.base,n.group.variants[i]].join(" "),children:[o&&(0,t.jsx)("span",{className:n.group.icon,children:o}),(0,t.jsx)("span",{className:n.group.content,children:a}),e]})},d.Misc=function({children:e}){return(0,t.jsx)("div",{children:(0,t.jsx)(a.Text,{children:(0,t.jsx)("span",{children:e})})})},e.s(["default",0,d],744061)},3259,100387,e=>{"use strict";var t=e.i(478902),r=e.i(106766),o=e.i(933505);e.s(["ChevronRightIcon",()=>o.default],100387);var o=o,a=e.i(389959),n=e.i(843778);let i=a.forwardRef(({...e},r)=>(0,t.jsx)("nav",{ref:r,"aria-label":"breadcrumb",...e}));i.displayName="Breadcrumb";let l=a.forwardRef(({className:e,...r},o)=>(0,t.jsx)("ol",{ref:o,className:(0,n.cn)("flex flex-wrap items-center gap-0.5 wrap-break-word text-sm text-muted-foreground sm:gap-1.5",e),...r}));l.displayName="BreadcrumbList";let s=a.forwardRef(({className:e,...r},o)=>(0,t.jsx)("li",{ref:o,className:(0,n.cn)("inline-flex text-foreground-lighter items-center gap-1.5 leading-5",e),...r}));s.displayName="BreadcrumbItem";let d=a.forwardRef(({asChild:e,className:o,...a},i)=>{let l=e?r.Slot.Slot:"a";return(0,t.jsx)(l,{ref:i,className:(0,n.cn)("transition-colors underline lg:no-underline hover:text-foreground",o),...a})});d.displayName="BreadcrumbLink";let c=a.forwardRef(({className:e,...r},o)=>(0,t.jsx)("span",{ref:o,role:"link","aria-disabled":"true","aria-current":"page",className:(0,n.cn)("no-underline text-foreground",e),...r}));c.displayName="BreadcrumbPage";let u=({children:e,className:r,...a})=>(0,t.jsx)("li",{role:"presentation","aria-hidden":"true",className:(0,n.cn)("[&>svg]:size-3.5 text-foreground-muted",r),...a,children:e??(0,t.jsx)(o.default,{})});u.displayName="BreadcrumbSeparator";let p=({className:e,...r})=>(0,t.jsxs)("span",{className:(0,n.cn)("flex h-4 w-4 items-center justify-center",e),...r,children:[(0,t.jsx)("svg",{role:"presentation","aria-hidden":"true",width:"15",height:"15",viewBox:"0 0 15 15",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,t.jsx)("path",{d:"M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z",fill:"currentColor",fillRule:"evenodd",clipRule:"evenodd"})}),(0,t.jsx)("span",{className:"sr-only",children:"More"})]});p.displayName="BreadcrumbEllipsis",e.s(["Breadcrumb",0,i,"BreadcrumbEllipsis",0,p,"BreadcrumbItem",0,s,"BreadcrumbLink",0,d,"BreadcrumbList",0,l,"BreadcrumbPage",0,c,"BreadcrumbSeparator",0,u],3259)},547723,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(843778);let a=(0,r.forwardRef)((e,r)=>(0,t.jsx)("nav",{ref:r,dir:"ltr",...e,className:(0,o.cn)("border-b",e.className),children:(0,t.jsx)("ul",{role:"menu",className:"flex gap-5",children:e.children})})),n=(0,r.forwardRef)(({children:e,className:r,active:a,...n},i)=>(0,t.jsx)("li",{ref:i,"aria-selected":a?"true":"false","data-state":a?"active":"inactive",className:(0,o.cn)("inline-flex items-center justify-center whitespace-nowrap text-sm ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground text-foreground-lighter hover:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent *:py-1.5",r),...n,children:e}));e.s(["NavMenu",0,a,"NavMenuItem",0,n])},839030,e=>{"use strict";var t=e.i(478902),r=e.i(774803),o=e.i(938933),a=e.i(843778);e.s(["default",0,function({children:e,active:n,isFullHeight:i=!1}){let l=(0,o.default)("loading"),s=[l.base],d=[l.content.base];n&&d.push(l.content.active);let c=[l.spinner];return(0,t.jsxs)("div",{className:(0,a.cn)(s.join(" "),i&&"h-full"),children:[(0,t.jsx)("div",{className:(0,a.cn)(d.join(" "),i&&"h-full"),children:e}),n&&(0,t.jsx)(r.Loader2,{size:24,className:c.join(" ")})]})}])},350046,e=>{"use strict";var t=e.i(478902),r=e.i(878716),o=e.i(88816),a=e.i(389959),n=e.i(843778);let i=r.Accordion.Root,l=a.forwardRef(({className:e,...o},a)=>(0,t.jsx)(r.Accordion.Item,{ref:a,className:(0,n.cn)("border-b",e),...o}));l.displayName="AccordionItem";let s=a.forwardRef(({className:e,children:a,hideIcon:i,...l},s)=>(0,t.jsx)(r.Accordion.Header,{className:"flex",children:(0,t.jsxs)(r.Accordion.Trigger,{ref:s,className:(0,n.cn)("flex flex-1 gap-2 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180 text-left",e),...l,children:[a,!i&&(0,t.jsx)(o.ChevronDown,{className:"h-4 w-4 transition-transform duration-200 shrink-0"})]})}));s.displayName=r.Accordion.Trigger.displayName;let d=a.forwardRef(({className:e,children:o,...a},i)=>(0,t.jsx)(r.Accordion.Content,{ref:i,className:(0,n.cn)("overflow-hidden text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",e),...a,children:(0,t.jsx)("div",{className:"pb-4 pt-0",children:o})}));d.displayName=r.Accordion.Content.displayName,e.s(["Accordion",0,i,"AccordionContent",0,d,"AccordionItem",0,l,"AccordionTrigger",0,s])},248210,e=>{"use strict";var t=e.i(478902),r=e.i(843778);e.s(["LoadingLine",0,({loading:e})=>(0,t.jsx)("div",{className:"relative overflow-hidden w-full h-px bg-border m-auto",children:(0,t.jsx)("span",{className:(0,r.cn)("absolute w-[80px] h-px ml-auto mr-auto left-0 right-0 text-center block top-0","transition-all","line-loading-bg-light dark:line-loading-bg",e&&"animate-line-loading-slower opacity-100",e?"opacity-100":"opacity-0")})})])},208089,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(843778),a=e.i(660908);let n=(0,r.forwardRef)(({className:e,value:n,...i},l)=>{let s=(0,r.useRef)(null);(0,r.useImperativeHandle)(l,()=>s.current,[]);let d=e=>{if(!e)return;e.style.height="auto";let t=e.scrollHeight;e.style.height=Math.max(40,t)+"px"};return(0,r.useLayoutEffect)(()=>{d(s.current)},[n]),(0,t.jsx)(a.Textarea,{ref:e=>{e&&(s.current=e,d(e))},rows:1,"aria-expanded":!1,className:(0,o.cn)("h-auto resize-none box-border",e),value:n,...i})});n.displayName="ExpandingTextArea",e.s(["ExpandingTextArea",0,n])},666555,22945,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(274664),a=e.i(546595),n=e.i(47015),i=e.i(174617),l=e.i(826524),s="Toggle",d=r.forwardRef((e,r)=>{let{pressed:o,defaultPressed:n,onPressedChange:d,...c}=e,[u,p]=(0,l.useControllableState)({prop:o,onChange:d,defaultProp:n??!1,caller:s});return(0,t.jsx)(a.Primitive.button,{type:"button","aria-pressed":u,"data-state":u?"on":"off","data-disabled":e.disabled?"":void 0,...c,ref:r,onClick:(0,i.composeEventHandlers)(e.onClick,()=>{e.disabled||p(!u)})})});d.displayName=s,e.s(["Root",0,d,"Toggle",0,d],7691);var c=e.i(2664),u="ToggleGroup",[p,f]=(0,o.createContextScope)(u,[n.createRovingFocusGroupScope]),m=(0,n.createRovingFocusGroupScope)(),g=r.default.forwardRef((e,r)=>{let{type:o,...a}=e;if("single"===o)return(0,t.jsx)(v,{...a,ref:r});if("multiple"===o)return(0,t.jsx)(b,{...a,ref:r});throw Error(`Missing prop \`type\` expected on \`${u}\``)});g.displayName=u;var[x,h]=p(u),v=r.default.forwardRef((e,o)=>{let{value:a,defaultValue:n,onValueChange:i=()=>{},...s}=e,[d,c]=(0,l.useControllableState)({prop:a,defaultProp:n??"",onChange:i,caller:u});return(0,t.jsx)(x,{scope:e.__scopeToggleGroup,type:"single",value:r.default.useMemo(()=>d?[d]:[],[d]),onItemActivate:c,onItemDeactivate:r.default.useCallback(()=>c(""),[c]),children:(0,t.jsx)(j,{...s,ref:o})})}),b=r.default.forwardRef((e,o)=>{let{value:a,defaultValue:n,onValueChange:i=()=>{},...s}=e,[d,c]=(0,l.useControllableState)({prop:a,defaultProp:n??[],onChange:i,caller:u}),p=r.default.useCallback(e=>c((t=[])=>[...t,e]),[c]),f=r.default.useCallback(e=>c((t=[])=>t.filter(t=>t!==e)),[c]);return(0,t.jsx)(x,{scope:e.__scopeToggleGroup,type:"multiple",value:d,onItemActivate:p,onItemDeactivate:f,children:(0,t.jsx)(j,{...s,ref:o})})});g.displayName=u;var[w,y]=p(u),j=r.default.forwardRef((e,r)=>{let{__scopeToggleGroup:o,disabled:i=!1,rovingFocus:l=!0,orientation:s,dir:d,loop:u=!0,...p}=e,f=m(o),g=(0,c.useDirection)(d),x={role:"group",dir:g,...p};return(0,t.jsx)(w,{scope:o,rovingFocus:l,disabled:i,children:l?(0,t.jsx)(n.Root,{asChild:!0,...f,orientation:s,dir:g,loop:u,children:(0,t.jsx)(a.Primitive.div,{...x,ref:r})}):(0,t.jsx)(a.Primitive.div,{...x,ref:r})})}),C="ToggleGroupItem",N=r.default.forwardRef((e,o)=>{let a=h(C,e.__scopeToggleGroup),i=y(C,e.__scopeToggleGroup),l=m(e.__scopeToggleGroup),s=a.value.includes(e.value),d=i.disabled||e.disabled,c={...e,pressed:s,disabled:d},u=r.default.useRef(null);return i.rovingFocus?(0,t.jsx)(n.Item,{asChild:!0,...l,focusable:!d,active:s,ref:u,children:(0,t.jsx)(k,{...c,ref:o})}):(0,t.jsx)(k,{...c,ref:o})});N.displayName=C;var k=r.default.forwardRef((e,r)=>{let{__scopeToggleGroup:o,value:a,...n}=e,i=h(C,o),l={role:"radio","aria-checked":e.pressed,"aria-pressed":void 0},s="single"===i.type?l:void 0;return(0,t.jsx)(d,{...s,...n,ref:r,onPressedChange:e=>{e?i.onItemActivate(a):i.onItemDeactivate(a)}})});e.s(["Item",0,N,"Root",0,g,"ToggleGroup",0,g,"ToggleGroupItem",0,N,"createToggleGroupScope",0,f],536740);var R=e.i(536740),R=R,_=e.i(843778),P=e.i(7691),P=P;let S=(0,e.i(766181).cva)("inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors text-foreground-light data-[state=on]:bg-accent data-[state=on]:bg-surface-300 data-[state=on]:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background bg-surface-200 hover:bg-surface-300 px-3 py-1 h-auto transition-all",{variants:{variant:{default:"bg-transparent",outline:"bg-transparent border border-control hover:bg-accent hover:text-accent-foreground"},size:{default:"h-10 px-3",sm:"h-9 px-2.5",lg:"h-11 px-5"}},defaultVariants:{variant:"default",size:"default"}}),T=r.forwardRef(({className:e,variant:r,size:o,...a},n)=>(0,t.jsx)(P.Root,{ref:n,className:(0,_.cn)(S({variant:r,size:o,className:e})),tabIndex:0,...a}));T.displayName=P.Root.displayName,e.s(["Toggle",0,T,"toggleVariants",0,S],22945);let E=r.createContext({size:"default",variant:"default"}),z=r.forwardRef(({className:e,variant:r,size:o,children:a,...n},i)=>(0,t.jsx)(R.Root,{ref:i,className:(0,_.cn)("flex items-center justify-center gap-1",e),...n,children:(0,t.jsx)(E.Provider,{value:{variant:r,size:o},children:a})}));z.displayName=R.Root.displayName;let I=r.forwardRef(({className:e,children:o,variant:a,size:n,...i},l)=>{let s=r.useContext(E);return(0,t.jsx)(R.Item,{ref:l,className:(0,_.cn)(S({variant:s.variant||a,size:s.size||n}),e),...i,children:o})});I.displayName=R.Item.displayName,e.s(["ToggleGroup",0,z,"ToggleGroupItem",0,I],666555)},152285,e=>{"use strict";var t=e.i(478902),r=e.i(974331),o=e.i(389959),a=e.i(938933);let n=({defaultActiveId:e,activeId:n,type:i="pills",size:l="tiny",block:s,onChange:d,onClick:c,scrollable:u,wrappable:p,addOnBefore:f,addOnAfter:m,listClassNames:g,baseClassNames:x,refs:h,children:v})=>{let b=[];o.Children.forEach(v,e=>{(0,o.isValidElement)(e)&&b.push(e)});let[w,y]=(0,o.useState)(n??e??b?.[0]?.props?.id);(0,o.useMemo)(()=>{n&&n!==w&&y(n)},[n]);let j=(0,a.default)("tabs");function C(e){c?.(e),e!==w&&(d?.(e),y(e))}let N=[j[i].list];return u&&N.push(j.scrollable),p&&N.push(j.wrappable),g&&N.push(g),(0,t.jsxs)(r.Tabs.Root,{value:w,className:[j.base,x].join(" "),ref:h?.base,children:[(0,t.jsxs)(r.Tabs.List,{className:N.join(" "),ref:h?.list,children:[f,b.map(e=>{let o=w===e.props.id,a=[j[i].base,j.size[l]];return o?a.push(j[i].active):a.push(j[i].inactive),s&&a.push(j.block),(0,t.jsxs)(r.Tabs.Trigger,{onKeyDown:t=>{"Enter"===t.key&&(t.preventDefault(),C(e.props.id))},onClick:()=>C(e.props.id),value:e.props.id,className:a.join(" "),children:[e.props.icon,(0,t.jsx)("span",{children:e.props.label}),e.props.iconRight]},`${e.props.id}-tab-button`)}),m]}),b]})};n.Panel=({children:e,id:o,className:n})=>{let i=(0,a.default)("tabs");return(0,t.jsx)(r.Tabs.Content,{value:o,className:[i.content,n].join(" "),children:e})},e.s(["default",0,n])},194576,e=>{"use strict";var t=e.i(478902),r=e.i(270740),o=e.i(938933);let a=({open:e,children:o,className:a,...n})=>(0,t.jsx)(r.Collapsible.Root,{asChild:n.asChild,defaultOpen:n.defaultOpen,open:e,onOpenChange:n.onOpenChange,disabled:n.disabled,className:a,children:o});a.Trigger=function({children:e,asChild:o}){return(0,t.jsx)(r.Collapsible.Trigger,{asChild:o,children:e})},a.Content=function({asChild:e,children:a,className:n}){let i=(0,o.default)("collapsible");return(0,t.jsx)(r.Collapsible.Content,{asChild:e,className:[i.content,n].join(" "),children:a})},e.s(["default",0,a])},245049,e=>{"use strict";var t=e.i(478902),r=e.i(975924),o=e.i(505859),a=e.i(938933);function n({align:e="center",ariaLabel:r,arrow:i=!1,children:l,className:s,defaultOpen:d=!1,modal:c,onOpenChange:u,open:p,overlay:f,side:m="bottom",sideOffset:g=6,style:x,header:h,footer:v,size:b="content",disabled:w,"data-testid":y}){let j=(0,a.default)("popover"),C=[j.content,j.size[b]];return s&&C.push(s),(0,t.jsxs)(o.Popover.Root,{defaultOpen:d,modal:c,onOpenChange:u,open:p,children:[(0,t.jsx)(o.Popover.Trigger,{disabled:w,className:j.trigger,"aria-label":r,"data-testid":y,children:l}),(0,t.jsx)(o.Popover.Portal,{children:(0,t.jsxs)(o.Popover.Content,{sideOffset:g,side:m,align:e,className:C.join(" "),style:x,children:[i&&(0,t.jsx)(o.Popover.Arrow,{offset:10}),h&&(0,t.jsx)("div",{className:j.header,children:h}),f,v&&(0,t.jsx)("div",{className:j.footer,children:v})]})})]})}n.Separator=function(){let e=(0,a.default)("popover");return(0,t.jsx)("div",{className:e.separator})},n.Close=function(){let e=(0,a.default)("popover");return(0,t.jsx)(o.Popover.Close,{className:e.close,children:(0,t.jsx)(r.X,{size:14,strokeWidth:2})})},e.s(["default",0,n])},93472,165610,e=>{"use strict";var t=e.i(478902);let r=(0,e.i(388019).default)("OctagonAlert",[["path",{d:"M12 16h.01",key:"1drbdi"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",key:"1fd625"}]]);e.s(["AlertOctagon",0,r],165610);var o=e.i(217444),a=e.i(872646),n=e.i(833655),i=e.i(975924),l=e.i(389959),s=e.i(938933);let d={danger:(0,t.jsx)(r,{strokeWidth:1.5,size:18}),success:(0,t.jsx)(a.CheckCircle,{strokeWidth:1.5,size:18}),warning:(0,t.jsx)(o.AlertTriangle,{strokeWidth:1.5,size:18}),info:(0,t.jsx)(n.Info,{strokeWidth:1.5,size:18}),neutral:(0,t.jsx)(t.Fragment,{})};e.s(["Alert",0,function({variant:e="neutral",className:r,title:o,withIcon:a,closable:n,children:c,icon:u,actions:p}){let f=(0,s.default)("alert"),[m,g]=(0,l.useState)(!0),x=[f.base];x.push(f.variant[e].base),r&&x.push(r);let h=[f.description,f.variant[e].description],v=[f.close];return(0,t.jsx)(t.Fragment,{children:m&&(0,t.jsxs)("div",{className:x.join(" "),children:[a?(0,t.jsx)("div",{className:f.variant[e].icon,children:a&&d[e]}):null,u&&u,(0,t.jsxs)("div",{className:"flex flex-1 items-center justify-between",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:[f.variant[e].header,f.header].join(" "),children:o}),(0,t.jsx)("div",{className:h.join(" "),children:c})]}),p]}),n&&(0,t.jsx)("button",{"aria-label":"Close alert",onClick:()=>g(!1),className:v.join(" "),children:(0,t.jsx)(i.X,{strokeWidth:2,size:16})})]})})}],93472)},1962,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=e.i(274664),a=e.i(546595),n="Progress",[i,l]=(0,o.createContextScope)(n),[s,d]=i(n),c=r.forwardRef((e,r)=>{var o,n;let{__scopeProgress:i,value:l=null,max:d,getValueLabel:c=f,...u}=e;(d||0===d)&&!x(d)&&console.error((o=`${d}`,`Invalid prop \`max\` of value \`${o}\` supplied to \`Progress\`. Only numbers greater than 0 are valid max values. Defaulting to \`100\`.`));let p=x(d)?d:100;null===l||h(l,p)||console.error((n=`${l}`,`Invalid prop \`value\` of value \`${n}\` supplied to \`Progress\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or 100 if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`));let v=h(l,p)?l:null,b=g(v)?c(v,p):void 0;return(0,t.jsx)(s,{scope:i,value:v,max:p,children:(0,t.jsx)(a.Primitive.div,{"aria-valuemax":p,"aria-valuemin":0,"aria-valuenow":g(v)?v:void 0,"aria-valuetext":b,role:"progressbar","data-state":m(v,p),"data-value":v??void 0,"data-max":p,...u,ref:r})})});c.displayName=n;var u="ProgressIndicator",p=r.forwardRef((e,r)=>{let{__scopeProgress:o,...n}=e,i=d(u,o);return(0,t.jsx)(a.Primitive.div,{"data-state":m(i.value,i.max),"data-value":i.value??void 0,"data-max":i.max,...n,ref:r})});function f(e,t){return`${Math.round(e/t*100)}%`}function m(e,t){return null==e?"indeterminate":e===t?"complete":"loading"}function g(e){return"number"==typeof e}function x(e){return g(e)&&!isNaN(e)&&e>0}function h(e,t){return g(e)&&!isNaN(e)&&e<=t&&e>=0}p.displayName=u,e.s(["Indicator",0,p,"Progress",0,c,"ProgressIndicator",0,p,"Root",0,c,"createProgressScope",0,l],386108);var v=e.i(386108),v=v,b=e.i(843778);let w=r.forwardRef(({className:e,value:r,...o},a)=>(0,t.jsx)(v.Root,{ref:a,className:(0,b.cn)("relative h-1 w-full overflow-hidden rounded-full bg-surface-300",e),...o,children:(0,t.jsx)(v.Indicator,{className:"h-full w-full flex-1 bg-foreground transition-all",style:{transform:`translateX(-${100-(r||0)}%)`}})}));w.displayName=v.Root.displayName,e.s(["Progress",0,w],1962)},474325,e=>{"use strict";var t=e.i(478902),r=e.i(774803),o=e.i(1962);e.s(["SonnerProgress",0,({progress:e,progressPrefix:a,action:n,message:i,description:l="Please do not close the browser"})=>(0,t.jsxs)("div",{className:"flex gap-3 w-full",children:[(0,t.jsx)(r.Loader2,{className:"animate-spin text-foreground-muted mt-0.5",size:16}),(0,t.jsxs)("div",{className:"flex flex-col gap-2 w-full",children:[(0,t.jsxs)("div",{className:"flex w-full justify-between",children:[(0,t.jsx)("p",{className:"text-foreground text-sm",children:i}),(0,t.jsxs)("p",{className:"text-foreground-light text-sm font-mono",children:[a||"",`${Number(e).toFixed(0)}%`]})]}),(0,t.jsx)(o.Progress,{value:e,className:"w-full"}),(0,t.jsxs)("div",{className:"flex flex-row gap-2 items-center justify-between",children:[(0,t.jsx)("small",{className:"text-foreground-lighter text-xs",children:l}),n]})]})]})])},449696,e=>{"use strict";var t=e.i(478902),r=e.i(376577),o=e.i(207155),a=e.i(389959),n=e.i(843778);let i=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(o.RadioGroup.Root,{className:(0,n.cn)("grid gap-2",e),...r,ref:a}));i.displayName=o.RadioGroup.Root.displayName;let l=a.forwardRef(({image:e,label:a,showIndicator:i=!0,...l},s)=>(0,t.jsxs)(o.RadioGroup.Item,{ref:s,...l,className:(0,n.cn)("flex flex-col gap-2","w-48","bg-overlay","rounded-md","border","p-2","hover:border-foreground-muted","hover:z-1 focus-visible:z-1","data-[state=checked]:z-1","data-[state=checked]:ring-2 data-[state=checked]:ring-border","data-[state=checked]:bg-surface-300 dark:data-[state=checked]:bg-surface-300","data-[state=checked]:border-foreground/50","transition-colors","group",l.className),children:[l.children,(0,t.jsxs)("label",{className:"flex gap-2 w-full",id:l.id,htmlFor:l.value,children:[i&&(0,t.jsx)("div",{className:" aspect-square h-4 w-4 rounded-full border group-data-[state=checked]:border-foreground-muted group-focus:border-foreground-muted group-hover:border-foreground-muted ring-offset-background group-focus:outline-hidden group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-disabled:cursor-not-allowed group-disabled:opacity-50 flex items-center justify-center transition ",children:(0,t.jsx)(o.RadioGroup.Indicator,{className:"flex items-center justify-center",children:(0,t.jsx)(r.Circle,{className:"h-2.5 w-2.5 fill-current text-current"})})}),(0,t.jsx)("div",{className:(0,n.cn)("w-full","text-xs transition-colors text-left","text-light","group-hover:text-foreground group-data-[state=checked]:text-foreground",l.disabled?"cursor-not-allowed":"cursor-pointer"),children:a})]})]}));l.displayName=o.RadioGroup.Item.displayName,e.s(["RadioGroupCard",0,i,"RadioGroupCardItem",0,l])},776861,e=>{"use strict";var t=e.i(478902),r=e.i(355901),o=e.i(843778),a=e.i(837710),n=e.i(877555);e.s(["SONNER_DEFAULT_DURATION",0,4e3,"SonnerToaster",0,({toastOptions:e,...i})=>(0,t.jsx)(r.Toaster,{icons:{warning:(0,t.jsx)(n.StatusIcon,{variant:"warning"}),error:(0,t.jsx)(n.StatusIcon,{variant:"destructive"}),info:(0,t.jsx)(n.StatusIcon,{variant:"default"})},className:"toaster group pointer-events-auto",style:{fontFamily:"inherit"},toastOptions:{unstyled:!0,classNames:{toast:(0,o.cn)("group","toast","w-full","rounded-md","py-3","px-5","flex","gap-2","items-start","font-normal","text-sm","group-[.toaster]:bg-overlay group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-overlay group-[.toaster]:shadow-lg"),icon:"mt-0.5",title:"font-normal!",description:"text-xs group-[.toast]:text-foreground-lighter transition-opacity group-data-[expanded=false]:opacity-0 group-data-[front=true]:opacity-100!",actionButton:(0,o.cn)("block",(0,a.buttonVariants)({type:"primary",size:"tiny"})),cancelButton:(0,o.cn)("block",(0,a.buttonVariants)({type:"default",size:"tiny"})),warning:"group toast group-[.toaster]:!bg-warning-200 group-[.toaster]:!border-warning-500",error:"group toast group-[.toaster]:!bg-destructive-200 group-[.toaster]:!border-destructive-500",closeButton:(0,o.cn)("absolute right-2 top-2 size-6 flex items-center justify-center rounded-md text-foreground-light opacity-0 transition","hover:text-foreground hover:bg-surface-200 focus:opacity-100 focus:outline-hidden focus:ring-2 group-hover:opacity-100","group-[.destructive]:text-destructive-300 group-[.destructive]:hover:text-destructive-50","group-[.destructive]:focus:ring-destructive-400 group-[.destructive]:focus:ring-offset-destructive-600","left-auto transform-none border-0 border-transparent"),content:"grow"},duration:4e3,closeButton:!0,...e},cn:o.cn,...i})])},95200,e=>{"use strict";var t=e.i(478902),r=e.i(938933),o=e.i(843778);let a=(0,e.i(389959).createContext)({contextSize:"small",className:""});e.s(["default",0,function({className:e,size:n,type:i="Mail",color:l,strokeWidth:s,fill:d,stroke:c,background:u,src:p,icon:f,...m}){let g=(0,r.default)("icon");return(0,t.jsx)(a.Consumer,{children:({contextSize:r,className:a})=>{let i={tiny:14,small:18,medium:20,large:20,xlarge:24,xxlarge:30,xxxlarge:42},x=i.large,h=21;r&&(h=r?"string"==typeof r?i[r]:r:x),n&&(h=n?"string"==typeof n?i[n]:n:x);let v=!l&&!d&&!c,b=["sbui-icon",e];a&&b.push(a);let w=p?(0,t.jsx)("div",{className:"relative",style:{width:h+"px",height:h+"px"},children:(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",color:v?"currentColor":l,fill:v?"none":d||"none",stroke:v?"currentColor":c,className:(0,o.cn)(b),width:"100%",height:"100%",strokeWidth:s??void 0,...m,children:p})}):(0,t.jsx)(f,{color:v?"currentColor":l,stroke:v?"currentColor":c,className:(0,o.cn)(b),strokeWidth:s,size:h,fill:v?"none":d||"none",...m});return u?(0,t.jsx)("div",{className:g.container,children:w}):w}})}],95200)},721704,e=>{"use strict";var t=e.i(478902),r=e.i(95200);let o=(0,t.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M13.5447 3.01094C12.5249 2.54302 11.4313 2.19828 10.2879 2.00083C10.2671 1.99702 10.2463 2.00654 10.2356 2.02559C10.0949 2.27573 9.93921 2.60206 9.83011 2.85856C8.60028 2.67444 7.3768 2.67444 6.17222 2.85856C6.06311 2.59636 5.90166 2.27573 5.76038 2.02559C5.74966 2.00717 5.72887 1.99765 5.70803 2.00083C4.56527 2.19764 3.47171 2.54239 2.45129 3.01094C2.44246 3.01475 2.43488 3.0211 2.42986 3.02935C0.355594 6.12826 -0.212633 9.151 0.06612 12.1362C0.067381 12.1508 0.0755799 12.1648 0.0869319 12.1737C1.45547 13.1787 2.78114 13.7889 4.08219 14.1933C4.10301 14.1996 4.12507 14.192 4.13832 14.1749C4.44608 13.7546 4.72043 13.3114 4.95565 12.8454C4.96953 12.8181 4.95628 12.7857 4.92791 12.7749C4.49275 12.6099 4.0784 12.4086 3.67982 12.18C3.64829 12.1616 3.64577 12.1165 3.67477 12.095C3.75865 12.0321 3.84255 11.9667 3.92264 11.9007C3.93713 11.8886 3.95732 11.8861 3.97435 11.8937C6.59287 13.0892 9.42771 13.0892 12.0153 11.8937C12.0323 11.8854 12.0525 11.888 12.0677 11.9C12.1478 11.9661 12.2316 12.0321 12.3161 12.095C12.3451 12.1165 12.3433 12.1616 12.3117 12.18C11.9131 12.413 11.4988 12.6099 11.063 12.7743C11.0346 12.7851 11.022 12.8181 11.0359 12.8454C11.2762 13.3108 11.5505 13.7539 11.8526 14.1742C11.8652 14.192 11.8879 14.1996 11.9087 14.1933C13.2161 13.7889 14.5417 13.1787 15.9103 12.1737C15.9223 12.1648 15.9298 12.1515 15.9311 12.1369C16.2647 8.6856 15.3723 5.68765 13.5655 3.02998C13.5611 3.0211 13.5535 3.01475 13.5447 3.01094ZM5.34668 10.3185C4.55833 10.3185 3.90876 9.59478 3.90876 8.70593C3.90876 7.81707 4.54574 7.09331 5.34668 7.09331C6.15393 7.09331 6.79722 7.82342 6.7846 8.70593C6.7846 9.59478 6.14762 10.3185 5.34668 10.3185ZM10.6632 10.3185C9.87481 10.3185 9.22527 9.59478 9.22527 8.70593C9.22527 7.81707 9.86221 7.09331 10.6632 7.09331C11.4704 7.09331 12.1137 7.82342 12.1011 8.70593C12.1011 9.59478 11.4704 10.3185 10.6632 10.3185Z",fill:"currentColor"});e.s(["default",0,function(e){return(0,t.jsx)(r.default,{src:o,stroke:"none",...e})}])},340923,616970,938713,e=>{"use strict";var t=e.i(478902),r=e.i(95200);let o=()=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("path",{id:"Ellipse 146",d:"M17.3154 6.70312C18.6968 8.06227 19.5532 9.95249 19.5532 12.0426C19.5532 14.1326 18.6968 16.0229 17.3154 17.382M6.79102 6.70312C5.40966 8.06227 4.55322 9.95249 4.55322 12.0426C4.55322 14.1326 5.40966 16.0229 6.79102 17.382",stroke:"currentColor",strokeMiterlimit:"10",strokeLinejoin:"bevel",opacity:.45}),(0,t.jsx)("ellipse",{id:"Ellipse 144",cx:"12.0532",cy:"12.0428",rx:"3.00928",ry:"3.00666",stroke:"currentColor",strokeMiterlimit:"10",strokeLinejoin:"bevel"}),(0,t.jsx)("path",{id:"Vector 96",d:"M12.0747 15.0488L12.0747 23.9996",stroke:"currentColor",strokeMiterlimit:"10",strokeLinejoin:"bevel"})]});e.s(["default",0,function(e){return(0,t.jsx)(r.default,{src:(0,t.jsx)(o,{}),viewBox:"0 0 24 24",...e})}],340923);let a=()=>(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:25,height:24,fill:"none",children:[(0,t.jsx)("path",{stroke:"currentColor",strokeLinecap:"round",strokeLinejoin:"bevel",strokeMiterlimit:10,d:"M20.307 12a7.807 7.807 0 0 1-7.807 7.808M4.693 12A7.807 7.807 0 0 1 12.5 4.193",opacity:.45}),(0,t.jsx)("circle",{cx:17.512,cy:6.971,r:3.723,stroke:"currentColor",strokeLinejoin:"bevel",strokeMiterlimit:10}),(0,t.jsx)("path",{stroke:"currentColor",strokeLinejoin:"bevel",strokeMiterlimit:10,d:"m10.11 13.287 2.137 3.703-2.138 3.703H5.833L3.695 16.99l2.138-3.703h4.276Z"})]});e.s(["default",0,function(e){return(0,t.jsx)(r.default,{src:(0,t.jsx)(a,{}),viewBox:"0 0 25 24",...e})}],616970);let n=()=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("path",{stroke:"currentColor",strokeLinejoin:"round",strokeMiterlimit:10,d:"m23.149 23.499 3.424 7.83a.5.5 0 0 0 .942-.074l.74-2.868a.5.5 0 0 1 .364-.36l3.039-.756a.5.5 0 0 0 .08-.943l-7.93-3.487a.5.5 0 0 0-.66.658Z"}),(0,t.jsx)("path",{stroke:"currentColor",strokeLinejoin:"round",strokeMiterlimit:10,d:"M24.544 32.746h-5.623a3 3 0 0 1-3-3V18.5a3 3 0 0 1 3-3h11.247a3 3 0 0 1 3 3v5.623",opacity:.45})]});e.s(["default",0,function(e){return(0,t.jsx)(r.default,{src:(0,t.jsx)(n,{}),viewBox:"12.5 12 24 24",...e})}],938713)},179660,e=>{"use strict";var t=e.i(478902),r=e.i(766181),o=e.i(389959),a=e.i(843778),n=e.i(737018),i=e.i(479095);let l=(0,r.cva)("group/field data-[invalid=true]:text-destructive flex w-full gap-3",{variants:{orientation:{vertical:["flex-col *:w-full [&>.sr-only]:w-auto"],horizontal:["flex-row items-center","*:data-[slot=field-label]:flex-auto","has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px has-[>[data-slot=field-content]]:items-start"],responsive:["@md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto flex-col *:w-full [&>.sr-only]:w-auto","@md/field-group:*:data-[slot=field-label]:flex-auto","@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px"]}},defaultVariants:{orientation:"vertical"}});e.s(["Field",0,function({className:e,orientation:r="vertical",...o}){return(0,t.jsx)("div",{role:"group","data-slot":"field","data-orientation":r,className:(0,a.cn)(l({orientation:r}),e),...o})},"FieldContent",0,function({className:e,...r}){return(0,t.jsx)("div",{"data-slot":"field-content",className:(0,a.cn)("group/field-content flex flex-1 flex-col gap-1.5 leading-snug",e),...r})},"FieldDescription",0,function({className:e,...r}){return(0,t.jsx)("p",{"data-slot":"field-description",className:(0,a.cn)("text-muted-foreground text-sm font-normal leading-normal group-has-data-[orientation=horizontal]/field:text-balance","nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5","[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4",e),...r})},"FieldError",0,function({className:e,children:r,errors:n,...i}){let l=(0,o.useMemo)(()=>r||(n?n?.length===1&&n[0]?.message?n[0].message:(0,t.jsx)("ul",{className:"ml-4 flex list-disc flex-col gap-1",children:n.map((e,r)=>e?.message&&(0,t.jsx)("li",{children:e.message},r))}):null),[r,n]);return l?(0,t.jsx)("div",{role:"alert","data-slot":"field-error",className:(0,a.cn)("text-destructive text-sm font-normal",e),...i,children:l}):null},"FieldGroup",0,function({className:e,...r}){return(0,t.jsx)("div",{"data-slot":"field-group",className:(0,a.cn)("group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",e),...r})},"FieldLabel",0,function({className:e,...r}){return(0,t.jsx)(n.Label,{"data-slot":"field-label",className:(0,a.cn)("group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50","has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border *:data-[slot=field]:p-4","has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10",e),...r})},"FieldLegend",0,function({className:e,variant:r="legend",...o}){return(0,t.jsx)("legend",{"data-slot":"field-legend","data-variant":r,className:(0,a.cn)("mb-3 font-medium","data-[variant=legend]:text-base","data-[variant=label]:text-sm",e),...o})},"FieldSeparator",0,function({children:e,className:r,...o}){return(0,t.jsxs)("div",{"data-slot":"field-separator","data-content":!!e,className:(0,a.cn)("relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",r),...o,children:[(0,t.jsx)(i.Separator,{className:"absolute inset-0 top-1/2"}),e&&(0,t.jsx)("span",{className:"bg-background text-muted-foreground relative mx-auto block w-fit px-2","data-slot":"field-separator-content",children:e})]})},"FieldSet",0,function({className:e,...r}){return(0,t.jsx)("fieldset",{"data-slot":"field-set",className:(0,a.cn)("flex flex-col gap-6","has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",e),...r})},"FieldTitle",0,function({className:e,...r}){return(0,t.jsx)("div",{"data-slot":"field-label",className:(0,a.cn)("flex w-fit items-center gap-2 text-sm font-medium leading-snug group-data-[disabled=true]/field:opacity-50",e),...r})}])},796284,e=>{"use strict";var t=e.i(389959),r=Object.defineProperty,o=new Map,a=new WeakMap,n=0,i=void 0;t.Component,e.s(["useInView",0,function({threshold:e,delay:r,trackVisibility:l,rootMargin:s,root:d,triggerOnce:c,skip:u,initialInView:p,fallbackInView:f,onChange:m}={}){var g;let[x,h]=t.useState(null),v=t.useRef(),[b,w]=t.useState({inView:!!p,entry:void 0});v.current=m,t.useEffect(()=>{let t;if(!u&&x)return t=function(e,t,r={},l=i){if(void 0===window.IntersectionObserver&&void 0!==l){let o=e.getBoundingClientRect();return t(l,{isIntersecting:l,target:e,intersectionRatio:"number"==typeof r.threshold?r.threshold:0,time:0,boundingClientRect:o,intersectionRect:o,rootBounds:o}),()=>{}}let{id:s,observer:d,elements:c}=function(e){let t=Object.keys(e).sort().filter(t=>void 0!==e[t]).map(t=>{var r;return`${t}_${"root"===t?!(r=e.root)?"0":(a.has(r)||(n+=1,a.set(r,n.toString())),a.get(r)):e[t]}`}).toString(),r=o.get(t);if(!r){let a,n=new Map,i=new IntersectionObserver(t=>{t.forEach(t=>{var r;let o=t.isIntersecting&&a.some(e=>t.intersectionRatio>=e);e.trackVisibility&&void 0===t.isVisible&&(t.isVisible=o),null==(r=n.get(t.target))||r.forEach(e=>{e(o,t)})})},e);a=i.thresholds||(Array.isArray(e.threshold)?e.threshold:[e.threshold||0]),r={id:t,observer:i,elements:n},o.set(t,r)}return r}(r),u=c.get(e)||[];return c.has(e)||c.set(e,u),u.push(t),d.observe(e),function(){u.splice(u.indexOf(t),1),0===u.length&&(c.delete(e),d.unobserve(e)),0===c.size&&(d.disconnect(),o.delete(s))}}(x,(e,r)=>{w({inView:e,entry:r}),v.current&&v.current(e,r),r.isIntersecting&&c&&t&&(t(),t=void 0)},{root:d,rootMargin:s,threshold:e,trackVisibility:l,delay:r},f),()=>{t&&t()}},[Array.isArray(e)?e.toString():e,x,d,s,c,u,l,f,r]);let y=null==(g=b.entry)?void 0:g.target,j=t.useRef();x||!y||c||u||j.current===y||(j.current=y,w({inView:!!p,entry:void 0}));let C=[h,b.inView,b.entry];return C.ref=C[0],C.inView=C[1],C.entry=C[2],C}])},102116,846360,e=>{"use strict";var t=e.i(478902),r=e.i(389959),o=Object.defineProperty,a=Object.defineProperties,n=Object.getOwnPropertyDescriptors,i=Object.getOwnPropertySymbols,l=Object.prototype.hasOwnProperty,s=Object.prototype.propertyIsEnumerable,d=(e,t,r)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,c=r.createContext({}),u=r.forwardRef((e,t)=>{let o;var u,m,g,x,h,{value:v,onChange:b,maxLength:w,textAlign:y="left",pattern:j,placeholder:C,inputMode:N="numeric",onComplete:k,pushPasswordManagerStrategy:R="increase-width",pasteTransformer:_,containerClassName:P,noScriptCSSFallback:S=f,render:T,children:E}=e,z=((e,t)=>{var r={};for(var o in e)l.call(e,o)&&0>t.indexOf(o)&&(r[o]=e[o]);if(null!=e&&i)for(var o of i(e))0>t.indexOf(o)&&s.call(e,o)&&(r[o]=e[o]);return r})(e,["value","onChange","maxLength","textAlign","pattern","placeholder","inputMode","onComplete","pushPasswordManagerStrategy","pasteTransformer","containerClassName","noScriptCSSFallback","render","children"]);let[I,M]=r.useState("string"==typeof z.defaultValue?z.defaultValue:""),O=null!=v?v:I,A=(o=r.useRef(),r.useEffect(()=>{o.current=O}),o.current),L=r.useCallback(e=>{null==b||b(e),M(e)},[b]),D=r.useMemo(()=>j?"string"==typeof j?new RegExp(j):j:null,[j]),B=r.useRef(null),F=r.useRef(null),H=r.useRef({value:O,onChange:L,isIOS:"u">typeof window&&(null==(m=null==(u=null==window?void 0:window.CSS)?void 0:u.supports)?void 0:m.call(u,"-webkit-touch-callout","none"))}),$=r.useRef({prev:[null==(g=B.current)?void 0:g.selectionStart,null==(x=B.current)?void 0:x.selectionEnd,null==(h=B.current)?void 0:h.selectionDirection]});r.useImperativeHandle(t,()=>B.current,[]),r.useEffect(()=>{let e=B.current,t=F.current;if(!e||!t)return;function r(){if(document.activeElement!==e){q(null),X(null);return}let t=e.selectionStart,r=e.selectionEnd,o=e.selectionDirection,a=e.maxLength,n=e.value,i=$.current.prev,l=-1,s=-1,d;if(0!==n.length&&null!==t&&null!==r){let e=t===r,o=t===n.length&&n.length<a;if(e&&!o){if(0===t)l=0,s=1,d="forward";else if(t===a)l=t-1,s=t,d="backward";else if(a>1&&n.length>1){let e=0;if(null!==i[0]&&null!==i[1]){d=t<i[1]?"backward":"forward";let r=i[0]===i[1]&&i[0]<a;"backward"!==d||r||(e=-1)}l=e+t,s=e+t+1}}-1!==l&&-1!==s&&l!==s&&B.current.setSelectionRange(l,s,d)}let c=-1!==l?l:t,u=-1!==s?s:r,p=null!=d?d:o;q(c),X(u),$.current.prev=[c,u,p]}if(H.current.value!==e.value&&H.current.onChange(e.value),$.current.prev=[e.selectionStart,e.selectionEnd,e.selectionDirection],document.addEventListener("selectionchange",r,{capture:!0}),r(),document.activeElement===e&&Z(!0),!document.getElementById("input-otp-style")){let e=document.createElement("style");if(e.id="input-otp-style",document.head.appendChild(e),e.sheet){let t="background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;";p(e.sheet,"[data-input-otp]::selection { background: transparent !important; color: transparent !important; }"),p(e.sheet,`[data-input-otp]:autofill { ${t} }`),p(e.sheet,`[data-input-otp]:-webkit-autofill { ${t} }`),p(e.sheet,"@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }"),p(e.sheet,"[data-input-otp] + * { pointer-events: all !important; }")}}let o=()=>{t&&t.style.setProperty("--root-height",`${e.clientHeight}px`)};o();let a=new ResizeObserver(o);return a.observe(e),()=>{document.removeEventListener("selectionchange",r,{capture:!0}),a.disconnect()}},[]);let[G,W]=r.useState(!1),[V,Z]=r.useState(!1),[U,q]=r.useState(null),[K,X]=r.useState(null);r.useEffect(()=>{var e;setTimeout(e=()=>{var e,t,r,o;null==(e=B.current)||e.dispatchEvent(new Event("input"));let a=null==(t=B.current)?void 0:t.selectionStart,n=null==(r=B.current)?void 0:r.selectionEnd,i=null==(o=B.current)?void 0:o.selectionDirection;null!==a&&null!==n&&(q(a),X(n),$.current.prev=[a,n,i])},0),setTimeout(e,10),setTimeout(e,50)},[O,V]),r.useEffect(()=>{void 0!==A&&O!==A&&A.length<w&&O.length===w&&(null==k||k(O))},[w,k,A,O]);let J=function({containerRef:e,inputRef:t,pushPasswordManagerStrategy:o,isFocused:a}){let[n,i]=r.useState(!1),[l,s]=r.useState(!1),[d,c]=r.useState(!1),u=r.useMemo(()=>"none"!==o&&("increase-width"===o||"experimental-no-flickering"===o)&&n&&l,[n,l,o]),p=r.useCallback(()=>{let r=e.current,a=t.current;if(!r||!a||d||"none"===o)return;let n=r.getBoundingClientRect().left+r.offsetWidth,l=r.getBoundingClientRect().top+r.offsetHeight/2;0===document.querySelectorAll('[data-lastpass-icon-root],com-1password-button,[data-dashlanecreated],[style$="2147483647 !important;"]').length&&document.elementFromPoint(n-18,l)===r||(i(!0),c(!0))},[e,t,d,o]);return r.useEffect(()=>{let t=e.current;if(!t||"none"===o)return;function r(){s(window.innerWidth-t.getBoundingClientRect().right>=40)}r();let a=setInterval(r,1e3);return()=>{clearInterval(a)}},[e,o]),r.useEffect(()=>{let e=a||document.activeElement===t.current;if("none"===o||!e)return;let r=setTimeout(p,0),n=setTimeout(p,2e3),i=setTimeout(p,5e3),l=setTimeout(()=>{c(!0)},6e3);return()=>{clearTimeout(r),clearTimeout(n),clearTimeout(i),clearTimeout(l)}},[t,a,o,p]),{hasPWMBadge:n,willPushPWMBadge:u,PWM_BADGE_SPACE_WIDTH:"40px"}}({containerRef:F,inputRef:B,pushPasswordManagerStrategy:R,isFocused:V}),Y=r.useCallback(e=>{let t=e.currentTarget.value.slice(0,w);t.length>0&&D&&!D.test(t)?e.preventDefault():("string"==typeof A&&t.length<A.length&&document.dispatchEvent(new Event("selectionchange")),L(t))},[w,L,A,D]),Q=r.useCallback(()=>{var e;if(B.current){let t=Math.min(B.current.value.length,w-1),r=B.current.value.length;null==(e=B.current)||e.setSelectionRange(t,r),q(t),X(r)}Z(!0)},[w]),ee=r.useCallback(e=>{var t,r;let o=B.current;if(!_&&(!H.current.isIOS||!e.clipboardData||!o))return;let a=e.clipboardData.getData("text/plain"),n=_?_(a):a;e.preventDefault();let i=null==(t=B.current)?void 0:t.selectionStart,l=null==(r=B.current)?void 0:r.selectionEnd,s=(i!==l?O.slice(0,i)+n+O.slice(l):O.slice(0,i)+n+O.slice(i)).slice(0,w);if(s.length>0&&D&&!D.test(s))return;o.value=s,L(s);let d=Math.min(s.length,w-1),c=s.length;o.setSelectionRange(d,c),q(d),X(c)},[w,L,D,O]),et=r.useMemo(()=>({position:"relative",cursor:z.disabled?"default":"text",userSelect:"none",WebkitUserSelect:"none",pointerEvents:"none"}),[z.disabled]),er=r.useMemo(()=>({position:"absolute",inset:0,width:J.willPushPWMBadge?`calc(100% + ${J.PWM_BADGE_SPACE_WIDTH})`:"100%",clipPath:J.willPushPWMBadge?`inset(0 ${J.PWM_BADGE_SPACE_WIDTH} 0 0)`:void 0,height:"100%",display:"flex",textAlign:y,opacity:"1",color:"transparent",pointerEvents:"all",background:"transparent",caretColor:"transparent",border:"0 solid transparent",outline:"0 solid transparent",boxShadow:"none",lineHeight:"1",letterSpacing:"-.5em",fontSize:"var(--root-height)",fontFamily:"monospace",fontVariantNumeric:"tabular-nums"}),[J.PWM_BADGE_SPACE_WIDTH,J.willPushPWMBadge,y]),eo=r.useMemo(()=>r.createElement("input",a(((e,t)=>{for(var r in t||(t={}))l.call(t,r)&&d(e,r,t[r]);if(i)for(var r of i(t))s.call(t,r)&&d(e,r,t[r]);return e})({autoComplete:z.autoComplete||"one-time-code"},z),n({"data-input-otp":!0,"data-input-otp-placeholder-shown":0===O.length||void 0,"data-input-otp-mss":U,"data-input-otp-mse":K,inputMode:N,pattern:null==D?void 0:D.source,"aria-placeholder":C,style:er,maxLength:w,value:O,ref:B,onPaste:e=>{var t;ee(e),null==(t=z.onPaste)||t.call(z,e)},onChange:Y,onMouseOver:e=>{var t;W(!0),null==(t=z.onMouseOver)||t.call(z,e)},onMouseLeave:e=>{var t;W(!1),null==(t=z.onMouseLeave)||t.call(z,e)},onFocus:e=>{var t;Q(),null==(t=z.onFocus)||t.call(z,e)},onBlur:e=>{var t;Z(!1),null==(t=z.onBlur)||t.call(z,e)}}))),[Y,Q,ee,N,er,w,K,U,z,null==D?void 0:D.source,O]),ea=r.useMemo(()=>({slots:Array.from({length:w}).map((e,t)=>{var r;let o=V&&null!==U&&null!==K&&(U===K&&t===U||t>=U&&t<K),a=void 0!==O[t]?O[t]:null;return{char:a,placeholderChar:void 0!==O[0]?null:null!=(r=null==C?void 0:C[t])?r:null,isActive:o,hasFakeCaret:o&&null===a}}),isFocused:V,isHovering:!z.disabled&&G}),[V,G,w,K,U,z.disabled,O]),en=r.useMemo(()=>T?T(ea):r.createElement(c.Provider,{value:ea},E),[E,ea,T]);return r.createElement(r.Fragment,null,null!==S&&r.createElement("noscript",null,r.createElement("style",null,S)),r.createElement("div",{ref:F,"data-input-otp-container":!0,style:et,className:P},en,r.createElement("div",{style:{position:"absolute",inset:0,pointerEvents:"none"}},eo)))});function p(e,t){try{e.insertRule(t)}catch(e){console.error("input-otp could not insert CSS rule:",t)}}u.displayName="Input";var f=`
[data-input-otp] {
  --nojs-bg: white !important;
  --nojs-fg: black !important;

  background-color: var(--nojs-bg) !important;
  color: var(--nojs-fg) !important;
  caret-color: var(--nojs-fg) !important;
  letter-spacing: .25em !important;
  text-align: center !important;
  border: 1px solid var(--nojs-fg) !important;
  border-radius: 4px !important;
  width: 100% !important;
}
@media (prefers-color-scheme: dark) {
  [data-input-otp] {
    --nojs-bg: black !important;
    --nojs-fg: white !important;
  }
}`;e.s(["OTPInput",0,u,"OTPInputContext",0,c,"REGEXP_ONLY_DIGITS_AND_CHARS",0,"^[a-zA-Z0-9]+$"],846360);let m=(0,e.i(388019).default)("Dot",[["circle",{cx:"12.1",cy:"12.1",r:"1",key:"18d7e5"}]]);var g=e.i(843778);let x=r.forwardRef(({className:e,containerClassName:r,...o},a)=>(0,t.jsx)(u,{ref:a,containerClassName:(0,g.cn)("flex items-center gap-2 has-disabled:opacity-50",r),className:(0,g.cn)("disabled:cursor-not-allowed",e),...o}));x.displayName="InputOTP";let h=r.forwardRef(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,className:(0,g.cn)("flex items-center",e),...r}));h.displayName="InputOTPGroup";let v=r.forwardRef(({index:e,className:o,...a},n)=>{let{char:i,hasFakeCaret:l,isActive:s}=r.useContext(c).slots[e];return(0,t.jsxs)("div",{ref:n,className:(0,g.cn)("relative flex h-10 w-10 items-center justify-center border-y border-r border-input text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",s&&"z-10 ring-2 ring-ring ring-offset-background",o),...a,children:[i,l&&(0,t.jsx)("div",{className:"pointer-events-none absolute inset-0 flex items-center justify-center",children:(0,t.jsx)("div",{className:"h-4 w-px animate-caret-blink bg-foreground duration-1000"})})]})});v.displayName="InputOTPSlot";let b=r.forwardRef(({...e},r)=>(0,t.jsx)("div",{ref:r,role:"separator",...e,children:(0,t.jsx)(m,{})}));b.displayName="InputOTPSeparator",e.s(["InputOTP",0,x,"InputOTPGroup",0,h,"InputOTPSeparator",0,b,"InputOTPSlot",0,v],102116)}]);