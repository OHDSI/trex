(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},n={accordion:{variants:{default:{base:`
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
    `}};e.s(["default",0,n],305551);let a=(0,t.createContext)({theme:n});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(a);return r||(r=n.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},305607,e=>{"use strict";e.s(["clamp",0,function(e,[t,r]){return Math.min(r,Math.max(t,e))}])},594661,e=>{"use strict";var t=e.i(389959);e.s(["usePrevious",0,function(e){let r=t.useRef({value:e,previous:e});return t.useMemo(()=>(r.current.value!==e&&(r.current.previous=r.current.value,r.current.value=e),r.current.previous),[e])}])},130843,283342,e=>{"use strict";var t=e.i(478902),r=e.i(766181),o=e.i(370410),n=e.i(88816);let a=(0,e.i(388019).default)("ChevronUp",[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]]);e.s(["ChevronUp",0,a],283342);var l=e.i(389959),i=e.i(971131),s=e.i(305607),d=e.i(174617),c=e.i(295047),u=e.i(678001),p=e.i(274664),f=e.i(2664),m=e.i(735343),g=e.i(645499),x=e.i(130874),b=e.i(904641),h=e.i(940051),v=e.i(839518),w=e.i(546595),y=e.i(153545),S=e.i(746523),C=e.i(826524),_=e.i(503867),j=e.i(594661),k=e.i(608051),R=e.i(34345),I=e.i(453912),E=[" ","Enter","ArrowUp","ArrowDown"],N=[" ","Enter"],T="Select",[z,P,D]=(0,c.createCollection)(T),[L,H]=(0,p.createContextScope)(T,[D,h.createPopperScope]),A=(0,h.createPopperScope)(),[M,B]=L(T),[V,U]=L(T),O=e=>{let{__scopeSelect:r,children:o,open:n,defaultOpen:a,onOpenChange:i,value:s,defaultValue:d,onValueChange:c,dir:u,name:p,autoComplete:m,disabled:g,required:x,form:v}=e,w=A(r),[y,S]=l.useState(null),[_,j]=l.useState(null),[k,R]=l.useState(!1),I=(0,f.useDirection)(u),[E,N]=(0,C.useControllableState)({prop:n,defaultProp:a??!1,onChange:i,caller:T}),[P,D]=(0,C.useControllableState)({prop:s,defaultProp:d,onChange:c,caller:T}),L=l.useRef(null),H=!y||v||!!y.closest("form"),[B,U]=l.useState(new Set),O=Array.from(B).map(e=>e.props.value).join(";");return(0,t.jsx)(h.Root,{...w,children:(0,t.jsxs)(M,{required:x,scope:r,trigger:y,onTriggerChange:S,valueNode:_,onValueNodeChange:j,valueNodeHasChildren:k,onValueNodeHasChildrenChange:R,contentId:(0,b.useId)(),value:P,onValueChange:D,open:E,onOpenChange:N,dir:I,triggerPointerDownPosRef:L,disabled:g,children:[(0,t.jsx)(z.Provider,{scope:r,children:(0,t.jsx)(V,{scope:e.__scopeSelect,onNativeOptionAdd:l.useCallback(e=>{U(t=>new Set(t).add(e))},[]),onNativeOptionRemove:l.useCallback(e=>{U(t=>{let r=new Set(t);return r.delete(e),r})},[]),children:o})}),H?(0,t.jsxs)(eE,{"aria-hidden":!0,required:x,tabIndex:-1,name:p,autoComplete:m,value:P,onChange:e=>D(e.target.value),disabled:g,form:v,children:[void 0===P?(0,t.jsx)("option",{value:""}):null,Array.from(B)]},O):null]})})};O.displayName=T;var F="SelectTrigger",$=l.forwardRef((e,r)=>{let{__scopeSelect:o,disabled:n=!1,...a}=e,i=A(o),s=B(F,o),c=s.disabled||n,p=(0,u.useComposedRefs)(r,s.onTriggerChange),f=P(o),m=l.useRef("touch"),[g,x,b]=eT(e=>{let t=f().filter(e=>!e.disabled),r=t.find(e=>e.value===s.value),o=ez(t,e,r);void 0!==o&&s.onValueChange(o.value)}),v=e=>{c||(s.onOpenChange(!0),b()),e&&(s.triggerPointerDownPosRef.current={x:Math.round(e.pageX),y:Math.round(e.pageY)})};return(0,t.jsx)(h.Anchor,{asChild:!0,...i,children:(0,t.jsx)(w.Primitive.button,{type:"button",role:"combobox","aria-controls":s.contentId,"aria-expanded":s.open,"aria-required":s.required,"aria-autocomplete":"none",dir:s.dir,"data-state":s.open?"open":"closed",disabled:c,"data-disabled":c?"":void 0,"data-placeholder":eN(s.value)?"":void 0,...a,ref:p,onClick:(0,d.composeEventHandlers)(a.onClick,e=>{e.currentTarget.focus(),"mouse"!==m.current&&v(e)}),onPointerDown:(0,d.composeEventHandlers)(a.onPointerDown,e=>{m.current=e.pointerType;let t=e.target;t.hasPointerCapture(e.pointerId)&&t.releasePointerCapture(e.pointerId),0===e.button&&!1===e.ctrlKey&&"mouse"===e.pointerType&&(v(e),e.preventDefault())}),onKeyDown:(0,d.composeEventHandlers)(a.onKeyDown,e=>{let t=""!==g.current;e.ctrlKey||e.altKey||e.metaKey||1!==e.key.length||x(e.key),(!t||" "!==e.key)&&E.includes(e.key)&&(v(),e.preventDefault())})})})});$.displayName=F;var K="SelectValue",W=l.forwardRef((e,r)=>{let{__scopeSelect:o,className:n,style:a,children:l,placeholder:i="",...s}=e,d=B(K,o),{onValueNodeHasChildrenChange:c}=d,p=void 0!==l,f=(0,u.useComposedRefs)(r,d.onValueNodeChange);return(0,_.useLayoutEffect)(()=>{c(p)},[c,p]),(0,t.jsx)(w.Primitive.span,{...s,ref:f,style:{pointerEvents:"none"},children:eN(d.value)?(0,t.jsx)(t.Fragment,{children:i}):l})});W.displayName=K;var G=l.forwardRef((e,r)=>{let{__scopeSelect:o,children:n,...a}=e;return(0,t.jsx)(w.Primitive.span,{"aria-hidden":!0,...a,ref:r,children:n||"▼"})});G.displayName="SelectIcon";var q=e=>(0,t.jsx)(v.Portal,{asChild:!0,...e});q.displayName="SelectPortal";var Y="SelectContent",Z=l.forwardRef((e,r)=>{let o=B(Y,e.__scopeSelect),[n,a]=l.useState();return((0,_.useLayoutEffect)(()=>{a(new DocumentFragment)},[]),o.open)?(0,t.jsx)(ee,{...e,ref:r}):n?i.createPortal((0,t.jsx)(J,{scope:e.__scopeSelect,children:(0,t.jsx)(z.Slot,{scope:e.__scopeSelect,children:(0,t.jsx)("div",{children:e.children})})}),n):null});Z.displayName=Y;var[J,X]=L(Y),Q=(0,y.createSlot)("SelectContent.RemoveScroll"),ee=l.forwardRef((e,r)=>{let{__scopeSelect:o,position:n="item-aligned",onCloseAutoFocus:a,onEscapeKeyDown:i,onPointerDownOutside:s,side:c,sideOffset:p,align:f,alignOffset:b,arrowPadding:h,collisionBoundary:v,collisionPadding:w,sticky:y,hideWhenDetached:S,avoidCollisions:C,..._}=e,j=B(Y,o),[k,E]=l.useState(null),[N,T]=l.useState(null),z=(0,u.useComposedRefs)(r,e=>E(e)),[D,L]=l.useState(null),[H,A]=l.useState(null),M=P(o),[V,U]=l.useState(!1),O=l.useRef(!1);l.useEffect(()=>{if(k)return(0,R.hideOthers)(k)},[k]),(0,g.useFocusGuards)();let F=l.useCallback(e=>{let[t,...r]=M().map(e=>e.ref.current),[o]=r.slice(-1),n=document.activeElement;for(let r of e)if(r===n||(r?.scrollIntoView({block:"nearest"}),r===t&&N&&(N.scrollTop=0),r===o&&N&&(N.scrollTop=N.scrollHeight),r?.focus(),document.activeElement!==n))return},[M,N]),$=l.useCallback(()=>F([D,k]),[F,D,k]);l.useEffect(()=>{V&&$()},[V,$]);let{onOpenChange:K,triggerPointerDownPosRef:W}=j;l.useEffect(()=>{if(k){let e={x:0,y:0},t=t=>{e={x:Math.abs(Math.round(t.pageX)-(W.current?.x??0)),y:Math.abs(Math.round(t.pageY)-(W.current?.y??0))}},r=r=>{e.x<=10&&e.y<=10?r.preventDefault():k.contains(r.target)||K(!1),document.removeEventListener("pointermove",t),W.current=null};return null!==W.current&&(document.addEventListener("pointermove",t),document.addEventListener("pointerup",r,{capture:!0,once:!0})),()=>{document.removeEventListener("pointermove",t),document.removeEventListener("pointerup",r,{capture:!0})}}},[k,K,W]),l.useEffect(()=>{let e=()=>K(!1);return window.addEventListener("blur",e),window.addEventListener("resize",e),()=>{window.removeEventListener("blur",e),window.removeEventListener("resize",e)}},[K]);let[G,q]=eT(e=>{let t=M().filter(e=>!e.disabled),r=t.find(e=>e.ref.current===document.activeElement),o=ez(t,e,r);o&&setTimeout(()=>o.ref.current.focus())}),Z=l.useCallback((e,t,r)=>{let o=!O.current&&!r;(void 0!==j.value&&j.value===t||o)&&(L(e),o&&(O.current=!0))},[j.value]),X=l.useCallback(()=>k?.focus(),[k]),ee=l.useCallback((e,t,r)=>{let o=!O.current&&!r;(void 0!==j.value&&j.value===t||o)&&A(e)},[j.value]),eo="popper"===n?er:et,en=eo===er?{side:c,sideOffset:p,align:f,alignOffset:b,arrowPadding:h,collisionBoundary:v,collisionPadding:w,sticky:y,hideWhenDetached:S,avoidCollisions:C}:{};return(0,t.jsx)(J,{scope:o,content:k,viewport:N,onViewportChange:T,itemRefCallback:Z,selectedItem:D,onItemLeave:X,itemTextRefCallback:ee,focusSelectedItem:$,selectedItemText:H,position:n,isPositioned:V,searchRef:G,children:(0,t.jsx)(I.RemoveScroll,{as:Q,allowPinchZoom:!0,children:(0,t.jsx)(x.FocusScope,{asChild:!0,trapped:j.open,onMountAutoFocus:e=>{e.preventDefault()},onUnmountAutoFocus:(0,d.composeEventHandlers)(a,e=>{j.trigger?.focus({preventScroll:!0}),e.preventDefault()}),children:(0,t.jsx)(m.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!0,onEscapeKeyDown:i,onPointerDownOutside:s,onFocusOutside:e=>e.preventDefault(),onDismiss:()=>j.onOpenChange(!1),children:(0,t.jsx)(eo,{role:"listbox",id:j.contentId,"data-state":j.open?"open":"closed",dir:j.dir,onContextMenu:e=>e.preventDefault(),..._,...en,onPlaced:()=>U(!0),ref:z,style:{display:"flex",flexDirection:"column",outline:"none",..._.style},onKeyDown:(0,d.composeEventHandlers)(_.onKeyDown,e=>{let t=e.ctrlKey||e.altKey||e.metaKey;if("Tab"===e.key&&e.preventDefault(),t||1!==e.key.length||q(e.key),["ArrowUp","ArrowDown","Home","End"].includes(e.key)){let t=M().filter(e=>!e.disabled).map(e=>e.ref.current);if(["ArrowUp","End"].includes(e.key)&&(t=t.slice().reverse()),["ArrowUp","ArrowDown"].includes(e.key)){let r=e.target,o=t.indexOf(r);t=t.slice(o+1)}setTimeout(()=>F(t)),e.preventDefault()}})})})})})})});ee.displayName="SelectContentImpl";var et=l.forwardRef((e,r)=>{let{__scopeSelect:o,onPlaced:n,...a}=e,i=B(Y,o),d=X(Y,o),[c,p]=l.useState(null),[f,m]=l.useState(null),g=(0,u.useComposedRefs)(r,e=>m(e)),x=P(o),b=l.useRef(!1),h=l.useRef(!0),{viewport:v,selectedItem:y,selectedItemText:S,focusSelectedItem:C}=d,j=l.useCallback(()=>{if(i.trigger&&i.valueNode&&c&&f&&v&&y&&S){let e=i.trigger.getBoundingClientRect(),t=f.getBoundingClientRect(),r=i.valueNode.getBoundingClientRect(),o=S.getBoundingClientRect();if("rtl"!==i.dir){let n=o.left-t.left,a=r.left-n,l=e.left-a,i=e.width+l,d=Math.max(i,t.width),u=window.innerWidth-10,p=(0,s.clamp)(a,[10,Math.max(10,u-d)]);c.style.minWidth=i+"px",c.style.left=p+"px"}else{let n=t.right-o.right,a=window.innerWidth-r.right-n,l=window.innerWidth-e.right-a,i=e.width+l,d=Math.max(i,t.width),u=window.innerWidth-10,p=(0,s.clamp)(a,[10,Math.max(10,u-d)]);c.style.minWidth=i+"px",c.style.right=p+"px"}let a=x(),l=window.innerHeight-20,d=v.scrollHeight,u=window.getComputedStyle(f),p=parseInt(u.borderTopWidth,10),m=parseInt(u.paddingTop,10),g=parseInt(u.borderBottomWidth,10),h=p+m+d+parseInt(u.paddingBottom,10)+g,w=Math.min(5*y.offsetHeight,h),C=window.getComputedStyle(v),_=parseInt(C.paddingTop,10),j=parseInt(C.paddingBottom,10),k=e.top+e.height/2-10,R=y.offsetHeight/2,I=p+m+(y.offsetTop+R);if(I<=k){let e=a.length>0&&y===a[a.length-1].ref.current;c.style.bottom="0px";let t=Math.max(l-k,R+(e?j:0)+(f.clientHeight-v.offsetTop-v.offsetHeight)+g);c.style.height=I+t+"px"}else{let e=a.length>0&&y===a[0].ref.current;c.style.top="0px";let t=Math.max(k,p+v.offsetTop+(e?_:0)+R);c.style.height=t+(h-I)+"px",v.scrollTop=I-k+v.offsetTop}c.style.margin="10px 0",c.style.minHeight=w+"px",c.style.maxHeight=l+"px",n?.(),requestAnimationFrame(()=>b.current=!0)}},[x,i.trigger,i.valueNode,c,f,v,y,S,i.dir,n]);(0,_.useLayoutEffect)(()=>j(),[j]);let[k,R]=l.useState();(0,_.useLayoutEffect)(()=>{f&&R(window.getComputedStyle(f).zIndex)},[f]);let I=l.useCallback(e=>{e&&!0===h.current&&(j(),C?.(),h.current=!1)},[j,C]);return(0,t.jsx)(eo,{scope:o,contentWrapper:c,shouldExpandOnScrollRef:b,onScrollButtonChange:I,children:(0,t.jsx)("div",{ref:p,style:{display:"flex",flexDirection:"column",position:"fixed",zIndex:k},children:(0,t.jsx)(w.Primitive.div,{...a,ref:g,style:{boxSizing:"border-box",maxHeight:"100%",...a.style}})})})});et.displayName="SelectItemAlignedPosition";var er=l.forwardRef((e,r)=>{let{__scopeSelect:o,align:n="start",collisionPadding:a=10,...l}=e,i=A(o);return(0,t.jsx)(h.Content,{...i,...l,ref:r,align:n,collisionPadding:a,style:{boxSizing:"border-box",...l.style,"--radix-select-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-select-content-available-width":"var(--radix-popper-available-width)","--radix-select-content-available-height":"var(--radix-popper-available-height)","--radix-select-trigger-width":"var(--radix-popper-anchor-width)","--radix-select-trigger-height":"var(--radix-popper-anchor-height)"}})});er.displayName="SelectPopperPosition";var[eo,en]=L(Y,{}),ea="SelectViewport",el=l.forwardRef((e,r)=>{let{__scopeSelect:o,nonce:n,...a}=e,i=X(ea,o),s=en(ea,o),c=(0,u.useComposedRefs)(r,i.onViewportChange),p=l.useRef(0);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("style",{dangerouslySetInnerHTML:{__html:"[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}"},nonce:n}),(0,t.jsx)(z.Slot,{scope:o,children:(0,t.jsx)(w.Primitive.div,{"data-radix-select-viewport":"",role:"presentation",...a,ref:c,style:{position:"relative",flex:1,overflow:"hidden auto",...a.style},onScroll:(0,d.composeEventHandlers)(a.onScroll,e=>{let t=e.currentTarget,{contentWrapper:r,shouldExpandOnScrollRef:o}=s;if(o?.current&&r){let e=Math.abs(p.current-t.scrollTop);if(e>0){let o=window.innerHeight-20,n=Math.max(parseFloat(r.style.minHeight),parseFloat(r.style.height));if(n<o){let a=n+e,l=Math.min(o,a),i=a-l;r.style.height=l+"px","0px"===r.style.bottom&&(t.scrollTop=i>0?i:0,r.style.justifyContent="flex-end")}}}p.current=t.scrollTop})})})]})});el.displayName=ea;var ei="SelectGroup",[es,ed]=L(ei),ec=l.forwardRef((e,r)=>{let{__scopeSelect:o,...n}=e,a=(0,b.useId)();return(0,t.jsx)(es,{scope:o,id:a,children:(0,t.jsx)(w.Primitive.div,{role:"group","aria-labelledby":a,...n,ref:r})})});ec.displayName=ei;var eu="SelectLabel",ep=l.forwardRef((e,r)=>{let{__scopeSelect:o,...n}=e,a=ed(eu,o);return(0,t.jsx)(w.Primitive.div,{id:a.id,...n,ref:r})});ep.displayName=eu;var ef="SelectItem",[em,eg]=L(ef),ex=l.forwardRef((e,r)=>{let{__scopeSelect:o,value:n,disabled:a=!1,textValue:i,...s}=e,c=B(ef,o),p=X(ef,o),f=c.value===n,[m,g]=l.useState(i??""),[x,h]=l.useState(!1),v=(0,u.useComposedRefs)(r,e=>p.itemRefCallback?.(e,n,a)),y=(0,b.useId)(),S=l.useRef("touch"),C=()=>{a||(c.onValueChange(n),c.onOpenChange(!1))};if(""===n)throw Error("A <Select.Item /> must have a value prop that is not an empty string. This is because the Select value can be set to an empty string to clear the selection and show the placeholder.");return(0,t.jsx)(em,{scope:o,value:n,disabled:a,textId:y,isSelected:f,onItemTextChange:l.useCallback(e=>{g(t=>t||(e?.textContent??"").trim())},[]),children:(0,t.jsx)(z.ItemSlot,{scope:o,value:n,disabled:a,textValue:m,children:(0,t.jsx)(w.Primitive.div,{role:"option","aria-labelledby":y,"data-highlighted":x?"":void 0,"aria-selected":f&&x,"data-state":f?"checked":"unchecked","aria-disabled":a||void 0,"data-disabled":a?"":void 0,tabIndex:a?void 0:-1,...s,ref:v,onFocus:(0,d.composeEventHandlers)(s.onFocus,()=>h(!0)),onBlur:(0,d.composeEventHandlers)(s.onBlur,()=>h(!1)),onClick:(0,d.composeEventHandlers)(s.onClick,()=>{"mouse"!==S.current&&C()}),onPointerUp:(0,d.composeEventHandlers)(s.onPointerUp,()=>{"mouse"===S.current&&C()}),onPointerDown:(0,d.composeEventHandlers)(s.onPointerDown,e=>{S.current=e.pointerType}),onPointerMove:(0,d.composeEventHandlers)(s.onPointerMove,e=>{S.current=e.pointerType,a?p.onItemLeave?.():"mouse"===S.current&&e.currentTarget.focus({preventScroll:!0})}),onPointerLeave:(0,d.composeEventHandlers)(s.onPointerLeave,e=>{e.currentTarget===document.activeElement&&p.onItemLeave?.()}),onKeyDown:(0,d.composeEventHandlers)(s.onKeyDown,e=>{(p.searchRef?.current===""||" "!==e.key)&&(N.includes(e.key)&&C()," "===e.key&&e.preventDefault())})})})})});ex.displayName=ef;var eb="SelectItemText",eh=l.forwardRef((e,r)=>{let{__scopeSelect:o,className:n,style:a,...s}=e,d=B(eb,o),c=X(eb,o),p=eg(eb,o),f=U(eb,o),[m,g]=l.useState(null),x=(0,u.useComposedRefs)(r,e=>g(e),p.onItemTextChange,e=>c.itemTextRefCallback?.(e,p.value,p.disabled)),b=m?.textContent,h=l.useMemo(()=>(0,t.jsx)("option",{value:p.value,disabled:p.disabled,children:b},p.value),[p.disabled,p.value,b]),{onNativeOptionAdd:v,onNativeOptionRemove:y}=f;return(0,_.useLayoutEffect)(()=>(v(h),()=>y(h)),[v,y,h]),(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(w.Primitive.span,{id:p.textId,...s,ref:x}),p.isSelected&&d.valueNode&&!d.valueNodeHasChildren?i.createPortal(s.children,d.valueNode):null]})});eh.displayName=eb;var ev="SelectItemIndicator",ew=l.forwardRef((e,r)=>{let{__scopeSelect:o,...n}=e;return eg(ev,o).isSelected?(0,t.jsx)(w.Primitive.span,{"aria-hidden":!0,...n,ref:r}):null});ew.displayName=ev;var ey="SelectScrollUpButton",eS=l.forwardRef((e,r)=>{let o=X(ey,e.__scopeSelect),n=en(ey,e.__scopeSelect),[a,i]=l.useState(!1),s=(0,u.useComposedRefs)(r,n.onScrollButtonChange);return(0,_.useLayoutEffect)(()=>{if(o.viewport&&o.isPositioned){let e=function(){i(t.scrollTop>0)},t=o.viewport;return e(),t.addEventListener("scroll",e),()=>t.removeEventListener("scroll",e)}},[o.viewport,o.isPositioned]),a?(0,t.jsx)(ej,{...e,ref:s,onAutoScroll:()=>{let{viewport:e,selectedItem:t}=o;e&&t&&(e.scrollTop=e.scrollTop-t.offsetHeight)}}):null});eS.displayName=ey;var eC="SelectScrollDownButton",e_=l.forwardRef((e,r)=>{let o=X(eC,e.__scopeSelect),n=en(eC,e.__scopeSelect),[a,i]=l.useState(!1),s=(0,u.useComposedRefs)(r,n.onScrollButtonChange);return(0,_.useLayoutEffect)(()=>{if(o.viewport&&o.isPositioned){let e=function(){let e=t.scrollHeight-t.clientHeight;i(Math.ceil(t.scrollTop)<e)},t=o.viewport;return e(),t.addEventListener("scroll",e),()=>t.removeEventListener("scroll",e)}},[o.viewport,o.isPositioned]),a?(0,t.jsx)(ej,{...e,ref:s,onAutoScroll:()=>{let{viewport:e,selectedItem:t}=o;e&&t&&(e.scrollTop=e.scrollTop+t.offsetHeight)}}):null});e_.displayName=eC;var ej=l.forwardRef((e,r)=>{let{__scopeSelect:o,onAutoScroll:n,...a}=e,i=X("SelectScrollButton",o),s=l.useRef(null),c=P(o),u=l.useCallback(()=>{null!==s.current&&(window.clearInterval(s.current),s.current=null)},[]);return l.useEffect(()=>()=>u(),[u]),(0,_.useLayoutEffect)(()=>{let e=c().find(e=>e.ref.current===document.activeElement);e?.ref.current?.scrollIntoView({block:"nearest"})},[c]),(0,t.jsx)(w.Primitive.div,{"aria-hidden":!0,...a,ref:r,style:{flexShrink:0,...a.style},onPointerDown:(0,d.composeEventHandlers)(a.onPointerDown,()=>{null===s.current&&(s.current=window.setInterval(n,50))}),onPointerMove:(0,d.composeEventHandlers)(a.onPointerMove,()=>{i.onItemLeave?.(),null===s.current&&(s.current=window.setInterval(n,50))}),onPointerLeave:(0,d.composeEventHandlers)(a.onPointerLeave,()=>{u()})})}),ek=l.forwardRef((e,r)=>{let{__scopeSelect:o,...n}=e;return(0,t.jsx)(w.Primitive.div,{"aria-hidden":!0,...n,ref:r})});ek.displayName="SelectSeparator";var eR="SelectArrow",eI=l.forwardRef((e,r)=>{let{__scopeSelect:o,...n}=e,a=A(o),l=B(eR,o),i=X(eR,o);return l.open&&"popper"===i.position?(0,t.jsx)(h.Arrow,{...a,...n,ref:r}):null});eI.displayName=eR;var eE=l.forwardRef(({__scopeSelect:e,value:r,...o},n)=>{let a=l.useRef(null),i=(0,u.useComposedRefs)(n,a),s=(0,j.usePrevious)(r);return l.useEffect(()=>{let e=a.current;if(!e)return;let t=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,"value").set;if(s!==r&&t){let o=new Event("change",{bubbles:!0});t.call(e,r),e.dispatchEvent(o)}},[s,r]),(0,t.jsx)(w.Primitive.select,{...o,style:{...k.VISUALLY_HIDDEN_STYLES,...o.style},ref:i,defaultValue:r})});function eN(e){return""===e||void 0===e}function eT(e){let t=(0,S.useCallbackRef)(e),r=l.useRef(""),o=l.useRef(0),n=l.useCallback(e=>{let n=r.current+e;t(n),function e(t){r.current=t,window.clearTimeout(o.current),""!==t&&(o.current=window.setTimeout(()=>e(""),1e3))}(n)},[t]),a=l.useCallback(()=>{r.current="",window.clearTimeout(o.current)},[]);return l.useEffect(()=>()=>window.clearTimeout(o.current),[]),[r,n,a]}function ez(e,t,r){var o,n;let a=t.length>1&&Array.from(t).every(e=>e===t[0])?t[0]:t,l=r?e.indexOf(r):-1,i=(o=e,n=Math.max(l,0),o.map((e,t)=>o[(n+t)%o.length]));1===a.length&&(i=i.filter(e=>e!==r));let s=i.find(e=>e.textValue.toLowerCase().startsWith(a.toLowerCase()));return s!==r?s:void 0}eE.displayName="SelectBubbleInput",e.s(["Arrow",0,eI,"Content",0,Z,"Group",0,ec,"Icon",0,G,"Item",0,ex,"ItemIndicator",0,ew,"ItemText",0,eh,"Label",0,ep,"Portal",0,q,"Root",0,O,"ScrollDownButton",0,e_,"ScrollUpButton",0,eS,"Select",0,O,"SelectArrow",0,eI,"SelectContent",0,Z,"SelectGroup",0,ec,"SelectIcon",0,G,"SelectItem",0,ex,"SelectItemIndicator",0,ew,"SelectItemText",0,eh,"SelectLabel",0,ep,"SelectPortal",0,q,"SelectScrollDownButton",0,e_,"SelectScrollUpButton",0,eS,"SelectSeparator",0,ek,"SelectTrigger",0,$,"SelectValue",0,W,"SelectViewport",0,el,"Separator",0,ek,"Trigger",0,$,"Value",0,W,"Viewport",0,el,"createSelectScope",0,H],147395);var eP=e.i(147395),eP=eP,eD=e.i(282410),eL=e.i(843778);let eH=eP.Root,eA=eP.Group,eM=l.forwardRef(({placeholder:e,...r},o)=>(0,t.jsx)(eP.Value,{placeholder:"string"==typeof e?(0,t.jsx)("span",{children:e}):e,...r,ref:o}));eM.displayName=eP.Value.displayName;let eB=(0,r.cva)("",{variants:{size:{...eD.SIZE_VARIANTS}},defaultVariants:{size:eD.SIZE_VARIANTS_DEFAULT}}),eV=l.forwardRef(({className:e,children:r,size:o,...a},l)=>(0,t.jsxs)(eP.Trigger,{ref:l,className:(0,eL.cn)("flex w-full items-center justify-between rounded-md border border-strong hover:border-stronger bg-alternative dark:bg-muted hover:bg-selection text-xs ring-offset-background-control data-[placeholder]:text-foreground-lighter focus:outline-hidden ring-border-control focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200","data-[state=open]:bg-selection data-[state=open]:border-stronger","gap-2","[&>span]:truncate text-left",eB({size:o}),e),tabIndex:0,...a,children:[r,(0,t.jsx)(eP.Icon,{asChild:!0,children:(0,t.jsx)(n.ChevronDown,{className:"h-4 w-4 text-foreground-lighter shrink-0",strokeWidth:1.5})})]}));eV.displayName=eP.Trigger.displayName;let eU=l.forwardRef(({className:e,...r},o)=>(0,t.jsx)(eP.ScrollUpButton,{ref:o,className:(0,eL.cn)("flex cursor-default items-center justify-center py-1 text-foreground-muted",e),...r,children:(0,t.jsx)(a,{className:"h-4 w-4"})}));eU.displayName=eP.ScrollUpButton.displayName;let eO=l.forwardRef(({className:e,...r},o)=>(0,t.jsx)(eP.ScrollDownButton,{ref:o,className:(0,eL.cn)("flex cursor-default items-center justify-center py-1 text-foreground-muted",e),...r,children:(0,t.jsx)(n.ChevronDown,{className:"h-4 w-4"})}));eO.displayName=eP.ScrollDownButton.displayName;let eF=l.forwardRef(({className:e,children:r,position:o="popper",...n},a)=>(0,t.jsx)(eP.Portal,{children:(0,t.jsxs)(eP.Content,{ref:a,className:(0,eL.cn)("relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border bg-overlay text-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2","popper"===o&&"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",e),position:o,...n,children:[(0,t.jsx)(eU,{}),(0,t.jsx)(eP.Viewport,{className:(0,eL.cn)("p-1","popper"===o&&"h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)"),children:r}),(0,t.jsx)(eO,{})]})}));eF.displayName=eP.Content.displayName;let e$=l.forwardRef(({className:e,...r},o)=>(0,t.jsx)(eP.Label,{ref:o,className:(0,eL.cn)("py-1.5 pl-8 pr-2 text-xs text-foreground-lighter/75 uppercase tracking-wider font-mono",e),...r}));e$.displayName=eP.Label.displayName;let eK=l.forwardRef(({className:e,children:r,...n},a)=>(0,t.jsxs)(eP.Item,{ref:a,className:(0,eL.cn)("group","relative flex w-full cursor-default select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-sm outline-hidden focus:bg-overlay-hover text-foreground-light focus:text-foreground data-[state=checked]:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",e),...n,children:[(0,t.jsx)("span",{className:"absolute left-2 flex h-3.5 w-3.5 items-center justify-center",children:(0,t.jsx)(eP.ItemIndicator,{className:"h-3.5 w-3.5 bg-foreground rounded-full flex justify-center items-center",children:(0,t.jsx)(o.Check,{className:"h-2 w-2 text-background-overlay",strokeWidth:6})})}),(0,t.jsx)(eP.ItemText,{children:"string"==typeof r?(0,t.jsx)("span",{children:r}):r})]}));eK.displayName=eP.Item.displayName;let eW=l.forwardRef(({className:e,...r},o)=>(0,t.jsx)(eP.Separator,{ref:o,className:(0,eL.cn)("-mx-1 my-1 h-px bg-border-overlay",e),...r}));eW.displayName=eP.Separator.displayName,e.s(["Select",0,eH,"SelectContent",0,eF,"SelectGroup",0,eA,"SelectItem",0,eK,"SelectLabel",0,e$,"SelectScrollDownButton",0,eO,"SelectScrollUpButton",0,eU,"SelectSeparator",0,eW,"SelectTrigger",0,eV,"SelectValue",0,eM],130843)}]);