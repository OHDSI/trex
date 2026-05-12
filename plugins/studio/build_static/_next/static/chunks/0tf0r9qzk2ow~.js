(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938933,305551,e=>{"use strict";var r=e.i(389959);let t={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${t.size.text.tiny} ${t.size.padding.tiny}`,small:`${t.size.text.small} ${t.size.padding.small}`,medium:`${t.size.text.medium} ${t.size.padding.medium}`,large:`${t.size.text.large} ${t.size.padding.large}`,xlarge:`${t.size.text.xlarge} ${t.size.padding.xlarge}`},n={accordion:{variants:{default:{base:`
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
      ${t.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${t.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${t.border.secondary}
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
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
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
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...t.size.text}},label_optional:{base:"text-foreground-lighter",size:{...t.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...t.size.text}},label_before:{base:"text-foreground-lighter ",size:{...t.size.text}},label_after:{base:"text-foreground-lighter",size:{...t.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...t.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
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
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
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
    `}};e.s(["default",0,n],305551);let l=(0,r.createContext)({theme:n});e.s(["default",0,function(e){let{theme:{[e]:t}}=(0,r.useContext)(l);return t||(t=n.accordion),t=JSON.parse(t=JSON.stringify(t).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},449123,451031,831927,156722,e=>{"use strict";var r=e.i(130843);e.s(["Select_Shadcn_",()=>r.Select],449123),e.s(["SelectContent_Shadcn_",()=>r.SelectContent],451031),e.s(["SelectItem_Shadcn_",()=>r.SelectItem],831927),e.s(["SelectTrigger_Shadcn_",()=>r.SelectTrigger],156722)},719754,e=>{"use strict";var r=e.i(130843);e.s(["SelectValue_Shadcn_",()=>r.SelectValue])},471998,698381,e=>{"use strict";let r=(0,e.i(388019).default)("EllipsisVertical",[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"12",cy:"5",r:"1",key:"gxeob9"}],["circle",{cx:"12",cy:"19",r:"1",key:"lyex9k"}]]);e.s(["default",0,r],698381),e.s(["MoreVertical",0,r],471998)},396831,e=>{"use strict";var r=e.i(478902),t=e.i(389959),o=e.i(546595),n=e.i(889251),l=e.i(274664),a=e.i(678001),i=e.i(746523),s=e.i(2664),d=e.i(503867),c=e.i(305607),u=e.i(174617),p="ScrollArea",[f,b]=(0,l.createContextScope)(p),[g,m]=f(p),x=t.forwardRef((e,n)=>{let{__scopeScrollArea:l,type:i="hover",dir:d,scrollHideDelay:c=600,...u}=e,[p,f]=t.useState(null),[b,m]=t.useState(null),[x,h]=t.useState(null),[v,w]=t.useState(null),[y,_]=t.useState(null),[S,C]=t.useState(0),[z,R]=t.useState(0),[E,T]=t.useState(!1),[P,j]=t.useState(!1),k=(0,a.useComposedRefs)(n,e=>f(e)),L=(0,s.useDirection)(d);return(0,r.jsx)(g,{scope:l,type:i,dir:L,scrollHideDelay:c,scrollArea:p,viewport:b,onViewportChange:m,content:x,onContentChange:h,scrollbarX:v,onScrollbarXChange:w,scrollbarXEnabled:E,onScrollbarXEnabledChange:T,scrollbarY:y,onScrollbarYChange:_,scrollbarYEnabled:P,onScrollbarYEnabledChange:j,onCornerWidthChange:C,onCornerHeightChange:R,children:(0,r.jsx)(o.Primitive.div,{dir:L,...u,ref:k,style:{position:"relative","--radix-scroll-area-corner-width":S+"px","--radix-scroll-area-corner-height":z+"px",...e.style}})})});x.displayName=p;var h="ScrollAreaViewport",v=t.forwardRef((e,n)=>{let{__scopeScrollArea:l,children:i,nonce:s,...d}=e,c=m(h,l),u=t.useRef(null),p=(0,a.useComposedRefs)(n,u,c.onViewportChange);return(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)("style",{dangerouslySetInnerHTML:{__html:"[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}"},nonce:s}),(0,r.jsx)(o.Primitive.div,{"data-radix-scroll-area-viewport":"",...d,ref:p,style:{overflowX:c.scrollbarXEnabled?"scroll":"hidden",overflowY:c.scrollbarYEnabled?"scroll":"hidden",...e.style},children:(0,r.jsx)("div",{ref:c.onContentChange,style:{minWidth:"100%",display:"table"},children:i})})]})});v.displayName=h;var w="ScrollAreaScrollbar",y=t.forwardRef((e,o)=>{let{forceMount:n,...l}=e,a=m(w,e.__scopeScrollArea),{onScrollbarXEnabledChange:i,onScrollbarYEnabledChange:s}=a,d="horizontal"===e.orientation;return t.useEffect(()=>(d?i(!0):s(!0),()=>{d?i(!1):s(!1)}),[d,i,s]),"hover"===a.type?(0,r.jsx)(_,{...l,ref:o,forceMount:n}):"scroll"===a.type?(0,r.jsx)(S,{...l,ref:o,forceMount:n}):"auto"===a.type?(0,r.jsx)(C,{...l,ref:o,forceMount:n}):"always"===a.type?(0,r.jsx)(z,{...l,ref:o}):null});y.displayName=w;var _=t.forwardRef((e,o)=>{let{forceMount:l,...a}=e,i=m(w,e.__scopeScrollArea),[s,d]=t.useState(!1);return t.useEffect(()=>{let e=i.scrollArea,r=0;if(e){let t=()=>{window.clearTimeout(r),d(!0)},o=()=>{r=window.setTimeout(()=>d(!1),i.scrollHideDelay)};return e.addEventListener("pointerenter",t),e.addEventListener("pointerleave",o),()=>{window.clearTimeout(r),e.removeEventListener("pointerenter",t),e.removeEventListener("pointerleave",o)}}},[i.scrollArea,i.scrollHideDelay]),(0,r.jsx)(n.Presence,{present:l||s,children:(0,r.jsx)(C,{"data-state":s?"visible":"hidden",...a,ref:o})})}),S=t.forwardRef((e,o)=>{var l;let{forceMount:a,...i}=e,s=m(w,e.__scopeScrollArea),d="horizontal"===e.orientation,c=X(()=>f("SCROLL_END"),100),[p,f]=(l={hidden:{SCROLL:"scrolling"},scrolling:{SCROLL_END:"idle",POINTER_ENTER:"interacting"},interacting:{SCROLL:"interacting",POINTER_LEAVE:"idle"},idle:{HIDE:"hidden",SCROLL:"scrolling",POINTER_ENTER:"interacting"}},t.useReducer((e,r)=>l[e][r]??e,"hidden"));return t.useEffect(()=>{if("idle"===p){let e=window.setTimeout(()=>f("HIDE"),s.scrollHideDelay);return()=>window.clearTimeout(e)}},[p,s.scrollHideDelay,f]),t.useEffect(()=>{let e=s.viewport,r=d?"scrollLeft":"scrollTop";if(e){let t=e[r],o=()=>{let o=e[r];t!==o&&(f("SCROLL"),c()),t=o};return e.addEventListener("scroll",o),()=>e.removeEventListener("scroll",o)}},[s.viewport,d,f,c]),(0,r.jsx)(n.Presence,{present:a||"hidden"!==p,children:(0,r.jsx)(z,{"data-state":"hidden"===p?"hidden":"visible",...i,ref:o,onPointerEnter:(0,u.composeEventHandlers)(e.onPointerEnter,()=>f("POINTER_ENTER")),onPointerLeave:(0,u.composeEventHandlers)(e.onPointerLeave,()=>f("POINTER_LEAVE"))})})}),C=t.forwardRef((e,o)=>{let l=m(w,e.__scopeScrollArea),{forceMount:a,...i}=e,[s,d]=t.useState(!1),c="horizontal"===e.orientation,u=X(()=>{if(l.viewport){let e=l.viewport.offsetWidth<l.viewport.scrollWidth,r=l.viewport.offsetHeight<l.viewport.scrollHeight;d(c?e:r)}},10);return Y(l.viewport,u),Y(l.content,u),(0,r.jsx)(n.Presence,{present:a||s,children:(0,r.jsx)(z,{"data-state":s?"visible":"hidden",...i,ref:o})})}),z=t.forwardRef((e,o)=>{let{orientation:n="vertical",...l}=e,a=m(w,e.__scopeScrollArea),i=t.useRef(null),s=t.useRef(0),[d,c]=t.useState({content:0,viewport:0,scrollbar:{size:0,paddingStart:0,paddingEnd:0}}),u=O(d.viewport,d.content),p={...l,sizes:d,onSizesChange:c,hasThumb:!!(u>0&&u<1),onThumbChange:e=>i.current=e,onThumbPointerUp:()=>s.current=0,onThumbPointerDown:e=>s.current=e};function f(e,r){return function(e,r,t,o="ltr"){let n=I(t),l=r||n/2,a=t.scrollbar.paddingStart+l,i=t.scrollbar.size-t.scrollbar.paddingEnd-(n-l),s=t.content-t.viewport;return W([a,i],"ltr"===o?[0,s]:[-1*s,0])(e)}(e,s.current,d,r)}return"horizontal"===n?(0,r.jsx)(R,{...p,ref:o,onThumbPositionChange:()=>{if(a.viewport&&i.current){let e=V(a.viewport.scrollLeft,d,a.dir);i.current.style.transform=`translate3d(${e}px, 0, 0)`}},onWheelScroll:e=>{a.viewport&&(a.viewport.scrollLeft=e)},onDragScroll:e=>{a.viewport&&(a.viewport.scrollLeft=f(e,a.dir))}}):"vertical"===n?(0,r.jsx)(E,{...p,ref:o,onThumbPositionChange:()=>{if(a.viewport&&i.current){let e=V(a.viewport.scrollTop,d);i.current.style.transform=`translate3d(0, ${e}px, 0)`}},onWheelScroll:e=>{a.viewport&&(a.viewport.scrollTop=e)},onDragScroll:e=>{a.viewport&&(a.viewport.scrollTop=f(e))}}):null}),R=t.forwardRef((e,o)=>{let{sizes:n,onSizesChange:l,...i}=e,s=m(w,e.__scopeScrollArea),[d,c]=t.useState(),u=t.useRef(null),p=(0,a.useComposedRefs)(o,u,s.onScrollbarXChange);return t.useEffect(()=>{u.current&&c(getComputedStyle(u.current))},[u]),(0,r.jsx)(j,{"data-orientation":"horizontal",...i,ref:p,sizes:n,style:{bottom:0,left:"rtl"===s.dir?"var(--radix-scroll-area-corner-width)":0,right:"ltr"===s.dir?"var(--radix-scroll-area-corner-width)":0,"--radix-scroll-area-thumb-width":I(n)+"px",...e.style},onThumbPointerDown:r=>e.onThumbPointerDown(r.x),onDragScroll:r=>e.onDragScroll(r.x),onWheelScroll:(r,t)=>{if(s.viewport){var o,n;let l=s.viewport.scrollLeft+r.deltaX;e.onWheelScroll(l),o=l,n=t,o>0&&o<n&&r.preventDefault()}},onResize:()=>{u.current&&s.viewport&&d&&l({content:s.viewport.scrollWidth,viewport:s.viewport.offsetWidth,scrollbar:{size:u.current.clientWidth,paddingStart:$(d.paddingLeft),paddingEnd:$(d.paddingRight)}})}})}),E=t.forwardRef((e,o)=>{let{sizes:n,onSizesChange:l,...i}=e,s=m(w,e.__scopeScrollArea),[d,c]=t.useState(),u=t.useRef(null),p=(0,a.useComposedRefs)(o,u,s.onScrollbarYChange);return t.useEffect(()=>{u.current&&c(getComputedStyle(u.current))},[u]),(0,r.jsx)(j,{"data-orientation":"vertical",...i,ref:p,sizes:n,style:{top:0,right:"ltr"===s.dir?0:void 0,left:"rtl"===s.dir?0:void 0,bottom:"var(--radix-scroll-area-corner-height)","--radix-scroll-area-thumb-height":I(n)+"px",...e.style},onThumbPointerDown:r=>e.onThumbPointerDown(r.y),onDragScroll:r=>e.onDragScroll(r.y),onWheelScroll:(r,t)=>{if(s.viewport){var o,n;let l=s.viewport.scrollTop+r.deltaY;e.onWheelScroll(l),o=l,n=t,o>0&&o<n&&r.preventDefault()}},onResize:()=>{u.current&&s.viewport&&d&&l({content:s.viewport.scrollHeight,viewport:s.viewport.offsetHeight,scrollbar:{size:u.current.clientHeight,paddingStart:$(d.paddingTop),paddingEnd:$(d.paddingBottom)}})}})}),[T,P]=f(w),j=t.forwardRef((e,n)=>{let{__scopeScrollArea:l,sizes:s,hasThumb:d,onThumbChange:c,onThumbPointerUp:p,onThumbPointerDown:f,onThumbPositionChange:b,onDragScroll:g,onWheelScroll:x,onResize:h,...v}=e,y=m(w,l),[_,S]=t.useState(null),C=(0,a.useComposedRefs)(n,e=>S(e)),z=t.useRef(null),R=t.useRef(""),E=y.viewport,P=s.content-s.viewport,j=(0,i.useCallbackRef)(x),k=(0,i.useCallbackRef)(b),L=X(h,10);function A(e){z.current&&g({x:e.clientX-z.current.left,y:e.clientY-z.current.top})}return t.useEffect(()=>{let e=e=>{let r=e.target;_?.contains(r)&&j(e,P)};return document.addEventListener("wheel",e,{passive:!1}),()=>document.removeEventListener("wheel",e,{passive:!1})},[E,_,P,j]),t.useEffect(k,[s,k]),Y(_,L),Y(y.content,L),(0,r.jsx)(T,{scope:l,scrollbar:_,hasThumb:d,onThumbChange:(0,i.useCallbackRef)(c),onThumbPointerUp:(0,i.useCallbackRef)(p),onThumbPositionChange:k,onThumbPointerDown:(0,i.useCallbackRef)(f),children:(0,r.jsx)(o.Primitive.div,{...v,ref:C,style:{position:"absolute",...v.style},onPointerDown:(0,u.composeEventHandlers)(e.onPointerDown,e=>{0===e.button&&(e.target.setPointerCapture(e.pointerId),z.current=_.getBoundingClientRect(),R.current=document.body.style.webkitUserSelect,document.body.style.webkitUserSelect="none",y.viewport&&(y.viewport.style.scrollBehavior="auto"),A(e))}),onPointerMove:(0,u.composeEventHandlers)(e.onPointerMove,A),onPointerUp:(0,u.composeEventHandlers)(e.onPointerUp,e=>{let r=e.target;r.hasPointerCapture(e.pointerId)&&r.releasePointerCapture(e.pointerId),document.body.style.webkitUserSelect=R.current,y.viewport&&(y.viewport.style.scrollBehavior=""),z.current=null})})})}),k="ScrollAreaThumb",L=t.forwardRef((e,t)=>{let{forceMount:o,...l}=e,a=P(k,e.__scopeScrollArea);return(0,r.jsx)(n.Presence,{present:o||a.hasThumb,children:(0,r.jsx)(A,{ref:t,...l})})}),A=t.forwardRef((e,n)=>{let{__scopeScrollArea:l,style:i,...s}=e,d=m(k,l),c=P(k,l),{onThumbPositionChange:p}=c,f=(0,a.useComposedRefs)(n,e=>c.onThumbChange(e)),b=t.useRef(void 0),g=X(()=>{b.current&&(b.current(),b.current=void 0)},100);return t.useEffect(()=>{let e=d.viewport;if(e){let r=()=>{g(),b.current||(b.current=U(e,p),p())};return p(),e.addEventListener("scroll",r),()=>e.removeEventListener("scroll",r)}},[d.viewport,g,p]),(0,r.jsx)(o.Primitive.div,{"data-state":c.hasThumb?"visible":"hidden",...s,ref:f,style:{width:"var(--radix-scroll-area-thumb-width)",height:"var(--radix-scroll-area-thumb-height)",...i},onPointerDownCapture:(0,u.composeEventHandlers)(e.onPointerDownCapture,e=>{let r=e.target.getBoundingClientRect(),t=e.clientX-r.left,o=e.clientY-r.top;c.onThumbPointerDown({x:t,y:o})}),onPointerUp:(0,u.composeEventHandlers)(e.onPointerUp,c.onThumbPointerUp)})});L.displayName=k;var N="ScrollAreaCorner",D=t.forwardRef((e,t)=>{let o=m(N,e.__scopeScrollArea),n=!!(o.scrollbarX&&o.scrollbarY);return"scroll"!==o.type&&n?(0,r.jsx)(H,{...e,ref:t}):null});D.displayName=N;var H=t.forwardRef((e,n)=>{let{__scopeScrollArea:l,...a}=e,i=m(N,l),[s,d]=t.useState(0),[c,u]=t.useState(0),p=!!(s&&c);return Y(i.scrollbarX,()=>{let e=i.scrollbarX?.offsetHeight||0;i.onCornerHeightChange(e),u(e)}),Y(i.scrollbarY,()=>{let e=i.scrollbarY?.offsetWidth||0;i.onCornerWidthChange(e),d(e)}),p?(0,r.jsx)(o.Primitive.div,{...a,ref:n,style:{width:s,height:c,position:"absolute",right:"ltr"===i.dir?0:void 0,left:"rtl"===i.dir?0:void 0,bottom:0,...e.style}}):null});function $(e){return e?parseInt(e,10):0}function O(e,r){let t=e/r;return isNaN(t)?0:t}function I(e){let r=O(e.viewport,e.content),t=e.scrollbar.paddingStart+e.scrollbar.paddingEnd;return Math.max((e.scrollbar.size-t)*r,18)}function V(e,r,t="ltr"){let o=I(r),n=r.scrollbar.paddingStart+r.scrollbar.paddingEnd,l=r.scrollbar.size-n,a=r.content-r.viewport,i=(0,c.clamp)(e,"ltr"===t?[0,a]:[-1*a,0]);return W([0,a],[0,l-o])(i)}function W(e,r){return t=>{if(e[0]===e[1]||r[0]===r[1])return r[0];let o=(r[1]-r[0])/(e[1]-e[0]);return r[0]+o*(t-e[0])}}var U=(e,r=()=>{})=>{let t={left:e.scrollLeft,top:e.scrollTop},o=0;return!function n(){let l={left:e.scrollLeft,top:e.scrollTop},a=t.left!==l.left,i=t.top!==l.top;(a||i)&&r(),t=l,o=window.requestAnimationFrame(n)}(),()=>window.cancelAnimationFrame(o)};function X(e,r){let o=(0,i.useCallbackRef)(e),n=t.useRef(0);return t.useEffect(()=>()=>window.clearTimeout(n.current),[]),t.useCallback(()=>{window.clearTimeout(n.current),n.current=window.setTimeout(o,r)},[o,r])}function Y(e,r){let t=(0,i.useCallbackRef)(r);(0,d.useLayoutEffect)(()=>{let r=0;if(e){let o=new ResizeObserver(()=>{cancelAnimationFrame(r),r=window.requestAnimationFrame(t)});return o.observe(e),()=>{window.cancelAnimationFrame(r),o.unobserve(e)}}},[e,t])}e.s(["Corner",0,D,"Root",0,x,"ScrollArea",0,x,"ScrollAreaCorner",0,D,"ScrollAreaScrollbar",0,y,"ScrollAreaThumb",0,L,"ScrollAreaViewport",0,v,"Scrollbar",0,y,"Thumb",0,L,"Viewport",0,v,"createScrollAreaScope",0,b],102931);var B=e.i(102931),B=B,F=e.i(843778);let M=t.forwardRef(({className:e,children:t,...o},n)=>(0,r.jsxs)(B.Root,{ref:n,className:(0,F.cn)("relative overflow-hidden",e),...o,children:[(0,r.jsx)(B.Viewport,{className:"h-full w-full rounded-[inherit]",children:t}),(0,r.jsx)(J,{}),(0,r.jsx)(B.Corner,{})]}));M.displayName=B.Root.displayName;let q=t.forwardRef(({className:e,children:t,...o},n)=>(0,r.jsx)(B.Viewport,{ref:n,className:(0,F.cn)("size-full rounded-[inherit]",e),...o,children:t}));q.displayName=B.Viewport.displayName;let J=t.forwardRef(({className:e,orientation:t="vertical",...o},n)=>(0,r.jsx)(B.ScrollAreaScrollbar,{ref:n,orientation:t,className:(0,F.cn)("flex touch-none select-none transition-colors","vertical"===t&&"h-full w-2.5 border-l border-l-transparent p-px","horizontal"===t&&"h-2.5 border-t border-t-transparent p-px",e),...o,children:(0,r.jsx)(B.ScrollAreaThumb,{className:"relative flex-1 rounded-full bg-border"})}));J.displayName=B.ScrollAreaScrollbar.displayName,e.s(["ScrollArea",0,M,"ScrollBar",0,J,"ScrollViewport",0,q],396831)},860990,e=>{"use strict";let r=(0,e.i(388019).default)("Plus",[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"M12 5v14",key:"s699le"}]]);e.s(["default",0,r])},544197,e=>{"use strict";var r=e.i(860990);e.s(["Plus",()=>r.default])}]);