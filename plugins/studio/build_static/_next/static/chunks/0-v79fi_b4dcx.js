(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,375761,e=>{"use strict";var t=e.i(802715),n=e.i(355901);let r=async(e,r=t.default)=>{if(!window.document.hasFocus())return void n.toast.error("Unable to copy to clipboard");try{if("u">typeof ClipboardItem&&navigator.clipboard?.write){let t=new ClipboardItem({"text/plain":Promise.resolve(e).then(e=>new Blob([e],{type:"text/plain"}))}),n=()=>{},a=()=>{},o=new Promise((e,t)=>{n=e,a=t});return setTimeout(()=>{navigator.clipboard.write([t]).then(r).then(n).catch(a)},0),o}await Promise.resolve(e).then(e=>navigator.clipboard?.writeText(e)),r()}catch{n.toast.error("Unable to copy to clipboard")}};e.s(["copyToClipboard",0,r])},816467,e=>{"use strict";let t=(0,e.i(388019).default)("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",0,t],816467)},938933,305551,e=>{"use strict";var t=e.i(389959);let n={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},r={tiny:`${n.size.text.tiny} ${n.size.padding.tiny}`,small:`${n.size.text.small} ${n.size.padding.small}`,medium:`${n.size.text.medium} ${n.size.padding.medium}`,large:`${n.size.text.large} ${n.size.padding.large}`,xlarge:`${n.size.text.xlarge} ${n.size.padding.xlarge}`},a={accordion:{variants:{default:{base:`
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
      ${n.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${n.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${n.border.secondary}
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
      `},block:"w-full flex items-center justify-center",size:{...r},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${n.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${n.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...r},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...n.size.text}},label_optional:{base:"text-foreground-lighter",size:{...n.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...n.size.text}},label_before:{base:"text-foreground-lighter ",size:{...n.size.text}},label_after:{base:"text-foreground-lighter",size:{...n.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...n.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
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
      ${n.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${n.placeholder}
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
    `,size:{...r},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,a],305551);let o=(0,t.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:n}}=(0,t.useContext)(o);return n||(n=a.accordion),n=JSON.parse(n=JSON.stringify(n).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),n=e.i(816467),r=e.i(389959),a=e.i(843778),o=e.i(375761),i=e.i(231665),s=e.i(938933);let l=(0,r.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:p=!1,actions:u,onCopy:c,iconContainerClassName:g,containerClassName:m,size:f="small",...b},h)=>{let[x,_]=(0,r.useState)("Copy"),[S,v]=(0,r.useState)(!0),y=(0,s.default)("input"),T=[];return f&&T.push(y.size[f]),(0,t.jsxs)(i.InputGroup,{className:m,children:[(0,t.jsx)(i.InputGroupInput,{ref:h,onFocus:e=>e.target.select(),...b,size:f,onCopy:c,type:p&&S?"password":b.type,disabled:b.disabled,className:(0,a.cn)(...T,b.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(i.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(i.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(p&&S)?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",className:(0,a.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(n.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=b.value,void(0,o.copyToClipboard)(e,()=>{_("Copied"),setTimeout(function(){_("Copy")},3e3),c?.()})},children:x}):null,p&&S?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",onClick:function(){v(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},710083,285473,908663,e=>{"use strict";var t=e.i(725663),n=e.i(851165),r=e.i(11694),a=e.i(132184),o=e.i(40108);function i(e,t=[]){return[e,t]}function s(e,t){for(let n of e[1]){let e=n[0].type;if(t(n,e))return!0}return!1}function l(e){let t=(0,r.getSentryCarrier)(o.GLOBAL_OBJ);return t.encodePolyfill?t.encodePolyfill(e):new TextEncoder().encode(e)}function d(e){return[{type:"span"},e]}let p={session:"session",sessions:"session",attachment:"attachment",transaction:"transaction",event:"error",client_report:"internal",user_report:"default",profile:"profile",profile_chunk:"profile",replay_event:"replay",replay_recording:"replay",check_in:"monitor",feedback:"feedback",span:"span",raw_security:"security",log:"log_item",metric:"metric",trace_metric:"metric"};function u(e){if(!e?.sdk)return;let{name:t,version:n}=e.sdk;return{name:t,version:n}}function c(e,t,r,a){let o=e.sdkProcessingMetadata?.dynamicSamplingContext;return{event_id:e.event_id,sent_at:new Date().toISOString(),...t&&{sdk:t},...!!r&&a&&{dsn:(0,n.dsnToString)(a)},...o&&{trace:o}}}e.s(["addItemToEnvelope",0,function(e,t){let[n,r]=e;return[n,[...r,t]]},"createAttachmentEnvelopeItem",0,function(e){let t="string"==typeof e.data?l(e.data):e.data;return[{type:"attachment",length:t.length,filename:e.filename,content_type:e.contentType,attachment_type:e.attachmentType},t]},"createEnvelope",0,i,"createEventEnvelopeHeaders",0,c,"createSpanEnvelopeItem",0,d,"envelopeContainsItemType",0,function(e,t){return s(e,(e,n)=>t.includes(n))},"envelopeItemTypeToDataCategory",0,function(e){return p[e]},"forEachEnvelopeItem",0,s,"getSdkMetadataForEnvelopeHeader",0,u,"parseEnvelope",0,function(e){let t="string"==typeof e?l(e):e;function n(e){let n=t.subarray(0,e);return t=t.subarray(e+1),n}function a(){var e;let a,i=t.indexOf(10);return i<0&&(i=t.length),JSON.parse((e=n(i),(a=(0,r.getSentryCarrier)(o.GLOBAL_OBJ)).decodePolyfill?a.decodePolyfill(e):new TextDecoder().decode(e)))}let i=a(),s=[];for(;t.length;){let e=a(),t="number"==typeof e.length?e.length:void 0;s.push([e,t?n(t):a()])}return[i,s]},"serializeEnvelope",0,function(e){let[t,n]=e,r=JSON.stringify(t);function o(e){"string"==typeof r?r="string"==typeof e?r+e:[l(r),e]:r.push("string"==typeof e?l(e):e)}for(let e of n){let[t,n]=e;if(o(`
${JSON.stringify(t)}
`),"string"==typeof n||n instanceof Uint8Array)o(n);else{let e;try{e=JSON.stringify(n)}catch{e=JSON.stringify((0,a.normalize)(n))}o(e)}}return"string"==typeof r?r:function(e){let t=new Uint8Array(e.reduce((e,t)=>e+t.length,0)),n=0;for(let r of e)t.set(r,n),n+=r.length;return t}(r)}],285473);var g=e.i(35024),m=e.i(521852),f=e.i(507391);function b(e){m.debug.log(`Ignoring span ${e.op} - ${e.description} because it matches \`ignoreSpans\`.`)}function h(e,t){if(!t?.length||!e.description)return!1;for(let r of t){var n;if("string"==typeof(n=r)||n instanceof RegExp){if((0,f.isMatchingPattern)(e.description,r))return g.DEBUG_BUILD&&b(e),!0;continue}if(!r.name&&!r.op)continue;let t=!r.name||(0,f.isMatchingPattern)(e.description,r.name),a=!r.op||e.op&&(0,f.isMatchingPattern)(e.op,r.op);if(t&&a)return g.DEBUG_BUILD&&b(e),!0}return!1}e.s(["reparentChildSpans",0,function(e,t){let n=t.parent_span_id,r=t.span_id;if(n)for(let t of e)t.parent_span_id===r&&(t.parent_span_id=n)},"shouldIgnoreSpan",0,h],908663);var x=e.i(81307);e.s(["createEventEnvelope",0,function(e,t,n,r){let a=u(n),o=e.type&&"replay_event"!==e.type?e.type:"event";!function(e,t){if(!t)return;let n=e.sdk||{};e.sdk={...n,name:n.name||t.name,version:n.version||t.version,integrations:[...e.sdk?.integrations||[],...t.integrations||[]],packages:[...e.sdk?.packages||[],...t.packages||[]],settings:e.sdk?.settings||t.settings?{...e.sdk?.settings,...t.settings}:void 0}}(e,n?.sdk);let s=c(e,a,r,t);return delete e.sdkProcessingMetadata,i(s,[[{type:o},e]])},"createSessionEnvelope",0,function(e,t,r,a){let o=u(r);return i({sent_at:new Date().toISOString(),...o&&{sdk:o},...!!a&&t&&{dsn:(0,n.dsnToString)(t)}},["aggregates"in e?[{type:"sessions"},e]:[{type:"session"},e.toJSON()]])},"createSpanEnvelope",0,function(e,r){let a=(0,t.getDynamicSamplingContextFromSpan)(e[0]),o=r?.getDsn(),s=r?.getOptions().tunnel,l={sent_at:new Date().toISOString(),...!!a.trace_id&&!!a.public_key&&{trace:a},...!!s&&o&&{dsn:(0,n.dsnToString)(o)}},{beforeSendSpan:p,ignoreSpans:u}=r?.getOptions()||{},c=u?.length?e.filter(e=>!h((0,x.spanToJSON)(e),u)):e,g=e.length-c.length;g&&r?.recordDroppedEvent("before_send","span",g);let m=p?e=>{let t=(0,x.spanToJSON)(e),n=p(t);return n||((0,x.showSpanDropWarning)(),t)}:x.spanToJSON,f=[];for(let e of c){let t=m(e);t&&f.push(d(t))}return i(l,f)}],710083)},750671,e=>{"use strict";var t=e.i(488153),n=e.i(81307);e.s(["SentryNonRecordingSpan",0,class{constructor(e={}){this._traceId=e.traceId||(0,t.generateTraceId)(),this._spanId=e.spanId||(0,t.generateSpanId)()}spanContext(){return{spanId:this._spanId,traceId:this._traceId,traceFlags:n.TRACE_FLAG_NONE}}end(e){}setAttribute(e,t){return this}setAttributes(e){return this}setStatus(e){return this}updateName(e){return this}isRecording(){return!1}addEvent(e,t,n){return this}addLink(e){return this}addLinks(e){return this}recordException(e,t){}}])},642200,e=>{"use strict";var t=e.i(35024),n=e.i(521852),r=e.i(81307);e.s(["logSpanEnd",0,function(e){if(!t.DEBUG_BUILD)return;let{description:a="< unknown name >",op:o="< unknown op >"}=(0,r.spanToJSON)(e),{spanId:i}=e.spanContext(),s=(0,r.getRootSpan)(e)===e,l=`[Tracing] Finishing "${o}" ${s?"root ":""}span "${a}" with ID ${i}`;n.debug.log(l)},"logSpanStart",0,function(e){if(!t.DEBUG_BUILD)return;let{description:a="< unknown name >",op:o="< unknown op >",parent_span_id:i}=(0,r.spanToJSON)(e),{spanId:s}=e.spanContext(),l=(0,r.spanIsSampled)(e),d=(0,r.getRootSpan)(e),p=d===e,u=`[Tracing] Starting ${l?"sampled":"unsampled"} ${p?"root ":""}span`,c=[`op: ${o}`,`name: ${a}`,`ID: ${s}`];if(i&&c.push(`parent ID: ${i}`),!p){let{op:e,description:t}=(0,r.spanToJSON)(d);c.push(`root ID: ${d.spanContext().spanId}`),e&&c.push(`root op: ${e}`),t&&c.push(`root description: ${t}`)}n.debug.log(`${u}
  ${c.join("\n  ")}`)}])},888282,909608,e=>{"use strict";var t=e.i(469449),n=e.i(35024),r=e.i(710083),a=e.i(903494),o=e.i(521852),i=e.i(488153),s=e.i(81307),l=e.i(50382),d=e.i(725663),p=e.i(642200);function u(e){if(!e||0===e.length)return;let t={};return e.forEach(e=>{let n=e.attributes||{},r=n[a.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT],o=n[a.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE];"string"==typeof r&&"number"==typeof o&&(t[e.name]={value:o,unit:r})}),t}e.s(["setMeasurement",0,function(e,t,r,i=(0,s.getActiveSpan)()){let l=i&&(0,s.getRootSpan)(i);l&&(n.DEBUG_BUILD&&o.debug.log(`[Measurement] Setting measurement on root span: ${e} = ${t} ${r}`),l.addEvent(e,{[a.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_VALUE]:t,[a.SEMANTIC_ATTRIBUTE_SENTRY_MEASUREMENT_UNIT]:r}))},"timedEventsToMeasurements",0,u],909608);var c=e.i(596100);class g{constructor(e={}){this._traceId=e.traceId||(0,i.generateTraceId)(),this._spanId=e.spanId||(0,i.generateSpanId)(),this._startTime=e.startTimestamp||(0,l.timestampInSeconds)(),this._links=e.links,this._attributes={},this.setAttributes({[a.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]:"manual",[a.SEMANTIC_ATTRIBUTE_SENTRY_OP]:e.op,...e.attributes}),this._name=e.name,e.parentSpanId&&(this._parentSpanId=e.parentSpanId),"sampled"in e&&(this._sampled=e.sampled),e.endTimestamp&&(this._endTime=e.endTimestamp),this._events=[],this._isStandaloneSpan=e.isStandalone,this._endTime&&this._onSpanEnded()}addLink(e){return this._links?this._links.push(e):this._links=[e],this}addLinks(e){return this._links?this._links.push(...e):this._links=e,this}recordException(e,t){}spanContext(){let{_spanId:e,_traceId:t,_sampled:n}=this;return{spanId:e,traceId:t,traceFlags:n?s.TRACE_FLAG_SAMPLED:s.TRACE_FLAG_NONE}}setAttribute(e,t){return void 0===t?delete this._attributes[e]:this._attributes[e]=t,this}setAttributes(e){return Object.keys(e).forEach(t=>this.setAttribute(t,e[t])),this}updateStartTime(e){this._startTime=(0,s.spanTimeInputToSeconds)(e)}setStatus(e){return this._status=e,this}updateName(e){return this._name=e,this.setAttribute(a.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,"custom"),this}end(e){this._endTime||(this._endTime=(0,s.spanTimeInputToSeconds)(e),(0,p.logSpanEnd)(this),this._onSpanEnded())}getSpanJSON(){return{data:this._attributes,description:this._name,op:this._attributes[a.SEMANTIC_ATTRIBUTE_SENTRY_OP],parent_span_id:this._parentSpanId,span_id:this._spanId,start_timestamp:this._startTime,status:(0,s.getStatusMessage)(this._status),timestamp:this._endTime,trace_id:this._traceId,origin:this._attributes[a.SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN],profile_id:this._attributes[a.SEMANTIC_ATTRIBUTE_PROFILE_ID],exclusive_time:this._attributes[a.SEMANTIC_ATTRIBUTE_EXCLUSIVE_TIME],measurements:u(this._events),is_segment:this._isStandaloneSpan&&(0,s.getRootSpan)(this)===this||void 0,segment_id:this._isStandaloneSpan?(0,s.getRootSpan)(this).spanContext().spanId:void 0,links:(0,s.convertSpanLinksForEnvelope)(this._links)}}isRecording(){return!this._endTime&&!!this._sampled}addEvent(e,t,r){n.DEBUG_BUILD&&o.debug.log("[Tracing] Adding an event to span:",e);let a=m(t)?t:r||(0,l.timestampInSeconds)(),i=m(t)?{}:t||{},d={name:e,time:(0,s.spanTimeInputToSeconds)(a),attributes:i};return this._events.push(d),this}isStandaloneSpan(){return!!this._isStandaloneSpan}_onSpanEnded(){let e=(0,t.getClient)();if(e&&e.emit("spanEnd",this),!(this._isStandaloneSpan||this===(0,s.getRootSpan)(this)))return;if(this._isStandaloneSpan)return void(this._sampled?function(e){let n=(0,t.getClient)();if(!n)return;let r=e[1];r&&0!==r.length?n.sendEnvelope(e):n.recordDroppedEvent("before_send","span")}((0,r.createSpanEnvelope)([this],e)):(n.DEBUG_BUILD&&o.debug.log("[Tracing] Discarding standalone span because its trace was not chosen to be sampled."),e&&e.recordDroppedEvent("sample_rate","span")));let a=this._convertSpanToTransaction();a&&((0,c.getCapturedScopesOnSpan)(this).scope||(0,t.getCurrentScope)()).captureEvent(a)}_convertSpanToTransaction(){if(!f((0,s.spanToJSON)(this)))return;this._name||(n.DEBUG_BUILD&&o.debug.warn("Transaction has no name, falling back to `<unlabeled transaction>`."),this._name="<unlabeled transaction>");let{scope:e,isolationScope:t}=(0,c.getCapturedScopesOnSpan)(this),r=e?.getScopeData().sdkProcessingMetadata?.normalizedRequest;if(!0!==this._sampled)return;let i=(0,s.getSpanDescendants)(this).filter(e=>{var t;return e!==this&&!((t=e)instanceof g&&t.isStandaloneSpan())}).map(e=>(0,s.spanToJSON)(e)).filter(f),l=this._attributes[a.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE];delete this._attributes[a.SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME],i.forEach(e=>{delete e.data[a.SEMANTIC_ATTRIBUTE_SENTRY_CUSTOM_SPAN_NAME]});let p={contexts:{trace:(0,s.spanToTransactionTraceContext)(this)},spans:i.length>1e3?i.sort((e,t)=>e.start_timestamp-t.start_timestamp).slice(0,1e3):i,start_timestamp:this._startTime,timestamp:this._endTime,transaction:this._name,type:"transaction",sdkProcessingMetadata:{capturedSpanScope:e,capturedSpanIsolationScope:t,dynamicSamplingContext:(0,d.getDynamicSamplingContextFromSpan)(this)},request:r,...l&&{transaction_info:{source:l}}},m=u(this._events);return m&&Object.keys(m).length&&(n.DEBUG_BUILD&&o.debug.log("[Measurements] Adding measurements to transaction event",JSON.stringify(m,void 0,2)),p.measurements=m),p}}function m(e){return e&&"number"==typeof e||e instanceof Date||Array.isArray(e)}function f(e){return!!e.start_timestamp&&!!e.timestamp&&!!e.span_id&&!!e.trace_id}e.s(["SentrySpan",0,g],888282)},90966,e=>{"use strict";var t=e.i(334251);e.s(["handleCallbackErrors",0,function(e,n,r=()=>{},a=()=>{}){var o,i,s,l;let d;try{d=e()}catch(e){throw n(e),r(),e}return o=d,i=n,s=r,l=a,(0,t.isThenable)(o)?o.then(e=>(s(),l(e),e),e=>{throw i(e),s(),e}):(s(),l(o),o)}])},698985,e=>{"use strict";var t=e.i(35024),n=e.i(521852),r=e.i(432046),a=e.i(724290);e.s(["sampleSpan",0,function(e,o,i){let s,l;if(!(0,r.hasSpansEnabled)(e))return[!1];"function"==typeof e.tracesSampler?(s=e.tracesSampler({...o,inheritOrSampleWith:e=>"number"==typeof o.parentSampleRate?o.parentSampleRate:"boolean"==typeof o.parentSampled?Number(o.parentSampled):e}),l=!0):void 0!==o.parentSampled?s=o.parentSampled:void 0!==e.tracesSampleRate&&(s=e.tracesSampleRate,l=!0);let d=(0,a.parseSampleRate)(s);if(void 0===d)return t.DEBUG_BUILD&&n.debug.warn(`[Tracing] Discarding root span because of invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(s)} of type ${JSON.stringify(typeof s)}.`),[!1];if(!d)return t.DEBUG_BUILD&&n.debug.log(`[Tracing] Discarding transaction because ${"function"==typeof e.tracesSampler?"tracesSampler returned 0 or false":"a negative sampling decision was inherited or tracesSampleRate is set to 0"}`),[!1,d,l];let p=i<d;return!p&&t.DEBUG_BUILD&&n.debug.log(`[Tracing] Discarding transaction because it's not included in the random sample (sampling rate = ${Number(s)})`),[p,d,l]}])},837688,e=>{"use strict";var t=e.i(117446),n=e.i(11694),r=e.i(469449),a=e.i(35024),o=e.i(903494),i=e.i(626607),s=e.i(521852),l=e.i(90966),d=e.i(432046),p=e.i(724290),u=e.i(488153),c=e.i(248024),g=e.i(81307),m=e.i(234990),f=e.i(725663),b=e.i(642200),h=e.i(698985),x=e.i(750671),_=e.i(888282),S=e.i(129235),v=e.i(596100);let y="__SENTRY_SUPPRESS_TRACING__";function T(e,t){let n=C();return n.withActiveSpan?n.withActiveSpan(e,t):(0,r.withScope)(n=>((0,c._setSpanForScope)(n,e||void 0),t(n)))}function w(e){return(0,r.withScope)(t=>(t.setPropagationContext({traceId:(0,u.generateTraceId)(),sampleRand:Math.random()}),a.DEBUG_BUILD&&s.debug.log(`Starting a new trace with id ${t.getPropagationContext().traceId}`),T(null,e)))}function E({parentSpan:e,spanArguments:t,forceTransaction:n,scope:a}){let o;if(!(0,d.hasSpansEnabled)()){let r=new x.SentryNonRecordingSpan;if(n||!e){let e={sampled:"false",sample_rate:"0",transaction:t.name,...(0,f.getDynamicSamplingContextFromSpan)(r)};(0,f.freezeDscOnSpan)(r,e)}return r}let i=(0,r.getIsolationScope)();if(e&&!n)o=function(e,t,n){let{spanId:a,traceId:o}=e.spanContext(),i=!t.getScopeData().sdkProcessingMetadata[y]&&(0,g.spanIsSampled)(e),s=i?new _.SentrySpan({...n,parentSpanId:a,traceId:o,sampled:i}):new x.SentryNonRecordingSpan({traceId:o});(0,g.addChildSpanToSpan)(e,s);let l=(0,r.getClient)();return l&&(l.emit("spanStart",s),n.endTimestamp&&l.emit("spanEnd",s)),s}(e,a,t),(0,g.addChildSpanToSpan)(e,o);else if(e){let n=(0,f.getDynamicSamplingContextFromSpan)(e),{traceId:r,spanId:i}=e.spanContext(),s=(0,g.spanIsSampled)(e);o=N({traceId:r,parentSpanId:i,...t},a,s),(0,f.freezeDscOnSpan)(o,n)}else{let{traceId:e,dsc:n,parentSpanId:r,sampled:s}={...i.getPropagationContext(),...a.getPropagationContext()};o=N({traceId:e,parentSpanId:r,...t},a,s),n&&(0,f.freezeDscOnSpan)(o,n)}return(0,b.logSpanStart)(o),(0,v.setCapturedScopesOnSpan)(o,a,i),o}function I(e){let t={isStandalone:(e.experimental||{}).standalone,...e};if(e.startTime){let n={...t};return n.startTimestamp=(0,g.spanTimeInputToSeconds)(e.startTime),delete n.startTime,n}return t}function C(){let e=(0,n.getMainCarrier)();return(0,t.getAsyncContextStrategy)(e)}function N(e,t,n){let i=(0,r.getClient)(),l=i?.getOptions()||{},{name:d=""}=e,u={spanAttributes:{...e.attributes},spanName:d,parentSampled:n};i?.emit("beforeSampling",u,{decision:!1});let c=u.parentSampled??n,g=u.spanAttributes,m=t.getPropagationContext(),[f,b,x]=t.getScopeData().sdkProcessingMetadata[y]?[!1]:(0,h.sampleSpan)(l,{name:d,parentSampled:c,attributes:g,parentSampleRate:(0,p.parseSampleRate)(m.dsc?.sample_rate)},m.sampleRand),S=new _.SentrySpan({...e,attributes:{[o.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]:"custom",[o.SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]:void 0!==b&&x?b:void 0,...g},sampled:f});return!f&&i&&(a.DEBUG_BUILD&&s.debug.log("[Tracing] Discarding root span because its trace was not chosen to be sampled."),i.recordDroppedEvent("sample_rate","transaction")),i&&i.emit("spanStart",S),S}function R(e,t){if(t)return t;if(null===t)return;let n=(0,c._getSpanForScope)(e);if(!n)return;let a=(0,r.getClient)();return(a?a.getOptions():{}).parentSpanIsAlwaysRootSpan?(0,g.getRootSpan)(n):n}function A(e){return void 0!==e?t=>T(e,t):e=>e()}e.s(["continueTrace",0,(e,a)=>{let o=(0,n.getMainCarrier)(),s=(0,t.getAsyncContextStrategy)(o);if(s.continueTrace)return s.continueTrace(e,a);let{sentryTrace:l,baggage:d}=e,p=(0,r.getClient)(),u=(0,i.baggageHeaderToDynamicSamplingContext)(d);return p&&!(0,m.shouldContinueTrace)(p,u?.org_id)?w(a):(0,r.withScope)(e=>{let t=(0,m.propagationContextFromHeaders)(l,d);return e.setPropagationContext(t),a()})},"startInactiveSpan",0,function(e){let t=C();if(t.startInactiveSpan)return t.startInactiveSpan(e);let n=I(e),{forceTransaction:a,parentSpan:o}=e;return(e.scope?t=>(0,r.withScope)(e.scope,t):void 0!==o?e=>T(o,e):e=>e())(()=>{let t=(0,r.getCurrentScope)(),i=R(t,o);return e.onlyIfParent&&!i?new x.SentryNonRecordingSpan:E({parentSpan:i,spanArguments:n,forceTransaction:a,scope:t})})},"startNewTrace",0,w,"startSpan",0,function(e,t){let n=C();if(n.startSpan)return n.startSpan(e,t);let a=I(e),{forceTransaction:o,parentSpan:i,scope:s}=e,d=s?.clone();return(0,r.withScope)(d,()=>A(i)(()=>{let n=(0,r.getCurrentScope)(),s=R(n,i),d=e.onlyIfParent&&!s?new x.SentryNonRecordingSpan:E({parentSpan:s,spanArguments:a,forceTransaction:o,scope:n});return(0,c._setSpanForScope)(n,d),(0,l.handleCallbackErrors)(()=>t(d),()=>{let{status:e}=(0,g.spanToJSON)(d);d.isRecording()&&(!e||"ok"===e)&&d.setStatus({code:S.SPAN_STATUS_ERROR,message:"internal_error"})},()=>{d.end()})}))},"startSpanManual",0,function(e,t){let n=C();if(n.startSpanManual)return n.startSpanManual(e,t);let a=I(e),{forceTransaction:o,parentSpan:i,scope:s}=e,d=s?.clone();return(0,r.withScope)(d,()=>A(i)(()=>{let n=(0,r.getCurrentScope)(),s=R(n,i),d=e.onlyIfParent&&!s?new x.SentryNonRecordingSpan:E({parentSpan:s,spanArguments:a,forceTransaction:o,scope:n});return(0,c._setSpanForScope)(n,d),(0,l.handleCallbackErrors)(()=>t(d,()=>d.end()),()=>{let{status:e}=(0,g.spanToJSON)(d);d.isRecording()&&(!e||"ok"===e)&&d.setStatus({code:S.SPAN_STATUS_ERROR,message:"internal_error"})})}))},"suppressTracing",0,function(e){let t=C();return t.suppressTracing?t.suppressTracing(e):(0,r.withScope)(t=>{t.setSDKProcessingMetadata({[y]:!0});let n=e();return t.setSDKProcessingMetadata({[y]:void 0}),n})},"withActiveSpan",0,T])}]);