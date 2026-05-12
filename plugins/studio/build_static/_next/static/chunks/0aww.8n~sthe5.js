(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,585915,e=>{"use strict";let t=(0,e.i(388019).default)("Loader",[["path",{d:"M12 2v4",key:"3427ic"}],["path",{d:"m16.2 7.8 2.9-2.9",key:"r700ao"}],["path",{d:"M18 12h4",key:"wj9ykh"}],["path",{d:"m16.2 16.2 2.9 2.9",key:"1bxg5t"}],["path",{d:"M12 18v4",key:"jadmvz"}],["path",{d:"m4.9 19.1 2.9-2.9",key:"bwix9q"}],["path",{d:"M2 12h4",key:"j09sii"}],["path",{d:"m4.9 4.9 2.9 2.9",key:"giyufr"}]]);e.s(["Loader",0,t],585915)},592383,e=>{"use strict";var t=e.i(478902),r=e.i(755146),n=e.i(861833),o=e.i(843778),i=e.i(937942);let a=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),l=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),s=({href:e,children:r})=>(0,t.jsx)(i.InlineLink,{href:e??"/",children:r});e.s(["Markdown",0,({children:e,className:i,content:d="",extLinks:u=!1,...c})=>(0,t.jsx)("div",{className:(0,o.cn)("text-sm",i),children:(0,t.jsx)(r.default,{remarkPlugins:[n.default],components:{h3:a,code:l,a:s},...c,children:e??d})})])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},n={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},o={accordion:{variants:{default:{base:`
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
      `},block:"w-full flex items-center justify-center",size:{...n},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
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
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `,size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),n=e.i(389959),o=e.i(843778),i=e.i(375761),a=e.i(231665),l=e.i(938933);let s=(0,n.forwardRef)(({copy:e,showCopyOnHover:s=!1,icon:d,reveal:u=!1,actions:c,onCopy:f,iconContainerClassName:p,containerClassName:g,size:m="small",...b},h)=>{let[x,v]=(0,n.useState)("Copy"),[y,w]=(0,n.useState)(!0),j=(0,l.default)("input"),_=[];return m&&_.push(j.size[m]),(0,t.jsxs)(a.InputGroup,{className:g,children:[(0,t.jsx)(a.InputGroupInput,{ref:h,onFocus:e=>e.target.select(),...b,size:m,onCopy:f,type:u&&y?"password":b.type,disabled:b.disabled,className:(0,o.cn)(..._,b.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(a.InputGroupAddon,{align:"inline-start",children:d}),e||c?(0,t.jsxs)(a.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(u&&y)?(0,t.jsx)(a.InputGroupButton,{size:"tiny",type:"default",className:(0,o.cn)(s&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=b.value,void(0,i.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),f?.()})},children:x}):null,u&&y?(0,t.jsx)(a.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,c&&c]}):null]})});e.s(["Input",0,s])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},836764,e=>{e.v({dash:"loading-anim-module__T3MC1q__dash",loading:"loading-anim-module__T3MC1q__loading"})},724945,e=>{"use strict";var t=e.i(478902),r=e.i(836764);e.s(["default",0,()=>(0,t.jsx)("div",{className:"w-full h-full flex flex-col items-center justify-center",children:(0,t.jsx)("div",{children:(0,t.jsx)("svg",{width:"60",height:"62",viewBox:"0 0 60 62",fill:"none",xmlns:"http://www.w3.org/2000/svg",className:r.default.loading,children:(0,t.jsx)("path",{d:"M30.2571 4.12811L30.257 4.12389C30.2133 1.21067 26.5349 -0.034778 24.7224 2.24311L1.76109 31.0996C-1.21104 34.8348 1.45637 40.34 6.23131 40.34H29.4845L29.7563 58.4432C29.8 61.3564 33.4783 62.6016 35.2908 60.324L34.8996 60.0127L35.2908 60.324L58.2521 31.4674C61.2241 27.7322 58.5568 22.227 53.782 22.227H30.3762L30.2571 4.12811Z",stroke:"hsl(var(--brand-default))",strokeWidth:2,strokeLinecap:"round"})})})})])},818843,e=>{"use strict";var t=e.i(724945);e.s(["LogoLoader",()=>t.default])},71049,e=>{"use strict";var t,r=e.i(478902),n=e.i(389959),o=e.i(174617),i=e.i(274664),a=e.i(826524),l=e.i(678001),s=e.i(940051),d=e.i(839518),u=e.i(889251),c=e.i(546595),f=e.i(735343),p="HoverCard",[g,m]=(0,i.createContextScope)(p,[s.createPopperScope]),b=(0,s.createPopperScope)(),[h,x]=g(p),v=e=>{let{__scopeHoverCard:t,children:o,open:i,defaultOpen:l,onOpenChange:d,openDelay:u=700,closeDelay:c=300}=e,f=b(t),g=n.useRef(0),m=n.useRef(0),x=n.useRef(!1),v=n.useRef(!1),[y,w]=(0,a.useControllableState)({prop:i,defaultProp:l??!1,onChange:d,caller:p}),j=n.useCallback(()=>{clearTimeout(m.current),g.current=window.setTimeout(()=>w(!0),u)},[u,w]),_=n.useCallback(()=>{clearTimeout(g.current),x.current||v.current||(m.current=window.setTimeout(()=>w(!1),c))},[c,w]),O=n.useCallback(()=>w(!1),[w]);return n.useEffect(()=>()=>{clearTimeout(g.current),clearTimeout(m.current)},[]),(0,r.jsx)(h,{scope:t,open:y,onOpenChange:w,onOpen:j,onClose:_,onDismiss:O,hasSelectionRef:x,isPointerDownOnContentRef:v,children:(0,r.jsx)(s.Root,{...f,children:o})})};v.displayName=p;var y="HoverCardTrigger",w=n.forwardRef((e,t)=>{let{__scopeHoverCard:n,...i}=e,a=x(y,n),l=b(n);return(0,r.jsx)(s.Anchor,{asChild:!0,...l,children:(0,r.jsx)(c.Primitive.a,{"data-state":a.open?"open":"closed",...i,ref:t,onPointerEnter:(0,o.composeEventHandlers)(e.onPointerEnter,P(a.onOpen)),onPointerLeave:(0,o.composeEventHandlers)(e.onPointerLeave,P(a.onClose)),onFocus:(0,o.composeEventHandlers)(e.onFocus,a.onOpen),onBlur:(0,o.composeEventHandlers)(e.onBlur,a.onClose),onTouchStart:(0,o.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});w.displayName=y;var j="HoverCardPortal",[_,O]=g(j,{forceMount:void 0}),C=e=>{let{__scopeHoverCard:t,forceMount:n,children:o,container:i}=e,a=x(j,t);return(0,r.jsx)(_,{scope:t,forceMount:n,children:(0,r.jsx)(u.Presence,{present:n||a.open,children:(0,r.jsx)(d.Portal,{asChild:!0,container:i,children:o})})})};C.displayName=j;var k="HoverCardContent",E=n.forwardRef((e,t)=>{let n=O(k,e.__scopeHoverCard),{forceMount:i=n.forceMount,...a}=e,l=x(k,e.__scopeHoverCard);return(0,r.jsx)(u.Presence,{present:i||l.open,children:(0,r.jsx)(z,{"data-state":l.open?"open":"closed",...a,onPointerEnter:(0,o.composeEventHandlers)(e.onPointerEnter,P(l.onOpen)),onPointerLeave:(0,o.composeEventHandlers)(e.onPointerLeave,P(l.onClose)),ref:t})})});E.displayName=k;var z=n.forwardRef((e,i)=>{let{__scopeHoverCard:a,onEscapeKeyDown:d,onPointerDownOutside:u,onFocusOutside:c,onInteractOutside:p,...g}=e,m=x(k,a),h=b(a),v=n.useRef(null),y=(0,l.useComposedRefs)(i,v),[w,j]=n.useState(!1);return n.useEffect(()=>{if(w){let e=document.body;return t=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=t,e.style.webkitUserSelect=t}}},[w]),n.useEffect(()=>{if(v.current){let e=()=>{j(!1),m.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(m.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),m.hasSelectionRef.current=!1,m.isPointerDownOnContentRef.current=!1}}},[m.isPointerDownOnContentRef,m.hasSelectionRef]),n.useEffect(()=>{v.current&&(function(e){let t=[],r=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;r.nextNode();)t.push(r.currentNode);return t})(v.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,r.jsx)(f.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:p,onEscapeKeyDown:d,onPointerDownOutside:u,onFocusOutside:(0,o.composeEventHandlers)(c,e=>{e.preventDefault()}),onDismiss:m.onDismiss,children:(0,r.jsx)(s.Content,{...h,...g,onPointerDown:(0,o.composeEventHandlers)(g.onPointerDown,e=>{e.currentTarget.contains(e.target)&&j(!0),m.hasSelectionRef.current=!1,m.isPointerDownOnContentRef.current=!0}),ref:y,style:{...g.style,userSelect:w?"text":void 0,WebkitUserSelect:w?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),M=n.forwardRef((e,t)=>{let{__scopeHoverCard:n,...o}=e,i=b(n);return(0,r.jsx)(s.Arrow,{...i,...o,ref:t})});function P(e){return t=>"touch"===t.pointerType?void 0:e()}M.displayName="HoverCardArrow",e.s(["Arrow",0,M,"Content",0,E,"HoverCard",0,v,"HoverCardArrow",0,M,"HoverCardContent",0,E,"HoverCardPortal",0,C,"HoverCardTrigger",0,w,"Portal",0,C,"Root",0,v,"Trigger",0,w,"createHoverCardScope",0,m],73929);var S=e.i(73929),S=S,R=e.i(843778);let T=S.Root,L=S.Trigger,N=n.forwardRef(({className:e,align:t="center",animate:n="zoom-in",sideOffset:o=4,...i},a)=>(0,r.jsx)(S.Portal,{children:(0,r.jsx)(S.Content,{ref:a,align:t,sideOffset:o,className:(0,R.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===n?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...i})}));N.displayName=S.Content.displayName,e.s(["HoverCard",0,T,"HoverCardContent",0,N,"HoverCardTrigger",0,L],71049)},68205,e=>{"use strict";let t=e=>Array.from(new Set(e)).sort();e.s(["edgeFunctionsKeys",0,{list:e=>["projects",e,"edge-functions"],lastHourStats:(e,r=[])=>["projects",e,"edge-functions","last-hour-stats",t(r)],detail:(e,t)=>["projects",e,"edge-function",t,"detail"],body:(e,t)=>["projects",e,"edge-function",t,"body"]},"normalizeFunctionIds",0,t])},240788,e=>{"use strict";var t=e.i(242882),r=e.i(68205),n=e.i(234745);async function o({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:r,error:i}=await (0,n.get)("/v1/projects/{ref}/functions",{params:{path:{ref:e}},signal:t});return i&&(0,n.handleError)(i),r}e.s(["useEdgeFunctionsQuery",0,({projectRef:e},{enabled:n=!0,...i}={})=>(0,t.useQuery)({queryKey:r.edgeFunctionsKeys.list(e),queryFn:({signal:t})=>o({projectRef:e},t),enabled:n&&void 0!==e,...i})])},156054,350660,e=>{"use strict";function t(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,n)}return r}function r(e){for(var r=1;r<arguments.length;r++){var n=null!=arguments[r]?arguments[r]:{};r%2?t(Object(n),!0).forEach(function(t){var r;r=n[t],t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):t(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function n(e,t){(null==t||t>e.length)&&(t=e.length);for(var r=0,n=Array(t);r<t;r++)n[r]=e[r];return n}function o(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,n)}return r}function i(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?o(Object(r),!0).forEach(function(t){var n;n=r[t],t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):o(Object(r)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))})}return e}function a(e){return function t(){for(var r=this,n=arguments.length,o=Array(n),i=0;i<n;i++)o[i]=arguments[i];return o.length>=e.length?e.apply(this,o):function(){for(var e=arguments.length,n=Array(e),i=0;i<e;i++)n[i]=arguments[i];return t.apply(r,[].concat(o,n))}}}function l(e){return({}).toString.call(e).includes("Object")}function s(e){return"function"==typeof e}var d,u,c=a(function(e,t){throw Error(e[t]||e.default)})({initialIsRequired:"initial state is required",initialType:"initial state should be an object",initialContent:"initial state shouldn't be an empty object",handlerType:"handler should be an object or a function",handlersType:"all handlers should be a functions",selectorType:"selector should be a function",changeType:"provided value of changes should be an object",changeField:'it seams you want to change a field in the state which is not specified in the "initial" state',default:"an unknown error accured in `state-local` package"}),f=function(e,t){return l(t)||c("changeType"),Object.keys(t).some(function(t){return!Object.prototype.hasOwnProperty.call(e,t)})&&c("changeField"),t},p=function(e){s(e)||c("selectorType")},g=function(e){s(e)||l(e)||c("handlerType"),l(e)&&Object.values(e).some(function(e){return!s(e)})&&c("handlersType")},m=function(e){e||c("initialIsRequired"),l(e)||c("initialType"),Object.keys(e).length||c("initialContent")};function b(e,t){return s(t)?t(e.current):t}function h(e,t){return e.current=i(i({},e.current),t),t}function x(e,t,r){return s(t)?t(e.current):Object.keys(r).forEach(function(r){var n;return null==(n=t[r])?void 0:n.call(t,e.current[r])}),r}var v={configIsRequired:"the configuration object is required",configType:"the configuration object should be an object",default:"an unknown error accured in `@monaco-editor/loader` package",deprecation:"Deprecation warning!\n    You are using deprecated way of configuration.\n\n    Instead of using\n      monaco.config({ urls: { monacoBase: '...' } })\n    use\n      monaco.config({ paths: { vs: '...' } })\n\n    For more please check the link https://github.com/suren-atoyan/monaco-loader#config\n  "},y=(d=function(e,t){throw Error(e[t]||e.default)},function e(){for(var t=this,r=arguments.length,n=Array(r),o=0;o<r;o++)n[o]=arguments[o];return n.length>=d.length?d.apply(this,n):function(){for(var r=arguments.length,o=Array(r),i=0;i<r;i++)o[i]=arguments[i];return e.apply(t,[].concat(n,o))}})(v);let w=function(e){return(e||y("configIsRequired"),({}).toString.call(e).includes("Object")||y("configType"),e.urls)?(console.warn(v.deprecation),{paths:{vs:e.urls.monacoBase}}):e},j=function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}};var _={type:"cancelation",msg:"operation is manually canceled"};let O=function(e){var t=!1,r=new Promise(function(r,n){e.then(function(e){return t?n(_):r(e)}),e.catch(n)});return r.cancel=function(){return t=!0},r};var C=function(e){if(Array.isArray(e))return e}(u=({create:function(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};m(e),g(t);var r={current:e},n=a(x)(r,t),o=a(h)(r),i=a(f)(e),l=a(b)(r);return[function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:function(e){return e};return p(e),e(r.current)},function(e){(function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}})(n,o,i,l)(e)}]}}).create({config:{paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs"}},isInitialized:!1,resolve:null,reject:null,monaco:null}))||function(e){if("u">typeof Symbol&&Symbol.iterator in Object(e)){var t=[],r=!0,n=!1,o=void 0;try{for(var i,a=e[Symbol.iterator]();!(r=(i=a.next()).done)&&(t.push(i.value),2!==t.length);r=!0);}catch(e){n=!0,o=e}finally{try{r||null==a.return||a.return()}finally{if(n)throw o}}return t}}(u)||function(e){if(e){if("string"==typeof e)return n(e,2);var t=Object.prototype.toString.call(e).slice(8,-1);if("Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t)return Array.from(e);if("Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))return n(e,2)}}(u)||function(){throw TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),k=C[0],E=C[1];function z(e){return document.body.appendChild(e)}function M(e){var t,r,n=k(function(e){return{config:e.config,reject:e.reject}}),o=(t="".concat(n.config.paths.vs,"/loader.js"),r=document.createElement("script"),t&&(r.src=t),r);return o.onload=function(){return e()},o.onerror=n.reject,o}function P(){var e=k(function(e){return{config:e.config,resolve:e.resolve,reject:e.reject}}),t=window.require;t.config(e.config),t(["vs/editor/editor.main"],function(t){S(t),e.resolve(t)},function(t){e.reject(t)})}function S(e){k().monaco||E({monaco:e})}var R=new Promise(function(e,t){return E({resolve:e,reject:t})});let T={config:function(e){var t=w(e),n=t.monaco,o=function(e,t){if(null==e)return{};var r,n,o=function(e,t){if(null==e)return{};var r,n,o={},i=Object.keys(e);for(n=0;n<i.length;n++)r=i[n],t.indexOf(r)>=0||(o[r]=e[r]);return o}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(n=0;n<i.length;n++)r=i[n],!(t.indexOf(r)>=0)&&Object.prototype.propertyIsEnumerable.call(e,r)&&(o[r]=e[r])}return o}(t,["monaco"]);E(function(e){return{config:function e(t,n){return Object.keys(n).forEach(function(r){n[r]instanceof Object&&t[r]&&Object.assign(n[r],e(t[r],n[r]))}),r(r({},t),n)}(e.config,o),monaco:n}})},init:function(){var e=k(function(e){return{monaco:e.monaco,isInitialized:e.isInitialized,resolve:e.resolve}});if(!e.isInitialized){if(E({isInitialized:!0}),e.monaco)return e.resolve(e.monaco),O(R);if(window.monaco&&window.monaco.editor)return S(window.monaco),e.resolve(window.monaco),O(R);j(z,M)(P)}return O(R)},__getMonacoInstance:function(){return k(function(e){return e.monaco})}};e.s(["default",0,T],350660);var L=e.i(389959),N={display:"flex",position:"relative",textAlign:"initial"},I={width:"100%"},H={display:"none"},A={display:"flex",height:"100%",width:"100%",justifyContent:"center",alignItems:"center"},D=function({children:e}){return L.default.createElement("div",{style:A},e)},F=(0,L.memo)(function({width:e,height:t,isEditorReady:r,loading:n,_ref:o,className:i,wrapperProps:a}){return L.default.createElement("section",{style:{...N,width:e,height:t},...a},!r&&L.default.createElement(D,null,n),L.default.createElement("div",{ref:o,style:{...I,...!r&&H},className:i}))}),$=function(e){(0,L.useEffect)(e,[])},q=function(e,t,r=!0){let n=(0,L.useRef)(!0);(0,L.useEffect)(n.current||!r?()=>{n.current=!1}:e,t)};function V(){}function B(e,t,r,n){var o,i,a,l,s,d;return o=e,i=n,o.editor.getModel(U(o,i))||(a=e,l=t,s=r,d=n,a.editor.createModel(l,s,d?U(a,d):void 0))}function U(e,t){return e.Uri.parse(t)}var G=(0,L.memo)(function({original:e,modified:t,language:r,originalLanguage:n,modifiedLanguage:o,originalModelPath:i,modifiedModelPath:a,keepCurrentOriginalModel:l=!1,keepCurrentModifiedModel:s=!1,theme:d="light",loading:u="Loading...",options:c={},height:f="100%",width:p="100%",className:g,wrapperProps:m={},beforeMount:b=V,onMount:h=V}){let[x,v]=(0,L.useState)(!1),[y,w]=(0,L.useState)(!0),j=(0,L.useRef)(null),_=(0,L.useRef)(null),O=(0,L.useRef)(null),C=(0,L.useRef)(h),k=(0,L.useRef)(b),E=(0,L.useRef)(!1);$(()=>{let e=T.init();return e.then(e=>(_.current=e)&&w(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>{let t;return j.current?(t=j.current?.getModel(),void(l||t?.original?.dispose(),s||t?.modified?.dispose(),j.current?.dispose())):e.cancel()}}),q(()=>{if(j.current&&_.current){let t=j.current.getOriginalEditor(),o=B(_.current,e||"",n||r||"text",i||"");o!==t.getModel()&&t.setModel(o)}},[i],x),q(()=>{if(j.current&&_.current){let e=j.current.getModifiedEditor(),n=B(_.current,t||"",o||r||"text",a||"");n!==e.getModel()&&e.setModel(n)}},[a],x),q(()=>{let e=j.current.getModifiedEditor();e.getOption(_.current.editor.EditorOption.readOnly)?e.setValue(t||""):t!==e.getValue()&&(e.executeEdits("",[{range:e.getModel().getFullModelRange(),text:t||"",forceMoveMarkers:!0}]),e.pushUndoStop())},[t],x),q(()=>{j.current?.getModel()?.original.setValue(e||"")},[e],x),q(()=>{let{original:e,modified:t}=j.current.getModel();_.current.editor.setModelLanguage(e,n||r||"text"),_.current.editor.setModelLanguage(t,o||r||"text")},[r,n,o],x),q(()=>{_.current?.editor.setTheme(d)},[d],x),q(()=>{j.current?.updateOptions(c)},[c],x);let z=(0,L.useCallback)(()=>{if(!_.current)return;k.current(_.current);let l=B(_.current,e||"",n||r||"text",i||""),s=B(_.current,t||"",o||r||"text",a||"");j.current?.setModel({original:l,modified:s})},[r,t,o,e,n,i,a]),M=(0,L.useCallback)(()=>{!E.current&&O.current&&(j.current=_.current.editor.createDiffEditor(O.current,{automaticLayout:!0,...c}),z(),_.current?.editor.setTheme(d),v(!0),E.current=!0)},[c,d,z]);return(0,L.useEffect)(()=>{x&&C.current(j.current,_.current)},[x]),(0,L.useEffect)(()=>{y||x||M()},[y,x,M]),L.default.createElement(F,{width:p,height:f,isEditorReady:x,loading:u,_ref:O,className:g,wrapperProps:m})}),K=function(e){let t=(0,L.useRef)();return(0,L.useEffect)(()=>{t.current=e},[e]),t.current},W=new Map,J=(0,L.memo)(function({defaultValue:e,defaultLanguage:t,defaultPath:r,value:n,language:o,path:i,theme:a="light",line:l,loading:s="Loading...",options:d={},overrideServices:u={},saveViewState:c=!0,keepCurrentModel:f=!1,width:p="100%",height:g="100%",className:m,wrapperProps:b={},beforeMount:h=V,onMount:x=V,onChange:v,onValidate:y=V}){let[w,j]=(0,L.useState)(!1),[_,O]=(0,L.useState)(!0),C=(0,L.useRef)(null),k=(0,L.useRef)(null),E=(0,L.useRef)(null),z=(0,L.useRef)(x),M=(0,L.useRef)(h),P=(0,L.useRef)(),S=(0,L.useRef)(n),R=K(i),N=(0,L.useRef)(!1),I=(0,L.useRef)(!1);$(()=>{let e=T.init();return e.then(e=>(C.current=e)&&O(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>k.current?void(P.current?.dispose(),f?c&&W.set(i,k.current.saveViewState()):k.current.getModel()?.dispose(),k.current.dispose()):e.cancel()}),q(()=>{let a=B(C.current,e||n||"",t||o||"",i||r||"");a!==k.current?.getModel()&&(c&&W.set(R,k.current?.saveViewState()),k.current?.setModel(a),c&&k.current?.restoreViewState(W.get(i)))},[i],w),q(()=>{k.current?.updateOptions(d)},[d],w),q(()=>{k.current&&void 0!==n&&(k.current.getOption(C.current.editor.EditorOption.readOnly)?k.current.setValue(n):n!==k.current.getValue()&&(I.current=!0,k.current.executeEdits("",[{range:k.current.getModel().getFullModelRange(),text:n,forceMoveMarkers:!0}]),k.current.pushUndoStop(),I.current=!1))},[n],w),q(()=>{let e=k.current?.getModel();e&&o&&C.current?.editor.setModelLanguage(e,o)},[o],w),q(()=>{void 0!==l&&k.current?.revealLine(l)},[l],w),q(()=>{C.current?.editor.setTheme(a)},[a],w);let H=(0,L.useCallback)(()=>{if(!(!E.current||!C.current)&&!N.current){M.current(C.current);let s=i||r,f=B(C.current,n||e||"",t||o||"",s||"");k.current=C.current?.editor.create(E.current,{model:f,automaticLayout:!0,...d},u),c&&k.current.restoreViewState(W.get(s)),C.current.editor.setTheme(a),void 0!==l&&k.current.revealLine(l),j(!0),N.current=!0}},[e,t,r,n,o,i,d,u,c,a,l]);return(0,L.useEffect)(()=>{w&&z.current(k.current,C.current)},[w]),(0,L.useEffect)(()=>{_||w||H()},[_,w,H]),S.current=n,(0,L.useEffect)(()=>{w&&v&&(P.current?.dispose(),P.current=k.current?.onDidChangeModelContent(e=>{I.current||v(k.current.getValue(),e)}))},[w,v]),(0,L.useEffect)(()=>{if(w){let e=C.current.editor.onDidChangeMarkers(e=>{let t=k.current.getModel()?.uri;if(t&&e.find(e=>e.path===t.path)){let e=C.current.editor.getModelMarkers({resource:t});y?.(e)}});return()=>{e?.dispose()}}return()=>{}},[w,y]),L.default.createElement(F,{width:p,height:g,isEditorReady:w,loading:s,_ref:E,className:m,wrapperProps:b})});e.s(["DiffEditor",0,G,"Editor",0,J,"default",0,J,"useMonaco",0,function(){let[e,t]=(0,L.useState)(T.__getMonacoInstance());return $(()=>{let r;return e||(r=T.init()).then(e=>{t(e)}),()=>r?.cancel()}),e}],156054)}]);