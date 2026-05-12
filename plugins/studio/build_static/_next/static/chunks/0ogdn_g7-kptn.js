(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,375761,e=>{"use strict";var t=e.i(802715),r=e.i(355901);let a=async(e,a=t.default)=>{if(!window.document.hasFocus())return void r.toast.error("Unable to copy to clipboard");try{if("u">typeof ClipboardItem&&navigator.clipboard?.write){let t=new ClipboardItem({"text/plain":Promise.resolve(e).then(e=>new Blob([e],{type:"text/plain"}))}),r=()=>{},o=()=>{},i=new Promise((e,t)=>{r=e,o=t});return setTimeout(()=>{navigator.clipboard.write([t]).then(a).then(r).catch(o)},0),i}await Promise.resolve(e).then(e=>navigator.clipboard?.writeText(e)),a()}catch{r.toast.error("Unable to copy to clipboard")}};e.s(["copyToClipboard",0,a])},816467,e=>{"use strict";let t=(0,e.i(388019).default)("Copy",[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]);e.s(["Copy",0,t],816467)},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},660908,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let o=r.forwardRef(({className:e,...r},o)=>(0,t.jsx)("textarea",{className:(0,a.cn)("flex min-h-[80px] w-full rounded-md border border-control bg-foreground/[.026] px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-foreground-muted focus:ring-background-control focus:border-control focus-visible:border-control focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-foreground-muted focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",e),ref:o,...r}));o.displayName="Textarea",e.s(["Textarea",0,o])},737018,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(546595),o=r.forwardRef((e,r)=>(0,t.jsx)(a.Primitive.label,{...e,ref:r,onMouseDown:t=>{t.target.closest("button, input, select, textarea")||(e.onMouseDown?.(t),!t.defaultPrevented&&t.detail>1&&t.preventDefault())}}));o.displayName="Label",e.s(["Label",0,o,"Root",0,o],475388);var i=e.i(475388),i=i,n=e.i(766181),s=e.i(843778);let l=(0,n.cva)("text-sm text leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"),d=r.forwardRef(({className:e,...r},a)=>(0,t.jsx)(i.Root,{ref:a,className:(0,s.cn)(l(),e),...r}));d.displayName=i.Root.displayName,e.s(["Label",0,d],737018)},9679,e=>{"use strict";var t=e.i(737018);e.s(["Label_Shadcn_",()=>t.Label])},231665,e=>{"use strict";var t=e.i(478902),r=e.i(766181),a=e.i(389959),o=e.i(843778),i=e.i(837710),n=e.i(348481),s=e.i(660908);let l=(0,r.cva)("text-foreground-light flex h-auto cursor-text select-none items-center justify-center gap-2 text-sm group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4",{variants:{align:{"inline-start":"order-first pl-2 has-[>button]:ml-[-0.45rem] has-[>kbd]:ml-[-0.35rem]","inline-end":"order-last pr-2 has-[>button]:mr-[-0.4rem] has-[>kbd]:mr-[-0.35rem]","block-start":"[.border-b]:pb-3 order-first w-full justify-start px-2 pt-2 group-has-[>input]/input-group:pt-2.5","block-end":"[.border-t]:pt-3 order-last w-full justify-start px-2 pb-2 group-has-[>input]/input-group:pb-2.5"}},defaultVariants:{align:"inline-start"}}),d=(0,r.cva)("",{variants:{size:{tiny:"h-6 gap-1 rounded-md px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",small:"h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5"}},defaultVariants:{size:"tiny"}}),u=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(n.Input,{ref:a,"data-slot":"input-group-control",className:(0,o.cn)("flex-1 rounded-none border border-transparent -m-px bg-transparent shadow-none","focus:border-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0","read-only:border-transparent","aria-invalid:border-transparent aria-invalid:bg-transparent","aria-invalid:focus:border-transparent aria-invalid:focus-visible:border-transparent",e),...r}));u.displayName="InputGroupInput";let c=a.forwardRef(({className:e,...r},a)=>(0,t.jsx)(s.Textarea,{ref:a,"data-slot":"input-group-control",className:(0,o.cn)("flex-1 resize-none rounded-none border border-transparent bg-transparent py-0 shadow-none","focus:border-transparent focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0",e),...r}));c.displayName="InputGroupTextarea",e.s(["InputGroup",0,function({className:e,id:r,"aria-invalid":a,"aria-describedby":i,...n}){return(0,t.jsx)("div",{"data-slot":"input-group",role:"group",className:(0,o.cn)("group/input-group relative items-center outline-hidden transition-[color,box-shadow]","flex rounded-md border border-control bg-foreground/[.026] text-sm","has-[>textarea]:h-auto","has-[>[data-align=inline-start]]:[&>input]:pl-2","has-[>[data-align=inline-end]]:[&>input]:pr-2","has-[>[data-align=block-end]]:pb-0","has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3","has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3","has-[[data-slot=input-group-control]:focus-visible]:outline-hidden has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-background-control has-[[data-slot=input-group-control]:focus-visible]:ring-offset-2 has-[[data-slot=input-group-control]:focus-visible]:ring-offset-foreground-muted","has-[[data-slot][aria-invalid=true]]:bg-destructive-200 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 has-[[data-slot][aria-invalid=true]]:border-destructive-400 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40","has-[[data-slot][aria-invalid=true]]:has-[[data-slot=input-group-control]:focus-visible]:border-destructive","has-[[data-slot=input-group-control]:disabled]:cursor-not-allowed has-[[data-slot=input-group-control]:disabled]:text-foreground-muted","has-[[data-slot=input-group-control]:read-only]:border-button",e),...n})},"InputGroupAddon",0,function({className:e,align:r="inline-start",...a}){return(0,t.jsx)("div",{role:"group","data-slot":"input-group-addon","data-align":r,className:(0,o.cn)(l({align:r}),e),onClick:e=>{e.target.closest("button")||e.currentTarget.parentElement?.querySelector("input")?.focus()},...a})},"InputGroupButton",0,function({className:e,type:r="text",size:a="tiny",...n}){return(0,t.jsx)(i.Button,{type:r,size:a,className:(0,o.cn)(d({size:a}),e),...n})},"InputGroupInput",0,u,"InputGroupText",0,function({className:e,...r}){return(0,t.jsx)("span",{className:(0,o.cn)("text-muted-foreground flex items-center gap-2 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",e),...r})},"InputGroupTextarea",0,c])},95053,e=>{"use strict";var t=e.i(478902),r=e.i(766181),a=e.i(389959),o=e.i(843778),i=e.i(20482),n=e.i(9679),s=e.i(282410);let l=(0,r.cva)("relative grid gap-10",{variants:{size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},align:{left:"",right:""},responsive:{true:"",false:""},layout:{horizontal:"flex flex-col gap-2 md:grid md:grid-cols-12",vertical:"flex flex-col gap-2",flex:"flex flex-row gap-3","flex-row-reverse":"flex flex-col-reverse gap-2 md:gap-6 md:flex-row-reverse md:justify-between"},flex:{true:"",false:""}},compoundVariants:[{layout:"flex",align:"right",className:"justify-between"},{layout:"flex-row-reverse",align:"right",className:"justify-between"}],defaultVariants:{}}),d=(0,r.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"flex flex-col gap-2 col-span-4",vertical:"flex flex-row gap-2 justify-between",flex:"flex flex-col gap-0 min-w-0","flex-row-reverse":"flex flex-col min-w-0 grow"},labelLayout:{horizontal:"",vertical:"","":""}},compoundVariants:[{flex:!0,align:"left",className:"order-2"},{flex:!0,align:"right",className:"order-1"},{layout:["vertical","flex"],labelLayout:void 0,flex:!1,className:"flex flex-row gap-2 justify-between"},{layout:"horizontal",className:"flex flex-col gap-2"}],defaultVariants:{}}),u=(0,r.cva)("transition-all duration-500 ease-in-out",{variants:{flex:{true:"",false:""},align:{left:"order-1",right:"order-2"},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:"order-1"},{flex:!0,align:"right",className:"order-2"},{layout:["vertical","flex"],className:"col-span-12"},{layout:"horizontal",align:"left",className:"col-span-8"},{layout:"horizontal",align:"right",className:"text-right"}],defaultVariants:{}}),c=(0,r.cva)("text-foreground-lighter leading-normal",{variants:{size:{...s.SIZE.text},layout:{vertical:"mt-2",horizontal:"mt-2",flex:"","flex-row-reverse":""}},defaultVariants:{}}),p=(0,r.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),f=(0,r.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),g=(0,r.cva)("text-foreground-muted",{variants:{size:{...s.SIZE.text}},defaultVariants:{}}),m=(0,r.cva)("",{variants:{flex:{true:"",false:""},align:{left:"",right:""},layout:{horizontal:"",vertical:"",flex:"","flex-row-reverse":""}},compoundVariants:[{flex:!0,align:"left",className:""},{flex:!0,align:"right",className:"order-last"},{layout:"flex-row-reverse",className:"flex flex-col justify-center items-start md:items-end shrink-0 md:w-1/2 xl:w-2/5 [&>div]:md:w-full"}]}),x=(0,r.cva)("",{variants:{nonBoxInput:{true:"",false:""},label:{true:"",false:""},layout:{vertical:"",horizontal:"","flex-row-reverse":""}},compoundVariants:[{nonBoxInput:!0,label:!0,layout:"vertical",className:"my-3"},{nonBoxInput:!0,label:!0,layout:"horizontal",className:"my-3 md:mt-0 mb-3"}],defaultVariants:{}}),b=a.default.forwardRef(({align:e="left",className:r,description:a,id:s,label:b,labelOptional:h,layout:v="vertical",style:y,labelLayout:w,size:_="medium",beforeLabel:z,afterLabel:j,nonBoxInput:k=!b,hideMessage:N=!1,isReactForm:S,...$},C)=>{let P="flex"===v||"flex-row-reverse"===v,R=!!(b||z||j),E=S&&!N?(0,t.jsx)(i.FormMessage,{className:(0,o.cn)("mt-2 transition-all duration-300 ease-in-out","flex-row-reverse"===v&&"mt-0"),"data-formlayout-id":"message"}):null,q=a&&S?(0,t.jsx)(i.FormDescription,{className:(0,o.cn)(c({size:_,layout:v})),"data-formlayout-id":"description",id:`${s}-description`,children:a}):a?(0,t.jsx)("p",{className:(0,o.cn)(c({size:_,layout:v}),"text-sm text-foreground-light"),"data-formlayout-id":"description",children:a}):null,I=()=>(0,t.jsxs)(t.Fragment,{children:[z&&(0,t.jsx)("span",{className:(0,o.cn)(p({size:_})),id:s+"-before","data-formlayout-id":"beforeLabel",children:(0,t.jsx)("span",{children:z})}),(0,t.jsx)("span",{children:b}),j&&(0,t.jsx)("span",{className:(0,o.cn)(f({size:_})),id:s+"-after","data-formlayout-id":"afterLabel",children:j})]});return(0,t.jsxs)("div",{ref:C,...$,className:(0,o.cn)(l({size:_,flex:P,align:e,layout:v}),r),children:[P&&(0,t.jsxs)("div",{className:(0,o.cn)(m({flex:P,align:e,layout:v})),children:[$.children,"flex-row-reverse"===v&&E]}),R||h||"horizontal"===v?(0,t.jsx)(t.Fragment,{children:(0,t.jsxs)("div",{className:(0,o.cn)(d({align:e,labelLayout:w,flex:P,layout:v})),"data-formlayout-id":"labelContainer",children:[R&&S?(0,t.jsx)(i.FormLabel,{className:"text-foreground flex gap-2 items-center wrap-break-word","data-formlayout-id":"formLabel",htmlFor:$.name||s,children:(0,t.jsx)(I,{})}):(0,t.jsx)(n.Label_Shadcn_,{className:"text-foreground flex gap-2 items-center wrap-break-word leading-normal","data-formlayout-id":"label",htmlFor:$.name||s,children:(0,t.jsx)(I,{})}),h&&(0,t.jsx)("span",{className:(0,o.cn)(g({size:_})),id:s+"-optional","data-formlayout-id":"labelOptional",children:h}),P&&(0,t.jsxs)(t.Fragment,{children:[q,"flex-row-reverse"!==v&&E]})]})}):null,!P&&(0,t.jsx)("div",{className:(0,o.cn)(u({align:e,layout:v})),style:y,"data-formlayout-id":"dataContainer",children:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:(0,o.cn)(x({nonBoxInput:k,label:b,layout:v})),"data-formlayout-id":"nonBoxInputContainer",children:$.children}),E,q]})})]})});e.s(["FormLayout",0,b])},538482,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(20482),o=e.i(95053);let i=(0,r.forwardRef)(({...e},r)=>(0,t.jsx)(a.FormItem,{children:(0,t.jsx)(o.FormLayout,{ref:r,isReactForm:!0,...e,children:e.children})}));i.displayName="FormItemLayout",e.s(["FormItemLayout",0,i])},283607,e=>{"use strict";var t=e.i(655744),r=function(e,r,a){if(e&&"reportValidity"in e){var o=(0,t.get)(a,r);e.setCustomValidity(o&&o.message||""),e.reportValidity()}},a=function(e,t){var a=function(a){var o=t.fields[a];o&&o.ref&&"reportValidity"in o.ref?r(o.ref,a,e):o.refs&&o.refs.forEach(function(t){return r(t,a,e)})};for(var o in t.fields)a(o)},o=function(e,r){r.shouldUseNativeValidation&&a(e,r);var o={};for(var s in e){var l=(0,t.get)(r.fields,s),d=Object.assign(e[s]||{},{ref:l&&l.ref});if(n(r.names||Object.keys(e),s)){var u=Object.assign({},i((0,t.get)(o,s)));(0,t.set)(u,"root",d),(0,t.set)(o,s,u)}else(0,t.set)(o,s,d)}return o},i=function(e){return Array.isArray(e)?e.filter(Boolean):[]},n=function(e,t){return e.some(function(e){return e.startsWith(t+".")})},s=function(e,r){for(var a={};e.length;){var o=e[0],i=o.code,n=o.message,s=o.path.join(".");if(!a[s])if("unionErrors"in o){var l=o.unionErrors[0].errors[0];a[s]={message:l.message,type:l.code}}else a[s]={message:n,type:i};if("unionErrors"in o&&o.unionErrors.forEach(function(t){return t.errors.forEach(function(t){return e.push(t)})}),r){var d=a[s].types,u=d&&d[o.code];a[s]=(0,t.appendErrors)(s,r,a,i,u?[].concat(u,o.message):o.message)}e.shift()}return a};e.s(["zodResolver",0,function(e,t,r){return void 0===r&&(r={}),function(i,n,l){try{return Promise.resolve(function(o){try{var n=Promise.resolve(e["sync"===r.mode?"parse":"parseAsync"](i,t)).then(function(e){return l.shouldUseNativeValidation&&a({},l),{errors:{},values:r.raw?i:e}})}catch(e){return o(e)}return n&&n.then?n.then(void 0,o):n}(function(e){if(null!=e.errors)return{values:{},errors:o(s(e.errors,!l.shouldUseNativeValidation&&"all"===l.criteriaMode),l)};throw e}))}catch(e){return Promise.reject(e)}}}],283607)},719754,e=>{"use strict";var t=e.i(130843);e.s(["SelectValue_Shadcn_",()=>t.SelectValue])},417403,e=>{"use strict";var t=e.i(907019);e.s(["default",0,t])},290811,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(174617),o=e.i(678001),i=e.i(274664),n=e.i(826524),s=e.i(594661),l=e.i(374251),d=e.i(546595),u="Switch",[c,p]=(0,i.createContextScope)(u),[f,g]=c(u),m=r.forwardRef((e,i)=>{let{__scopeSwitch:s,name:l,checked:c,defaultChecked:p,required:g,disabled:m,value:x="on",onCheckedChange:b,form:y,...w}=e,[_,z]=r.useState(null),j=(0,o.useComposedRefs)(i,e=>z(e)),k=r.useRef(!1),N=!_||y||!!_.closest("form"),[S,$]=(0,n.useControllableState)({prop:c,defaultProp:p??!1,onChange:b,caller:u});return(0,t.jsxs)(f,{scope:s,checked:S,disabled:m,children:[(0,t.jsx)(d.Primitive.button,{type:"button",role:"switch","aria-checked":S,"aria-required":g,"data-state":v(S),"data-disabled":m?"":void 0,disabled:m,value:x,...w,ref:j,onClick:(0,a.composeEventHandlers)(e.onClick,e=>{$(e=>!e),N&&(k.current=e.isPropagationStopped(),k.current||e.stopPropagation())})}),N&&(0,t.jsx)(h,{control:_,bubbles:!k.current,name:l,value:x,checked:S,required:g,disabled:m,form:y,style:{transform:"translateX(-100%)"}})]})});m.displayName=u;var x="SwitchThumb",b=r.forwardRef((e,r)=>{let{__scopeSwitch:a,...o}=e,i=g(x,a);return(0,t.jsx)(d.Primitive.span,{"data-state":v(i.checked),"data-disabled":i.disabled?"":void 0,...o,ref:r})});b.displayName=x;var h=r.forwardRef(({__scopeSwitch:e,control:a,checked:i,bubbles:n=!0,...d},u)=>{let c=r.useRef(null),p=(0,o.useComposedRefs)(c,u),f=(0,s.usePrevious)(i),g=(0,l.useSize)(a);return r.useEffect(()=>{let e=c.current;if(!e)return;let t=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set;if(f!==i&&t){let r=new Event("click",{bubbles:n});t.call(e,i),e.dispatchEvent(r)}},[f,i,n]),(0,t.jsx)("input",{type:"checkbox","aria-hidden":!0,defaultChecked:i,...d,tabIndex:-1,ref:p,style:{...d.style,...g,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});function v(e){return e?"checked":"unchecked"}h.displayName="SwitchBubbleInput",e.s(["Root",0,m,"Switch",0,m,"SwitchThumb",0,b,"Thumb",0,b,"createSwitchScope",0,p],736223);var y=e.i(736223),y=y,w=e.i(766181),_=e.i(843778);let z=(0,w.cva)("peer inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand data-[state=checked]:hover:bg-brand-600/90 data-[state=unchecked]:bg-control data-[state=unchecked]:hover:bg-border",{variants:{size:{small:"h-[16px] w-[28px]",medium:"h-[20px] w-[34px]",large:"h-[24px] w-[44px]"}},defaultVariants:{size:"medium"}}),j=(0,w.cva)("pointer-events-none block rounded-full bg-foreground-lighter data-[state=checked]:bg-white shadow-lg ring-0 transition-transform",{variants:{size:{small:"h-[12px] w-[12px] data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-px",medium:"h-[16px] w-[16px] data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-px",large:"h-[18px] w-[18px] data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[3px]"}},defaultVariants:{size:"medium"}}),k=r.forwardRef(({className:e,size:r,...a},o)=>(0,t.jsx)(y.Root,{className:(0,_.cn)(z({size:r}),e),tabIndex:0,...a,ref:o,children:(0,t.jsx)(y.Thumb,{className:(0,_.cn)(j({size:r}))})}));k.displayName=y.Root.displayName,e.s(["Switch",0,k],290811)},636900,e=>{"use strict";let t=(0,e.i(388019).default)("Book",[["path",{d:"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",key:"k3hazp"}]]);e.s(["Book",0,t],636900)},398696,e=>{"use strict";let t=(0,e.i(388019).default)("Github",[["path",{d:"M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4",key:"tonef"}],["path",{d:"M9 18c-4.51 2-5-2-7-2",key:"9comsn"}]]);e.s(["Github",0,t],398696)},17203,672483,e=>{"use strict";let t=(0,e.i(388019).default)("ExternalLink",[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]]);e.s(["default",0,t],672483),e.s(["ExternalLink",0,t],17203)},954676,e=>{"use strict";let t=(0,e.i(388019).default)("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]);e.s(["ChevronLeft",0,t],954676)},617976,e=>{"use strict";e.s(["organizationKeys",0,{rolesV2:e=>["organization-members",e,"roles-v2"],invitations:e=>["organization-members",e,"invitations"],invitation:(e,t)=>["organization-members",e,"invitations",t],token:(e,t)=>["organization-members",e,"token",t]}])},388531,e=>{"use strict";var t=e.i(242882),r=e.i(617976),a=e.i(234745);let o=["Owner","Administrator","Developer","Read-only"];async function i({slug:e},t){if(!e)throw Error("slug is required");let{data:r,error:o}=await (0,a.get)("/platform/organizations/{slug}/roles",{params:{path:{slug:e}},headers:{Version:2},signal:t});return o&&(0,a.handleError)(o),r}e.s(["useOrganizationRolesV2Query",0,({slug:e},{enabled:a=!0,...n}={})=>(0,t.useQuery)({queryKey:r.organizationKeys.rolesV2(e),queryFn:({signal:t})=>i({slug:e},t),enabled:a&&void 0!==e,select:e=>({...e,org_scoped_roles:e.org_scoped_roles.sort((e,t)=>o.indexOf(e.name)-o.indexOf(t.name))}),...n})])},793595,e=>{"use strict";var t=e.i(242882),r=e.i(711950),a=e.i(234745);async function o({slug:e},t){if(!e)throw Error("slug is required");let[r,i]=await Promise.all([(0,a.get)("/platform/organizations/{slug}/members",{params:{path:{slug:e}},signal:t}),(0,a.get)("/platform/organizations/{slug}/members/invitations",{params:{path:{slug:e}},signal:t})]),{data:n,error:s}=r,{data:l,error:d}=i;return s&&(0,a.handleError)(s),d&&(0,a.handleError)(d),[...n,...l.invitations.map(e=>({...{invited_at:e.invited_at,invited_id:e.id,mfa_enabled:!1,username:e.invited_email.slice(0,1),primary_email:e.invited_email},role_ids:[e.role_id]}))]}e.s(["useOrganizationMembersQuery",0,({slug:e},{enabled:a=!0,...i}={})=>(0,t.useQuery)({queryKey:r.organizationKeys.members(e),queryFn:({signal:t})=>o({slug:e},t),enabled:a&&void 0!==e,...i})])},794231,781894,e=>{"use strict";var t=e.i(478902),r=e.i(26898);e.i(128328);var a=e.i(657588),o=e.i(158639),i=e.i(345594),n=e.i(837710),s=e.i(215312),l=e.i(283607),d=e.i(389959),u=e.i(655744),c=e.i(355901),p=e.i(587433),f=e.i(253214),g=e.i(20482),m=e.i(398876),x=e.i(613580),b=e.i(538482),h=e.i(417403),v=e.i(388531),y=e.i(793595),w=e.i(38429),_=e.i(234745);async function z({slug:e,plan:t,note:r}){if(!e)throw Error("Slug is required");let{data:a,error:o}=await (0,_.post)("/platform/organizations/{slug}/billing/upgrade-request",{params:{path:{slug:e}},body:{requested_plan:t,note:r}});return o&&(0,_.handleError)(o),a}var j=e.i(265735),k=e.i(635494),N=e.i(967052);let S=h.default.object({note:h.default.string().optional()}),$="request-upgrade-form",C=({block:e=!1,plan:r="Pro",addon:a,featureProposition:o,children:i,className:s,type:h="primary"})=>{let[_,C]=(0,d.useState)(!1),P=(0,N.useTrack)(),{data:R}=(0,k.useSelectedProjectQuery)(),{data:E}=(0,j.useSelectedOrganizationQuery)(),q=E?.slug,I=E?.plan?.id,T="free"===I,{data:V=[]}=(0,y.useOrganizationMembersQuery)({slug:E?.slug}),{data:F}=(0,v.useOrganizationRolesV2Query)({slug:E?.slug}),L=F?.org_scoped_roles??[],{mutate:B,isPending:O}=(({onSuccess:e,onError:t,...r}={})=>(0,w.useMutation)({mutationFn:e=>z(e),async onSuccess(t,r,a){await e?.(t,r,a)},async onError(e,r,a){void 0===t?c.toast.error(`Failed to send upgrade request: ${e.message}`):t(e,r,a)},...r}))({onSuccess:()=>{P("request_upgrade_submitted",{requestedPlan:r,addon:a,currentPlan:I}),c.toast.success("Successfully sent request to billing owners!"),C(!1)}}),D="pitr"===a?"PITR":"customDomain"===a?"Custom domain":"ipv4"===a?"dedicated IPv4 address":"",A=R?`for the project "${R?.name}"`:E?`for the organization "${E.name}"`:"",M="spendCap"===a?"disable spend cap":"computeSize"===a?"change the compute size":`enable the ${D} add-on`,U=a?"spendCap"===a?"Request to disable spend cap":"computeSize"===a?"Request to change compute size":`Request to enable the ${D} add-on`:`Request an upgrade for the ${r} Plan`,G=i||(a?"spendCap"===a?"Request to disable spend cap":"computeSize"===a?"Request to change compute":"Request to enable addon":`Request upgrade to ${r}`),Q={note:a?`We'd like to ${T?"upgrade to Pro and ":""}${M} ${A} so that we can ${o}`:`We'd like to upgrade to the ${r} plan ${o?`to ${o} `:""}${A}`},H=(0,u.useForm)({resolver:(0,l.zodResolver)(S),defaultValues:Q,values:Q}),K=V.filter(e=>{let t=e.role_ids.map(e=>L.find(t=>t.id===e)?.name).filter(Boolean);return!e.invited_id&&(t.includes("Owner")||t.includes("Administrator"))}),W=async e=>{if(!q)return console.error("Slug is required");B({slug:q,plan:r,note:e.note})};return(0,t.jsxs)(f.Dialog,{open:_,onOpenChange:e=>{e&&P("request_upgrade_modal_opened",{requestedPlan:r,addon:a,currentPlan:I,featureProposition:o}),C(e)},children:[(0,t.jsx)(f.DialogTrigger,{asChild:!0,children:(0,t.jsx)(n.Button,{block:e,type:h,className:s,children:G})}),(0,t.jsx)(f.DialogContent,{children:(0,t.jsx)(g.Form,{...H,children:(0,t.jsxs)("form",{id:$,onSubmit:H.handleSubmit(W),children:[(0,t.jsxs)(f.DialogHeader,{children:[(0,t.jsx)(f.DialogTitle,{children:U}),(0,t.jsx)(f.DialogDescription,{children:"Let your organization's billing owners know your interest in this"})]}),(0,t.jsx)(f.DialogSectionSeparator,{}),(0,t.jsxs)(f.DialogSection,{className:"flex flex-col gap-y-6",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)("p",{className:"text-sm",children:"Your request will be sent to the following emails, who are billing owners of your organization:"}),(0,t.jsxs)("div",{className:"text-sm flex gap-x-2",children:[(0,t.jsx)("p",{children:K.slice(0,2).map(e=>e.primary_email).join(", ")}),K.length>2&&(0,t.jsxs)(x.Tooltip,{children:[(0,t.jsx)(x.TooltipTrigger,{tabIndex:-1,children:(0,t.jsx)(p.Badge,{children:"+1 others"})}),(0,t.jsx)(x.TooltipContent,{side:"bottom",children:(0,t.jsx)("ul",{className:"",children:K.slice(2).map(e=>(0,t.jsx)("li",{children:e.primary_email},e.gotrue_id))})})]})]})]}),(0,t.jsx)(g.FormField,{control:H.control,name:"note",render:({field:e})=>(0,t.jsx)(b.FormItemLayout,{name:"note",label:"Add a note to your request (optional)",layout:"vertical",children:(0,t.jsx)(g.FormControl,{children:(0,t.jsx)(m.TextArea_Shadcn_,{id:"note",...e,rows:3,placeholder:a?"spendCap"===a?"e.g. We need to disabled spend cap on this project to do something":"e.g. We need to enable this add-on to do something with the project":"e.g. We need to upgrade to the Pro plan to use this feature"})})})})]}),(0,t.jsxs)(f.DialogFooter,{children:[(0,t.jsx)(n.Button,{type:"default",disabled:O,onClick:()=>C(!1),children:"Cancel"}),(0,t.jsx)(n.Button,{htmlType:"submit",form:$,loading:O,children:"Submit request"})]})]})})})]})};e.s(["RequestUpgradeToBillingOwners",0,C],781894);var P=e.i(196621),R=e.i(2579),E=e.i(912793);let q="<Specify which plan to upgrade to: Pro | Team | Enterprise>";e.s(["PLAN_REQUEST_EMPTY_PLACEHOLDER",0,q,"UpgradePlanButton",0,({source:e,variant:l="primary",plan:d="Pro",addon:u,featureProposition:c,disabled:p,children:f,className:g,slug:m,onClick:x})=>{let{ref:b}=(0,o.useParams)(),{data:h}=(0,j.useSelectedOrganizationQuery)(),v=h?.plan?.id==="free",y=m??h?.slug??"_",w=(0,a.useFlag)("disableProjectCreationAndUpdate"),{billingAll:_}=(0,E.useIsFeatureEnabled)(["billing:all"]),{can:z}=(0,R.useAsyncCheckPermissions)(r.PermissionAction.BILLING_WRITE,"stripe.subscriptions",void 0,{organizationSlug:y}),k=`Enquiry to upgrade ${d?`to ${d} `:""}plan for organization`,N=`Name: ${h?.name}
Slug: ${y}
Requested plan: ${d??q}`,S="spendCap"===u,$=!v&&!!u,I=S?`/org/${y??"_"}/billing?panel=costControl&source=${e}`:$?"computeSize"===u?`/project/${b??"_"}/settings/compute-and-disk`:`/project/${b??"_"}/settings/addons?panel=${u}&source=${e}`:`/org/${y??"_"}/billing?panel=subscriptionPlan&source=${e}`,T=f||($?"computeSize"===u?"Change compute size":"Enable add-on":`Upgrade to ${d}`),V=_?(0,t.jsx)(i.default,{href:I,children:T}):(0,t.jsx)(P.SupportLink,{queryParams:{orgSlug:y,category:"Plan_upgrade",subject:k,message:N},children:T});return z?w?(0,t.jsx)(s.ButtonTooltip,{disabled:!0,type:l,className:g,tooltip:{content:{side:"bottom",text:"Plan changes are currently disabled, our engineers are working on a fix"}},children:T}):(0,t.jsx)(n.Button,{asChild:!0,type:l,disabled:p,className:g,onClick:x,children:V}):(0,t.jsx)(C,{plan:d,addon:u,featureProposition:c,className:g,type:l,children:f})}],794231)}]);