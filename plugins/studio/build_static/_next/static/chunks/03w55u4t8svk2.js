(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,592383,e=>{"use strict";var t=e.i(478902),r=e.i(755146),a=e.i(861833),n=e.i(843778),s=e.i(937942);let o=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),i=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:r})=>(0,t.jsx)(s.InlineLink,{href:e??"/",children:r});e.s(["Markdown",0,({children:e,className:s,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,n.cn)("text-sm",s),children:(0,t.jsx)(r.default,{remarkPlugins:[a.default],components:{h3:o,code:i,a:l},...u,children:e??d})})])},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),a=e.i(389959),n=e.i(837710),s=e.i(710483),o=e.i(196621),i=e.i(967052);let l=({projectRef:e,subject:a,error:s})=>(0,t.jsx)(n.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(o.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:a,error:s?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:n="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:o,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:m=!0,showErrorPrefix:p=!0,children:x,additionalActions:g})=>{let h=(0,i.useTrack)(),f=(0,a.useRef)(!1),b=o?.message?.includes("503")?"503 Service Temporarily Unavailable":o?.message;return(0,a.useEffect)(()=>{!f.current&&(f.current=!0,.1>Math.random()&&h("dashboard_error_created",{source:"admonition"}))},[h]),(0,t.jsx)(s.Admonition,{type:"warning",layout:g?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[o?.message&&(0,t.jsxs)("p",{children:[p&&"Error: ",b]}),m&&(0,t.jsx)("p",{children:n}),x]}),actions:g?(0,t.jsxs)(t.Fragment,{children:[g,(0,t.jsx)(l,{projectRef:e,subject:r,error:o})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:o}),className:d})};e.s(["AlertError",0,d,"default",0,d])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,n],305551);let s=(0,t.createContext)({theme:n});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(s);return r||(r=n.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),a=e.i(389959),n=e.i(843778),s=e.i(375761),o=e.i(231665),i=e.i(938933);let l=(0,a.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:m,iconContainerClassName:p,containerClassName:x,size:g="small",...h},f)=>{let[b,v]=(0,a.useState)("Copy"),[y,j]=(0,a.useState)(!0),w=(0,i.default)("input"),_=[];return g&&_.push(w.size[g]),(0,t.jsxs)(o.InputGroup,{className:x,children:[(0,t.jsx)(o.InputGroupInput,{ref:f,onFocus:e=>e.target.select(),...h,size:g,onCopy:m,type:c&&y?"password":h.type,disabled:h.disabled,className:(0,n.cn)(..._,h.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(o.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(o.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,t.jsx)(o.InputGroupButton,{size:"tiny",type:"default",className:(0,n.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=h.value,void(0,s.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),m?.()})},children:b}):null,c&&y?(0,t.jsx)(o.InputGroupButton,{size:"tiny",type:"default",onClick:function(){j(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},388034,e=>{"use strict";let t=(0,e.i(388019).default)("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);e.s(["default",0,t])},61187,e=>{"use strict";var t=e.i(388034);e.s(["RefreshCw",()=>t.default])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),r=e.i(38429),a=e.i(356003),n=e.i(355901),s=e.i(667286),o=e.i(78162),i=e.i(714403);async function l({projectRef:e,connectionString:r,schema:a,name:n,version:s,cascade:o=!1,createSchema:d=!1}){let c=new Headers;r&&c.set("x-connection-encrypted",r);let u=(0,t.getEnableDatabaseExtensionSQL)({schema:a,name:n,version:s,cascade:o,createSchema:d}),{result:m}=await (0,i.executeSql)({projectRef:e,connectionString:r,sql:u,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...i}={})=>{let d=(0,a.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>l(e),async onSuccess(t,r,a){let{projectRef:n}=r;await Promise.all([d.invalidateQueries({queryKey:s.databaseExtensionsKeys.list(n)}),d.invalidateQueries({queryKey:o.configKeys.upgradeEligibility(n)})]),await e?.(t,r,a)},async onError(e,r,a){void 0===t?n.toast.error(`Failed to enable database extension: ${e.message}`):t(e,r,a)},...i})}])},336908,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:n,onCancel:s,title:o="Unsaved changes",description:i="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:d="Keep editing",size:c="tiny"})=>{let u=(0,r.useRef)(!1);(0,r.useEffect)(()=>{e&&(u.current=!1)},[e]);let m=(0,r.useCallback)(()=>{u.current=!0,n()},[n]),p=(0,r.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}s()}},[s]);return(0,t.jsx)(a.AlertDialog,{open:e,onOpenChange:p,children:(0,t.jsxs)(a.AlertDialogContent,{size:c,children:[(0,t.jsxs)(a.AlertDialogHeader,{children:[(0,t.jsx)(a.AlertDialogTitle,{children:o}),null!=i&&(0,t.jsx)(a.AlertDialogDescription,{children:i})]}),(0,t.jsxs)(a.AlertDialogFooter,{children:[(0,t.jsx)(a.AlertDialogCancel,{children:d}),(0,t.jsx)(a.AlertDialogAction,{variant:"danger",onClick:m,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),r=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:a})=>{let[n,s]=(0,t.useState)(!1),o=(0,r.default)(e),i=(0,r.default)(a),l=(0,t.useCallback)(()=>{o.current()?s(!0):i.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{s(!1),i.current()},[]),u=(0,t.useCallback)(()=>{s(!1)},[]),m=(0,t.useMemo)(()=>({visible:n,onClose:c,onCancel:u}),[n,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:m}),[l,d,m])}])},248210,e=>{"use strict";var t=e.i(478902),r=e.i(843778);e.s(["LoadingLine",0,({loading:e})=>(0,t.jsx)("div",{className:"relative overflow-hidden w-full h-px bg-border m-auto",children:(0,t.jsx)("span",{className:(0,r.cn)("absolute w-[80px] h-px ml-auto mr-auto left-0 right-0 text-center block top-0","transition-all","line-loading-bg-light dark:line-loading-bg",e&&"animate-line-loading-slower opacity-100",e?"opacity-100":"opacity-0")})})])},843142,e=>{"use strict";var t=e.i(130843);e.s(["SelectSeparator_Shadcn_",()=>t.SelectSeparator])},944334,e=>{"use strict";e.s(["EXTENSION_DISABLE_WARNINGS",0,{pg_cron:"Disabling this extension will delete all scheduled jobs. This cannot be undone.",pg_partman:"Disabling this extension will stop automatic partition management for any partitioned queues. New partitions will no longer be created and retention policies will no longer be enforced."},"HIDDEN_EXTENSIONS",0,["adminpack","amcheck","file_fdw","lo","old_snapshot","pageinspect","pg_buffercache","pg_freespacemap","pg_surgery","pg_visibility","supabase_vault","supautils","intagg","xml2","pg_tle","pg_stat_monitor"],"SEARCH_TERMS",0,{vector:["pgvector","pg_vector"],pg_partman:["partman","partition","partitioned"]},"extensionsWithRecommendedSchemas",0,{wrappers:"extensions"}])},121832,e=>{"use strict";var t=e.i(478902),r=e.i(283607),a=e.i(655744),n=e.i(355901),s=e.i(587433),o=e.i(837710),i=e.i(253214),l=e.i(20482),d=e.i(378277),c=e.i(449123),u=e.i(451031),m=e.i(831927),p=e.i(843142),x=e.i(156722),g=e.i(719754),h=e.i(710483),f=e.i(538482),b=e.i(108151),v=e.i(531837),y=e.i(249909),j=e.i(944334),w=e.i(513826),_=e.i(610144),S=e.i(801834),q=e.i(635494),C=e.i(392491),N=e.i(10429);let z=["vector","postgis"],k=v.object({name:v.string(),schema:v.string()}).superRefine((e,t)=>{"custom"===e.schema&&0===e.name.length&&t.addIssue({code:y.ZodIssueCode.custom,path:["name"],message:"Please provide a name for the schema"})});e.s(["EnableExtensionModal",0,({visible:e,extension:v,onCancel:y})=>{let I=(0,q.useIsOrioleDb)(),{data:R}=(0,q.useSelectedProjectQuery)(),{data:E}=(0,C.useProtectedSchemas)({excludeSchemas:["extensions"]}),F=j.extensionsWithRecommendedSchemas[v.name],{data:D=[],isPending:T}=(0,S.useSchemasQuery)({projectRef:R?.ref,connectionString:R?.connectionString},{enabled:e}),Q=D.filter(e=>e.name===F||!E.some(t=>t.name===e.name)),$="pg_cron"===v.name?"pg_catalog":v.default_version_schema,{mutate:L,isPending:P}=(0,_.useDatabaseExtensionEnableMutation)({onSuccess:()=>{n.toast.success(`Extension "${v.name}" is now enabled`),y()},onError:e=>{n.toast.error(`Failed to enable ${v.name}: ${e.message}`)}}),A={name:v.name,schema:F??"extensions"},B=(0,a.useForm)({mode:"onBlur",reValidateMode:"onBlur",resolver:(0,r.zodResolver)(k),defaultValues:A}),{schema:M}=B.watch(),O=async e=>{if(void 0===R)return console.error("Project is required");let t=null!=$?$:"custom"===e.schema?e.name:e.schema;L({projectRef:R.ref,connectionString:R?.connectionString,schema:t,name:v.name,version:v.default_version,cascade:!0,createSchema:!t.startsWith("pg_")})};return(0,t.jsx)(i.Dialog,{open:e,onOpenChange:e=>{e||y()},children:(0,t.jsxs)(i.DialogContent,{size:"small","aria-describedby":void 0,children:[(0,t.jsx)(i.DialogHeader,{children:(0,t.jsxs)(i.DialogTitle,{children:["Enable ",v.name]})}),(0,t.jsx)(i.DialogSectionSeparator,{}),I&&z.includes(v.name)&&(0,t.jsxs)(h.Admonition,{type:"default",title:"Extension is limited by OrioleDB",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsxs)("span",{className:"block",children:[v.name," cannot be accelerated by indexes on tables that are using the OrioleDB access method"]}),(0,t.jsx)(w.DocsButton,{abbrev:!1,className:"mt-2",href:`${N.DOCS_URL}`})]}),"pg_cron"===v.name&&R?.cloud_provider==="FLY"&&(0,t.jsxs)(h.Admonition,{type:"warning",title:"The pg_cron extension is not fully supported for Fly projects",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsx)("p",{children:"You can still enable the extension, but pg_cron jobs may not run due to the behavior of Fly projects."}),(0,t.jsx)(w.DocsButton,{className:"mt-2",href:`${N.DOCS_URL}/guides/platform/fly-postgres#limitations`})]}),(0,t.jsx)(i.DialogSection,{children:(0,t.jsx)(l.Form,{...B,children:(0,t.jsx)("form",{id:"enable-extensions-form",onSubmit:B.handleSubmit(O),children:T?(0,t.jsxs)("div",{className:"space-y-2",children:[(0,t.jsx)(b.ShimmeringLoader,{}),(0,t.jsx)("div",{className:"w-3/4",children:(0,t.jsx)(b.ShimmeringLoader,{})})]}):$?(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(f.FormItemLayout,{isReactForm:!1,label:"Select a schema to enable the extension for",children:(0,t.jsx)(d.Input_Shadcn_,{disabled:!0,value:$})}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Extension must be installed in the "',$,'" schema.']})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(l.FormField,{name:"schema",control:B.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"schema",label:"Select a schema to enable the extension for",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsxs)(c.Select_Shadcn_,{value:e.value,onValueChange:e.onChange,disabled:!!$,children:[(0,t.jsx)(x.SelectTrigger_Shadcn_,{children:(0,t.jsx)(g.SelectValue_Shadcn_,{placeholder:"Select a schema"})}),(0,t.jsxs)(u.SelectContent_Shadcn_,{children:[(0,t.jsxs)(m.SelectItem_Shadcn_,{value:"custom",children:["Create a new schema"," ",(0,t.jsx)("code",{className:"text-code-inline",children:v.name})]}),(0,t.jsx)(p.SelectSeparator_Shadcn_,{}),Q.map(e=>(0,t.jsxs)(m.SelectItem_Shadcn_,{value:e.name,children:[e.name,e.name===F?(0,t.jsx)(s.Badge,{className:"ml-2",variant:"success",children:"Recommended"}):$||"extensions"!==e.name?null:(0,t.jsx)(s.Badge,{className:"ml-2",children:"Default"})]},e.id))]})]})})})},"schema"),!!F&&(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Use the "',F,'" schema for full compatibility with related features.']}),"custom"===M&&(0,t.jsx)(l.FormField,{name:"name",control:B.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"name",label:"Schema name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Input_Shadcn_,{...e})})})},"name")]})})})}),(0,t.jsxs)(i.DialogFooter,{children:[(0,t.jsx)(o.Button,{type:"default",disabled:P,onClick:()=>y(),children:"Cancel"}),(0,t.jsx)(o.Button,{htmlType:"submit",form:"enable-extensions-form",loading:P,disabled:T||P,children:"Enable extension"})]})]})})}])},596481,895164,e=>{"use strict";e.i(850036);var t=e.i(957386),r=e.i(242882);let a={create:()=>["queues","create"],delete:e=>["queues",e,"delete"],purge:e=>["queues",e,"purge"],getMessagesInfinite:(e,t,r)=>["projects",e,"queue-messages",t,r].filter(Boolean),list:e=>["projects",e,"queues"],metrics:(e,t)=>["projects",e,"queue-metrics",t],exposePostgrestStatus:e=>["projects",e,"queue-expose-status"]};e.s(["databaseQueuesKeys",0,a],895164);var n=e.i(714403);async function s({projectRef:e,connectionString:r}){if(!e)throw Error("Project ref is required");let a=(0,t.getQueuesExposePostgrestStatusSQL)(),{result:o}=await (0,n.executeSql)({projectRef:e,connectionString:r,sql:a});return o[0].exists}e.s(["useQueuesExposePostgrestStatusQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...o}={})=>(0,r.useQuery)({queryKey:a.exposePostgrestStatus(e),queryFn:()=>s({projectRef:e,connectionString:t}),enabled:n&&void 0!==e,...o})],596481)},586732,e=>{"use strict";var t=e.i(479084),r=e.i(242882),a=e.i(895164),n=e.i(714403);let s=t.safeSql`select * from pgmq.list_queues();`;async function o({projectRef:e,connectionString:t}){if(!e)throw Error("Project ref is required");let{result:r}=await (0,n.executeSql)({projectRef:e,connectionString:t,sql:s});return r}e.s(["useQueuesQuery",0,({projectRef:e,connectionString:t},{enabled:n=!0,...s}={})=>(0,r.useQuery)({queryKey:a.databaseQueuesKeys.list(e),queryFn:()=>o({projectRef:e,connectionString:t}),enabled:n&&void 0!==e,...s})])},495672,e=>{"use strict";e.s(["QueueNameSchema",()=>_,"formatQueueColumns",()=>j,"isQueueNameValid",()=>S,"pgmqArchiveTable",()=>C,"pgmqQueueTable",()=>q,"prepareQueuesForDataGrid",()=>w],495672);var t=e.i(478902),r=e.i(843778),a=e.i(417403),n=e.i(55956),s=e.i(370410),o=e.i(774803),i=e.i(975924),l=e.i(479084),d=e.i(242882),c=e.i(895164),u=e.i(714403);async function m({projectRef:e,connectionString:t,queueName:r}){if(!e)throw Error("Project ref is required");if(!S(r))throw Error("Invalid queue name: must contain only alphanumeric characters, underscores, and hyphens");try{let{result:a}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:l.safeSql`
  set local statement_timeout = '1s';
  SELECT
    COUNT(*) AS row_count
  FROM
    ${(0,l.ident)("pgmq")}.${(0,l.ident)(q(r))};
`});return{queue_name:r,queue_length:a[0].row_count,method:"precise"}}catch(a){if(a?.message==="canceling statement due to statement timeout"){let{result:a}=await (0,u.executeSql)({projectRef:e,connectionString:t,sql:l.safeSql`
  select
  reltuples::bigint as estimated_rows
    from
  pg_class
    where
  relname = ${(0,l.literal)(q(r))}
  and relnamespace = 'pgmq'::regnamespace;
`});return{queue_name:r,queue_length:a[0].estimated_rows,method:"estimated"}}throw a}}var p=e.i(738196),x=e.i(635494),g=e.i(10429);let h=({queue:e})=>(0,t.jsx)("div",{className:"flex items-center",children:(0,t.jsx)("span",{className:"truncate",title:e.queue_name,children:e.queue_name})}),f=({queue:e})=>{let r=e.is_partitioned?"Partitioned":e.is_unlogged?"Unlogged":"Basic";return(0,t.jsx)("div",{className:"flex items-center",children:(0,t.jsx)("span",{className:"truncate",title:r.toLowerCase(),children:r})})},b=({queue:e})=>{let{data:r}=(0,x.useSelectedProjectQuery)(),{data:a}=(0,p.useTablesQuery)({projectRef:r?.ref,connectionString:r?.connectionString,schema:"pgmq"}),n=a?.find(t=>t.name===q(e.queue_name)),o=!!n?.rls_enabled;return(0,t.jsx)("div",{className:"flex items-center",children:o?(0,t.jsx)(s.Check,{size:14,className:"text-brand"}):(0,t.jsx)(i.X,{size:14})})},v=({queue:e})=>(0,t.jsx)("div",{className:"flex items-center",children:(0,t.jsx)("span",{title:e.created_at,children:(0,n.default)(e.created_at).format(g.DATETIME_FORMAT)})}),y=({queue:e})=>{let{data:r}=(0,x.useSelectedProjectQuery)(),{data:a,isPending:n}=(({projectRef:e,connectionString:t,queueName:r},{enabled:a=!0,...n}={})=>(0,d.useQuery)({queryKey:c.databaseQueuesKeys.metrics(e,r),queryFn:()=>m({projectRef:e,connectionString:t,queueName:r}),enabled:a&&void 0!==e,...n}))({queueName:e.queue_name,projectRef:r?.ref,connectionString:r?.connectionString},{staleTime:3e4});return(0,t.jsx)("div",{className:"flex items-center",children:n?(0,t.jsx)(o.Loader2,{className:"animate-spin",size:16}):(0,t.jsxs)("span",{children:[a?.queue_length," ",a?.method==="estimated"?"(Approximate)":null]})})},j=()=>[{key:"queue_name",name:"Name",resizable:!0,minWidth:200,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,r.cn)("flex items-center justify-between font-normal text-xs w-full ml-8"),children:(0,t.jsx)("p",{className:"text-foreground!",children:"Name"})}),renderCell:e=>(0,t.jsx)(h,{queue:e.row})},{key:"type",name:"Type",resizable:!0,minWidth:120,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,r.cn)("flex items-center justify-between font-normal text-xs w-full"),children:(0,t.jsx)("p",{className:"text-foreground!",children:"Type"})}),renderCell:e=>(0,t.jsx)(f,{queue:e.row})},{key:"rls_enabled",name:"RLS enabled",resizable:!0,minWidth:120,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,r.cn)("flex items-center justify-between font-normal text-xs w-full"),children:(0,t.jsx)("p",{className:"text-foreground!",children:"RLS enabled"})}),renderCell:e=>(0,t.jsx)(b,{queue:e.row})},{key:"created_at",name:"Created at",resizable:!0,minWidth:180,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,r.cn)("flex items-center justify-between font-normal text-xs w-full"),children:(0,t.jsx)("p",{className:"text-foreground!",children:"Created at"})}),renderCell:e=>(0,t.jsx)(v,{queue:e.row})},{key:"queue_size",name:"Size",resizable:!0,minWidth:120,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,r.cn)("flex items-center justify-between font-normal text-xs w-full"),children:(0,t.jsx)("p",{className:"text-foreground!",children:"Size"})}),renderCell:e=>(0,t.jsx)(y,{queue:e.row})}],w=e=>e.map(e=>({...e,id:e.queue_name})),_=a.default.string().trim().min(1,"Please provide a name for your queue").max(47,"The name can't be longer than 47 characters").regex(/^[a-zA-Z0-9_-]+$/,"Name must contain only alphanumeric characters, underscores, and hyphens"),S=e=>_.safeParse(e).success,q=e=>`q_${e.toLowerCase()}`,C=e=>`a_${e.toLowerCase()}`},322076,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(158639),a=e.i(61187),n=e.i(366652),s=e.i(975924),o=e.i(989567),i=e.i(17313),l=e.i(389959),d=e.i(256625),c=e.i(837710),u=e.i(843778),m=e.i(248210),p=e.i(746301),x=e.i(108151),g=e.i(283607),h=e.i(655744),f=e.i(355901),b=e.i(20482),v=e.i(479095),y=e.i(725137),j=e.i(450972),w=e.i(635494);function _(){let{data:e}=(0,w.useSelectedProjectQuery)(),{data:t}=(0,j.useDatabaseExtensionsQuery)({projectRef:e?.ref,connectionString:e?.connectionString}),r=(t??[]).find(e=>"pg_partman"===e.name),a=void 0!==r,n=r?.installed_version!=void 0;return{pgPartmanExtension:r,isAvailable:a,isInstalled:n}}var S=e.i(417403),q=e.i(495672);let C=S.default.object({type:S.default.literal("basic")}),N=S.default.object({type:S.default.literal("partitioned"),partitionInterval:S.default.coerce.number().int().positive(),retentionInterval:S.default.coerce.number().int().positive()}),z=S.default.object({type:S.default.literal("unlogged")}),k=S.default.object({name:q.QueueNameSchema,enableRls:S.default.boolean(),values:S.default.discriminatedUnion("type",[C,N,z])});var I=e.i(231665),R=e.i(538482);function E({form:e}){return"partitioned"!==e.watch("values.type")?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(y.SheetSection,{className:"flex flex-col gap-3",children:[(0,t.jsx)(b.FormField,{control:e.control,name:"values.partitionInterval",render:({field:{ref:e,...r}})=>(0,t.jsx)(R.FormItemLayout,{label:"Partition interval",description:"Number of messages per partition",className:"gap-1",children:(0,t.jsxs)(I.InputGroup,{children:[(0,t.jsx)(I.InputGroupInput,{...r,type:"number",placeholder:"10000"}),(0,t.jsx)(I.InputGroupAddon,{align:"inline-end",children:(0,t.jsx)(I.InputGroupText,{children:"messages"})})]})})}),(0,t.jsx)(b.FormField,{control:e.control,name:"values.retentionInterval",render:({field:{ref:e,...r}})=>(0,t.jsx)(R.FormItemLayout,{label:"Retention interval",description:"Partitions older than this many messages behind the latest will be dropped",className:"gap-1",children:(0,t.jsxs)(I.InputGroup,{children:[(0,t.jsx)(I.InputGroupInput,{...r,type:"number",placeholder:"10000"}),(0,t.jsx)(I.InputGroupAddon,{align:"inline-end",children:(0,t.jsx)(I.InputGroupText,{children:"messages"})})]})})})]}),(0,t.jsx)(v.Separator,{})]})}var F=e.i(710483),D=e.i(121832);function T(){let{pgPartmanExtension:e,isAvailable:r,isInstalled:a}=_(),[n,s]=(0,l.useState)(!1);return!r||a?null:(0,t.jsxs)("div",{className:"mx-5 my-2",children:[(0,t.jsx)(F.Admonition,{type:"tip",title:"pg_partman is now available",description:"Unlock partitioned queues for automatic data retention, lower storage costs, and faster performance at scale.",children:(0,t.jsx)(c.Button,{type:"default",size:"tiny",className:"mt-2",onClick:()=>s(!0),children:"Enable pg_partman"})}),e&&(0,t.jsx)(D.EnableExtensionModal,{visible:n,extension:e,onCancel:()=>s(!1)})]})}var Q=e.i(378277);function $({form:e}){return(0,t.jsx)(y.SheetSection,{children:(0,t.jsx)(b.FormField,{control:e.control,name:"name",render:({field:e})=>(0,t.jsxs)(R.FormItemLayout,{label:"Name",layout:"vertical",className:"gap-1 relative",children:[(0,t.jsx)(b.FormControl,{children:(0,t.jsx)(Q.Input_Shadcn_,{...e})}),(0,t.jsx)("span",{className:"text-foreground-lighter text-xs absolute top-0 right-0",children:"Can include letters, numbers, underscores, and hyphens"})]})})})}var L=e.i(587433),P=e.i(418348),A=e.i(505909),A=A,B=e.i(388019);let M=(0,B.default)("Rows3",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M21 9H3",key:"1338ky"}],["path",{d:"M21 15H3",key:"9uk58r"}]]),O=(0,B.default)("Rows4",[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M21 7.5H3",key:"1hm9pq"}],["path",{d:"M21 12H3",key:"2avoz0"}],["path",{d:"M21 16.5H3",key:"n7jzkj"}]]),G=[{value:"basic",icon:(0,t.jsx)(O,{strokeWidth:1}),label:"Basic queue",description:"Create a basic queue."},{value:"unlogged",icon:(0,t.jsx)(A.default,{strokeWidth:1}),label:"Unlogged queue",description:"Creates an unlogged queue which loses all data on database restart. Can be useful when write throughput is more important than durability."},{value:"partitioned",icon:(0,t.jsx)(M,{strokeWidth:1}),label:"Partitioned queue",description:"Create a partitioned queue which is optimized for large amount of messages"}];function K({form:e}){let{isInstalled:r}=_();return(0,t.jsx)(y.SheetSection,{children:(0,t.jsx)(b.FormField,{control:e.control,name:"values.type",render:({field:e})=>(0,t.jsx)(R.FormItemLayout,{label:"Type",layout:"vertical",className:"gap-1",children:(0,t.jsx)(b.FormControl,{children:(0,t.jsx)(P.RadioGroupStacked,{id:"queue_type",name:"queue_type",value:e.value,disabled:e.disabled,onValueChange:e.onChange,children:G.filter(e=>"partitioned"!==e.value||r).map(e=>{let r="partitioned"===e.value;return(0,t.jsx)(P.RadioGroupStackedItem,{id:e.value,value:e.value,label:"",showIndicator:!1,children:(0,t.jsxs)("div",{className:"flex items-start gap-x-5",children:[(0,t.jsx)("div",{className:"text-foreground",children:e.icon}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)("p",{className:"text-foreground text-left",children:e.label}),r&&(0,t.jsx)(L.Badge,{variant:"success",children:"Recommended"})]}),(0,t.jsx)("p",{className:"text-foreground-lighter text-left",children:r?"Automatically manages data retention and improves performance for high-volume queues via pg_partman.":e.description})]})]})},e.value)})})})})})})}var H=e.i(290811),U=e.i(592383);function W({form:e,isExposed:r,projectRef:a}){return(0,t.jsxs)(y.SheetSection,{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(b.FormField,{control:e.control,name:"enableRls",render:({field:e})=>(0,t.jsx)(R.FormItemLayout,{layout:"flex",label:(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)("p",{children:"Enable Row Level Security (RLS)"}),(0,t.jsx)(L.Badge,{variant:"success",children:"Recommended"})]}),description:"Restrict access to your queue by enabling RLS and writing Postgres policies to control access for each role.",children:(0,t.jsx)(b.FormControl,{children:(0,t.jsx)(H.Switch,{checked:e.value,onCheckedChange:e.onChange,disabled:e.disabled||r})})})}),r?(0,t.jsx)(F.Admonition,{type:"default",title:"RLS must be enabled as queues are exposed via PostgREST",description:"This is to prevent anonymous access to any of your queues"}):(0,t.jsx)(F.Admonition,{type:"default",title:"Row Level Security for queues is only relevant if exposure through PostgREST has been enabled",children:(0,t.jsx)(U.Markdown,{className:"[&>p]:leading-normal!",content:`You may opt to manage your queues via any Supabase client libraries or PostgREST
                      endpoints by enabling this in the [queues settings](/project/${a}/integrations/queues/settings).`})})]})}var V=e.i(336908),X=e.i(479084),Y=e.i(38429),J=e.i(356003),Z=e.i(895164),ee=e.i(714403),et=e.i(138658);async function er({projectRef:e,connectionString:t,name:r,type:a,enableRls:n,configuration:s}){if(!(0,q.isQueueNameValid)(r))throw Error("Invalid queue name: must contain only alphanumeric characters, underscores, and hyphens");let{partitionInterval:o,retentionInterval:i}=s??{},l="partitioned"===a?X.safeSql`select from pgmq.create_partitioned(${(0,X.literal)(r)}, ${(0,X.literal)(o)}, ${(0,X.literal)(i)});`:"unlogged"===a?X.safeSql`SELECT pgmq.create_unlogged(${(0,X.literal)(r)});`:X.safeSql`SELECT pgmq.create(${(0,X.literal)(r)});`,d=n?X.safeSql` alter table ${(0,X.ident)("pgmq")}.${(0,X.ident)((0,q.pgmqQueueTable)(r))} enable row level security;`:X.safeSql``,{result:c}=await (0,ee.executeSql)({projectRef:e,connectionString:t,sql:X.safeSql`${l}${d}`,queryKey:Z.databaseQueuesKeys.create()});return c}var ea=e.i(596481),en=e.i(412385);let es="create-queue-sidepanel",eo=({visible:e,onClose:r})=>{let a=(0,o.useRouter)(),{data:n}=(0,w.useSelectedProjectQuery)(),{data:s}=(0,ea.useQueuesExposePostgrestStatusQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{mutate:i,isPending:d}=(({onSuccess:e,onError:t,...r}={})=>{let a=(0,J.useQueryClient)();return(0,Y.useMutation)({mutationFn:e=>er(e),async onSuccess(t,r,n){let{projectRef:s}=r;await a.invalidateQueries({queryKey:Z.databaseQueuesKeys.list(s)}),a.invalidateQueries({queryKey:et.tableKeys.list(s,"pgmq")}),await e?.(t,r,n)},async onError(e,r,a){void 0===t?f.toast.error(`Failed to create database queue: ${e.message}`):t(e,r,a)},...r})})(),{isInstalled:u}=_(),m=(0,l.useMemo)(()=>u?{name:"",enableRls:!0,values:{type:"partitioned",partitionInterval:1e4,retentionInterval:1e5}}:{name:"",enableRls:!0,values:{type:"basic"}},[u]),p=(0,h.useForm)({resolver:(0,g.zodResolver)(k),defaultValues:m});(0,l.useEffect)(()=>{e&&p.reset(m)},[p,m,e]);let{confirmOnClose:x,handleOpenChange:j,modalProps:S}=(0,en.useConfirmOnClose)({checkIsDirty:()=>p.formState.isDirty,onClose:r}),q=async({name:e,enableRls:t,values:s})=>{n?.ref?i({projectRef:n.ref,connectionString:n?.connectionString,name:e,enableRls:t,type:s.type,configuration:"partitioned"===s.type?{partitionInterval:s.partitionInterval,retentionInterval:s.retentionInterval}:void 0},{onSuccess:()=>{f.toast.success(`Successfully created queue ${e}`),a.push(`/project/${n?.ref}/integrations/queues/queues/${e}`),r()}}):f.toast.error("Project not found")};return(0,t.jsx)(y.Sheet,{open:e,onOpenChange:j,children:(0,t.jsxs)(y.SheetContent,{size:"default",className:"w-[35%]",tabIndex:void 0,children:[(0,t.jsxs)("div",{className:"flex flex-col h-full",tabIndex:-1,children:[(0,t.jsx)(y.SheetHeader,{children:(0,t.jsx)(y.SheetTitle,{children:"Create a new queue"})}),(0,t.jsx)("div",{className:"overflow-auto grow",children:(0,t.jsx)(b.Form,{...p,children:(0,t.jsxs)("form",{id:es,className:"grow overflow-auto",onSubmit:p.handleSubmit(q),children:[(0,t.jsx)($,{form:p}),(0,t.jsx)(v.Separator,{}),(0,t.jsx)(T,{}),(0,t.jsx)(K,{form:p}),(0,t.jsx)(v.Separator,{}),(0,t.jsx)(E,{form:p}),(0,t.jsx)(W,{form:p,isExposed:s,projectRef:n?.ref})]})})}),(0,t.jsxs)(y.SheetFooter,{children:[(0,t.jsx)(c.Button,{size:"tiny",type:"default",htmlType:"button",onClick:x,disabled:d,children:"Cancel"}),(0,t.jsx)(c.Button,{size:"tiny",type:"primary",form:es,htmlType:"submit",loading:d,disabled:!n?.ref,children:"Create queue"})]})]}),(0,t.jsx)(V.DiscardChangesConfirmationDialog,{...S})]})})};var ei=e.i(567558),el=e.i(586732);e.s(["QueuesTab",0,()=>{let e=(0,o.useRouter)(),{ref:g}=(0,r.useParams)(),{data:h}=(0,w.useSelectedProjectQuery)(),[f,b]=(0,i.useQueryState)("search",i.parseAsString.withDefault("")),[v,y]=(0,l.useState)(f),[j,_]=(0,i.useQueryState)("new",i.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),{data:S,error:C,isPending:N,isError:z,isRefetching:k,refetch:I}=(0,el.useQueuesQuery)({projectRef:h?.ref,connectionString:h?.connectionString}),R=(0,l.useMemo)(()=>S?f?S.filter(e=>e.queue_name.toLowerCase().includes(f.toLowerCase())):S:[],[S,f]),E=(0,l.useMemo)(()=>(0,q.prepareQueuesForDataGrid)(R),[R]),F=(0,l.useMemo)(()=>(0,q.formatQueueColumns)(),[]);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-full w-full space-y-4",children:(0,t.jsxs)("div",{className:"h-full w-full flex flex-col relative",children:[(0,t.jsxs)("div",{className:"bg-surface-200 py-3 px-10 flex items-center justify-between flex-wrap",children:[(0,t.jsx)(p.Input,{size:"tiny",className:"w-52",placeholder:"Search for a queue",icon:(0,t.jsx)(n.Search,{}),value:v??"",onChange:e=>y(e.target.value),onKeyDown:e=>{("Enter"===e.code||"NumpadEnter"===e.code)&&b(v.trim())},actions:[v&&(0,t.jsx)(c.Button,{size:"tiny",type:"text",icon:(0,t.jsx)(s.X,{}),onClick:()=>{y(""),b("")},className:"p-0 h-5 w-5"},"clear")]}),(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)(c.Button,{type:"default",icon:(0,t.jsx)(a.RefreshCw,{}),loading:k,onClick:()=>I(),children:"Refresh"}),(0,t.jsx)(c.Button,{onClick:()=>_(!0),children:"Create queue"})]})]}),(0,t.jsx)(m.LoadingLine,{loading:N||k}),(0,t.jsx)(d.default,{className:"grow border-t-0",rowHeight:44,headerRowHeight:36,columns:F,rows:E,rowKeyGetter:e=>e.id,rowClass:()=>(0,u.cn)("cursor-pointer","[&>.rdg-cell]:border-box [&>.rdg-cell]:outline-hidden [&>.rdg-cell]:shadow-none","[&>.rdg-cell:first-child>div]:ml-8"),renderers:{renderRow:(r,a)=>(0,t.jsx)(d.Row,{...a,onClick:()=>{let{queue_name:t}=a.row,r=`/project/${g}/integrations/queues/queues/${t}`;e.push(r)}},a.row.queue_name)}}),0===E.length?N?(0,t.jsx)("div",{className:"absolute top-28 px-10 w-full",children:(0,t.jsx)(x.GenericSkeletonLoader,{})}):z?(0,t.jsx)("div",{className:"absolute top-28 px-10 flex flex-col items-center justify-center w-full",children:(0,t.jsx)(ei.default,{subject:"Failed to retrieve database queues",error:C})}):(0,t.jsx)("div",{className:"absolute top-32 px-6 w-full",children:(0,t.jsxs)("div",{className:"text-center text-sm flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"text-foreground",children:f?"No queues found":"No queues created yet"}),(0,t.jsx)("p",{className:"text-foreground-light",children:f?"There are currently no queues based on the search applied":"There are currently no queues created yet in your project"})]})}):null,(0,t.jsx)("div",{className:"flex justify-between min-h-9 h-9 overflow-hidden items-center px-6 w-full border-t text-xs text-foreground-light",children:`Total: ${E.length} queues`})]})}),(0,t.jsx)(eo,{visible:j,onClose:()=>{_(!1)}})]})}],322076)},79703,e=>{e.n(e.i(322076))}]);