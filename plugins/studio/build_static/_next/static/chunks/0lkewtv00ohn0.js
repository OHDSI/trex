(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,378277,e=>{"use strict";var t=e.i(348481);e.s(["Input_Shadcn_",()=>t.Input])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,a],305551);let n=(0,t.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(n);return r||(r=a.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},57492,e=>{"use strict";var t=e.i(130843);e.s(["SelectGroup_Shadcn_",()=>t.SelectGroup])},774234,554855,e=>{"use strict";var t=e.i(348534);e.s(["CollapsibleContent_Shadcn_",()=>t.CollapsibleContent],774234),e.s(["CollapsibleTrigger_Shadcn_",()=>t.CollapsibleTrigger],554855)},925282,e=>{"use strict";var t=e.i(348534);e.s(["Collapsible_Shadcn_",()=>t.Collapsible])},867467,e=>{"use strict";var t=e.i(389959);e.s(["useChanged",0,function(e){let r=(0,t.useRef)(),o=r.current!==e;return(0,t.useEffect)(()=>{r.current=e}),o},"useChangedSync",0,function(e){let r=(0,t.useRef)(),o=r.current!==e;return r.current=e,o}])},97891,e=>{"use strict";var t=e.i(38429),r=e.i(355901),o=e.i(234745);async function a({subject:e,message:t,category:r,severity:n,projectRef:i,organizationSlug:s,library:l,affectedServices:d,browserInformation:c,allowSupportAccess:u,siteUrl:p,additionalRedirectUrls:x,dashboardSentryIssueId:g,dashboardLogs:m,dashboardStudioVersion:h}){let{data:f,error:b}=await (0,o.post)("/platform/feedback/send",{body:{subject:e,message:t,category:r,severity:n,projectRef:i,organizationSlug:s,library:l,verified:!0,tags:["dashboard-support-form"],siteUrl:p,additionalRedirectUrls:x,affectedServices:d,browserInformation:c,allowSupportAccess:u,dashboardSentryIssueId:g,dashboardLogs:m,dashboardStudioVersion:h}});return b&&(0,o.handleError)(b,{alwaysCapture:!0,sentryContext:{tags:{dashboardSupportForm:!0}}}),f}e.s(["useSendSupportTicketMutation",0,({onSuccess:e,onError:o,...n}={})=>(0,t.useMutation)({mutationFn:e=>a(e),async onSuccess(t,r,o){await e?.(t,r,o)},async onError(e,t,a){void 0===o?r.toast.error(`Failed to submit support ticket: ${e.message}`):o(e,t,a)},...n})])},352647,e=>{"use strict";var t=e.i(242882),r=e.i(572617),o=e.i(484231),a=e.i(10429),n=e.i(237948);async function i(e){let t=await fetch(`${a.BASE_PATH}/api/incident-status`,{signal:e,method:"GET",credentials:"omit",headers:{"Content-Type":"application/json"}});if(!t.ok){let e,r=await t.text();console.error("[getIncidentStatus] Failed:",t.status,r);let o=t.headers.get("Retry-After");if(null!==o){let t=Number(o);Number.isFinite(t)&&t>0&&(e=t)}throw new n.ResponseError(`Failed to fetch incident status: ${t.statusText}`,t.status,void 0,e)}let o=await t.json(),[i,s]=(0,r.default)(o??[],e=>"maintenance"===e.impact);return{maintenanceEvents:i,incidents:s}}e.s(["useIncidentStatusQuery",0,(e={})=>(0,t.useQuery)({queryKey:o.platformKeys.incidentStatus(),queryFn:({signal:e})=>i(e),refetchOnWindowFocus:!1,retryDelay:(e,t)=>t instanceof n.ResponseError&&t.retryAfter?1e3*t.retryAfter:Math.min(1e3*4**e,3e5),...e,enabled:(a.IS_PLATFORM||a.IS_TEST_ENV)&&(e.enabled??!0)})])},95200,e=>{"use strict";var t=e.i(478902),r=e.i(938933),o=e.i(843778);let a=(0,e.i(389959).createContext)({contextSize:"small",className:""});e.s(["default",0,function({className:e,size:n,type:i="Mail",color:s,strokeWidth:l,fill:d,stroke:c,background:u,src:p,icon:x,...g}){let m=(0,r.default)("icon");return(0,t.jsx)(a.Consumer,{children:({contextSize:r,className:a})=>{let i={tiny:14,small:18,medium:20,large:20,xlarge:24,xxlarge:30,xxxlarge:42},h=i.large,f=21;r&&(f=r?"string"==typeof r?i[r]:r:h),n&&(f=n?"string"==typeof n?i[n]:n:h);let b=!s&&!d&&!c,v=["sbui-icon",e];a&&v.push(a);let y=p?(0,t.jsx)("div",{className:"relative",style:{width:f+"px",height:f+"px"},children:(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",color:b?"currentColor":s,fill:b?"none":d||"none",stroke:b?"currentColor":c,className:(0,o.cn)(v),width:"100%",height:"100%",strokeWidth:l??void 0,...g,children:p})}):(0,t.jsx)(x,{color:b?"currentColor":s,stroke:b?"currentColor":c,className:(0,o.cn)(v),strokeWidth:l,size:f,fill:b?"none":d||"none",...g});return u?(0,t.jsx)("div",{className:m.container,children:y}):y}})}],95200)},721704,e=>{"use strict";var t=e.i(478902),r=e.i(95200);let o=(0,t.jsx)("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M13.5447 3.01094C12.5249 2.54302 11.4313 2.19828 10.2879 2.00083C10.2671 1.99702 10.2463 2.00654 10.2356 2.02559C10.0949 2.27573 9.93921 2.60206 9.83011 2.85856C8.60028 2.67444 7.3768 2.67444 6.17222 2.85856C6.06311 2.59636 5.90166 2.27573 5.76038 2.02559C5.74966 2.00717 5.72887 1.99765 5.70803 2.00083C4.56527 2.19764 3.47171 2.54239 2.45129 3.01094C2.44246 3.01475 2.43488 3.0211 2.42986 3.02935C0.355594 6.12826 -0.212633 9.151 0.06612 12.1362C0.067381 12.1508 0.0755799 12.1648 0.0869319 12.1737C1.45547 13.1787 2.78114 13.7889 4.08219 14.1933C4.10301 14.1996 4.12507 14.192 4.13832 14.1749C4.44608 13.7546 4.72043 13.3114 4.95565 12.8454C4.96953 12.8181 4.95628 12.7857 4.92791 12.7749C4.49275 12.6099 4.0784 12.4086 3.67982 12.18C3.64829 12.1616 3.64577 12.1165 3.67477 12.095C3.75865 12.0321 3.84255 11.9667 3.92264 11.9007C3.93713 11.8886 3.95732 11.8861 3.97435 11.8937C6.59287 13.0892 9.42771 13.0892 12.0153 11.8937C12.0323 11.8854 12.0525 11.888 12.0677 11.9C12.1478 11.9661 12.2316 12.0321 12.3161 12.095C12.3451 12.1165 12.3433 12.1616 12.3117 12.18C11.9131 12.413 11.4988 12.6099 11.063 12.7743C11.0346 12.7851 11.022 12.8181 11.0359 12.8454C11.2762 13.3108 11.5505 13.7539 11.8526 14.1742C11.8652 14.192 11.8879 14.1996 11.9087 14.1933C13.2161 13.7889 14.5417 13.1787 15.9103 12.1737C15.9223 12.1648 15.9298 12.1515 15.9311 12.1369C16.2647 8.6856 15.3723 5.68765 13.5655 3.02998C13.5611 3.0211 13.5535 3.01475 13.5447 3.01094ZM5.34668 10.3185C4.55833 10.3185 3.90876 9.59478 3.90876 8.70593C3.90876 7.81707 4.54574 7.09331 5.34668 7.09331C6.15393 7.09331 6.79722 7.82342 6.7846 8.70593C6.7846 9.59478 6.14762 10.3185 5.34668 10.3185ZM10.6632 10.3185C9.87481 10.3185 9.22527 9.59478 9.22527 8.70593C9.22527 7.81707 9.86221 7.09331 10.6632 7.09331C11.4704 7.09331 12.1137 7.82342 12.1011 8.70593C12.1011 9.59478 11.4704 10.3185 10.6632 10.3185Z",fill:"currentColor"});e.s(["default",0,function(e){return(0,t.jsx)(r.default,{src:o,stroke:"none",...e})}])},750824,604594,768989,184028,e=>{"use strict";var t=e.i(478902),r=e.i(26898),o=e.i(843778),a=e.i(20482),n=e.i(449123),i=e.i(451031),s=e.i(57492),l=e.i(831927),d=e.i(156722),c=e.i(719754),u=e.i(710483),p=e.i(538482),x=e.i(177113),g=e.i(917816),m=e.i(937942);function h({form:e}){return(0,t.jsx)(a.FormField,{name:"category",control:e.control,render:({field:e})=>{let{ref:r,...o}=e;return(0,t.jsx)(p.FormItemLayout,{hideMessage:!0,layout:"vertical",label:"What are you having issues with?",children:(0,t.jsx)(a.FormControl,{children:(0,t.jsxs)(n.Select_Shadcn_,{...o,defaultValue:e.value,onValueChange:e.onChange,children:[(0,t.jsx)(d.SelectTrigger_Shadcn_,{"aria-label":"Select an issue",className:"w-full",children:(0,t.jsx)(c.SelectValue_Shadcn_,{placeholder:"Select an issue",children:e.value?x.CATEGORY_OPTIONS.find(t=>t.value===e.value)?.label:null})}),(0,t.jsx)(i.SelectContent_Shadcn_,{children:(0,t.jsx)(s.SelectGroup_Shadcn_,{children:x.CATEGORY_OPTIONS.map(e=>(0,t.jsxs)(l.SelectItem_Shadcn_,{value:e.value,children:[e.label,(0,t.jsx)("span",{className:"block text-xs text-foreground-lighter",children:e.description})]},e.value))})})]})})})}})}function f({form:e}){return(0,t.jsx)(a.FormField,{name:"severity",control:e.control,render:({field:e})=>{let{ref:r,...o}=e;return(0,t.jsx)(p.FormItemLayout,{hideMessage:!0,layout:"vertical",label:"Severity",children:(0,t.jsx)(a.FormControl,{children:(0,t.jsxs)(n.Select_Shadcn_,{...o,defaultValue:e.value,onValueChange:e.onChange,children:[(0,t.jsx)(d.SelectTrigger_Shadcn_,{"aria-label":"Select a severity",className:"w-full",children:(0,t.jsx)(c.SelectValue_Shadcn_,{placeholder:"Select a severity",children:e.value})}),(0,t.jsx)(i.SelectContent_Shadcn_,{children:(0,t.jsx)(s.SelectGroup_Shadcn_,{children:x.SEVERITY_OPTIONS.map(e=>(0,t.jsxs)(l.SelectItem_Shadcn_,{value:e.value,children:[e.label,(0,t.jsx)("span",{className:"block text-xs text-foreground-lighter",children:e.description})]},e.value))})})]})})})}})}let b=({category:e,projectRef:o})=>{let a=`/project/${o===g.NO_PROJECT_MARKER?"_":o}`,n="col-span-2 mb-0";return e===r.SupportCategories.PROBLEM?(0,t.jsxs)(u.Admonition,{type:"default",className:n,title:"Have you checked your project's logs?",children:["Logs can help you identify errors that you might be running into when using your project's API or client libraries. View logs for each product"," ",(0,t.jsx)(m.InlineLink,{href:`${a}/logs/edge-logs`,children:"here"}),"."]}):e===r.SupportCategories.DATABASE_UNRESPONSIVE?(0,t.jsxs)(u.Admonition,{type:"default",className:n,title:"Have you checked your project's infrastructure activity?",children:["High memory or low disk IO bandwidth may be slowing down your database. Verify by checking the infrastructure activity of your project"," ",(0,t.jsx)(m.InlineLink,{href:`${a}/settings/infrastructure#infrastructure-activity`,children:"here"}),"."]}):e===r.SupportCategories.PERFORMANCE_ISSUES?(0,t.jsxs)(u.Admonition,{type:"default",className:n,title:"Have you checked the Query Performance Advisor?",children:["Identify slow running queries and get actionable insights on how to optimize them with the Query Performance Advisor"," ",(0,t.jsx)(m.InlineLink,{href:`${a}/settings/infrastructure#infrastructure-activity`,children:"here"}),"."]}):null};e.s(["CategoryAndSeverityInfo",0,function({form:e,category:r,severity:a,projectRef:n,showSeverity:i=!0,showIssueSuggestion:s=!0}){return(0,t.jsxs)("div",{className:(0,o.cn)("grid sm:grid-rows-1 gap-4 grid-cols-1 grid-rows-2",i?"sm:grid-cols-2":"sm:grid-cols-1"),children:[(0,t.jsx)(h,{form:e}),i&&(0,t.jsx)(f,{form:e}),s&&(0,t.jsx)(b,{category:r,projectRef:n}),("Urgent"===a||"High"===a)&&(0,t.jsx)(u.Admonition,{type:"default",className:"sm:col-span-2",title:"We do our best to respond to everyone as quickly as possible",description:"Prioritization will be based on production status. We ask that you reserve High and Urgent severity for production-impacting issues only."})]})}],750824);var v=e.i(587433),y=e.i(811025);e.s(["OrganizationSelector",0,function({form:e,orgSlug:r}){let{data:o,isSuccess:u}=(0,y.useOrganizationsQuery)(),x=(0,g.getOrgSubscriptionPlan)(o,r);return(0,t.jsx)(a.FormField,{name:"organizationSlug",control:e.control,render:({field:m})=>{let{ref:h,...f}=m;return(0,t.jsx)(p.FormItemLayout,{hideMessage:!0,layout:"vertical",label:"Which organization is affected?",children:(0,t.jsx)(a.FormControl,{children:(0,t.jsxs)(n.Select_Shadcn_,{...f,disabled:!u,defaultValue:m.value,onValueChange:t=>{let r=e.getValues("organizationSlug");m.onChange(t),r!==t&&e.resetField("projectRef",{defaultValue:g.NO_PROJECT_MARKER})},children:[(0,t.jsx)(d.SelectTrigger_Shadcn_,{className:"w-full","aria-label":"Select an organization",children:(0,t.jsx)(c.SelectValue_Shadcn_,{asChild:!0,placeholder:"Select an organization",children:(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[r===g.NO_ORG_MARKER?(0,t.jsx)("span",{children:"No specific organization"}):(o??[]).find(e=>e.slug===m.value)?.name,x&&(0,t.jsx)(v.Badge,{variant:"default",children:x})]})})}),(0,t.jsx)(i.SelectContent_Shadcn_,{children:(0,t.jsxs)(s.SelectGroup_Shadcn_,{children:[o?.map(e=>(0,t.jsx)(l.SelectItem_Shadcn_,{value:e.slug,children:e.name},e.slug)),u&&0===(o??[]).length&&(0,t.jsx)(l.SelectItem_Shadcn_,{value:g.NO_ORG_MARKER,children:"No specific organization"})]})})]})})})}})}],604594),e.i(128328);var w=e.i(158639),_=e.i(727859),j=e.i(858018),S=e.i(370410),C=e.i(365257),N=e.i(17203),E=e.i(345594),R=e.i(355901),z=e.i(837710),A=e.i(917007),k=e.i(549815),O=e.i(108151),T=e.i(223600),I=e.i(726398),P=e.i(912793);function F({form:e,orgSlug:r,projectRef:n}){let{projectRef:i}=(0,w.useParams)();return(0,t.jsx)(a.FormField,{name:"projectRef",control:e.control,render:({field:e})=>(0,t.jsx)(p.FormItemLayout,{hideMessage:!0,layout:"vertical",label:"Which project is affected?",children:(0,t.jsx)(a.FormControl,{children:(0,t.jsx)(I.OrganizationProjectSelector,{sameWidthAsTrigger:!0,fetchOnMount:!0,checkPosition:"left",slug:r&&r!==g.NO_ORG_MARKER?r:void 0,selectedRef:e.value,onInitialLoad:t=>{i||n&&n!==g.NO_PROJECT_MARKER||e.onChange(t[0]?.ref??g.NO_PROJECT_MARKER)},onSelect:t=>e.onChange(t.ref),renderTrigger:({isLoading:o,project:a,listboxId:n,open:i})=>(0,t.jsx)(z.Button,{block:!0,type:"default",role:"combobox","aria-label":"Select a project","aria-expanded":i,"aria-controls":n,size:"small",className:"justify-between",iconRight:(0,t.jsx)(C.ChevronsUpDown,{className:"ml-2 h-4 w-4 shrink-0 opacity-50"}),children:r&&o?(0,t.jsx)(O.default,{className:"w-44 py-2"}):e.value&&e.value!==g.NO_PROJECT_MARKER?a?.name??"Unknown project":"No specific project"}),renderActions:r=>(0,t.jsx)(A.CommandGroup_Shadcn_,{children:(0,t.jsxs)(k.CommandItem_Shadcn_,{className:"w-full gap-x-2",onSelect:()=>{e.onChange(g.NO_PROJECT_MARKER),r(!1)},children:[e.value===g.NO_PROJECT_MARKER&&(0,t.jsx)(S.Check,{size:16}),(0,t.jsx)("p",{className:(0,o.cn)(e.value!==g.NO_PROJECT_MARKER&&"ml-6"),children:"No specific project"})]})})},r)})})})}function M({projectRef:e}){let r=!!e&&e!==g.NO_PROJECT_MARKER;return(0,t.jsx)(_.AnimatePresence,{children:r&&(0,t.jsxs)(j.motion.div,{initial:{opacity:0,height:0},animate:{opacity:1,height:"auto"},exit:{opacity:0,height:0},transition:{duration:.3},className:"flex items-center gap-x-1",children:[(0,t.jsxs)("p",{className:"text-sm transition text-foreground-lighter",children:["Project ID:"," ",(0,t.jsx)("code",{className:"text-code-inline text-foreground-light!",children:e})]}),(0,t.jsx)(T.default,{iconOnly:!0,type:"text",text:e,onClick:()=>R.toast.success("Copied project ID to clipboard")})]})})}e.s(["PlanExpectationInfoContent",0,({orgSlug:e,planId:r})=>{let{billingAll:o}=(0,P.useIsFeatureEnabled)(["billing:all"]);return(0,t.jsxs)("div",{className:"flex flex-col gap-y-3 text-sm text-foreground-light",children:["free"===r&&(0,t.jsx)("p",{children:"Support on the Free plan is provided through the community and by the team on a best-effort basis. For a guaranteed response time, we recommend upgrading to the Pro plan. Enhanced support SLAs are available on the Enterprise plan."}),"pro"===r&&(0,t.jsx)("p",{children:"Pro includes email support with typical 1-business-day responses; upgrade to Team for prioritized ticketing and engineering escalation, or Enterprise for enhanced SLAs."}),"team"===r&&(0,t.jsx)("p",{children:"The Team plan includes email support with prioritized ticketing and escalation to product engineering. Low, normal, and high-severity tickets are typically handled within 1 business day. Urgent issues are handled within 1 day, 365 days a year. Enhanced support SLAs are available on the Enterprise plan."}),o&&"enterprise"!==r&&(0,t.jsxs)("div",{className:"flex flex-wrap gap-2 pt-1",children:[(0,t.jsx)(z.Button,{asChild:!0,size:"tiny",children:(0,t.jsx)(E.default,{href:`/org/${e}/billing?panel=subscriptionPlan&source=planSupportExpectationInfoBox`,children:"Upgrade plan"})}),(0,t.jsx)(z.Button,{asChild:!0,type:"default",size:"tiny",icon:(0,t.jsx)(N.ExternalLink,{}),children:(0,t.jsx)(E.default,{href:"https://supabase.com/contact/enterprise",target:"_blank",rel:"noreferrer",children:"Enquire about Enterprise"})})]})]})},"ProjectAndPlanInfo",0,function({form:e,orgSlug:r,projectRef:o,category:a,subscriptionPlanId:n}){let i=o&&o!==g.NO_PROJECT_MARKER;return(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(F,{form:e,orgSlug:r,projectRef:o}),(0,t.jsx)(M,{projectRef:o}),!i&&(0,t.jsx)(u.Admonition,{type:"default",title:"No project has been selected"})]})}],768989);var $=e.i(416050),L=e.i(925282),B=e.i(774234),K=e.i(554855),V=e.i(290811);let D=[r.SupportCategories.ACCOUNT_DELETION,r.SupportCategories.SALES_ENQUIRY,r.SupportCategories.REFUND];e.s(["DISABLE_SUPPORT_ACCESS_CATEGORIES",0,D,"SupportAccessToggle",0,function({form:e,align:r="left",className:o}){return(0,t.jsx)(a.FormField,{name:"allowSupportAccess",control:e.control,render:({field:e})=>(0,t.jsx)(p.FormItemLayout,{hideMessage:!0,name:"allowSupportAccess",className:o,layout:"flex",align:r,label:(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)("span",{className:"text-foreground",children:"Allow support access to your project"}),(0,t.jsx)(v.Badge,{children:"Recommended"})]}),description:(0,t.jsxs)("div",{className:"flex flex-col",children:[(0,t.jsx)("span",{className:"text-foreground-light",children:"Human support and AI diagnostic access."}),(0,t.jsxs)(L.Collapsible_Shadcn_,{className:"mt-2",children:[(0,t.jsxs)(K.CollapsibleTrigger_Shadcn_,{className:"group flex items-center gap-x-1 group-data-open:text-foreground hover:text-foreground transition",children:[(0,t.jsx)($.ChevronRight,{size:14,className:"transition-all group-data-open:rotate-90 text-foreground-muted -ml-1"}),(0,t.jsx)("span",{className:"text-sm",children:"More information"})]}),(0,t.jsxs)(B.CollapsibleContent_Shadcn_,{className:"text-sm text-foreground-light mt-2 space-y-2",children:[(0,t.jsx)("p",{children:"By enabling this, you grant permission for our support team to access your project temporarily and, if applicable, to use AI tools to assist in diagnosing and resolving issues. This access may involve analyzing database configurations, query performance, and other relevant data to expedite troubleshooting and enhance support accuracy."}),(0,t.jsxs)("p",{children:["We are committed to maintaining strict data privacy and security standards in all support activities."," ",(0,t.jsx)(E.default,{href:"https://supabase.com/privacy",target:"_blank",rel:"noreferrer",className:"text-foreground-light underline hover:text-foreground transition",children:"Privacy Policy"})]})]})]})]}),children:(0,t.jsx)(V.Switch,{size:"large",id:"allowSupportAccess",checked:e.value,onCheckedChange:e.onChange})})})}],184028)},347595,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(86086),o=e.i(954676),a=e.i(975924),n=e.i(111508),i=e.i(989567),s=e.i(389959),l=e.i(310474),d=e.i(837710),c=e.i(987388),u=e.i(951262),p=e.i(189172),x=e.i(215618),g=e.i(215312),m=e.i(317040),h=e.i(441081);e.s(["HelpPanel",0,({onClose:e,projectRef:f,supportLinkQueryParams:b})=>{let v=(0,m.useAiAssistantStateSnapshot)(),{openSidebar:y,closeSidebar:w}=(0,h.useSidebarManagerSnapshot)(),_=(0,i.useRouter)(),[j,S]=(0,s.useState)("home"),C="support"===j;return(0,t.jsxs)("div",{className:"flex h-full flex-col overflow-hidden",children:[(0,t.jsxs)("div",{className:"flex h-(--header-height) items-center justify-between gap-2 border-b pl-4 pr-3",children:[(0,t.jsxs)("div",{className:"flex min-w-0 items-center gap-1.5 text-xs",children:[C&&(0,t.jsx)(g.ButtonTooltip,{type:"text",className:"h-7 w-7",onClick:()=>S("home"),icon:(0,t.jsx)(o.ChevronLeft,{strokeWidth:1.5}),tooltip:{content:{side:"bottom",text:"Back"}}}),(0,t.jsx)("span",{className:"truncate",children:C?"Contact support":"Help & Support"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(p.SupportFormStatusButton,{}),(0,t.jsx)(g.ButtonTooltip,{type:"text",className:"w-7 h-7",onClick:()=>w(x.SIDEBAR_KEYS.HELP_PANEL),icon:(0,t.jsx)(a.X,{strokeWidth:1.5}),tooltip:{content:{side:"bottom",text:"Close"}}})]})]}),(0,t.jsx)("div",{className:"flex-1 overflow-hidden",children:C?(0,t.jsx)(p.SupportForm,{initialParams:b,onFinish:()=>{S("home")}}):(0,t.jsxs)("div",{className:"flex h-full flex-col overflow-y-auto pb-5",children:[(0,t.jsx)(u.HelpSection,{excludeIds:["discord"],isPlatform:r.IS_PLATFORM,projectRef:f,supportLinkQueryParams:b,onAssistantClick:()=>{e(),y(x.SIDEBAR_KEYS.AI_ASSISTANT),v.newChat(c.ASSISTANT_SUGGESTIONS)},onSupportClick:()=>(S("support"),!1)}),(0,t.jsxs)("div",{className:"flex flex-col gap-4 border-t pt-5",children:[(0,t.jsxs)("div",{className:"px-5 flex flex-col gap-0.5",children:[(0,t.jsx)("h5",{className:"text-foreground",children:"Community support"}),(0,t.jsx)("p",{className:"text-xs text-foreground-lighter text-balance",children:"Our Discord community can help with code-related issues. Many questions are answered in minutes."})]}),(0,t.jsx)("div",{className:"px-5",children:(0,t.jsx)("div",{className:"relative space-y-2 overflow-hidden rounded-sm px-4 py-4 pb-12 shadow-md",style:{background:"#404EED"},children:(0,t.jsxs)("a",{href:"https://discord.supabase.com",target:"_blank",rel:"noreferrer",className:"group dark block cursor-pointer",children:[(0,t.jsx)(n.default,{className:"absolute left-0 top-0 opacity-50 transition-opacity group-hover:opacity-40",src:`${_.basePath}/img/support/discord-bg-small.jpg`,layout:"fill",objectFit:"cover",alt:"Discord illustration"}),(0,t.jsx)(d.Button,{type:"secondary",size:"tiny",icon:(0,t.jsx)(l.default,{src:`${_.basePath}/img/discord-icon.svg`,className:"h-4 w-4"}),children:(0,t.jsx)("span",{style:{color:"#404EED"},children:"Join us on Discord"})})]})})})]})]})})]})}])},142543,e=>{e.n(e.i(347595))}]);