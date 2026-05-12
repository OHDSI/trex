(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,462142,e=>{"use strict";var t=e.i(242882),a=e.i(78162),r=e.i(234745);async function i({projectRef:e},t){if(!e)throw Error("projectRef is required");let{data:a,error:s}=await (0,r.get)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},signal:t});return s&&(0,r.handleError)(s),a}e.s(["parseDbSchemaString",0,e=>e.split(",").map(e=>e.trim()).filter(e=>e.length>0),"useProjectPostgrestConfigQuery",0,({projectRef:e},{enabled:r=!0,...s}={})=>(0,t.useQuery)({queryKey:a.configKeys.postgrest(e),queryFn:({signal:t})=>i({projectRef:e},t),enabled:r&&void 0!==e,...s})])},592383,e=>{"use strict";var t=e.i(478902),a=e.i(755146),r=e.i(861833),i=e.i(843778),s=e.i(937942);let n=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),o=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:a})=>(0,t.jsx)(s.InlineLink,{href:e??"/",children:a});e.s(["Markdown",0,({children:e,className:s,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,i.cn)("text-sm",s),children:(0,t.jsx)(a.default,{remarkPlugins:[r.default],components:{h3:n,code:o,a:l},...u,children:e??d})})])},466472,e=>{"use strict";var t=e.i(478902),a=e.i(389959),r=e.i(837710),i=e.i(843778),s=e.i(253214),n=e.i(710483);let o=(0,a.forwardRef)(({title:e,description:o,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:m,cancelLabel:p="Cancel",confirmLabel:g="Submit",confirmLabelLoading:h,alert:x,children:f,variant:b="default",disabled:v,className:y,...j},w)=>{let[_,S]=(0,a.useState)(void 0!==m&&m);(0,a.useEffect)(()=>{d&&void 0===m&&S(!1)},[d]),(0,a.useEffect)(()=>{void 0!==m&&S(m)},[m]);let{title:N,children:A,...C}=x?.base??{},k=x?.title?{label:x.title}:{};return(0,t.jsx)(s.Dialog,{open:d,...j,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(s.DialogContent,{"aria-describedby":void 0,ref:w,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(s.DialogHeader,{className:(0,i.cn)("border-b"),padding:"small",children:[(0,t.jsx)(s.DialogTitle,{children:e}),o&&(0,t.jsx)(s.DialogDescription,{children:o})]}),x&&(0,t.jsx)(n.Admonition,{type:b,description:x.description,...k,className:"border-x-0 rounded-none -mt-px",...C}),f&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(s.DialogSection,{padding:"small",className:y,children:f}),(0,t.jsx)(s.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(r.Button,{size:"medium",block:!0,type:"default",disabled:_,onClick:()=>c(),children:p}),(0,t.jsx)(r.Button,{block:!0,size:"medium",type:"destructive"===b?"danger":"warning"===b?"warning":"primary",htmlType:"submit",loading:_,disabled:_||v,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===m&&S(!0)},className:"truncate",children:_&&h?h:g})]})]})})});o.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,o,"default",0,o])},378277,e=>{"use strict";var t=e.i(348481);e.s(["Input_Shadcn_",()=>t.Input])},938933,305551,e=>{"use strict";var t=e.i(389959);let a={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},r={tiny:`${a.size.text.tiny} ${a.size.padding.tiny}`,small:`${a.size.text.small} ${a.size.padding.small}`,medium:`${a.size.text.medium} ${a.size.padding.medium}`,large:`${a.size.text.large} ${a.size.padding.large}`,xlarge:`${a.size.text.xlarge} ${a.size.padding.xlarge}`},i={accordion:{variants:{default:{base:`
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
      ${a.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${a.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${a.border.secondary}
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
      ${a.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${a.placeholder}
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
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...a.size.text}},label_optional:{base:"text-foreground-lighter",size:{...a.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...a.size.text}},label_before:{base:"text-foreground-lighter ",size:{...a.size.text}},label_after:{base:"text-foreground-lighter",size:{...a.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...a.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
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
      ${a.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${a.placeholder}
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
    `}};e.s(["default",0,i],305551);let s=(0,t.createContext)({theme:i});e.s(["default",0,function(e){let{theme:{[e]:a}}=(0,t.useContext)(s);return a||(a=i.accordion),a=JSON.parse(a=JSON.stringify(a).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),a=e.i(816467),r=e.i(389959),i=e.i(843778),s=e.i(375761),n=e.i(231665),o=e.i(938933);let l=(0,r.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:m,iconContainerClassName:p,containerClassName:g,size:h="small",...x},f)=>{let[b,v]=(0,r.useState)("Copy"),[y,j]=(0,r.useState)(!0),w=(0,o.default)("input"),_=[];return h&&_.push(w.size[h]),(0,t.jsxs)(n.InputGroup,{className:g,children:[(0,t.jsx)(n.InputGroupInput,{ref:f,onFocus:e=>e.target.select(),...x,size:h,onCopy:m,type:c&&y?"password":x.type,disabled:x.disabled,className:(0,i.cn)(..._,x.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(n.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(n.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",className:(0,i.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(a.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=x.value,void(0,s.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),m?.()})},children:b}):null,c&&y?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",onClick:function(){j(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},228027,e=>{"use strict";var t=e.i(478902),a=e.i(766181),r=e.i(843778);let i=(0,a.cva)(["pt-12 last:pb-12 gap-6"],{variants:{orientation:{horizontal:"grid @3xl:grid-cols-[1fr_2fr] @3xl:gap-12",vertical:"flex flex-col"}},defaultVariants:{orientation:"vertical"}}),s=({className:e,orientation:a="vertical",children:s,...n})=>(0,t.jsx)("div",{"data-slot":"page-section","data-orientation":a,className:(0,r.cn)(i({orientation:a}),e),...n,children:s});s.displayName="PageSectionRoot";let n=({className:e,children:a,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-summary",className:(0,r.cn)("flex flex-col gap-1",e),...i,children:a});n.displayName="PageSectionSummary";let o=({className:e,children:a,...i})=>(0,t.jsx)("h2",{"data-slot":"page-section-title",className:(0,r.cn)("heading-section",e),...i,children:a});o.displayName="PageSectionTitle";let l=({className:e,children:a,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-description",className:(0,r.cn)("text-sm text-foreground-light",e),style:{textBoxTrim:"trim-end"},...i,children:a});l.displayName="PageSectionDescription";let d=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-aside",className:(0,r.cn)("flex items-center gap-2","@xl:self-end",e),...a});d.displayName="PageSectionAside";let c=({className:e,children:a,...i})=>(0,t.jsx)("div",{className:"@container",children:(0,t.jsx)("div",{"data-slot":"page-section-meta",className:(0,r.cn)("flex flex-col @xl:flex-row @xl:justify-between @xl:items-center gap-4",'*:data-[slot="page-section-summary"]:flex-1','*:data-[slot="page-section-summary"]:@xl:self-center','*:data-[slot="page-section-aside"]:shrink-0',e),...i,children:a})});c.displayName="PageSectionMeta";let u=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-content",className:(0,r.cn)(e),...a});u.displayName="PageSectionContent",e.s(["PageSection",0,s,"PageSectionAside",0,d,"PageSectionContent",0,u,"PageSectionDescription",0,l,"PageSectionMeta",0,c,"PageSectionSummary",0,n,"PageSectionTitle",0,o])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(38429),r=e.i(356003),i=e.i(355901),s=e.i(667286),n=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:a,schema:r,name:i,version:s,cascade:n=!1,createSchema:d=!1}){let c=new Headers;a&&c.set("x-connection-encrypted",a);let u=(0,t.getEnableDatabaseExtensionSQL)({schema:r,name:i,version:s,cascade:n,createSchema:d}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:u,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let d=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,r){let{projectRef:i}=a;await Promise.all([d.invalidateQueries({queryKey:s.databaseExtensionsKeys.list(i)}),d.invalidateQueries({queryKey:n.configKeys.upgradeEligibility(i)})]),await e?.(t,a,r)},async onError(e,a,r){void 0===t?i.toast.error(`Failed to enable database extension: ${e.message}`):t(e,a,r)},...o})}])},330287,e=>{"use strict";var t=e.i(242882),a=e.i(346691),r=e.i(234745),i=e.i(10429);async function s({projectRef:e},t){if(!e)throw Error("Project ref is required");let{data:a,error:i}=await (0,r.get)("/platform/projects/{ref}/load-balancers",{params:{path:{ref:e}},signal:t});return i&&(0,r.handleError)(i),a}e.s(["useLoadBalancersQuery",0,({projectRef:e},{enabled:r=!0,...n}={})=>(0,t.useQuery)({queryKey:a.replicaKeys.loadBalancers(e),queryFn:({signal:t})=>s({projectRef:e},t),enabled:r&&void 0!==e&&i.IS_PLATFORM,...n})])},774234,554855,e=>{"use strict";var t=e.i(348534);e.s(["CollapsibleContent_Shadcn_",()=>t.CollapsibleContent],774234),e.s(["CollapsibleTrigger_Shadcn_",()=>t.CollapsibleTrigger],554855)},925282,e=>{"use strict";var t=e.i(348534);e.s(["Collapsible_Shadcn_",()=>t.Collapsible])},282492,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),r=e.i(802715),i=e.i(370410),s=e.i(88816),n=e.i(774803),o=e.i(544197),l=e.i(345594),d=e.i(989567),c=e.i(17313),u=e.i(389959),m=e.i(837710),p=e.i(843778),g=e.i(866205),h=e.i(917007),x=e.i(549815),f=e.i(911509),b=e.i(689805),v=e.i(793912),y=e.i(135144),j=e.i(396831),w=e.i(613580),_=e.i(592383),S=e.i(72187),N=e.i(150671),A=e.i(940009),C=e.i(912793),k=e.i(10429),P=e.i(189329);e.s(["DatabaseSelector",0,({selectedDatabaseId:e,variant:I="regular",additionalOptions:D=[],onSelectId:E=r.default,buttonProps:z,align:T="end",className:R,isForm:q=!1})=>{let F=(0,d.useRouter)(),{ref:L}=(0,a.useParams)(),[$,B]=(0,u.useState)(!1),[,O]=(0,c.useQueryState)("showConnect",c.parseAsBoolean.withDefault(!1)),{infrastructureReadReplicas:M}=(0,C.useIsFeatureEnabled)(["infrastructure:read_replicas"]),U=(0,P.useDatabaseSelectorStateSnapshot)(),Q=e??U.selectedDatabaseId,{data:K,isPending:G,isSuccess:H}=(0,N.useReadReplicasQuery)({projectRef:L}),V=K??[],W=V.sort((e,t)=>+(e.inserted_at>t.inserted_at)).sort(e=>e.identifier===L?-1:0),Y=V.find(e=>e.identifier===Q),J=(0,A.formatDatabaseRegion)(Y?.region??""),X=(0,A.formatDatabaseID)(Q??""),Z=D.find(e=>e.id===Q),ee=`/project/${L}/database/replication?type=Read+Replica`;return(0,u.useEffect)(()=>{e&&!q&&U.setSelectedDatabaseId(e)},[e]),(0,t.jsxs)(b.Popover_Shadcn_,{open:$,onOpenChange:B,modal:!1,children:[(0,t.jsx)(y.PopoverTrigger_Shadcn_,{asChild:!0,children:(0,t.jsxs)("div",{className:(0,p.cn)("flex cursor-pointer",R),children:[!q&&(0,t.jsx)("span",{className:"flex items-center text-foreground-lighter px-3 rounded-lg rounded-r-none text-xs border border-button border-r-0",children:"Source"}),(0,t.jsx)(m.Button,{type:"default",icon:G&&(0,t.jsx)(n.Loader2,{className:"animate-spin"}),iconRight:(0,t.jsx)(s.ChevronDown,{strokeWidth:1.5,size:12}),...z,className:(0,p.cn)("justify-start",!q&&"rounded-l-none","connected-on-right"===I&&"rounded-r-none","connected-on-left"===I&&"rounded-l-none border-l-0","connected-on-both"===I&&"rounded-none border-x-0",z?.className),children:Z?(0,t.jsx)("span",{children:Z.name}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("span",{className:"capitalize",children:G||Y?.identifier===L?"Primary database":"Read replica"})," ",H&&Y?.identifier!==L&&(0,t.jsxs)("span",{children:["(",J," - ",X,")"]})]})})]})}),(0,t.jsx)(v.PopoverContent_Shadcn_,{className:"p-0 w-64",side:"bottom",align:T,children:(0,t.jsx)(g.Command_Shadcn_,{children:(0,t.jsxs)(f.CommandList_Shadcn_,{children:[D.length>0&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-b",children:D.map(e=>(0,t.jsx)(x.CommandItem_Shadcn_,{value:e.id,className:"cursor-pointer w-full",onSelect:()=>{q||U.setSelectedDatabaseId(e.id),B(!1),E(e.id)},onClick:()=>{q||U.setSelectedDatabaseId(e.id),B(!1),E(e.id)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.name}),e.id===Q&&(0,t.jsx)(i.Check,{size:14})]})},e.id))}),(0,t.jsx)(h.CommandGroup_Shadcn_,{children:(0,t.jsx)(j.ScrollArea,{className:(V||[]).length>7?"h-[210px]":"",children:W?.map(e=>{let a=(0,A.formatDatabaseRegion)(e.region),r=(0,A.formatDatabaseID)(e.identifier);if("ACTIVE_HEALTHY"!==e.status){let i=[S.REPLICA_STATUS.INIT_READ_REPLICA,S.REPLICA_STATUS.COMING_UP].includes(e.status)?"coming up":"not healthy";return(0,t.jsxs)(w.Tooltip,{children:[(0,t.jsx)(w.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("div",{className:"px-2 py-1.5 w-full flex items-center justify-between",children:(0,t.jsxs)("p",{className:"text-xs text-foreground-lighter",children:["Read replica (",a," - ",r,")"]})})}),(0,t.jsx)(w.TooltipContent,{side:"right",className:"w-80",children:(0,t.jsx)(_.Markdown,{className:"text-xs text-foreground",content:`Replica unable to accept requests as its ${i}. [View infrastructure settings](/project/${L}/settings/infrastructure) for more information.`})})]},e.identifier)}return(0,t.jsx)(x.CommandItem_Shadcn_,{value:e.identifier,className:"cursor-pointer w-full",onSelect:()=>{q||U.setSelectedDatabaseId(e.identifier),B(!1),E(e.identifier)},onClick:()=>{q||U.setSelectedDatabaseId(e.identifier),B(!1),E(e.identifier)},children:(0,t.jsxs)("div",{className:"w-full flex items-center justify-between",children:[(0,t.jsx)("p",{children:e.identifier===L?"Primary database":`Read replica (${a} - ${r})`}),e.identifier===Q&&(0,t.jsx)(i.Check,{size:16})]})},e.identifier)})})}),k.IS_PLATFORM&&M&&(0,t.jsx)(h.CommandGroup_Shadcn_,{className:"border-t",children:(0,t.jsx)(x.CommandItem_Shadcn_,{className:"cursor-pointer w-full",onSelect:()=>{B(!1),F.push(ee)},onClick:()=>B(!1),children:(0,t.jsxs)(l.default,{href:ee,onClick:async()=>{B(!1),O(!1)},className:"w-full flex items-center gap-2",children:[(0,t.jsx)(o.Plus,{size:14,strokeWidth:1.5}),(0,t.jsx)("p",{children:"Create a new read replica"})]})})})]})})})]})}])},331720,e=>{"use strict";var t=e.i(478902),a=e.i(837710);e.s(["FormActions",0,({form:e,hasChanges:r,handleReset:i,helper:s,disabled:n=!1,isSubmitting:o,submitText:l="Save"})=>{let d=o||n||!r&&void 0!==r;return(0,t.jsxs)("div",{className:["flex w-full items-center gap-2",s?"justify-between":"justify-end"].join(" "),children:[s&&(0,t.jsx)("span",{className:"text-sm text-foreground-lighter",children:s}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(a.Button,{disabled:d,type:"default",htmlType:"reset",onClick:()=>i(),children:"Cancel"}),(0,t.jsx)(a.Button,{form:e,type:"primary",htmlType:"submit",disabled:d,loading:o,children:l})]})]})}])},843142,e=>{"use strict";var t=e.i(130843);e.s(["SelectSeparator_Shadcn_",()=>t.SelectSeparator])},944334,e=>{"use strict";e.s(["EXTENSION_DISABLE_WARNINGS",0,{pg_cron:"Disabling this extension will delete all scheduled jobs. This cannot be undone.",pg_partman:"Disabling this extension will stop automatic partition management for any partitioned queues. New partitions will no longer be created and retention policies will no longer be enforced."},"HIDDEN_EXTENSIONS",0,["adminpack","amcheck","file_fdw","lo","old_snapshot","pageinspect","pg_buffercache","pg_freespacemap","pg_surgery","pg_visibility","supabase_vault","supautils","intagg","xml2","pg_tle","pg_stat_monitor"],"SEARCH_TERMS",0,{vector:["pgvector","pg_vector"],pg_partman:["partman","partition","partitioned"]},"extensionsWithRecommendedSchemas",0,{wrappers:"extensions"}])},121832,e=>{"use strict";var t=e.i(478902),a=e.i(283607),r=e.i(655744),i=e.i(355901),s=e.i(587433),n=e.i(837710),o=e.i(253214),l=e.i(20482),d=e.i(378277),c=e.i(449123),u=e.i(451031),m=e.i(831927),p=e.i(843142),g=e.i(156722),h=e.i(719754),x=e.i(710483),f=e.i(538482),b=e.i(108151),v=e.i(531837),y=e.i(249909),j=e.i(944334),w=e.i(513826),_=e.i(610144),S=e.i(801834),N=e.i(635494),A=e.i(392491),C=e.i(10429);let k=["vector","postgis"],P=v.object({name:v.string(),schema:v.string()}).superRefine((e,t)=>{"custom"===e.schema&&0===e.name.length&&t.addIssue({code:y.ZodIssueCode.custom,path:["name"],message:"Please provide a name for the schema"})});e.s(["EnableExtensionModal",0,({visible:e,extension:v,onCancel:y})=>{let I=(0,N.useIsOrioleDb)(),{data:D}=(0,N.useSelectedProjectQuery)(),{data:E}=(0,A.useProtectedSchemas)({excludeSchemas:["extensions"]}),z=j.extensionsWithRecommendedSchemas[v.name],{data:T=[],isPending:R}=(0,S.useSchemasQuery)({projectRef:D?.ref,connectionString:D?.connectionString},{enabled:e}),q=T.filter(e=>e.name===z||!E.some(t=>t.name===e.name)),F="pg_cron"===v.name?"pg_catalog":v.default_version_schema,{mutate:L,isPending:$}=(0,_.useDatabaseExtensionEnableMutation)({onSuccess:()=>{i.toast.success(`Extension "${v.name}" is now enabled`),y()},onError:e=>{i.toast.error(`Failed to enable ${v.name}: ${e.message}`)}}),B={name:v.name,schema:z??"extensions"},O=(0,r.useForm)({mode:"onBlur",reValidateMode:"onBlur",resolver:(0,a.zodResolver)(P),defaultValues:B}),{schema:M}=O.watch(),U=async e=>{if(void 0===D)return console.error("Project is required");let t=null!=F?F:"custom"===e.schema?e.name:e.schema;L({projectRef:D.ref,connectionString:D?.connectionString,schema:t,name:v.name,version:v.default_version,cascade:!0,createSchema:!t.startsWith("pg_")})};return(0,t.jsx)(o.Dialog,{open:e,onOpenChange:e=>{e||y()},children:(0,t.jsxs)(o.DialogContent,{size:"small","aria-describedby":void 0,children:[(0,t.jsx)(o.DialogHeader,{children:(0,t.jsxs)(o.DialogTitle,{children:["Enable ",v.name]})}),(0,t.jsx)(o.DialogSectionSeparator,{}),I&&k.includes(v.name)&&(0,t.jsxs)(x.Admonition,{type:"default",title:"Extension is limited by OrioleDB",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsxs)("span",{className:"block",children:[v.name," cannot be accelerated by indexes on tables that are using the OrioleDB access method"]}),(0,t.jsx)(w.DocsButton,{abbrev:!1,className:"mt-2",href:`${C.DOCS_URL}`})]}),"pg_cron"===v.name&&D?.cloud_provider==="FLY"&&(0,t.jsxs)(x.Admonition,{type:"warning",title:"The pg_cron extension is not fully supported for Fly projects",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsx)("p",{children:"You can still enable the extension, but pg_cron jobs may not run due to the behavior of Fly projects."}),(0,t.jsx)(w.DocsButton,{className:"mt-2",href:`${C.DOCS_URL}/guides/platform/fly-postgres#limitations`})]}),(0,t.jsx)(o.DialogSection,{children:(0,t.jsx)(l.Form,{...O,children:(0,t.jsx)("form",{id:"enable-extensions-form",onSubmit:O.handleSubmit(U),children:R?(0,t.jsxs)("div",{className:"space-y-2",children:[(0,t.jsx)(b.ShimmeringLoader,{}),(0,t.jsx)("div",{className:"w-3/4",children:(0,t.jsx)(b.ShimmeringLoader,{})})]}):F?(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(f.FormItemLayout,{isReactForm:!1,label:"Select a schema to enable the extension for",children:(0,t.jsx)(d.Input_Shadcn_,{disabled:!0,value:F})}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Extension must be installed in the "',F,'" schema.']})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(l.FormField,{name:"schema",control:O.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"schema",label:"Select a schema to enable the extension for",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsxs)(c.Select_Shadcn_,{value:e.value,onValueChange:e.onChange,disabled:!!F,children:[(0,t.jsx)(g.SelectTrigger_Shadcn_,{children:(0,t.jsx)(h.SelectValue_Shadcn_,{placeholder:"Select a schema"})}),(0,t.jsxs)(u.SelectContent_Shadcn_,{children:[(0,t.jsxs)(m.SelectItem_Shadcn_,{value:"custom",children:["Create a new schema"," ",(0,t.jsx)("code",{className:"text-code-inline",children:v.name})]}),(0,t.jsx)(p.SelectSeparator_Shadcn_,{}),q.map(e=>(0,t.jsxs)(m.SelectItem_Shadcn_,{value:e.name,children:[e.name,e.name===z?(0,t.jsx)(s.Badge,{className:"ml-2",variant:"success",children:"Recommended"}):F||"extensions"!==e.name?null:(0,t.jsx)(s.Badge,{className:"ml-2",children:"Default"})]},e.id))]})]})})})},"schema"),!!z&&(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Use the "',z,'" schema for full compatibility with related features.']}),"custom"===M&&(0,t.jsx)(l.FormField,{name:"name",control:O.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"name",label:"Schema name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Input_Shadcn_,{...e})})})},"name")]})})})}),(0,t.jsxs)(o.DialogFooter,{children:[(0,t.jsx)(n.Button,{type:"default",disabled:$,onClick:()=>y(),children:"Cancel"}),(0,t.jsx)(n.Button,{htmlType:"submit",form:"enable-extensions-form",loading:$,disabled:R||$,children:"Enable extension"})]})]})})}])},29892,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),r=e.i(843778),i=e.i(79745),s=e.i(389959),n=e.i(253214);let o=({files:e})=>{let[a,i]=(0,s.useState)(e[0]),[o,l]=(0,s.useState)(!1);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("button",{onClick:()=>l(!0),children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border object-cover aspect-video"})}),e.length>1&&(0,t.jsx)("div",{className:"grid grid-cols-10 gap-x-2",children:e.map(e=>(0,t.jsx)("button",{onClick:()=>i(e),children:(0,t.jsx)("img",{alt:e,src:e,className:(0,r.cn)("col-span-1 bg-surface-100 rounded-md object-cover aspect-square border transition",a===e?"border-button-hover":"border-secondary")})},e))})]}),(0,t.jsx)(n.Dialog,{open:o,onOpenChange:l,children:(0,t.jsx)(n.DialogContent,{size:"xxlarge",children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border"})})})]})};var l=e.i(592383);let d=({content:a,integrationId:r})=>{let[i,n]=(0,s.useState)(""),o=a||i;return(0,s.useEffect)(()=>{r&&!o&&e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${r}/overview.md`).then(e=>n(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[r,o]),(0,t.jsx)(l.Markdown,{className:"flex flex-col gap-y-4 text-foreground-light",children:o})};var c=e.i(937942);e.s(["IntegrationOverviewTabV2",0,({children:e})=>{let{id:s}=(0,a.useParams)(),{data:n}=(0,i.useAvailableIntegrations)(),l=n.find(e=>e.id===s);if(!l)return(0,t.jsx)("div",{children:"Unsupported integration type"});let{type:u,content:m,docsUrl:p,siteUrl:g,files:h=[]}=l,x=p?.includes("supabase.com/docs")?"Supabase Docs":(e=>{if(!e)return!1;try{let t=new URL(e).hostname.toLowerCase();return"github.com"===t||t.endsWith(".github.com")}catch(e){return!1}})(p)?"GitHub Docs":"Documentation",f=(e=>{if(e)try{return new URL(e).origin}catch(e){return}})(g);return(0,t.jsxs)("div",{className:"grid grid-cols-3 gap-x-8 px-10 py-8",children:[(0,t.jsxs)("div",{className:"col-span-2 flex flex-col gap-y-8",children:[h.length>0&&(0,t.jsx)(o,{files:h}),(0,t.jsx)(d,{integrationId:s,content:m}),e]}),(0,t.jsx)("div",{className:"text-sm col-span-1 flex flex-col gap-y-8",children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("p",{children:"Details"}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Type"}),(0,t.jsx)("p",{className:"capitalize",children:"oauth"===u?"OAuth":u.replaceAll("_"," ")})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Built by"}),(0,t.jsx)("p",{className:(0,r.cn)(!l.author.name&&"text-foreground-lighter"),children:l.author.name||"Unknown Author"})]}),p&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Docs"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:p,className:c.InlineLinkClassName,children:x})]}),g&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Website"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:g,className:c.InlineLinkClassName,children:f})]})]})})]})}],29892)},135642,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),r=e.i(587433),i=e.i(627069),s=e.i(843778),n=e.i(479095),o=e.i(933275),l=e.i(636900),d=e.i(345594),c=e.i(389959);let u=(0,c.forwardRef)(({integration:e,status:a,className:r,...i},n)=>{let{docsUrl:o}=e,{name:c,websiteUrl:u}=e?.author??{};return c||o||u?(0,t.jsxs)("div",{ref:n,className:(0,s.cn)("flex flex-wrap items-center gap-8 md:gap-10 px-4 md:px-10",r),...i,children:[a&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"STATUS"}),(0,t.jsx)("div",{children:a})]}),c&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"BUILT BY"}),(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c})]}),o&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"DOCS"}),(0,t.jsxs)(d.default,{href:o,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm flex items-center gap-2",children:[(0,t.jsx)(l.Book,{size:16}),o.includes("supabase.com/docs")?"Supabase Docs":o.includes("github.com")?"GitHub Docs":"Documentation"]})]}),u&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"WEBSITE"}),(0,t.jsx)(d.default,{href:u,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm",children:u.replace("https://","")})]})]}):null});u.displayName="BuiltBySection";var m=e.i(858018),p=e.i(592383);let g=({integrationId:a,initiallyExpanded:r})=>{let[i,n]=(0,c.useState)(""),[o,l]=(0,c.useState)(r??!1);(0,c.useEffect)(()=>{e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${a}/overview.md`).then(e=>n(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[a]);let d=o?i:i.slice(0,500),u=i.length>500||(i.match(/\n/g)||[]).length>1;return 0===d.length?null:(0,t.jsx)("div",{className:"px-10",children:(0,t.jsxs)("div",{className:"relative",children:[(0,t.jsx)(m.motion.div,{initial:!1,animate:{height:o?"auto":80},className:"overflow-hidden",transition:{duration:.4},children:(0,t.jsx)(p.Markdown,{content:d,className:"max-w-3xl!"})}),!o&&(0,t.jsx)("div",{className:(0,s.cn)("bottom-0 left-0 right-0 h-24",u&&"bg-linear-to-t from-background-200 to-transparent",o?"relative":"absolute")}),u&&(0,t.jsx)("div",{className:(0,s.cn)("bottom-0",o?"relative mt-3":"absolute"),children:(0,t.jsx)("button",{className:"text-foreground-light hover:text-foreground underline text-sm",onClick:()=>l(!o),children:o?"Show less":"Read more"})})]})})};var h=e.i(837710),x=e.i(121832);let f=({extension:e})=>{let[a,r]=(0,c.useState)(!1);return e?.installed_version?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(h.Button,{type:"primary",className:"w-min",onClick:()=>r(!0),children:["Enable ",e.name]}),(0,t.jsx)(x.EnableExtensionModal,{visible:a,extension:e,onCancel:()=>r(!1)})]})};var b=e.i(450972),v=e.i(635494);e.s(["IntegrationOverviewTab",0,({actions:e,alert:l,status:d,children:c,hideRequiredExtensionsSection:m=!1})=>{let{id:p}=(0,a.useParams)(),{data:h}=(0,v.useSelectedProjectQuery)(),x=o.INTEGRATIONS.find(e=>e.id===p),{data:y}=(0,b.useDatabaseExtensionsQuery)({projectRef:h?.ref,connectionString:h?.connectionString});if(!x)return(0,t.jsx)("div",{children:"Unsupported integration type"});let j=(x.requiredExtensions??[]).length>0,w=(y??[]).filter(e=>(x.requiredExtensions??[]).includes(e.name)),_=w.some(e=>!e.installed_version),S=w.length!==x.requiredExtensions.length;return(0,t.jsxs)("div",{className:"flex flex-col gap-8 py-10",children:[(0,t.jsx)(u,{integration:x,status:d}),!!l&&(0,t.jsx)("div",{className:"px-10 max-w-4xl",children:l}),(0,t.jsx)(g,{integrationId:x.id},x.id),(0,t.jsx)(n.Separator,{}),j&&!m&&(0,t.jsxs)("div",{className:"px-4 md:px-10 max-w-4xl flex flex-col gap-y-4",children:[(0,t.jsx)("h4",{children:"Required extensions"}),(0,t.jsx)(i.Card,{children:(0,t.jsxs)(i.CardContent,{className:"p-0",children:[(0,t.jsx)("ul",{className:"text-foreground-light text-sm",children:(x.requiredExtensions??[]).map((e,a)=>{let i=(y??[]).find(t=>t.name===e),n=!!i?.installed_version,o=a===(x.requiredExtensions?.length??0)-1;return(0,t.jsxs)("li",{className:(0,s.cn)("flex items-center justify-between gap-3 py-2 px-3",o?"":"border-b"),children:[(0,t.jsx)("code",{className:"text-xs",children:e}),(0,t.jsx)("div",{className:"shrink-0",children:i?n?(0,t.jsx)(r.Badge,{children:"Installed"}):(0,t.jsx)(f,{extension:i}):(0,t.jsx)("span",{className:"text-foreground-muted",children:"Unavailable"})})]},e)})}),S&&(0,t.jsx)("div",{className:"py-3 px-4 border-t",children:x.missingExtensionsAlert})]})})]}),!!e&&(0,t.jsx)("div",{"aria-disabled":_&&!m,className:(0,s.cn)("px-10 max-w-4xl",_&&!m&&"opacity-25 [&_button]:pointer-events-none"),children:e}),c]})}],135642)},549487,e=>{"use strict";var t=e.i(38429),a=e.i(356003),r=e.i(355901),i=e.i(78162),s=e.i(234745),n=e.i(915993);async function o({projectRef:e,dbSchema:t,maxRows:a,dbExtraSearchPath:r,dbPool:i}){let n={db_schema:t,max_rows:a,db_extra_search_path:r};i&&(n.db_pool=i);let{data:l,error:d}=await (0,s.patch)("/platform/projects/{ref}/config/postgrest",{params:{path:{ref:e}},body:n});return d&&(0,s.handleError)(d),l}e.s(["useProjectPostgrestConfigUpdateMutation",0,({onSuccess:e,onError:s,...l}={})=>{let d=(0,a.useQueryClient)();return(0,t.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,r){let{projectRef:s}=a;await Promise.all([d.invalidateQueries({queryKey:i.configKeys.postgrest(s)}),d.invalidateQueries({queryKey:n.lintKeys.lint(s)})]),await e?.(t,a,r)},async onError(e,t,a){void 0===s?r.toast.error(`Failed to update Postgrest config: ${e.message}`):s(e,t,a)},...l})}])},247413,e=>{"use strict";var t=e.i(462142);e.s(["useIsDataApiEnabled",0,({projectRef:e})=>{let{data:a,...r}=(0,t.useProjectPostgrestConfigQuery)({projectRef:e}),i=!!a?.db_schema?.trim();return{...r,data:i,isEnabled:i}}])},479709,e=>{"use strict";var t=e.i(48189);function a(e){if(!e)return"";let t=e.replace(/\/+$/,"");return/\/rest\/v1$/.test(t)?`${t}/`:`${t}/rest/v1/`}e.s(["buildEntityMaps",0,function(e){let a="rpc/";return Object.keys(e??{}).reduce((e,r)=>{let i=r.slice(1);if(!i.length)return e;let s=i.startsWith(a),n=s?i.slice(a.length):i,o={id:n,displayName:n.replace(/_/g," "),camelCase:(0,t.snakeToCamel)(n)};return s?e.rpcs[n]=o:e.resources[n]=o,e},{resources:{},rpcs:{}})},"getApiEndpoint",0,function({selectedDatabaseId:e,projectRef:t,resolvedEndpoint:r,loadBalancers:i,selectedDatabase:s}){return e===t&&r?a(r):"load-balancer"===e?a(i?.[0]?.endpoint):a(s?.restUrl)}])},350187,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(657588),r=e.i(158639),i=e.i(867637),s=e.i(178527),n=e.i(592360),o=e.i(843778),l=e.i(710483),d=e.i(135642),c=e.i(29892),u=e.i(283607),m=e.i(26898),p=e.i(389959),g=e.i(655744),h=e.i(355901),x=e.i(627069),f=e.i(97429);let b=f.z.object({enableDataApi:f.z.boolean()});e.i(850036);var v=e.i(479084),y=e.i(714403);async function j({projectRef:e,connectionString:t,schemas:a}){if(0===a.length)return[];let{result:r}=await (0,y.executeSql)({projectRef:e,connectionString:t,sql:(({schemas:e})=>{let t=(0,v.joinSqlFragments)(e.map(v.literal),", ");return v.safeSql`
    select
      n.nspname as schema,
      c.relname as name,
      case c.relkind
        when 'r' then 'table'
        when 'f' then 'foreign table'
        when 'm' then 'materialized view'
        when 'v' then 'view'
      end as type
    from
      pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on c.relnamespace = n.oid
      left join pg_catalog.pg_depend dep
        on c.oid = dep.objid
        and dep.deptype = 'e'
    where
      (
        pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
      )
      and n.nspname in (${t})
      and n.nspname not in (
        '_timescaledb_cache', '_timescaledb_catalog', '_timescaledb_config',
        '_timescaledb_internal', 'auth', 'cron', 'extensions', 'graphql',
        'graphql_public', 'information_schema', 'net', 'pgmq', 'pgroonga',
        'pgsodium', 'pgsodium_masks', 'pgtle', 'pgbouncer', 'pg_catalog',
        'realtime', 'repack', 'storage', 'supabase_functions',
        'supabase_migrations', 'tiger', 'topology', 'vault'
      )
      and dep.objid is null
      and (
        -- Tables without RLS
        (c.relkind = 'r' and not c.relrowsecurity)
        -- Foreign tables (RLS not supported)
        or c.relkind = 'f'
        -- Materialized views (RLS not supported)
        or c.relkind = 'm'
        -- Views without security invoker (PG 15+)
        or (
          c.relkind = 'v'
          and substring(pg_catalog.version() from 'PostgreSQL ([0-9]+)') >= '15'
          and not (
            lower(coalesce(c.reloptions::text, '{}'))::text[]
            && array[
              'security_invoker=1',
              'security_invoker=true',
              'security_invoker=yes',
              'security_invoker=on'
            ]
          )
        )
      )
    order by n.nspname, c.relname
  `})({schemas:a}),queryKey:["unsafe-entities-in-api"]});return r??[]}let w=e=>{let t=e?.split(",").map(e=>e.trim()).filter(e=>e.length>0)??[];return t.length>0?t:["public"]};function _(e,t){switch(e.status){case"idle":if("START_CHECK"===t.type)return{status:"checking"};return e;case"checking":if("ENTITIES_FOUND"===t.type)return{status:"confirming",unsafeEntities:t.unsafeEntities};if("DISMISS"===t.type)return{status:"idle"};return e;case"confirming":if("DISMISS"===t.type)return{status:"idle"};return e}}var S=e.i(20482),N=e.i(290811),A=e.i(538482),C=e.i(206413),k=e.i(877555);let P=()=>(0,t.jsxs)(s.Alert_Shadcn_,{variant:"warning",children:[(0,t.jsx)(k.WarningIcon,{}),(0,t.jsx)(n.AlertTitle_Shadcn_,{children:"No schemas can be queried"}),(0,t.jsxs)(C.AlertDescription_Shadcn_,{children:[(0,t.jsx)("p",{children:"With this setting disabled, you will not be able to query any schemas via the Data API."}),(0,t.jsxs)("p",{children:["You will see errors from the Postgrest endpoint"," ",(0,t.jsx)("code",{className:"text-code-inline",children:"/rest/v1/"}),"."]})]})]});var I=e.i(331720);let D=({form:e,formId:a,disabled:r,isBusy:i,permissionsHelper:s,onSubmit:n,handleReset:o})=>{let l=e.watch("enableDataApi");return(0,t.jsx)(S.Form,{...e,children:(0,t.jsxs)("form",{id:a,onSubmit:e.handleSubmit(n),children:[(0,t.jsx)(x.CardContent,{children:(0,t.jsx)(S.FormField,{control:e.control,name:"enableDataApi",render:({field:e})=>(0,t.jsxs)(S.FormItem,{className:"space-y-4",children:[(0,t.jsx)(A.FormItemLayout,{layout:"flex-row-reverse",label:"Enable Data API",description:"When enabled you will be able to use any Supabase client library and PostgREST endpoints with any schema configured in the Settings tab.",children:(0,t.jsx)(S.FormControl,{children:(0,t.jsx)(N.Switch,{size:"large",disabled:r,checked:e.value,onCheckedChange:e.onChange})})}),!l&&(0,t.jsx)(P,{})]})})}),(0,t.jsx)(x.CardFooter,{children:(0,t.jsx)(I.FormActions,{form:a,isSubmitting:i,hasChanges:e.formState.isDirty,handleReset:o,disabled:r,helper:s})})]})})};var E=e.i(108151);let z=()=>(0,t.jsxs)(x.CardContent,{className:"space-y-2",children:[(0,t.jsx)(E.ShimmeringLoader,{}),(0,t.jsx)(E.ShimmeringLoader,{className:"w-3/4",delayIndex:1})]}),T=()=>(0,t.jsxs)(s.Alert_Shadcn_,{variant:"destructive",children:[(0,t.jsx)(i.AlertCircle,{size:16}),(0,t.jsx)(n.AlertTitle_Shadcn_,{children:"Failed to retrieve Data API settings"})]});var R=e.i(416050),q=e.i(283342),F=e.i(837710),L=e.i(925282),$=e.i(774234),B=e.i(554855),O=e.i(466472);let M={table:{heading:"Tables without Row Level Security",recommendation:"Enable RLS on these tables to control access per-row.",docsUrl:"https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public"},"foreign table":{heading:"Foreign tables",recommendation:"Foreign tables do not support RLS. Revoke access from the anon and authenticated roles.",docsUrl:"https://supabase.com/docs/guides/database/database-linter?lint=0017_foreign_table_in_api"},"materialized view":{heading:"Materialized views",recommendation:"Materialized views do not support RLS. Revoke access from the anon and authenticated roles.",docsUrl:"https://supabase.com/docs/guides/database/database-linter?lint=0016_materialized_view_in_api"},view:{heading:"Views without SECURITY INVOKER",recommendation:"These views run with the permissions of the view creator, not the querying user. Set SECURITY INVOKER to enforce caller permissions.",docsUrl:"https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view"}},U=["table","foreign table","materialized view","view"],Q=({visible:e,loading:a,unsafeEntities:r,onCancel:i,onConfirm:s})=>{let n=(0,p.useMemo)(()=>{let e=new Map;for(let t of r){let a=e.get(t.type);a?a.push(t):e.set(t.type,[t])}return U.filter(t=>e.has(t)).map(t=>({type:t,...M[t],entities:e.get(t)??[]}))},[r]);return(0,t.jsx)(O.default,{variant:"warning",visible:e,loading:a,title:"Insecure objects detected",confirmLabel:"Enable Data API",confirmLabelLoading:"Enabling",onCancel:i,onConfirm:s,className:"max-h-[50vh] overflow-y-auto",children:(0,t.jsxs)("div",{className:"text-sm text-foreground-light space-y-4",children:[(0,t.jsx)("p",{children:"The following objects will be publicly accessible through the Data API and are insecure."}),n.map(({type:e,heading:a,recommendation:r,docsUrl:i,entities:s})=>(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("h4",{className:"text-foreground font-medium",children:a}),(0,t.jsx)(G,{entities:s}),(0,t.jsxs)("p",{className:"text-foreground-lighter text-xs",children:[r," ",(0,t.jsx)("a",{href:i,target:"_blank",rel:"noopener noreferrer",className:"underline hover:text-foreground",children:"Learn more"})]})]},e))]})})},K=({entity:e})=>(0,t.jsx)("li",{children:(0,t.jsxs)("code",{className:"text-xs",children:[e.schema,".",e.name]})}),G=({entities:e})=>{let[a,r]=(0,p.useState)(!1),i=e.length>3,s=e.slice(0,3),n=e.slice(3);return i?(0,t.jsxs)(L.Collapsible_Shadcn_,{open:a,onOpenChange:r,children:[(0,t.jsx)("ul",{className:"list-disc pl-5 space-y-0.5",children:s.map(e=>(0,t.jsx)(K,{entity:e},`${e.schema}.${e.name}`))}),(0,t.jsx)($.CollapsibleContent_Shadcn_,{className:"transition-all data-closed:animate-collapsible-up data-open:animate-collapsible-down",children:(0,t.jsx)("ul",{className:"list-disc pl-5 space-y-0.5",children:n.map(e=>(0,t.jsx)(K,{entity:e},`${e.schema}.${e.name}`))})}),(0,t.jsx)(B.CollapsibleTrigger_Shadcn_,{asChild:!0,children:(0,t.jsx)(F.Button,{type:"text",size:"tiny",className:"px-0 h-auto text-xs text-foreground-lighter hover:text-foreground",children:(0,t.jsxs)("div",{className:"flex items-center gap-1",children:[a?(0,t.jsx)(q.ChevronUp,{size:12}):(0,t.jsx)(R.ChevronRight,{size:12}),(0,t.jsx)("span",{children:a?"Show less":`Show ${n.length} more`})]})})})]}):(0,t.jsx)("ul",{className:"list-disc pl-5 space-y-0.5",children:e.map(e=>(0,t.jsx)(K,{entity:e},`${e.schema}.${e.name}`))})};var H=e.i(462142),V=e.i(549487),W=e.i(2579),Y=e.i(247413),J=e.i(635494),X=e.i(804222);let Z=()=>{let{ref:e}=(0,r.useParams)(),{data:a}=(0,J.useSelectedProjectQuery)(),{can:i,isSuccess:s}=(0,W.useAsyncCheckPermissions)(m.PermissionAction.UPDATE,"custom_config_postgrest"),{data:n,isError:o,isPending:l}=(0,H.useProjectPostgrestConfigQuery)({projectRef:e}),{isEnabled:d,isPending:c}=(0,Y.useIsDataApiEnabled)({projectRef:e}),{mutate:f,isPending:v}=(0,V.useProjectPostgrestConfigUpdateMutation)({onSuccess:(e,t)=>{h.toast.success(t.dbSchema?"Data API enabled":"Data API disabled")}}),[y,S]=(0,p.useReducer)(_,{status:"idle"}),N=l||!e,A=(0,g.useForm)({resolver:(0,u.zodResolver)(b),mode:"onChange",defaultValues:{enableDataApi:!1}}),C=(0,X.useStaticEffectEvent)(()=>{c||A.reset({enableDataApi:d})});(0,p.useEffect)(()=>{C()},[C,d]);let k=(0,p.useCallback)(t=>{e&&n&&f({projectRef:e,dbSchema:t?w(n.db_schema).join(", "):"",maxRows:n.max_rows,dbExtraSearchPath:n.db_extra_search_path??"",dbPool:n.db_pool??null})},[e,n,f]),P=(0,p.useCallback)(async({enableDataApi:t})=>{if(!e)return;if(!t||d)return void k(t);let r=w(n?.db_schema);S({type:"START_CHECK"});try{let t=await j({projectRef:e,connectionString:a?.connectionString,schemas:r});t.length>0?S({type:"ENTITIES_FOUND",unsafeEntities:t}):(S({type:"DISMISS"}),k(!0))}catch(e){console.error("Failed to check for exposed entities",e),S({type:"DISMISS"}),h.toast.error("Failed to check for exposed entities")}},[e,d,n?.db_schema,a?.connectionString,k]),I=(0,p.useCallback)(()=>{c||A.reset({enableDataApi:d})},[c,d,A]),E=v||"checking"===y.status,R=N?(0,t.jsx)(z,{}):o||!n?(0,t.jsx)(T,{}):(0,t.jsx)(D,{form:A,formId:"data-api-enable-form",disabled:!i||E,isBusy:E,permissionsHelper:s&&!i?"You need additional permissions to update your project's API settings":void 0,onSubmit:P,handleReset:I});return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(x.Card,{children:R}),(0,t.jsx)(Q,{visible:"confirming"===y.status,loading:v,unsafeEntities:"confirming"===y.status?y.unsafeEntities:[],onCancel:()=>S({type:"DISMISS"}),onConfirm:()=>{S({type:"DISMISS"}),k(!0)}})]})};var ee=e.i(17313),et=e.i(228027),ea=e.i(746301),er=e.i(479709),ei=e.i(282492),es=e.i(480683),en=e.i(330287),eo=e.i(150671),el=e.i(189329);let ed=()=>{let{isPending:e}=(0,J.useSelectedProjectQuery)(),{ref:a}=(0,r.useParams)(),o=(0,el.useDatabaseSelectorStateSnapshot)(),[l,d]=(0,ee.useQueryState)("source",ee.parseAsString),{data:c}=(0,es.useProjectApiUrl)({projectRef:a}),{data:u,isError:m,isPending:g}=(0,eo.useReadReplicasQuery)({projectRef:a}),{data:h}=(0,en.useLoadBalancersQuery)({projectRef:a}),x=(0,X.useStaticEffectEvent)(()=>{l&&l!==o.selectedDatabaseId&&o.setSelectedDatabaseId(l)});(0,p.useEffect)(()=>{x()},[x,l,a]);let f=u?.find(e=>e.identifier===o.selectedDatabaseId),b="load-balancer"===o.selectedDatabaseId,v=f?.identifier!==a,y=(0,er.getApiEndpoint)({selectedDatabaseId:o.selectedDatabaseId,projectRef:a,resolvedEndpoint:c,loadBalancers:h,selectedDatabase:f});return(0,t.jsxs)(et.PageSection,{className:"first:pt-0",children:[(0,t.jsxs)(et.PageSectionMeta,{children:[(0,t.jsxs)(et.PageSectionSummary,{children:[(0,t.jsx)(et.PageSectionTitle,{children:"API URL"}),(0,t.jsx)(et.PageSectionDescription,{children:b?"RESTful endpoint for querying and managing your databases through your load balancer":v?"RESTful endpoint for querying your read replica":"RESTful endpoint for querying and managing your database"})]}),(0,t.jsx)(et.PageSectionAside,{children:(0,t.jsx)(ei.DatabaseSelector,{additionalOptions:(h??[]).length>0?[{id:"load-balancer",name:"API Load Balancer"}]:[],onSelectId:()=>{d(null)}})})]}),(0,t.jsx)(et.PageSectionContent,{children:e||g?(0,t.jsxs)("div",{className:"space-y-2",children:[(0,t.jsx)(E.ShimmeringLoader,{}),(0,t.jsx)(E.ShimmeringLoader,{className:"w-3/4",delayIndex:1})]}):m?(0,t.jsxs)(s.Alert_Shadcn_,{variant:"destructive",children:[(0,t.jsx)(i.AlertCircle,{size:16}),(0,t.jsx)(n.AlertTitle_Shadcn_,{children:"Failed to retrieve project URL"})]}):(0,t.jsx)(ea.Input,{copy:!0,readOnly:!0,className:"font-mono",value:y})})]})};var ec=e.i(10429),eu=e.i(837508);let em=()=>{let{ref:e}=(0,r.useParams)(),{data:a,isPending:d}=(0,J.useSelectedProjectQuery)(),{isEnabled:c,isPending:u}=(0,Y.useIsDataApiEnabled)({projectRef:e});return(0,t.jsx)("div",{className:"max-w-4xl flex flex-col",children:d||a?.status===eu.PROJECT_STATUS.ACTIVE_HEALTHY?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:(0,o.cn)(ec.IS_PLATFORM&&(d||u||!c)&&"opacity-50 pointer-events-none"),children:(0,t.jsx)(ed,{})}),ec.IS_PLATFORM?(0,t.jsx)(Z,{}):(0,t.jsx)(l.Admonition,{type:"default",title:"Managed via configuration variables",description:"Data API settings are configured via config.toml for CLI and local development, or via docker-compose.yml and .env for self-hosted deployments."})]}):(0,t.jsxs)(s.Alert_Shadcn_,{variant:"destructive",children:[(0,t.jsx)(i.AlertCircle,{size:16}),(0,t.jsx)(n.AlertTitle_Shadcn_,{children:"API settings are unavailable as the project is not active"})]})})};e.s(["DataApiOverviewTab",0,()=>(0,a.useFlag)("marketplaceIntegrations")?(0,t.jsx)(c.IntegrationOverviewTabV2,{children:(0,t.jsx)(em,{})}):(0,t.jsx)(d.IntegrationOverviewTab,{children:(0,t.jsx)("div",{className:"px-10",children:(0,t.jsx)(em,{})})})],350187)},429091,e=>{e.n(e.i(350187))},185246,e=>{e.v(t=>Promise.all(["static/chunks/08~qzvogqaaio.js"].map(t=>e.l(t))).then(()=>t(911142)))},434962,e=>{e.v(t=>Promise.all(["static/chunks/0mt1bd4o59er8.js"].map(t=>e.l(t))).then(()=>t(481162)))},216511,e=>{e.v(t=>Promise.all(["static/chunks/141scz7lioi__.js"].map(t=>e.l(t))).then(()=>t(575213)))},326546,e=>{e.v(t=>Promise.all(["static/chunks/12zy-nznlh7az.js"].map(t=>e.l(t))).then(()=>t(266186)))},780799,e=>{e.v(t=>Promise.all(["static/chunks/11pan2l1emfzx.js"].map(t=>e.l(t))).then(()=>t(567789)))},105568,e=>{e.v(t=>Promise.all(["static/chunks/0b80oynnurqnz.js"].map(t=>e.l(t))).then(()=>t(956849)))},43799,e=>{e.v(t=>Promise.all(["static/chunks/175v6ap~7k-_-.js"].map(t=>e.l(t))).then(()=>t(476149)))},479686,e=>{e.v(t=>Promise.all(["static/chunks/0ilvo.4ihrw.n.js"].map(t=>e.l(t))).then(()=>t(682117)))},790935,e=>{e.v(t=>Promise.all(["static/chunks/11.2jerslxqpe.js"].map(t=>e.l(t))).then(()=>t(918317)))},675240,e=>{e.v(t=>Promise.all(["static/chunks/0y7ynm3t00xgx.js"].map(t=>e.l(t))).then(()=>t(259107)))},196082,e=>{e.v(t=>Promise.all(["static/chunks/00p1trb5la_fj.js"].map(t=>e.l(t))).then(()=>t(725449)))},141281,e=>{e.v(t=>Promise.all(["static/chunks/0vmhs9_eiqaba.js"].map(t=>e.l(t))).then(()=>t(476854)))},401546,e=>{e.v(t=>Promise.all(["static/chunks/0-ffctee06z5q.js"].map(t=>e.l(t))).then(()=>t(427555)))},650542,e=>{e.v(t=>Promise.all(["static/chunks/0t.arw5d07tls.js"].map(t=>e.l(t))).then(()=>t(46434)))},297196,e=>{e.v(t=>Promise.all(["static/chunks/0akxsfqq-vl25.js"].map(t=>e.l(t))).then(()=>t(983259)))},751169,e=>{e.v(t=>Promise.all(["static/chunks/0kr22v~s62fbr.js"].map(t=>e.l(t))).then(()=>t(211963)))},652112,e=>{e.v(t=>Promise.all(["static/chunks/00f-a5~0swwup.js"].map(t=>e.l(t))).then(()=>t(106809)))},797235,e=>{e.v(t=>Promise.all(["static/chunks/0my39hx2sjys7.js"].map(t=>e.l(t))).then(()=>t(311486)))},304455,e=>{e.v(t=>Promise.all(["static/chunks/0e6i~_4t4~pz_.js"].map(t=>e.l(t))).then(()=>t(17077)))},338107,e=>{e.v(t=>Promise.all(["static/chunks/0aod~v1mpketd.js"].map(t=>e.l(t))).then(()=>t(1152)))},870265,e=>{e.v(t=>Promise.all(["static/chunks/17bpehtvrbq27.js"].map(t=>e.l(t))).then(()=>t(302280)))},441486,e=>{e.v(t=>Promise.all(["static/chunks/0pcp9er0q6-ly.js"].map(t=>e.l(t))).then(()=>t(659562)))},362060,e=>{e.v(t=>Promise.all(["static/chunks/142ssqlash_0x.js"].map(t=>e.l(t))).then(()=>t(667994)))},993747,e=>{e.v(t=>Promise.all(["static/chunks/0jrfxywrdebvc.js"].map(t=>e.l(t))).then(()=>t(102825)))},376147,e=>{e.v(t=>Promise.all(["static/chunks/0q363y5lf~b~y.js"].map(t=>e.l(t))).then(()=>t(89290)))},458511,e=>{e.v(t=>Promise.all(["static/chunks/0shu_91ffgh2t.js"].map(t=>e.l(t))).then(()=>t(786522)))},75071,e=>{e.v(t=>Promise.all(["static/chunks/05pv0ojh_evmh.js"].map(t=>e.l(t))).then(()=>t(739236)))},693988,e=>{e.v(t=>Promise.all(["static/chunks/10758s3hhc0t4.js"].map(t=>e.l(t))).then(()=>t(167237)))}]);