(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},a={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},o={accordion:{variants:{default:{base:`
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
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},21150,e=>{"use strict";e.s(["sqlKeys",0,{query:(e,t)=>["projects",e,"query",...t],ongoingQueries:e=>["projects",e,"ongoing-queries"]}])},714403,591052,e=>{"use strict";e.i(850036);var t=e.i(940562),r=e.i(248593);function a(e){let t=parseFloat(e);return Number.isFinite(t)?t:void 0}function o(e){let t=parseInt(e,10);return Number.isNaN(t)?void 0:t}function i(e){if(e.details){let t=e.details.match(/Rows Removed by Filter:\s*(\d+)/);t&&(e.rowsRemovedByFilter=o(t[1]))}e.children.forEach(i)}function n(e){let t={totalTime:0,totalCost:0,maxCost:0,hasSeqScan:!1,seqScanTables:[],hasIndexScan:!1},r=e=>{e.actualTime&&(t.totalTime=Math.max(t.totalTime,e.actualTime.end)),e.cost&&(t.maxCost=Math.max(t.maxCost,e.cost.end));let a=e.operation.toLowerCase();if(a.includes("seq scan")){t.hasSeqScan=!0;let r=e.details.match(/on\s+((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))*)/);r&&t.seqScanTables.push(r[1])}a.includes("index")&&(t.hasIndexScan=!0),e.children.forEach(r)};return e.forEach(r),t.totalCost=e[0]?.cost?.end??0,t}function s(e){let t=function(e){let t=e.map(e=>e["QUERY PLAN"]||"").filter(Boolean),r=[],i=[],n=/^(Filter|Sort Key|Group Key|Hash Cond|Join Filter|Index Cond|Recheck Cond|Rows Removed by Filter|Rows Removed by Index Recheck|Output|Merge Cond|Sort Method|Worker \d+|Buffers|Planning Time|Execution Time|One-Time Filter|InitPlan|SubPlan):/;for(let e=0;e<t.length;e++){let s=t[e];if(!s.trim())continue;let l=s.match(/^(\s*)/),d=l?l[1].length:0,u=s.includes("->"),c=s,p=d;if(u){let e=s.indexOf("->");p=e,c=s.substring(e+2).trim()}else c=s.trim();if(c.startsWith("Planning Time:")||c.startsWith("Execution Time:")||c.startsWith("Planning:")||c.startsWith("Execution:"))continue;if(n.test(c)&&i.length>0){let e=i[i.length-1].node;e.details+=(e.details?"\n":"")+c;continue}if(!u&&i.length>0&&d>0){let e=i[i.length-1];if(d>e.indent&&!c.match(/^\w+.*\(cost=/)){e.node.details+=(e.node.details?"\n":"")+c;continue}}let f=c.match(/^(.+?)\s*(\([^)]*cost=[^)]+\)(?:\s*\([^)]+\))*)?\s*$/);if(!f)continue;let[,b,g]=f,m=g?g.replace(/^\(|\)$/g,"").replace(/\)\s*\(/g," "):void 0,x=b.trim(),h="",v=b.match(/^(.+?)\s+on\s+(.+)$/i),y=b.match(/^(.+?)\s+using\s+(.+)$/i);v?(x=v[1].trim(),h="on "+v[2].trim()):y&&(x=y[1].trim(),h="using "+y[2].trim()),function(e,t,r,a){for(;a.length>0&&a[a.length-1].indent>=t;)a.pop();0===a.length?r.push(e):a[a.length-1].node.children.push(e),a.push({node:e,indent:t})}(function(e,t,r,i,n){let s={operation:e.trim(),details:t?.trim()||"",level:i,children:[],raw:n};if(r){let e=r.match(/cost=([\d.]+)\.\.([\d.]+)/);if(e){let t=a(e[1]),r=a(e[2]);void 0!==t&&void 0!==r&&(s.cost={start:t,end:r})}let t=r.match(/rows=(\d+)/);t&&(s.rows=o(t[1]));let i=r.match(/width=(\d+)/);i&&(s.width=o(i[1]));let n=r.match(/actual time=([\d.]+)\.\.([\d.]+)/);if(n){let e=a(n[1]),t=a(n[2]);void 0!==e&&void 0!==t&&(s.actualTime={start:e,end:t});let i=r.substring(r.indexOf("actual time=")).match(/rows=(\d+)/);i&&(s.actualRows=o(i[1]))}}return s}(x,h,m,u?Math.floor(p/6)+1:0,s),p,r,i)}return r}(e);return t.forEach(i),t}e.i(242882),e.i(21150),e.s(["calculateMaxDuration",0,function(e){return e.reduce((e,t)=>Math.max(e,function e(t){return Math.max(t.actualTime?t.actualTime.end-t.actualTime.start:0,t.children.reduce((t,r)=>Math.max(t,e(r)),0))}(t)),0)},"calculateSummary",0,n,"createNodeTree",0,s,"parseDetailLines",0,function(e){if(!e)return[];let t=e.split("\n").filter(Boolean),r=[];for(let e of t){let t=e.indexOf(":");t>0?r.push({label:e.substring(0,t+1),value:e.substring(t+1).trim()}):e.trim()&&r.push({label:"",value:e.trim()})}return r}],591052);var l=e.i(234745);e.i(635494);var d=e.i(10429);e.i(837508);let u="Query cost exceeds threshold";async function c({projectRef:e,connectionString:a,sql:o,queryKey:i,handleError:p,isRoleImpersonationEnabled:f=!1,isStatementTimeoutDisabled:b=!1,preflightCheck:g=!1},m,x,h){let v,y;if(!e)throw Error("projectRef is required");if(new Blob([o]).size>.98*d.MB)throw Error("Query is too large to be run via the SQL Editor");let w=new Headers(x);if(a&&w.set("x-connection-encrypted",a),h){let e=await h({query:o,headers:w});"data"in e?v=e.data:y=e.error}else{let t={signal:m,headers:w,params:{path:{ref:e},header:{"x-connection-encrypted":a??"","x-pg-application-name":b?"supabase/dashboard-query-editor":r.DEFAULT_PLATFORM_APPLICATION_NAME}}};if(g){let{data:e}=await (0,l.post)("/platform/pg-meta/{ref}/query",{...t,body:{query:`explain ${o}`,disable_statement_timeout:b},params:{...t.params,query:{key:"preflight-check"}}}),r=e?s(e):void 0,a=r?n(r):void 0,i=a?.totalCost??0;if(i>=2e5)return(0,l.handleError)({message:u,code:i,metadata:{cost:i,sql:o}})}let d=i?.filter(e=>"string"==typeof e||"number"==typeof e).join("-")??"",c=await (0,l.post)("/platform/pg-meta/{ref}/query",{...t,body:{query:o,disable_statement_timeout:b},params:{...t.params,query:{key:d}}});v=c.data,y=c.error}if(y){if(f&&"object"==typeof y&&null!==y&&"error"in y&&"formattedError"in y){let e=y,r=/LINE (\d+):/im,[,a]=r.exec(e.error)??[],o=Number(a);isNaN(o)||(e={...e,error:e.error.replace(r,`LINE ${o-t.ROLE_IMPERSONATION_SQL_LINE_COUNT}:`),formattedError:e.formattedError.replace(r,`LINE ${o-t.ROLE_IMPERSONATION_SQL_LINE_COUNT}:`)}),y=e}if(void 0!==p)return p(y);(0,l.handleError)(y)}return f&&Array.isArray(v)&&v?.[0]?.[t.ROLE_IMPERSONATION_NO_RESULTS]===1?{result:[]}:{result:v}}e.s(["COST_THRESHOLD_ERROR",0,u,"executeSql",0,c],714403)},660908,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let o=r.forwardRef(({className:e,...r},o)=>(0,t.jsx)("textarea",{className:(0,a.cn)("flex min-h-[80px] w-full rounded-md border border-control bg-foreground/[.026] px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-foreground-muted focus:ring-background-control focus:border-control focus-visible:border-control focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-foreground-muted focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",e),ref:o,...r}));o.displayName="Textarea",e.s(["Textarea",0,o])},737018,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(546595),o=r.forwardRef((e,r)=>(0,t.jsx)(a.Primitive.label,{...e,ref:r,onMouseDown:t=>{t.target.closest("button, input, select, textarea")||(e.onMouseDown?.(t),!t.defaultPrevented&&t.detail>1&&t.preventDefault())}}));o.displayName="Label",e.s(["Label",0,o,"Root",0,o],475388);var i=e.i(475388),i=i,n=e.i(766181),s=e.i(843778);let l=(0,n.cva)("text-sm text leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"),d=r.forwardRef(({className:e,...r},a)=>(0,t.jsx)(i.Root,{ref:a,className:(0,s.cn)(l(),e),...r}));d.displayName=i.Root.displayName,e.s(["Label",0,d],737018)},9679,e=>{"use strict";var t=e.i(737018);e.s(["Label_Shadcn_",()=>t.Label])},231665,e=>{"use strict";var t=e.i(478902),r=e.i(766181),a=e.i(389959),o=e.i(843778),i=e.i(837710),n=e.i(348481),s=e.i(660908);let l=(0,r.cva)("text-foreground-light flex h-auto cursor-text select-none items-center justify-center gap-2 text-sm group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",{variants:{align:{"inline-start":"order-first pl-2 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]","inline-end":"order-last pr-2 has-[>button]:mr-[-0.4rem] has-[>kbd]:mr-[-0.35rem]","block-start":"[.border-b]:pb-3 order-first w-full justify-start px-2 pt-2 group-has-[>input]/input-group:pt-2.5","block-end":"[.border-t]:pt-3 order-last w-full justify-start px-2 pb-2 group-has-[>input]/input-group:pb-2.5"}},defaultVariants:{align:"inline-start"}}),d=(0,r.cva)("",{variants:{size:{tiny:"h-6 gap-1 rounded-md px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",small:"h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5"}},defaultVariants:{size:"tiny"}}),u=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(n.Input,{ref:a,"data-slot":"input-group-control",className:(0,o.cn)("flex-1 rounded-none border border-transparent -m-px bg-transparent shadow-none","focus:border-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0","read-only:border-transparent","aria-invalid:border-transparent aria-invalid:bg-transparent","aria-invalid:focus:border-transparent aria-invalid:focus-visible:border-transparent",e),...r}));u.displayName="InputGroupInput";let c=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(s.Textarea,{ref:a,"data-slot":"input-group-control",className:(0,o.cn)("flex-1 resize-none rounded-none border border-transparent bg-transparent py-0 shadow-none","focus:border-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0",e),...r}));c.displayName="InputGroupTextarea",e.s(["InputGroup",0,function({className:e,id:r,"aria-invalid":a,"aria-describedby":i,...n}){return(0,t.jsx)("div",{"data-slot":"input-group",role:"group",className:(0,o.cn)("group/input-group relative items-center outline-hidden transition-[color,box-shadow]","flex rounded-md border border-control bg-foreground/[.026] text-sm","has-[>textarea]:h-auto","has-[>[data-align=inline-start]]:[&>input]:pl-2","has-[>[data-align=inline-end]]:[&>input]:pr-2","has-[>[data-align=block-end]]:pb-0","has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3","has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3","has-[[data-slot=input-group-control]:focus-visible]:outline-hidden has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-background-control has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-foreground-muted","has-[[data-slot][aria-invalid=true]]:bg-destructive-200 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive-400 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40","has-[[data-slot][aria-invalid=true]]:has-[[data-slot=input-group-control]:focus-visible]:border-destructive","has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:text-foreground-muted","has-[[data-slot=input-group-control]:read-only]:border-button",e),...n})},"InputGroupAddon",0,function({className:e,align:r="inline-start",...a}){return(0,t.jsx)("div",{role:"group","data-slot":"input-group-addon","data-align":r,className:(0,o.cn)(l({align:r}),e),onClick:e=>{e.target.closest("button")||e.currentTarget.parentElement?.querySelector("input")?.focus()},...a})},"InputGroupButton",0,function({className:e,type:r="text",size:a="tiny",...n}){return(0,t.jsx)(i.Button,{type:r,size:a,className:(0,o.cn)(d({size:a}),e),...n})},"InputGroupInput",0,u,"InputGroupText",0,function({className:e,...r}){return(0,t.jsx)("span",{className:(0,o.cn)("text-muted-foreground flex items-center gap-2 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",e),...r})},"InputGroupTextarea",0,c])},594661,e=>{"use strict";var t=e.i(389959);e.s(["usePrevious",0,function(e){let r=t.useRef({value:e,previous:e});return t.useMemo(()=>(r.current.value!==e&&(r.current.previous=r.current.value,r.current.value=e),r.current.previous),[e])}])},915993,e=>{"use strict";e.s(["lintKeys",0,{lint:e=>["projects",e,"lint"],lintRules:e=>["projects",e,"lint-rules"]}])},438824,e=>{"use strict";var t=e.i(242882),r=e.i(915993),a=e.i(234745),o=e.i(635494);e.i(10429);var i=e.i(837508);async function n({projectRef:e},t){if(!e)throw Error("Project ref is required");let{data:r,error:o}=await (0,a.get)("/platform/projects/{ref}/run-lints",{params:{path:{ref:e}},signal:t});return o&&(0,a.handleError)(o),r}e.s(["useProjectLintsQuery",0,({projectRef:e},{enabled:a=!0,...s}={})=>{let{data:l}=(0,o.useSelectedProjectQuery)(),d=l?.status===i.PROJECT_STATUS.ACTIVE_HEALTHY;return(0,t.useQuery)({queryKey:r.lintKeys.lint(e),queryFn:({signal:t})=>n({projectRef:e},t),enabled:a&&void 0!==e&&d,...s})}])},217444,e=>{"use strict";var t=e.i(512841);e.s(["AlertTriangle",()=>t.default])},17203,672483,e=>{"use strict";let t=(0,e.i(388019).default)("ExternalLink",[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]);e.s(["default",0,t],672483),e.s(["ExternalLink",0,t],17203)},954676,e=>{"use strict";let t=(0,e.i(388019).default)("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);e.s(["ChevronLeft",0,t],954676)},375761,e=>{"use strict";var t=e.i(802715),r=e.i(355901);let a=async(e,a=t.default)=>{if(!window.document.hasFocus())return void r.toast.error("Unable to copy to clipboard");try{if("u">typeof ClipboardItem&&navigator.clipboard?.write){let t=new ClipboardItem({"text/plain":Promise.resolve(e).then(e=>new Blob([e],{type:"text/plain"}))}),r=()=>{},o=()=>{},i=new Promise((e,t)=>{r=e,o=t});return setTimeout(()=>{navigator.clipboard.write([t]).then(a).then(r).catch(o)},0),i}await Promise.resolve(e).then(e=>navigator.clipboard?.writeText(e)),a()}catch{r.toast.error("Unable to copy to clipboard")}};e.s(["copyToClipboard",0,a])},816467,e=>{"use strict";let t=(0,e.i(388019).default)("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",0,t],816467)},974331,e=>{"use strict";var t=e.i(389959),r=e.i(174617),a=e.i(274664),o=e.i(47015),i=e.i(889251),n=e.i(546595),s=e.i(2664),l=e.i(826524),d=e.i(904641),u=e.i(478902),c="Tabs",[p,f]=(0,a.createContextScope)(c,[o.createRovingFocusGroupScope]),b=(0,o.createRovingFocusGroupScope)(),[g,m]=p(c),x=t.forwardRef((e,t)=>{let{__scopeTabs:r,value:a,onValueChange:o,defaultValue:i,orientation:p="horizontal",dir:f,activationMode:b="automatic",...m}=e,x=(0,s.useDirection)(f),[h,v]=(0,l.useControllableState)({prop:a,onChange:o,defaultProp:i??"",caller:c});return(0,u.jsx)(g,{scope:r,baseId:(0,d.useId)(),value:h,onValueChange:v,orientation:p,dir:x,activationMode:b,children:(0,u.jsx)(n.Primitive.div,{dir:x,"data-orientation":p,...m,ref:t})})});x.displayName=c;var h="TabsList",v=t.forwardRef((e,t)=>{let{__scopeTabs:r,loop:a=!0,...i}=e,s=m(h,r),l=b(r);return(0,u.jsx)(o.Root,{asChild:!0,...l,orientation:s.orientation,dir:s.dir,loop:a,children:(0,u.jsx)(n.Primitive.div,{role:"tablist","aria-orientation":s.orientation,...i,ref:t})})});v.displayName=h;var y="TabsTrigger",w=t.forwardRef((e,t)=>{let{__scopeTabs:a,value:i,disabled:s=!1,...l}=e,d=m(y,a),c=b(a),p=k(d.baseId,i),f=z(d.baseId,i),g=i===d.value;return(0,u.jsx)(o.Item,{asChild:!0,...c,focusable:!s,active:g,children:(0,u.jsx)(n.Primitive.button,{type:"button",role:"tab","aria-selected":g,"aria-controls":f,"data-state":g?"active":"inactive","data-disabled":s?"":void 0,disabled:s,id:p,...l,ref:t,onMouseDown:(0,r.composeEventHandlers)(e.onMouseDown,e=>{s||0!==e.button||!1!==e.ctrlKey?e.preventDefault():d.onValueChange(i)}),onKeyDown:(0,r.composeEventHandlers)(e.onKeyDown,e=>{[" ","Enter"].includes(e.key)&&d.onValueChange(i)}),onFocus:(0,r.composeEventHandlers)(e.onFocus,()=>{let e="manual"!==d.activationMode;g||s||!e||d.onValueChange(i)})})})});w.displayName=y;var _="TabsContent",T=t.forwardRef((e,r)=>{let{__scopeTabs:a,value:o,forceMount:s,children:l,...d}=e,c=m(_,a),p=k(c.baseId,o),f=z(c.baseId,o),b=o===c.value,g=t.useRef(b);return t.useEffect(()=>{let e=requestAnimationFrame(()=>g.current=!1);return()=>cancelAnimationFrame(e)},[]),(0,u.jsx)(i.Presence,{present:s||b,children:({present:t})=>(0,u.jsx)(n.Primitive.div,{"data-state":b?"active":"inactive","data-orientation":c.orientation,role:"tabpanel","aria-labelledby":p,hidden:!t,id:f,tabIndex:0,...d,ref:r,style:{...e.style,animationDuration:g.current?"0s":void 0},children:t&&l})})});function k(e,t){return`${e}-trigger-${t}`}function z(e,t){return`${e}-content-${t}`}T.displayName=_,e.s(["Content",0,T,"List",0,v,"Root",0,x,"Tabs",0,x,"TabsContent",0,T,"TabsList",0,v,"TabsTrigger",0,w,"Trigger",0,w,"createTabsScope",0,f],480215);var j=e.i(480215);e.s(["Tabs",0,j],974331)},412442,e=>{"use strict";var t=e.i(478902),r=e.i(974331),a=e.i(389959),o=e.i(843778);let i=r.Tabs.Root,n=a.forwardRef(({className:e,...a},i)=>(0,t.jsx)(r.Tabs.List,{ref:i,className:(0,o.cn)("flex items-center border-b",e),...a}));n.displayName=r.Tabs.List.displayName;let s=a.forwardRef(({className:e,...a},i)=>(0,t.jsx)(r.Tabs.Trigger,{ref:i,className:(0,o.cn)("inline-flex items-center justify-center whitespace-nowrap py-1.5 text-sm  ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:shadow-xs text-foreground-lighter hover:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent","group",e),...a}));s.displayName=r.Tabs.Trigger.displayName;let l=a.forwardRef(({className:e,...a},i)=>(0,t.jsx)(r.Tabs.Content,{ref:i,className:(0,o.cn)("mt-4 ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",e),...a}));l.displayName=r.Tabs.Content.displayName,e.s(["Tabs",0,i,"TabsContent",0,l,"TabsList",0,n,"TabsTrigger",0,s])},500850,314805,408279,e=>{"use strict";var t=e.i(412442);e.s(["Tabs_Shadcn_",()=>t.Tabs],500850),e.s(["TabsList_Shadcn_",()=>t.TabsList],314805),e.s(["TabsTrigger_Shadcn_",()=>t.TabsTrigger],408279)},289937,e=>{"use strict";let t=(0,e.i(388019).default)("User",[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]]);e.s(["default",0,t])},659016,e=>{"use strict";var t=e.i(289937);e.s(["User",()=>t.default])},250503,76257,e=>{"use strict";let t=(0,e.i(388019).default)("Lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);e.s(["default",0,t],76257),e.s(["Lock",0,t],250503)},219195,e=>{"use strict";let t=(0,e.i(388019).default)("Table2",[["path",{d:"M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",key:"gugj83"}]]);e.s(["Table2",0,t],219195)},968675,e=>{"use strict";let t=(0,e.i(388019).default)("Inbox",[["polyline",{points:"22 12 16 12 14 15 10 15 8 12 2 12",key:"o97t9d"}],["path",{d:"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",key:"oot6mr"}]]);e.s(["Inbox",0,t],968675)},881685,e=>{"use strict";let t=(0,e.i(388019).default)("Box",[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]);e.s(["Box",0,t],881685)},857889,e=>{"use strict";let t=(0,e.i(388019).default)("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);e.s(["Shield",0,t],857889)},843429,290975,369368,915094,e=>{"use strict";var t=e.i(389959),r=e.i(242882);e.i(128328);var a=e.i(86086);let o={list:e=>["projects",e,"banned-ips"]};e.s(["BannedIPKeys",0,o],290975);var i=e.i(234745);async function n({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:r,error:a}=await (0,i.post)("/v1/projects/{ref}/network-bans/retrieve",{params:{path:{ref:e}},signal:t});return a&&(0,i.handleError)(a),r}let s=({projectRef:e},{enabled:t=!0,...i}={})=>(0,r.useQuery)({queryKey:o.list(e),queryFn:({signal:t})=>n({projectRef:e},t),enabled:t&&a.IS_PLATFORM&&void 0!==e,retry:!1,refetchOnWindowFocus:!1,staleTime:6e4,...i});e.s(["useBannedIPsQuery",0,s],369368);var l=e.i(124416);let d=e=>`signal:banned-ip:${e}:v1`;e.s(["useAdvisorSignals",0,({projectRef:e,enabled:r=!0})=>{let{data:a,isPending:o,isError:i}=s({projectRef:e},{enabled:r}),n=e?`advisor-signal-dismissals:${e}`:"advisor-signal-dismissals:unknown-project",[u,c]=(0,l.useLocalStorageQuery)(n,[]),p=(0,t.useMemo)(()=>new Set(u),[u]),f=(0,t.useCallback)(e=>{c(t=>t.includes(e)?t:[...t,e])},[c]),b=(0,t.useMemo)(()=>(({projectRef:e,bannedIPsData:t})=>e?(t?.banned_ipv4_addresses??[]).map(t=>({id:d(t),dismissalKey:d(t),source:"signal",type:"banned-ip",severity:"warning",tab:"security",title:"Banned IP address",summary:`The IP address \`${t}\` is temporarily blocked because of suspicious traffic or repeated failed password attempts.`,description:"This IP address is temporarily blocked because of suspicious traffic or repeated failed password attempts. If this block is expected, you can dismiss this signal or remove the ban.",docsUrl:"https://supabase.com/docs/reference/cli/supabase-network-bans",actions:[{label:"Edit network bans",href:`/project/${e}/database/settings#banned-ips`}],sourceData:{type:"banned-ip",ip:t}})):[])({projectRef:e,bannedIPsData:a}),[e,a]);return(0,t.useEffect)(()=>{if(!a||!u.some(e=>e.startsWith("signal:banned-ip:")&&!b.some(t=>t.dismissalKey===e)))return;let e=new Set(b.map(e=>e.dismissalKey));c(t=>t.filter(t=>!t.startsWith("signal:banned-ip:")||e.has(t)))},[a,b,u,c]),{data:(0,t.useMemo)(()=>b.filter(e=>!p.has(e.dismissalKey)),[b,p]),dismissSignal:f,isPending:o,isError:i}}],843429);var u=e.i(867088);let c=10;async function p(e,t){let{status:r,filters:a,page:o=0,limit:n=c}=e,{priority:s=[],organizations:l=[],projects:d=[]}=a,{data:u,error:p}=await (0,i.get)("/platform/notifications",{params:{query:{offset:o*n,limit:n,...void 0!==r?{status:r}:{status:"new,seen"},...s.length>0?{priority:s.join(",")}:{},...l.length>0?{org_slug:l.join(",")}:{},...d.length>0?{project_ref:d.join(",")}:{}}},headers:{Version:"2"},signal:t});return p&&(0,i.handleError)(p),u}e.s(["useNotificationsV2Query",0,({status:e,filters:t,limit:r=c},{enabled:a,...o}={})=>(0,u.useInfiniteQuery)({queryKey:["notifications",{status:e,filters:t,limit:r}],queryFn:({signal:a,pageParam:o})=>p({status:e,filters:t,limit:r,page:o},a),enabled:a,initialPageParam:0,getNextPageParam(e,t){let a=t.length;if(!((e??[]).length<r))return a},...o})],915094)}]);