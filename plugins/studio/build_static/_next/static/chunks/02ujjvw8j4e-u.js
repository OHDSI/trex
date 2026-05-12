(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),o=e.i(389959),a=e.i(837710),i=e.i(710483),n=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:o,error:i})=>(0,t.jsx)(a.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(n.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:o,error:i?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:a="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:n,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:f=!0,children:g,additionalActions:m})=>{let x=(0,s.useTrack)(),b=(0,o.useRef)(!1),h=n?.message?.includes("503")?"503 Service Temporarily Unavailable":n?.message;return(0,o.useEffect)(()=>{!b.current&&(b.current=!0,.1>Math.random()&&x("dashboard_error_created",{source:"admonition"}))},[x]),(0,t.jsx)(i.Admonition,{type:"warning",layout:m?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[n?.message&&(0,t.jsxs)("p",{children:[f&&"Error: ",h]}),p&&(0,t.jsx)("p",{children:a}),g]}),actions:m?(0,t.jsxs)(t.Fragment,{children:[m,(0,t.jsx)(l,{projectRef:e,subject:r,error:n})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:n}),className:d})};e.s(["AlertError",0,d,"default",0,d])},202003,e=>{"use strict";e.s(["buildStudioPageTitle",0,e=>{let t=[e.entity,e.section,e.surface,e.project,e.org,e.brand],r=[];return t.forEach(e=>{let t=(e=>{if(void 0===e)return;let t=e.trim().replace(/\s+/g," ");if(0!==t.length)return t.length<=60?t:`${t.slice(0,59).trimEnd()}…`})(e);if(!t)return;let o=r[r.length-1];(void 0===o||o.toLowerCase()!==t.toLowerCase())&&r.push(t)}),r.join(" | ")}])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,a],305551);let i=(0,t.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=a.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},725137,e=>{"use strict";var t=e.i(478902),r=e.i(162361),o=e.i(766181),a=e.i(975924),i=e.i(389959),n=e.i(843778);let s=r.Dialog.Root,l=r.Dialog.Trigger,d=r.Dialog.Close;(0,o.cva)("fixed inset-0 z-50 flex",{variants:{side:{top:"items-start",bottom:"items-end",left:"justify-start",right:"justify-end"}},defaultVariants:{side:"right"}});let c=({side:e,children:o,...a})=>(0,t.jsx)(r.Dialog.Portal,{...a,children:o});c.displayName=r.Dialog.Portal.displayName;let u=i.forwardRef(({className:e,children:o,...a},i)=>(0,t.jsx)(r.Dialog.Overlay,{className:(0,n.cn)("fixed inset-0 z-50 bg-alternative/90 backdrop-blur-xs transition-all duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in",e),...a,ref:i}));u.displayName=r.Dialog.Overlay.displayName;let p=(0,n.cn)(["fixed z-50 scale-100 gap-4 bg-studio opacity-100 shadow-lg","data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:duration-300"]),f=(0,o.cva)(p,{variants:{side:{top:"data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top w-full border-b inset-x-0 top-0",bottom:"data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom w-full border-t inset-x-0 bottom-0",left:"data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left h-full border-r inset-y-0 left-0",right:"data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right h-full border-l inset-y-0 right-0"},size:{content:"",default:"",sm:"",lg:"",xl:"",xxl:"",full:""}},compoundVariants:[{side:["top","bottom"],size:"content",class:"max-h-screen"},{side:["top","bottom"],size:"default",class:"h-1/3"},{side:["top","bottom"],size:"sm",class:"h-1/4"},{side:["top","bottom"],size:"lg",class:"h-1/2"},{side:["top","bottom"],size:"xl",class:"h-5/6"},{side:["top","bottom"],size:"full",class:"h-screen"},{side:["right","left"],size:"content",class:"max-w-screen"},{side:["right","left"],size:"default",class:"lg:w-1/3"},{side:["right","left"],size:"sm",class:"lg:w-1/4"},{side:["right","left"],size:"lg",class:"lg:w-1/2"},{side:["right","left"],size:"xl",class:"lg:w-4/6"},{side:["right","left"],size:"xxl",class:"w-5/6"},{side:["right","left"],size:"full",class:"w-screen"}],defaultVariants:{side:"right",size:"default"}}),g=i.forwardRef(({side:e,size:o,className:i,children:s,showClose:l=!0,hasOverlay:d=!0,...p},g)=>(0,t.jsxs)(c,{side:e,children:[d&&(0,t.jsx)(u,{}),(0,t.jsxs)(r.Dialog.Content,{ref:g,className:(0,n.cn)(f({side:e,size:o}),i),...p,children:[s,l?(0,t.jsxs)(r.Dialog.Close,{className:(0,n.cn)("absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary","hit-area-6"),children:[(0,t.jsx)(a.X,{className:"h-4 w-4"}),(0,t.jsx)("span",{className:"sr-only",children:"Close"})]}):null]})]}));g.displayName=r.Dialog.Content.displayName;let m=({className:e,...r})=>(0,t.jsx)("div",{className:(0,n.cn)("px-5 py-4 text-center sm:text-left border-b bg-dash-sidebar",e),...r});m.displayName="SheetHeader";let x=({className:e,...r})=>(0,t.jsx)("div",{className:(0,n.cn)("px-5 py-4",e),...r});x.displayName="SheetSection";let b=({className:e,...r})=>(0,t.jsx)("div",{className:(0,n.cn)("px-5 py-3 border-t w-full","flex flex-col-reverse sm:flex-row sm:justify-end gap-2",e),...r});b.displayName="SheetFooter";let h=i.forwardRef(({className:e,...o},a)=>(0,t.jsx)(r.Dialog.Title,{ref:a,className:(0,n.cn)("text-lg text-foreground",e),...o}));h.displayName=r.Dialog.Title.displayName;let v=i.forwardRef(({className:e,...o},a)=>(0,t.jsx)(r.Dialog.Description,{ref:a,className:(0,n.cn)("text-sm text-foreground-light",e),...o}));v.displayName=r.Dialog.Description.displayName,e.s(["Sheet",0,s,"SheetClose",0,d,"SheetContent",0,g,"SheetDescription",0,v,"SheetFooter",0,b,"SheetHeader",0,m,"SheetSection",0,x,"SheetTitle",0,h,"SheetTrigger",0,l])},207155,e=>{"use strict";var t=e.i(389959),r=e.i(174617),o=e.i(678001),a=e.i(274664),i=e.i(546595),n=e.i(47015),s=e.i(826524),l=e.i(2664),d=e.i(374251),c=e.i(594661),u=e.i(889251),p=e.i(478902),f="Radio",[g,m]=(0,a.createContextScope)(f),[x,b]=g(f),h=t.forwardRef((e,a)=>{let{__scopeRadio:n,name:s,checked:l=!1,required:d,disabled:c,value:u="on",onCheck:f,form:g,...m}=e,[b,h]=t.useState(null),v=(0,o.useComposedRefs)(a,e=>h(e)),y=t.useRef(!1),j=!b||g||!!b.closest("form");return(0,p.jsxs)(x,{scope:n,checked:l,disabled:c,children:[(0,p.jsx)(i.Primitive.button,{type:"button",role:"radio","aria-checked":l,"data-state":_(l),"data-disabled":c?"":void 0,disabled:c,value:u,...m,ref:v,onClick:(0,r.composeEventHandlers)(e.onClick,e=>{l||f?.(),j&&(y.current=e.isPropagationStopped(),y.current||e.stopPropagation())})}),j&&(0,p.jsx)(w,{control:b,bubbles:!y.current,name:s,value:u,checked:l,required:d,disabled:c,form:g,style:{transform:"translateX(-100%)"}})]})});h.displayName=f;var v="RadioIndicator",y=t.forwardRef((e,t)=>{let{__scopeRadio:r,forceMount:o,...a}=e,n=b(v,r);return(0,p.jsx)(u.Presence,{present:o||n.checked,children:(0,p.jsx)(i.Primitive.span,{"data-state":_(n.checked),"data-disabled":n.disabled?"":void 0,...a,ref:t})})});y.displayName=v;var w=t.forwardRef(({__scopeRadio:e,control:r,checked:a,bubbles:n=!0,...s},l)=>{let u=t.useRef(null),f=(0,o.useComposedRefs)(u,l),g=(0,c.usePrevious)(a),m=(0,d.useSize)(r);return t.useEffect(()=>{let e=u.current;if(!e)return;let t=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set;if(g!==a&&t){let r=new Event("click",{bubbles:n});t.call(e,a),e.dispatchEvent(r)}},[g,a,n]),(0,p.jsx)(i.Primitive.input,{type:"radio","aria-hidden":!0,defaultChecked:a,...s,tabIndex:-1,ref:f,style:{...s.style,...m,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});function _(e){return e?"checked":"unchecked"}w.displayName="RadioBubbleInput";var j=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],C="RadioGroup",[z,R]=(0,a.createContextScope)(C,[n.createRovingFocusGroupScope,m]),k=(0,n.createRovingFocusGroupScope)(),S=m(),[N,E]=z(C),P=t.forwardRef((e,t)=>{let{__scopeRadioGroup:r,name:o,defaultValue:a,value:d,required:c=!1,disabled:u=!1,orientation:f,dir:g,loop:m=!0,onValueChange:x,...b}=e,h=k(r),v=(0,l.useDirection)(g),[y,w]=(0,s.useControllableState)({prop:d,defaultProp:a??null,onChange:x,caller:C});return(0,p.jsx)(N,{scope:r,name:o,required:c,disabled:u,value:y,onValueChange:w,children:(0,p.jsx)(n.Root,{asChild:!0,...h,orientation:f,dir:v,loop:m,children:(0,p.jsx)(i.Primitive.div,{role:"radiogroup","aria-required":c,"aria-orientation":f,"data-disabled":u?"":void 0,dir:v,...b,ref:t})})})});P.displayName=C;var T="RadioGroupItem",D=t.forwardRef((e,a)=>{let{__scopeRadioGroup:i,disabled:s,...l}=e,d=E(T,i),c=d.disabled||s,u=k(i),f=S(i),g=t.useRef(null),m=(0,o.useComposedRefs)(a,g),x=d.value===l.value,b=t.useRef(!1);return t.useEffect(()=>{let e=e=>{j.includes(e.key)&&(b.current=!0)},t=()=>b.current=!1;return document.addEventListener("keydown",e),document.addEventListener("keyup",t),()=>{document.removeEventListener("keydown",e),document.removeEventListener("keyup",t)}},[]),(0,p.jsx)(n.Item,{asChild:!0,...u,focusable:!c,active:x,children:(0,p.jsx)(h,{disabled:c,required:d.required,checked:x,...f,...l,name:d.name,ref:m,onCheck:()=>d.onValueChange(l.value),onKeyDown:(0,r.composeEventHandlers)(e=>{"Enter"===e.key&&e.preventDefault()}),onFocus:(0,r.composeEventHandlers)(l.onFocus,()=>{b.current&&g.current?.click()})})})});D.displayName=T;var H=t.forwardRef((e,t)=>{let{__scopeRadioGroup:r,...o}=e,a=S(r);return(0,p.jsx)(y,{...a,...o,ref:t})});H.displayName="RadioGroupIndicator",e.s(["Indicator",0,H,"Item",0,D,"RadioGroup",0,P,"RadioGroupIndicator",0,H,"RadioGroupItem",0,D,"Root",0,P,"createRadioGroupScope",0,R],20889);var I=e.i(20889);e.s(["RadioGroup",0,I],207155)},418348,e=>{"use strict";var t=e.i(478902),r=e.i(376577),o=e.i(207155),a=e.i(389959),i=e.i(737018),n=e.i(843778);let s=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(o.RadioGroup.Root,{className:(0,n.cn)("flex flex-col -space-y-px w-full",e),...r,ref:a}));s.displayName="RadioGroupStacked";let l=a.forwardRef(({image:e,label:a,showIndicator:s=!0,...l},d)=>(0,t.jsx)(o.RadioGroup.Item,{ref:d,...l,className:(0,n.cn)("flex flex-col gap-2 w-full","bg-overlay/50 border shadow-xs","first-of-type:rounded-t-lg last-of-type:rounded-b-lg","disabled:opacity-50 disabled:cursor-not-allowed","enabled:cursor-pointer enabled:hover:bg-surface-300 enabled:hover:border-foreground-muted","hover:z-1 focus-visible:z-1 data-[state=checked]:z-1","data-[state=checked]:ring-1 data-[state=checked]:ring-border","data-[state=checked]:bg-surface-300 data-[state=checked]:border-foreground-muted","transition group",l.className),children:(0,t.jsxs)("div",{className:"flex gap-3 w-full px-[21px] py-3",children:[s&&(0,t.jsx)("div",{className:(0,n.cn)("aspect-square h-4 w-4 min-w-4 min-h-4 rounded-full border relative","flex items-center justify-center","ring-offset-background transition","group-data-[state=checked]:border-foreground-muted","group-focus:border-foreground-muted group-focus:outline-hidden","group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2","group-hover:border-foreground-muted"),children:(0,t.jsx)(o.RadioGroup.Indicator,{className:"absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",children:(0,t.jsx)(r.Circle,{size:10,strokeWidth:0,className:"fill-current text-current"})})}),(0,t.jsxs)("div",{className:"flex flex-col gap-0.25 items-start",children:[(0,t.jsx)(i.Label,{htmlFor:l.value,className:(0,n.cn)("block mt-[-0.15rem] text-sm text-left text-light","transition-colors","enabled:group-hover:text-foreground group-data-[state=checked]:text-foreground"),children:a}),l.description&&(0,t.jsx)("p",{className:"text-left text-sm text-foreground-lighter text-balance",children:l.description}),l.children]})]})}));l.displayName="RadioGroupStackedItem",e.s(["RadioGroupStacked",0,s,"RadioGroupStackedItem",0,l])},489084,e=>{"use strict";let t=(0,e.i(388019).default)("Server",[["rect",{width:"20",height:"8",x:"2",y:"2",rx:"2",ry:"2",key:"ngkwjq"}],["rect",{width:"20",height:"8",x:"2",y:"14",rx:"2",ry:"2",key:"iecqi9"}],["line",{x1:"6",x2:"6.01",y1:"6",y2:"6",key:"16zg32"}],["line",{x1:"6",x2:"6.01",y1:"18",y2:"18",key:"nzw8ys"}]]);e.s(["default",0,t])},980533,e=>{"use strict";e.s(["getPathSegment",0,function(e,t){return e.split("/")[t]},"getPathnameWithoutQuery",0,function(e,t){return null==e?t:e.split(/[?#]/)[0]??t}])},71049,e=>{"use strict";var t,r=e.i(478902),o=e.i(389959),a=e.i(174617),i=e.i(274664),n=e.i(826524),s=e.i(678001),l=e.i(940051),d=e.i(839518),c=e.i(889251),u=e.i(546595),p=e.i(735343),f="HoverCard",[g,m]=(0,i.createContextScope)(f,[l.createPopperScope]),x=(0,l.createPopperScope)(),[b,h]=g(f),v=e=>{let{__scopeHoverCard:t,children:a,open:i,defaultOpen:s,onOpenChange:d,openDelay:c=700,closeDelay:u=300}=e,p=x(t),g=o.useRef(0),m=o.useRef(0),h=o.useRef(!1),v=o.useRef(!1),[y,w]=(0,n.useControllableState)({prop:i,defaultProp:s??!1,onChange:d,caller:f}),_=o.useCallback(()=>{clearTimeout(m.current),g.current=window.setTimeout(()=>w(!0),c)},[c,w]),j=o.useCallback(()=>{clearTimeout(g.current),h.current||v.current||(m.current=window.setTimeout(()=>w(!1),u))},[u,w]),C=o.useCallback(()=>w(!1),[w]);return o.useEffect(()=>()=>{clearTimeout(g.current),clearTimeout(m.current)},[]),(0,r.jsx)(b,{scope:t,open:y,onOpenChange:w,onOpen:_,onClose:j,onDismiss:C,hasSelectionRef:h,isPointerDownOnContentRef:v,children:(0,r.jsx)(l.Root,{...p,children:a})})};v.displayName=f;var y="HoverCardTrigger",w=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...i}=e,n=h(y,o),s=x(o);return(0,r.jsx)(l.Anchor,{asChild:!0,...s,children:(0,r.jsx)(u.Primitive.a,{"data-state":n.open?"open":"closed",...i,ref:t,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,E(n.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,E(n.onClose)),onFocus:(0,a.composeEventHandlers)(e.onFocus,n.onOpen),onBlur:(0,a.composeEventHandlers)(e.onBlur,n.onClose),onTouchStart:(0,a.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});w.displayName=y;var _="HoverCardPortal",[j,C]=g(_,{forceMount:void 0}),z=e=>{let{__scopeHoverCard:t,forceMount:o,children:a,container:i}=e,n=h(_,t);return(0,r.jsx)(j,{scope:t,forceMount:o,children:(0,r.jsx)(c.Presence,{present:o||n.open,children:(0,r.jsx)(d.Portal,{asChild:!0,container:i,children:a})})})};z.displayName=_;var R="HoverCardContent",k=o.forwardRef((e,t)=>{let o=C(R,e.__scopeHoverCard),{forceMount:i=o.forceMount,...n}=e,s=h(R,e.__scopeHoverCard);return(0,r.jsx)(c.Presence,{present:i||s.open,children:(0,r.jsx)(S,{"data-state":s.open?"open":"closed",...n,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,E(s.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,E(s.onClose)),ref:t})})});k.displayName=R;var S=o.forwardRef((e,i)=>{let{__scopeHoverCard:n,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:u,onInteractOutside:f,...g}=e,m=h(R,n),b=x(n),v=o.useRef(null),y=(0,s.useComposedRefs)(i,v),[w,_]=o.useState(!1);return o.useEffect(()=>{if(w){let e=document.body;return t=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=t,e.style.webkitUserSelect=t}}},[w]),o.useEffect(()=>{if(v.current){let e=()=>{_(!1),m.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(m.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),m.hasSelectionRef.current=!1,m.isPointerDownOnContentRef.current=!1}}},[m.isPointerDownOnContentRef,m.hasSelectionRef]),o.useEffect(()=>{v.current&&(function(e){let t=[],r=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;r.nextNode();)t.push(r.currentNode);return t})(v.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,r.jsx)(p.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:f,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:(0,a.composeEventHandlers)(u,e=>{e.preventDefault()}),onDismiss:m.onDismiss,children:(0,r.jsx)(l.Content,{...b,...g,onPointerDown:(0,a.composeEventHandlers)(g.onPointerDown,e=>{e.currentTarget.contains(e.target)&&_(!0),m.hasSelectionRef.current=!1,m.isPointerDownOnContentRef.current=!0}),ref:y,style:{...g.style,userSelect:w?"text":void 0,WebkitUserSelect:w?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),N=o.forwardRef((e,t)=>{let{__scopeHoverCard:o,...a}=e,i=x(o);return(0,r.jsx)(l.Arrow,{...i,...a,ref:t})});function E(e){return t=>"touch"===t.pointerType?void 0:e()}N.displayName="HoverCardArrow",e.s(["Arrow",0,N,"Content",0,k,"HoverCard",0,v,"HoverCardArrow",0,N,"HoverCardContent",0,k,"HoverCardPortal",0,z,"HoverCardTrigger",0,w,"Portal",0,z,"Root",0,v,"Trigger",0,w,"createHoverCardScope",0,m],73929);var P=e.i(73929),P=P,T=e.i(843778);let D=P.Root,H=P.Trigger,I=o.forwardRef(({className:e,align:t="center",animate:o="zoom-in",sideOffset:a=4,...i},n)=>(0,r.jsx)(P.Portal,{children:(0,r.jsx)(P.Content,{ref:n,align:t,sideOffset:a,className:(0,T.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===o?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...i})}));I.displayName=P.Content.displayName,e.s(["HoverCard",0,D,"HoverCardContent",0,I,"HoverCardTrigger",0,H],71049)},776578,e=>{"use strict";e.s(["CANCELLATION_REASONS",0,[{value:"I was just exploring, or it was a hobby/student project."},{value:"I was not satisfied with the customer support I received.",label:"Could you tell us more about your experience with our support team?"},{value:"Supabase is missing a specific feature I need.",label:"What specific feature(s) are we missing?"},{value:"I found it difficult to use or build with.",label:"What specific parts of Supabase did you find difficult or frustrating?"},{value:"Performance or reliability insufficient.",label:"Could you tell us more about the specific issues you encountered (e.g., UI bugs, API latency, downtime)?"},{value:"My project was cancelled or put on hold."},{value:"Too expensive",label:"We appreciate your perspective on our pricing, what aspects of the cost felt too high?"},{value:"The pricing is unpredictable and hard to budget for.",label:"Which aspects of our pricing model made it difficult for you to predict your monthly costs?"},{value:"My company went out of business or was acquired."},{value:"I lost trust in the company or its future direction.",label:"Building and maintaining your trust is our highest priority, could you please share the specific event or reason that led to this loss of trust?"}],"USAGE_APPROACHING_THRESHOLD",0,.8])}]);