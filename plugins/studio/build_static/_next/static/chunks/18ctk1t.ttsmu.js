(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,271332,e=>{"use strict";var t=e.i(478902),a=e.i(389959),r=e.i(843778),i=e.i(837710),n=e.i(253214);let s=(0,a.forwardRef)(({children:e,customFooter:s,description:o,hideFooter:l=!1,alignFooter:d="left",layout:c="horizontal",loading:u=!1,cancelText:m="Cancel",onConfirm:p=()=>{},onCancel:g=()=>{},confirmText:x="Confirm",showCloseButton:h=!0,footerBackground:f,variant:v="success",visible:b=!1,size:y="large",style:w,overlayStyle:j,contentStyle:_,triggerElement:S,header:N,modal:C,defaultOpen:k,...A},D)=>{let[P,T]=a.default.useState(!!b&&b);(0,a.useEffect)(()=>{T(b)},[b]);let q=s||(0,t.jsxs)("div",{className:"flex w-full space-x-2",style:{width:"100%",justifyContent:"vertical"===c?"center":"right"===d?"flex-end":"flex-start"},children:[(0,t.jsx)(i.Button,{type:"default",onClick:g,disabled:u,children:m}),(0,t.jsx)(i.Button,{onClick:p,disabled:u,loading:u,type:"danger"===v?"danger":"warning"===v?"warning":"primary",children:x})]});return(0,t.jsxs)(n.Dialog,{open:P,defaultOpen:k,onOpenChange:function(e){void 0===b||e?T(e):g()},modal:C,children:[S&&(0,t.jsx)(n.DialogTrigger,{children:S}),(0,t.jsxs)(n.DialogContent,{ref:D,hideClose:!h,...A,size:y,children:[N||o?(0,t.jsxs)(n.DialogHeader,{className:(0,r.cn)("border-b"),padding:"small",children:[N&&(0,t.jsx)(n.DialogTitle,{children:N}),o&&(0,t.jsx)(n.DialogDescription,{children:o})]}):null,e,!l&&(0,t.jsx)(n.DialogFooter,{padding:"small",children:q})]})]})}),o=(0,a.forwardRef)(({...e},a)=>(0,t.jsx)(n.DialogSection,{ref:a,...e,padding:"small",className:(0,r.cn)(e.className)})),l=(0,a.forwardRef)(({...e},a)=>(0,t.jsx)(n.DialogSectionSeparator,{ref:a,...e}));s.Content=o,s.Separator=l,e.s(["default",0,s])},40892,e=>{"use strict";var t=e.i(271332);e.s(["Modal",()=>t.default])},938933,305551,e=>{"use strict";var t=e.i(389959);let a={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,i],305551);let n=(0,t.createContext)({theme:i});e.s(["default",0,function(e){let{theme:{[e]:a}}=(0,t.useContext)(n);return a||(a=i.accordion),a=JSON.parse(a=JSON.stringify(a).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),a=e.i(816467),r=e.i(389959),i=e.i(843778),n=e.i(375761),s=e.i(231665),o=e.i(938933);let l=(0,r.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:m,iconContainerClassName:p,containerClassName:g,size:x="small",...h},f)=>{let[v,b]=(0,r.useState)("Copy"),[y,w]=(0,r.useState)(!0),j=(0,o.default)("input"),_=[];return x&&_.push(j.size[x]),(0,t.jsxs)(s.InputGroup,{className:g,children:[(0,t.jsx)(s.InputGroupInput,{ref:f,onFocus:e=>e.target.select(),...h,size:x,onCopy:m,type:c&&y?"password":h.type,disabled:h.disabled,className:(0,i.cn)(..._,h.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(s.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(s.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,t.jsx)(s.InputGroupButton,{size:"tiny",type:"default",className:(0,i.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(a.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=h.value,void(0,n.copyToClipboard)(e,()=>{b("Copied"),setTimeout(function(){b("Copy")},3e3),m?.()})},children:v}):null,c&&y?(0,t.jsx)(s.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},592383,e=>{"use strict";var t=e.i(478902),a=e.i(755146),r=e.i(861833),i=e.i(843778),n=e.i(937942);let s=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),o=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:a})=>(0,t.jsx)(n.InlineLink,{href:e??"/",children:a});e.s(["Markdown",0,({children:e,className:n,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,i.cn)("text-sm",n),children:(0,t.jsx)(a.default,{remarkPlugins:[r.default],components:{h3:s,code:o,a:l},...u,children:e??d})})])},466472,e=>{"use strict";var t=e.i(478902),a=e.i(389959),r=e.i(837710),i=e.i(843778),n=e.i(253214),s=e.i(710483);let o=(0,a.forwardRef)(({title:e,description:o,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:m,cancelLabel:p="Cancel",confirmLabel:g="Submit",confirmLabelLoading:x,alert:h,children:f,variant:v="default",disabled:b,className:y,...w},j)=>{let[_,S]=(0,a.useState)(void 0!==m&&m);(0,a.useEffect)(()=>{d&&void 0===m&&S(!1)},[d]),(0,a.useEffect)(()=>{void 0!==m&&S(m)},[m]);let{title:N,children:C,...k}=h?.base??{},A=h?.title?{label:h.title}:{};return(0,t.jsx)(n.Dialog,{open:d,...w,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(n.DialogContent,{"aria-describedby":void 0,ref:j,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(n.DialogHeader,{className:(0,i.cn)("border-b"),padding:"small",children:[(0,t.jsx)(n.DialogTitle,{children:e}),o&&(0,t.jsx)(n.DialogDescription,{children:o})]}),h&&(0,t.jsx)(s.Admonition,{type:v,description:h.description,...A,className:"border-x-0 rounded-none -mt-px",...k}),f&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(n.DialogSection,{padding:"small",className:y,children:f}),(0,t.jsx)(n.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(r.Button,{size:"medium",block:!0,type:"default",disabled:_,onClick:()=>c(),children:p}),(0,t.jsx)(r.Button,{block:!0,size:"medium",type:"destructive"===v?"danger":"warning"===v?"warning":"primary",htmlType:"submit",loading:_,disabled:_||b,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===m&&S(!0)},className:"truncate",children:_&&x?x:g})]})]})})});o.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,o,"default",0,o])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},236134,e=>{"use strict";var t=e.i(478902),a=e.i(162361),r=e.i(837710),i=e.i(613580),n=e.i(938933);let s=({id:e,disabled:s,className:o,children:l,header:d,visible:c,open:u,size:m="medium",loading:p,align:g="right",hideFooter:x=!1,customFooter:h,onConfirm:f,onCancel:v,confirmText:b="Confirm",cancelText:y="Cancel",triggerElement:w,defaultOpen:j,tooltip:_,...S})=>{let N=(0,n.default)("sidepanel"),C=h||(0,t.jsxs)("div",{className:N.footer,children:[(0,t.jsx)("div",{children:(0,t.jsx)(r.Button,{disabled:p,type:"default",onClick:()=>v?v():null,children:y})}),!!f&&(0,t.jsxs)(i.Tooltip,{children:[(0,t.jsx)(i.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("span",{className:"inline-block",children:(0,t.jsx)(r.Button,{htmlType:"submit",disabled:s||p,loading:p,onClick:f,children:b})})}),void 0!==_&&(0,t.jsx)(i.TooltipContent,{side:"bottom",children:_})]})]});u=u||c;let{onOpenAutoFocus:k,onCloseAutoFocus:A,onEscapeKeyDown:D,onPointerDownOutside:P,onInteractOutside:T}=S;return(0,t.jsxs)(a.Dialog.Root,{open:u,onOpenChange:function(e){void 0!==c&&!e&&v&&v()},defaultOpen:j,children:[w&&(0,t.jsx)(a.Dialog.Trigger,{asChild:!0,children:w}),(0,t.jsxs)(a.Dialog.Portal,{children:[(0,t.jsx)(a.Dialog.Overlay,{className:N.overlay}),(0,t.jsxs)(a.Dialog.Content,{className:[N.base,N.size[m],N.align[g],o&&o].join(" "),onOpenAutoFocus:k,onCloseAutoFocus:A,onEscapeKeyDown:D,onPointerDownOutside:P,onInteractOutside:e=>{e.target?.closest("#toast")&&e.preventDefault(),T&&T(e)},...S,children:[d&&(0,t.jsx)("header",{className:N.header,children:d}),(0,t.jsx)("div",{className:N.contents,children:l}),!x&&C]})]})]})};s.Content=function({children:e,className:a}){let r=(0,n.default)("sidepanel");return(0,t.jsx)("div",{className:[r.content,a].join(" ").trim(),children:e})},s.Separator=function(){let e=(0,n.default)("sidepanel");return(0,t.jsx)("div",{className:e.separator})},e.s(["default",0,s])},539013,e=>{"use strict";var t=e.i(236134);e.s(["SidePanel",()=>t.default])},228027,e=>{"use strict";var t=e.i(478902),a=e.i(766181),r=e.i(843778);let i=(0,a.cva)(["pt-12 last:pb-12 gap-6"],{variants:{orientation:{horizontal:"grid @3xl:grid-cols-[1fr_2fr] @3xl:gap-12",vertical:"flex flex-col"}},defaultVariants:{orientation:"vertical"}}),n=({className:e,orientation:a="vertical",children:n,...s})=>(0,t.jsx)("div",{"data-slot":"page-section","data-orientation":a,className:(0,r.cn)(i({orientation:a}),e),...s,children:n});n.displayName="PageSectionRoot";let s=({className:e,children:a,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-summary",className:(0,r.cn)("flex flex-col gap-1",e),...i,children:a});s.displayName="PageSectionSummary";let o=({className:e,children:a,...i})=>(0,t.jsx)("h2",{"data-slot":"page-section-title",className:(0,r.cn)("heading-section",e),...i,children:a});o.displayName="PageSectionTitle";let l=({className:e,children:a,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-description",className:(0,r.cn)("text-sm text-foreground-light",e),style:{textBoxTrim:"trim-end"},...i,children:a});l.displayName="PageSectionDescription";let d=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-aside",className:(0,r.cn)("flex items-center gap-2","@xl:self-end",e),...a});d.displayName="PageSectionAside";let c=({className:e,children:a,...i})=>(0,t.jsx)("div",{className:"@container",children:(0,t.jsx)("div",{"data-slot":"page-section-meta",className:(0,r.cn)("flex flex-col @xl:flex-row @xl:justify-between @xl:items-center gap-4",'*:data-[slot="page-section-summary"]:flex-1','*:data-[slot="page-section-summary"]:@xl:self-center','*:data-[slot="page-section-aside"]:shrink-0',e),...i,children:a})});c.displayName="PageSectionMeta";let u=({className:e,...a})=>(0,t.jsx)("div",{"data-slot":"page-section-content",className:(0,r.cn)(e),...a});u.displayName="PageSectionContent",e.s(["PageSection",0,n,"PageSectionAside",0,d,"PageSectionContent",0,u,"PageSectionDescription",0,l,"PageSectionMeta",0,c,"PageSectionSummary",0,s,"PageSectionTitle",0,o])},167892,e=>{"use strict";var t=e.i(478902),a=e.i(389959),r=e.i(843778);let i="mx-auto w-full max-w-[1200px]",n="px-4 @lg:px-6 @xl:px-10",s=(0,a.forwardRef)(({className:e,bottomPadding:a,size:i="default",...s},o)=>(0,t.jsx)("div",{ref:o,...s,className:(0,r.cn)("mx-auto w-full @container",{small:"max-w-[768px]",default:"max-w-[1200px]",large:"max-w-[1600px]",full:"max-w-none"}[i],n,a&&"pb-16",e)})),o=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("header",{...a,ref:i,className:(0,r.cn)("w-full","flex-col gap-3 py-6",e)})),l=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("h1",{ref:i,...a,className:(0,r.cn)(e)})),d=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("p",{ref:i,...a,className:(0,r.cn)("text-sm text-foreground-light",e)})),c=(0,a.forwardRef)(({className:e,isFullWidth:a,topPadding:i,...n},s)=>(0,t.jsx)("div",{ref:s,...n,className:(0,r.cn)("flex flex-col first:pt-12 py-6",a?"w-full":"gap-3 @md:grid-cols-12 @lg:grid",e)})),u=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("w-full h-px bg-border shrink-0",e)})),m=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("h3",{ref:i,...a,className:(0,r.cn)("text-foreground text-xl",e)})),p=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("p",{ref:i,...a,className:(0,r.cn)("text-sm text-foreground-light",e)})),g=(0,a.forwardRef)(({className:e,children:a,title:i,...n},s)=>(0,t.jsxs)("div",{ref:s,...n,className:(0,r.cn)("col-span-4 xl:col-span-5 prose text-sm",e),children:[i&&(0,t.jsx)("h2",{children:i}),a]})),x=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("col-span-8 xl:col-span-7","flex flex-col gap-6",e)})),h=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("flex flex-col gap-3 items-center",e)})),f=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("flex w-full items-center",e)})),v=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("flex flex-row gap-3",e)})),b=(0,a.forwardRef)(({className:e,...a},i)=>(0,t.jsx)("div",{ref:i,...a,className:(0,r.cn)("flex flex-col gap-3","min-w-[420px]",e)})),y=(0,a.forwardRef)(({className:e,...a},s)=>(0,t.jsx)("div",{ref:s,...a,className:(0,r.cn)(i,n,"my-8 flex flex-col gap-8",e)}));o.displayName="ScaffoldHeader",l.displayName="ScaffoldTitle",d.displayName="ScaffoldDescription",s.displayName="ScaffoldContainer",u.displayName="ScaffoldDivider",c.displayName="ScaffoldSection",b.displayName="ScaffoldColumn",g.displayName="ScaffoldSectionDetail",x.displayName="ScaffoldSectionContent",h.displayName="ScaffoldFilterAndContent",f.displayName="ScaffoldActionsContainer",v.displayName="ScaffoldActionsGroup",y.displayName="ScaffoldContainerLegacy",m.displayName="ScaffoldSectionTitle",p.displayName="ScaffoldSectionDescription",e.s(["MAX_WIDTH_CLASSES",0,i,"PADDING_CLASSES",0,n,"ScaffoldActionsContainer",0,f,"ScaffoldActionsGroup",0,v,"ScaffoldColumn",0,b,"ScaffoldContainer",0,s,"ScaffoldContainerLegacy",0,y,"ScaffoldDescription",0,d,"ScaffoldDivider",0,u,"ScaffoldFilterAndContent",0,h,"ScaffoldHeader",0,o,"ScaffoldSection",0,c,"ScaffoldSectionContent",0,x,"ScaffoldSectionDescription",0,p,"ScaffoldSectionDetail",0,g,"ScaffoldSectionTitle",0,m,"ScaffoldTitle",0,l])},53071,e=>{"use strict";let t=(0,e.i(388019).default)("SquarePen",[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]]);e.s(["Edit",0,t],53071)},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(38429),r=e.i(356003),i=e.i(355901),n=e.i(667286),s=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:a,schema:r,name:i,version:n,cascade:s=!1,createSchema:d=!1}){let c=new Headers;a&&c.set("x-connection-encrypted",a);let u=(0,t.getEnableDatabaseExtensionSQL)({schema:r,name:i,version:n,cascade:s,createSchema:d}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:u,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let d=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,r){let{projectRef:i}=a;await Promise.all([d.invalidateQueries({queryKey:n.databaseExtensionsKeys.list(i)}),d.invalidateQueries({queryKey:s.configKeys.upgradeEligibility(i)})]),await e?.(t,a,r)},async onError(e,a,r){void 0===t?i.toast.error(`Failed to enable database extension: ${e.message}`):t(e,a,r)},...o})}])},336908,e=>{"use strict";var t=e.i(478902),a=e.i(389959),r=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:i,onCancel:n,title:s="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:d="Keep editing",size:c="tiny"})=>{let u=(0,a.useRef)(!1);(0,a.useEffect)(()=>{e&&(u.current=!1)},[e]);let m=(0,a.useCallback)(()=>{u.current=!0,i()},[i]),p=(0,a.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}n()}},[n]);return(0,t.jsx)(r.AlertDialog,{open:e,onOpenChange:p,children:(0,t.jsxs)(r.AlertDialogContent,{size:c,children:[(0,t.jsxs)(r.AlertDialogHeader,{children:[(0,t.jsx)(r.AlertDialogTitle,{children:s}),null!=o&&(0,t.jsx)(r.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(r.AlertDialogFooter,{children:[(0,t.jsx)(r.AlertDialogCancel,{children:d}),(0,t.jsx)(r.AlertDialogAction,{variant:"danger",onClick:m,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),a=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:r})=>{let[i,n]=(0,t.useState)(!1),s=(0,a.default)(e),o=(0,a.default)(r),l=(0,t.useCallback)(()=>{s.current()?n(!0):o.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{n(!1),o.current()},[]),u=(0,t.useCallback)(()=>{n(!1)},[]),m=(0,t.useMemo)(()=>({visible:i,onClose:c,onCancel:u}),[i,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:m}),[l,d,m])}])},742578,e=>{"use strict";e.s(["vaultSecretsKeys",0,{list:e=>["projects",e,"secrets"],getDecryptedValue:(e,t)=>["projects",e,"secrets",t].filter(Boolean)}])},667954,e=>{"use strict";e.i(850036);var t=e.i(479084),a=e.i(721490),r=e.i(242882),i=e.i(742578),n=e.i(714403);let s=async({projectRef:e,connectionString:r,id:s},o)=>{if(!s)throw Error("ID is required");let l=new a.Query().from("decrypted_secrets","vault").select(t.safeSql`decrypted_secret`).match({id:s}).toSql(),{result:d}=await (0,n.executeSql)({projectRef:e,connectionString:r,sql:l,queryKey:i.vaultSecretsKeys.getDecryptedValue(e,s)},o);return d},o=async({projectRef:e,connectionString:r,ids:i},s)=>{let o=new a.Query().from("decrypted_secrets","vault").select(t.safeSql`id,decrypted_secret`).filter("id","in",i).toSql(),{result:l}=await (0,n.executeSql)({projectRef:e,connectionString:r,sql:o},s);return l.reduce((e,t)=>({...e,[t.id]:t.decrypted_secret}),{})};e.s(["getDecryptedValue",0,s,"getDecryptedValues",0,o,"useVaultSecretDecryptedValueQuery",0,({projectRef:e,connectionString:t,id:a},{enabled:n=!0,...o}={})=>(0,r.useQuery)({queryKey:i.vaultSecretsKeys.getDecryptedValue(e,a),queryFn:({signal:r})=>s({projectRef:e,connectionString:t,id:a},r),select:e=>e[0]?.decrypted_secret??"",enabled:n&&void 0!==e&&void 0!==a,...o})])},143692,e=>{"use strict";let t=(0,e.i(388019).default)("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);e.s(["default",0,t])},971687,e=>{"use strict";var t=e.i(143692);e.s(["Calendar",()=>t.default])},615573,(e,t,a)=>{t.exports=function(e,t){var a=-1,r=e.length;for(t||(t=Array(r));++a<r;)t[a]=e[a];return t}},507648,(e,t,a)=>{var r=e.r(203941),i=e.r(297926),n=e.r(615573),s=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),a=arguments[0],o=e;o--;)t[o-1]=arguments[o];return r(s(a)?n(a):[a],i(t,1))}},707409,e=>{"use strict";var t=e.i(507648),a=e.i(827047);let r=["int2","int4","int8","float4","float8","numeric","double precision"],i=["json","jsonb"],n=["text","varchar"],s=["timestamp","timestamptz"],o=["date"],l=["time","timetz"],d=(0,t.default)(s,o,l),c=["uuid","bool","vector","bytea"],u=(0,a.default)((0,t.default)(r,i,n,d,c));e.s(["DATETIME_TYPES",0,d,"DATE_TYPES",0,o,"JSON_TYPES",0,i,"NUMERICAL_TYPES",0,r,"OTHER_DATA_TYPES",0,c,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,n,"TIMESTAMP_TYPES",0,s,"TIME_TYPES",0,l])},647307,e=>{"use strict";var t=e.i(850036),a=e.i(38429),r=e.i(356003),i=e.i(355901),n=e.i(801834),s=e.i(714403);async function o({name:e,projectRef:a,connectionString:r}){let i=t.default.schemas.create({name:e,owner:"postgres"}).sql,{result:n}=await (0,s.executeSql)({projectRef:a,connectionString:r,sql:i,queryKey:["schema","create"]});return n}e.s(["useSchemaCreateMutation",0,({onSuccess:e,onError:t,...s}={})=>{let l=(0,r.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>o(e),async onSuccess(t,a,r){let{projectRef:i}=a;await (0,n.invalidateSchemasQuery)(l,i),await e?.(t,a,r)},async onError(e,a,r){void 0===t?i.toast.error(`Failed to create schema: ${e.message}`):t(e,a,r)},...s})}])},433857,e=>{"use strict";let t=(0,e.i(388019).default)("ListPlus",[["path",{d:"M11 12H3",key:"51ecnj"}],["path",{d:"M16 6H3",key:"1wxfjs"}],["path",{d:"M16 18H3",key:"12xzn7"}],["path",{d:"M18 9v6",key:"1twb98"}],["path",{d:"M21 12h-6",key:"bt1uis"}]]);e.s(["ListPlus",0,t],433857)},272299,257320,e=>{"use strict";var t=e.i(388019);let a=(0,t.default)("ToggleRight",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"6",ry:"6",key:"f2vt7d"}],["circle",{cx:"16",cy:"12",r:"2",key:"4ma0v8"}]]);e.s(["ToggleRight",0,a],272299);let r=(0,t.default)("Type",[["polyline",{points:"4 7 4 4 20 4 20 7",key:"1nosan"}],["line",{x1:"9",x2:"15",y1:"20",y2:"20",key:"swin9y"}],["line",{x1:"12",x2:"12",y1:"4",y2:"20",key:"1tx1rr"}]]);e.s(["Type",0,r],257320)},973512,e=>{"use strict";var t=e.i(478902),a=e.i(802715),r=e.i(389959),i=e.i(837710),n=e.i(788070),s=e.i(368136),o=e.i(194125);e.s(["ActionBar",0,({loading:e=!1,disableApply:l=!1,hideApply:d=!1,children:c,applyButtonLabel:u="Apply",backButtonLabel:m="Back",applyFunction:p,closePanel:g=a.default,formId:x,visible:h=!0})=>{let[f,v]=(0,r.useState)(!1),b=(0,r.useCallback)(async()=>{v(!0),await new Promise(e=>p?.(e)),v(!1)},[p]),y=(0,r.useCallback)(()=>{if(!f&&!e&&!l&&!d)if(x){let e=document.getElementById(x);e&&e.requestSubmit()}else p&&b()},[f,e,l,d,x,p,b]);return(0,o.useShortcut)(s.SHORTCUT_IDS.ACTION_BAR_SAVE,y,{enabled:h}),(0,t.jsxs)("div",{className:"flex w-full items-center gap-3 border-t border-default px-3 py-4",children:[c,(0,t.jsxs)("div",{className:"flex items-center gap-3 ml-auto",children:[(0,t.jsx)(i.Button,{type:"default",htmlType:"button",onClick:g,disabled:f||e,children:m}),void 0!==p?(0,t.jsx)(i.Button,{onClick:b,disabled:l||f||e,loading:f||e,iconRight:f||e?void 0:(0,t.jsx)(n.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u}):d?(0,t.jsx)("div",{}):(0,t.jsx)(i.Button,{disabled:e||l,loading:e,"data-testid":"action-bar-save-row",htmlType:"submit",form:x,iconRight:e?void 0:(0,t.jsx)(n.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u})]})]})}])},843142,e=>{"use strict";var t=e.i(130843);e.s(["SelectSeparator_Shadcn_",()=>t.SelectSeparator])},944334,e=>{"use strict";e.s(["EXTENSION_DISABLE_WARNINGS",0,{pg_cron:"Disabling this extension will delete all scheduled jobs. This cannot be undone.",pg_partman:"Disabling this extension will stop automatic partition management for any partitioned queues. New partitions will no longer be created and retention policies will no longer be enforced."},"HIDDEN_EXTENSIONS",0,["adminpack","amcheck","file_fdw","lo","old_snapshot","pageinspect","pg_buffercache","pg_freespacemap","pg_surgery","pg_visibility","supabase_vault","supautils","intagg","xml2","pg_tle","pg_stat_monitor"],"SEARCH_TERMS",0,{vector:["pgvector","pg_vector"],pg_partman:["partman","partition","partitioned"]},"extensionsWithRecommendedSchemas",0,{wrappers:"extensions"}])},121832,e=>{"use strict";var t=e.i(478902),a=e.i(283607),r=e.i(655744),i=e.i(355901),n=e.i(587433),s=e.i(837710),o=e.i(253214),l=e.i(20482),d=e.i(378277),c=e.i(449123),u=e.i(451031),m=e.i(831927),p=e.i(843142),g=e.i(156722),x=e.i(719754),h=e.i(710483),f=e.i(538482),v=e.i(108151),b=e.i(531837),y=e.i(249909),w=e.i(944334),j=e.i(513826),_=e.i(610144),S=e.i(801834),N=e.i(635494),C=e.i(392491),k=e.i(10429);let A=["vector","postgis"],D=b.object({name:b.string(),schema:b.string()}).superRefine((e,t)=>{"custom"===e.schema&&0===e.name.length&&t.addIssue({code:y.ZodIssueCode.custom,path:["name"],message:"Please provide a name for the schema"})});e.s(["EnableExtensionModal",0,({visible:e,extension:b,onCancel:y})=>{let P=(0,N.useIsOrioleDb)(),{data:T}=(0,N.useSelectedProjectQuery)(),{data:q}=(0,C.useProtectedSchemas)({excludeSchemas:["extensions"]}),E=w.extensionsWithRecommendedSchemas[b.name],{data:R=[],isPending:z}=(0,S.useSchemasQuery)({projectRef:T?.ref,connectionString:T?.connectionString},{enabled:e}),I=R.filter(e=>e.name===E||!q.some(t=>t.name===e.name)),F="pg_cron"===b.name?"pg_catalog":b.default_version_schema,{mutate:M,isPending:O}=(0,_.useDatabaseExtensionEnableMutation)({onSuccess:()=>{i.toast.success(`Extension "${b.name}" is now enabled`),y()},onError:e=>{i.toast.error(`Failed to enable ${b.name}: ${e.message}`)}}),B={name:b.name,schema:E??"extensions"},K=(0,r.useForm)({mode:"onBlur",reValidateMode:"onBlur",resolver:(0,a.zodResolver)(D),defaultValues:B}),{schema:$}=K.watch(),Q=async e=>{if(void 0===T)return console.error("Project is required");let t=null!=F?F:"custom"===e.schema?e.name:e.schema;M({projectRef:T.ref,connectionString:T?.connectionString,schema:t,name:b.name,version:b.default_version,cascade:!0,createSchema:!t.startsWith("pg_")})};return(0,t.jsx)(o.Dialog,{open:e,onOpenChange:e=>{e||y()},children:(0,t.jsxs)(o.DialogContent,{size:"small","aria-describedby":void 0,children:[(0,t.jsx)(o.DialogHeader,{children:(0,t.jsxs)(o.DialogTitle,{children:["Enable ",b.name]})}),(0,t.jsx)(o.DialogSectionSeparator,{}),P&&A.includes(b.name)&&(0,t.jsxs)(h.Admonition,{type:"default",title:"Extension is limited by OrioleDB",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsxs)("span",{className:"block",children:[b.name," cannot be accelerated by indexes on tables that are using the OrioleDB access method"]}),(0,t.jsx)(j.DocsButton,{abbrev:!1,className:"mt-2",href:`${k.DOCS_URL}`})]}),"pg_cron"===b.name&&T?.cloud_provider==="FLY"&&(0,t.jsxs)(h.Admonition,{type:"warning",title:"The pg_cron extension is not fully supported for Fly projects",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsx)("p",{children:"You can still enable the extension, but pg_cron jobs may not run due to the behavior of Fly projects."}),(0,t.jsx)(j.DocsButton,{className:"mt-2",href:`${k.DOCS_URL}/guides/platform/fly-postgres#limitations`})]}),(0,t.jsx)(o.DialogSection,{children:(0,t.jsx)(l.Form,{...K,children:(0,t.jsx)("form",{id:"enable-extensions-form",onSubmit:K.handleSubmit(Q),children:z?(0,t.jsxs)("div",{className:"space-y-2",children:[(0,t.jsx)(v.ShimmeringLoader,{}),(0,t.jsx)("div",{className:"w-3/4",children:(0,t.jsx)(v.ShimmeringLoader,{})})]}):F?(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(f.FormItemLayout,{isReactForm:!1,label:"Select a schema to enable the extension for",children:(0,t.jsx)(d.Input_Shadcn_,{disabled:!0,value:F})}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Extension must be installed in the "',F,'" schema.']})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(l.FormField,{name:"schema",control:K.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"schema",label:"Select a schema to enable the extension for",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsxs)(c.Select_Shadcn_,{value:e.value,onValueChange:e.onChange,disabled:!!F,children:[(0,t.jsx)(g.SelectTrigger_Shadcn_,{children:(0,t.jsx)(x.SelectValue_Shadcn_,{placeholder:"Select a schema"})}),(0,t.jsxs)(u.SelectContent_Shadcn_,{children:[(0,t.jsxs)(m.SelectItem_Shadcn_,{value:"custom",children:["Create a new schema"," ",(0,t.jsx)("code",{className:"text-code-inline",children:b.name})]}),(0,t.jsx)(p.SelectSeparator_Shadcn_,{}),I.map(e=>(0,t.jsxs)(m.SelectItem_Shadcn_,{value:e.name,children:[e.name,e.name===E?(0,t.jsx)(n.Badge,{className:"ml-2",variant:"success",children:"Recommended"}):F||"extensions"!==e.name?null:(0,t.jsx)(n.Badge,{className:"ml-2",children:"Default"})]},e.id))]})]})})})},"schema"),!!E&&(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Use the "',E,'" schema for full compatibility with related features.']}),"custom"===$&&(0,t.jsx)(l.FormField,{name:"name",control:K.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"name",label:"Schema name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Input_Shadcn_,{...e})})})},"name")]})})})}),(0,t.jsxs)(o.DialogFooter,{children:[(0,t.jsx)(s.Button,{type:"default",disabled:O,onClick:()=>y(),children:"Cancel"}),(0,t.jsx)(s.Button,{htmlType:"submit",form:"enable-extensions-form",loading:O,disabled:z||O,children:"Enable extension"})]})]})})}])},29892,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),r=e.i(843778),i=e.i(79745),n=e.i(389959),s=e.i(253214);let o=({files:e})=>{let[a,i]=(0,n.useState)(e[0]),[o,l]=(0,n.useState)(!1);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("button",{onClick:()=>l(!0),children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border object-cover aspect-video"})}),e.length>1&&(0,t.jsx)("div",{className:"grid grid-cols-10 gap-x-2",children:e.map(e=>(0,t.jsx)("button",{onClick:()=>i(e),children:(0,t.jsx)("img",{alt:e,src:e,className:(0,r.cn)("col-span-1 bg-surface-100 rounded-md object-cover aspect-square border transition",a===e?"border-button-hover":"border-secondary")})},e))})]}),(0,t.jsx)(s.Dialog,{open:o,onOpenChange:l,children:(0,t.jsx)(s.DialogContent,{size:"xxlarge",children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border"})})})]})};var l=e.i(592383);let d=({content:a,integrationId:r})=>{let[i,s]=(0,n.useState)(""),o=a||i;return(0,n.useEffect)(()=>{r&&!o&&e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${r}/overview.md`).then(e=>s(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[r,o]),(0,t.jsx)(l.Markdown,{className:"flex flex-col gap-y-4 text-foreground-light",children:o})};var c=e.i(937942);e.s(["IntegrationOverviewTabV2",0,({children:e})=>{let{id:n}=(0,a.useParams)(),{data:s}=(0,i.useAvailableIntegrations)(),l=s.find(e=>e.id===n);if(!l)return(0,t.jsx)("div",{children:"Unsupported integration type"});let{type:u,content:m,docsUrl:p,siteUrl:g,files:x=[]}=l,h=p?.includes("supabase.com/docs")?"Supabase Docs":(e=>{if(!e)return!1;try{let t=new URL(e).hostname.toLowerCase();return"github.com"===t||t.endsWith(".github.com")}catch(e){return!1}})(p)?"GitHub Docs":"Documentation",f=(e=>{if(e)try{return new URL(e).origin}catch(e){return}})(g);return(0,t.jsxs)("div",{className:"grid grid-cols-3 gap-x-8 px-10 py-8",children:[(0,t.jsxs)("div",{className:"col-span-2 flex flex-col gap-y-8",children:[x.length>0&&(0,t.jsx)(o,{files:x}),(0,t.jsx)(d,{integrationId:n,content:m}),e]}),(0,t.jsx)("div",{className:"text-sm col-span-1 flex flex-col gap-y-8",children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("p",{children:"Details"}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Type"}),(0,t.jsx)("p",{className:"capitalize",children:"oauth"===u?"OAuth":u.replaceAll("_"," ")})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Built by"}),(0,t.jsx)("p",{className:(0,r.cn)(!l.author.name&&"text-foreground-lighter"),children:l.author.name||"Unknown Author"})]}),p&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Docs"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:p,className:c.InlineLinkClassName,children:h})]}),g&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Website"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:g,className:c.InlineLinkClassName,children:f})]})]})})]})}],29892)},135642,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),r=e.i(587433),i=e.i(627069),n=e.i(843778),s=e.i(479095),o=e.i(933275),l=e.i(636900),d=e.i(345594),c=e.i(389959);let u=(0,c.forwardRef)(({integration:e,status:a,className:r,...i},s)=>{let{docsUrl:o}=e,{name:c,websiteUrl:u}=e?.author??{};return c||o||u?(0,t.jsxs)("div",{ref:s,className:(0,n.cn)("flex flex-wrap items-center gap-8 md:gap-10 px-4 md:px-10",r),...i,children:[a&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"STATUS"}),(0,t.jsx)("div",{children:a})]}),c&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"BUILT BY"}),(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c})]}),o&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"DOCS"}),(0,t.jsxs)(d.default,{href:o,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm flex items-center gap-2",children:[(0,t.jsx)(l.Book,{size:16}),o.includes("supabase.com/docs")?"Supabase Docs":o.includes("github.com")?"GitHub Docs":"Documentation"]})]}),u&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"WEBSITE"}),(0,t.jsx)(d.default,{href:u,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm",children:u.replace("https://","")})]})]}):null});u.displayName="BuiltBySection";var m=e.i(858018),p=e.i(592383);let g=({integrationId:a,initiallyExpanded:r})=>{let[i,s]=(0,c.useState)(""),[o,l]=(0,c.useState)(r??!1);(0,c.useEffect)(()=>{e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${a}/overview.md`).then(e=>s(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[a]);let d=o?i:i.slice(0,500),u=i.length>500||(i.match(/\n/g)||[]).length>1;return 0===d.length?null:(0,t.jsx)("div",{className:"px-10",children:(0,t.jsxs)("div",{className:"relative",children:[(0,t.jsx)(m.motion.div,{initial:!1,animate:{height:o?"auto":80},className:"overflow-hidden",transition:{duration:.4},children:(0,t.jsx)(p.Markdown,{content:d,className:"max-w-3xl!"})}),!o&&(0,t.jsx)("div",{className:(0,n.cn)("bottom-0 left-0 right-0 h-24",u&&"bg-linear-to-t from-background-200 to-transparent",o?"relative":"absolute")}),u&&(0,t.jsx)("div",{className:(0,n.cn)("bottom-0",o?"relative mt-3":"absolute"),children:(0,t.jsx)("button",{className:"text-foreground-light hover:text-foreground underline text-sm",onClick:()=>l(!o),children:o?"Show less":"Read more"})})]})})};var x=e.i(837710),h=e.i(121832);let f=({extension:e})=>{let[a,r]=(0,c.useState)(!1);return e?.installed_version?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(x.Button,{type:"primary",className:"w-min",onClick:()=>r(!0),children:["Enable ",e.name]}),(0,t.jsx)(h.EnableExtensionModal,{visible:a,extension:e,onCancel:()=>r(!1)})]})};var v=e.i(450972),b=e.i(635494);e.s(["IntegrationOverviewTab",0,({actions:e,alert:l,status:d,children:c,hideRequiredExtensionsSection:m=!1})=>{let{id:p}=(0,a.useParams)(),{data:x}=(0,b.useSelectedProjectQuery)(),h=o.INTEGRATIONS.find(e=>e.id===p),{data:y}=(0,v.useDatabaseExtensionsQuery)({projectRef:x?.ref,connectionString:x?.connectionString});if(!h)return(0,t.jsx)("div",{children:"Unsupported integration type"});let w=(h.requiredExtensions??[]).length>0,j=(y??[]).filter(e=>(h.requiredExtensions??[]).includes(e.name)),_=j.some(e=>!e.installed_version),S=j.length!==h.requiredExtensions.length;return(0,t.jsxs)("div",{className:"flex flex-col gap-8 py-10",children:[(0,t.jsx)(u,{integration:h,status:d}),!!l&&(0,t.jsx)("div",{className:"px-10 max-w-4xl",children:l}),(0,t.jsx)(g,{integrationId:h.id},h.id),(0,t.jsx)(s.Separator,{}),w&&!m&&(0,t.jsxs)("div",{className:"px-4 md:px-10 max-w-4xl flex flex-col gap-y-4",children:[(0,t.jsx)("h4",{children:"Required extensions"}),(0,t.jsx)(i.Card,{children:(0,t.jsxs)(i.CardContent,{className:"p-0",children:[(0,t.jsx)("ul",{className:"text-foreground-light text-sm",children:(h.requiredExtensions??[]).map((e,a)=>{let i=(y??[]).find(t=>t.name===e),s=!!i?.installed_version,o=a===(h.requiredExtensions?.length??0)-1;return(0,t.jsxs)("li",{className:(0,n.cn)("flex items-center justify-between gap-3 py-2 px-3",o?"":"border-b"),children:[(0,t.jsx)("code",{className:"text-xs",children:e}),(0,t.jsx)("div",{className:"shrink-0",children:i?s?(0,t.jsx)(r.Badge,{children:"Installed"}):(0,t.jsx)(f,{extension:i}):(0,t.jsx)("span",{className:"text-foreground-muted",children:"Unavailable"})})]},e)})}),S&&(0,t.jsx)("div",{className:"py-3 px-4 border-t",children:h.missingExtensionsAlert})]})})]}),!!e&&(0,t.jsx)("div",{"aria-disabled":_&&!m,className:(0,n.cn)("px-10 max-w-4xl",_&&!m&&"opacity-25 [&_button]:pointer-events-none"),children:e}),c]})}],135642)},534499,e=>{"use strict";let t={list:e=>["projects",e,"foreignTables"],listBySchema:(e,a)=>[...t.list(e),a]};e.s(["foreignTableKeys",0,t])},760377,e=>{"use strict";e.i(850036);var t=e.i(33942),a=e.i(332357),r=e.i(38429),i=e.i(356003),n=e.i(355901),s=e.i(584258),o=e.i(497761),l=e.i(534499),d=e.i(714403),c=e.i(742578);async function u({projectRef:e,connectionString:r,...i}){let n=(0,a.wrapWithTransaction)((0,t.getCreateFDWSql)(i)),{result:s}=await (0,d.executeSql)({projectRef:e,connectionString:r,sql:n});return s}e.s(["useFDWCreateMutation",0,({onSuccess:e,onError:t,...a}={})=>{let d=(0,i.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>u(e),async onSuccess(t,a,r){let{projectRef:i}=a;await Promise.all([d.invalidateQueries({queryKey:s.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:o.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to create ${a.wrapperMeta.label} foreign data wrapper: ${e.message}`):t(e,a,r)},...a})}])},900341,874406,e=>{"use strict";e.i(850036);var t=e.i(33942),a=e.i(332357),r=e.i(38429),i=e.i(356003),n=e.i(355901),s=e.i(584258),o=e.i(497761),l=e.i(534499),d=e.i(714403),c=e.i(742578);async function u({projectRef:e,connectionString:r,wrapper:i,wrapperMeta:n}){let s=(0,a.wrapWithTransaction)((0,t.getDeleteFDWSql)({wrapper:i,wrapperMeta:n})),{result:o}=await (0,d.executeSql)({projectRef:e,connectionString:r,sql:s});return o}async function m({projectRef:e,connectionString:r,wrapper:i,wrapperMeta:n,formState:s,tables:o}){let l=(0,a.wrapWithTransaction)((0,t.getUpdateFDWSql)({wrapper:i,wrapperMeta:n,formState:s,tables:o})),{result:c}=await (0,d.executeSql)({projectRef:e,connectionString:r,sql:l});return c}e.s(["useFDWDeleteMutation",0,({onSuccess:e,onError:t,...a}={})=>{let d=(0,i.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>u(e),async onSuccess(t,a,r){let{projectRef:i}=a;await Promise.all([d.invalidateQueries({queryKey:s.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:o.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to disable ${a.wrapper.name} foreign data wrapper: ${e.message}`):t(e,a,r)},...a})}],900341),e.s(["useFDWUpdateMutation",0,({onSuccess:e,onError:t,...a}={})=>{let d=(0,i.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>m(e),async onSuccess(t,a,r){let{projectRef:i,skipInvalidation:n=!1}=a;n||await Promise.all([d.invalidateQueries({queryKey:s.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:o.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,a,r)},async onError(e,a,r){void 0===t?n.toast.error(`Failed to update ${a.wrapper.name} foreign data wrapper: ${e.message}`):t(e,a,r)},...a})}],874406)},966494,e=>{"use strict";var t=e.i(478902),a=e.i(26898);e.i(128328);var r=e.i(657588),i=e.i(158639),n=e.i(345594),s=e.i(17313),o=e.i(389959),l=e.i(837710),d=e.i(725137),c=e.i(710483),u=e.i(135642),m=e.i(29892),p=e.i(79745),g=e.i(283607),x=e.i(655744),h=e.i(355901),f=e.i(627069),v=e.i(20482),b=e.i(378277),y=e.i(418348),w=e.i(538482),j=e.i(228027),_=e.i(531837),S=e.i(703954),N=e.i(647307),C=e.i(801834),k=e.i(760377),A=e.i(162082),D=e.i(265735),P=e.i(635494);let T="create-wrapper-form",q=_.object({target:_.literal("S3Tables"),source_schema:_.string().min(1,"Please provide a namespace name"),wrapper_name:_.string().min(1,"Please provide a name for your wrapper"),target_schema:_.string().min(1,"Please provide an unique target schema"),vault_aws_access_key_id:_.string().min(1,"Required"),vault_aws_secret_access_key:_.string().min(1,"Required"),region_name:_.string().min(1,"Required"),vault_aws_s3table_bucket_arn:_.string().min(1,"Required")}),E=_.object({target:_.literal("R2Catalog"),source_schema:_.string().min(1,"Please provide a namespace name"),wrapper_name:_.string().min(1,"Please provide a name for your wrapper"),target_schema:_.string().min(1,"Please provide an unique target schema"),vault_aws_access_key_id:_.string().min(1,"Required"),vault_aws_secret_access_key:_.string().min(1,"Required"),vault_token:_.string().min(1,"Required"),warehouse:_.string().min(1,"Required"),s3:_.object({endpoint:_.string().min(1,"Required")}),catalog_uri:_.string().min(1,"Required")}),R=_.object({target:_.literal("IcebergRestCatalog"),source_schema:_.string().min(1,"Please provide a namespace name"),wrapper_name:_.string().min(1,"Please provide a name for your wrapper"),target_schema:_.string().min(1,"Please provide an unique target schema"),vault_aws_access_key_id:_.string().optional(),vault_aws_secret_access_key:_.string().optional(),region_name:_.string().optional(),vault_aws_s3table_bucket_arn:_.string().optional(),vault_token:_.string().optional(),warehouse:_.string().optional(),s3:_.object({endpoint:_.string().min(1,"Required")}),catalog_uri:_.string().optional()}),z=_.discriminatedUnion("target",[q,E,R]),I={S3Tables:[{name:"vault_aws_access_key_id",required:!0},{name:"vault_aws_secret_access_key",required:!0},{name:"region_name",required:!0},{name:"vault_aws_s3table_bucket_arn",required:!0}],R2Catalog:[{name:"vault_aws_access_key_id",required:!0},{name:"vault_aws_secret_access_key",required:!0},{name:"vault_token",required:!0},{name:"warehouse",required:!0},{name:"s3.endpoint",required:!0},{name:"catalog_uri",required:!0}],IcebergRestCatalog:[{name:"vault_aws_access_key_id",required:!1},{name:"vault_aws_secret_access_key",required:!1},{name:"region_name",required:!1},{name:"vault_aws_s3table_bucket_arn",required:!1},{name:"vault_token",required:!1},{name:"warehouse",required:!1},{name:"s3.endpoint",required:!1},{name:"catalog_uri",required:!1}]},F={wrapper_name:"",source_schema:"",target_schema:"",target:"S3Tables",vault_aws_access_key_id:"",vault_aws_s3table_bucket_arn:"",vault_aws_secret_access_key:"",region_name:""},M=({wrapperMeta:e,onDirty:a,onClose:r,onCloseWithConfirmation:i})=>{let{data:n}=(0,P.useSelectedProjectQuery)(),{data:s}=(0,D.useSelectedOrganizationQuery)(),{mutate:c}=(0,A.useSendEventMutation)(),{mutateAsync:u,isPending:m}=(0,k.useFDWCreateMutation)({onSuccess:()=>{h.toast.success(`Successfully created ${e?.label} foreign data wrapper`),r()}}),{data:p}=(0,C.useSchemasQuery)({projectRef:n?.ref,connectionString:n?.connectionString}),{mutateAsync:_}=(0,N.useSchemaCreateMutation)(),q=(0,x.useForm)({resolver:(0,g.zodResolver)(z),defaultValues:F}),{resetField:E,formState:R,setError:M,watch:O}=q,{isDirty:B,isSubmitting:K}=R;(0,o.useEffect)(()=>{a(B)},[a,B]);let $=(0,o.useRef)(F.target);(0,o.useEffect)(()=>{let t=O(t=>{!t.target||t.target===$.current||($.current=t.target,I[t.target]&&e.server.options.forEach(e=>{E(e.name,{defaultValue:e.defaultValue??""})}))});return()=>t.unsubscribe()},[E,O,e]);let Q=async t=>{if(p?.find(e=>e.name===t.target_schema))return void M("target_schema",{type:"validate",message:"This schema already exists. Please specify a unique schema name."});let a={};if("R2Catalog"===t.target||"IcebergRestCatalog"===t.target){let{s3:e,...r}=t;(a=r)["s3.endpoint"]=e.endpoint}else a=t;try{await _({projectRef:n?.ref,connectionString:n?.connectionString,name:t.target_schema}),await u({projectRef:n?.ref,connectionString:n?.connectionString,wrapperMeta:e,formState:{...a,server_name:`${t.wrapper_name}_server`,supabase_target_schema:t.target_schema},mode:"schema",tables:[],sourceSchema:t.source_schema,targetSchema:t.target_schema}),c({action:"foreign_data_wrapper_created",properties:{wrapperType:e.label},groups:{project:n?.ref??"Unknown",organization:s?.slug??"Unknown"}})}catch(e){console.error(e)}},W=m||K,L=(0,x.useWatch)({name:"wrapper_name",control:q.control}),V=(0,x.useWatch)({name:"target",control:q.control}),U=e.server.options.filter(e=>I[V].find(t=>t.name===e.name)).map(e=>({...e,required:!!I[V].find(t=>t.name===e.name)?.required}));return(0,t.jsx)(t.Fragment,{children:(0,t.jsx)("div",{className:"h-full",tabIndex:-1,children:(0,t.jsx)(v.Form,{...q,children:(0,t.jsxs)("form",{id:T,onSubmit:q.handleSubmit(Q),className:"flex flex-col h-full",children:[(0,t.jsx)(d.SheetHeader,{children:(0,t.jsxs)(d.SheetTitle,{children:["Create a ",e.label," wrapper"]})}),(0,t.jsxs)(d.SheetSection,{className:"grow overflow-y-auto",children:[(0,t.jsxs)(j.PageSection,{children:[(0,t.jsx)(j.PageSectionMeta,{children:(0,t.jsx)(j.PageSectionSummary,{children:(0,t.jsx)(j.PageSectionTitle,{children:"Wrapper Configuration"})})}),(0,t.jsx)(j.PageSectionContent,{children:(0,t.jsx)(f.Card,{children:(0,t.jsx)(f.CardContent,{children:(0,t.jsx)(v.FormField,{control:q.control,name:"wrapper_name",render:({field:e})=>(0,t.jsx)(w.FormItemLayout,{layout:"horizontal",label:"Wrapper Name",description:L.length>0?(0,t.jsxs)(t.Fragment,{children:["Your wrapper's server name will be"," ",(0,t.jsxs)("code",{className:"text-code-inline",children:[L,"_server"]})]}):"",children:(0,t.jsx)(v.FormControl,{children:(0,t.jsx)(b.Input_Shadcn_,{...e})})})})})})})]}),(0,t.jsxs)(j.PageSection,{children:[(0,t.jsx)(j.PageSectionMeta,{children:(0,t.jsx)(j.PageSectionSummary,{children:(0,t.jsx)(j.PageSectionTitle,{children:"Data target"})})}),(0,t.jsx)(j.PageSectionContent,{children:(0,t.jsx)(f.Card,{children:(0,t.jsx)(f.CardContent,{children:(0,t.jsx)(v.FormField,{control:q.control,name:"target",render:({field:e})=>(0,t.jsx)(w.FormItemLayout,{layout:"vertical",children:(0,t.jsx)("div",{children:(0,t.jsxs)(y.RadioGroupStacked,{value:e.value,onValueChange:e.onChange,children:[(0,t.jsx)(y.RadioGroupStackedItem,{value:"S3Tables",label:"AWS S3 Tables",showIndicator:!1,children:(0,t.jsx)("div",{className:"flex gap-x-5",children:(0,t.jsx)("div",{className:"flex flex-col",children:(0,t.jsx)("p",{className:"text-foreground-light text-left",children:"AWS S3 storage that's optimized for analytics workloads."})})})},"S3Tables"),(0,t.jsx)(y.RadioGroupStackedItem,{value:"R2Catalog",label:"Cloudflare R2 Catalog",showIndicator:!1,children:(0,t.jsx)("div",{className:"flex gap-x-5",children:(0,t.jsx)("div",{className:"flex flex-col",children:(0,t.jsx)("p",{className:"text-foreground-light text-left",children:"Managed Apache Iceberg built directly into your R2 bucket."})})})},"R2Catalog"),(0,t.jsx)(y.RadioGroupStackedItem,{value:"IcebergRestCatalog",label:"Iceberg REST Catalog",showIndicator:!1,children:(0,t.jsx)("div",{className:"flex gap-x-5",children:(0,t.jsx)("div",{className:"flex flex-col",children:(0,t.jsx)("p",{className:"text-foreground-light text-left",children:"Can be used with any S3-compatible storage."})})})},"IcebergRestCatalog")]})})})})})})})]}),(0,t.jsxs)(j.PageSection,{children:[(0,t.jsx)(j.PageSectionMeta,{children:(0,t.jsx)(j.PageSectionSummary,{children:(0,t.jsxs)(j.PageSectionTitle,{children:[e.label," Configuration"]})})}),(0,t.jsx)(j.PageSectionContent,{children:(0,t.jsx)(f.Card,{children:U.map(e=>e.hidden?(0,t.jsx)("input",{type:"hidden",...q.register(e.name)},`${e.name}-${e.required}-${e.hidden}`):(0,t.jsx)(f.CardContent,{children:(0,t.jsx)(S.default,{control:q.control,option:e})},`${e.name}-${e.required}-${e.hidden}`))})})]}),(0,t.jsxs)(j.PageSection,{children:[(0,t.jsx)(j.PageSectionMeta,{children:(0,t.jsxs)(j.PageSectionSummary,{children:[(0,t.jsx)(j.PageSectionTitle,{children:"Foreign Schema"}),(0,t.jsx)(j.PageSectionDescription,{children:"You can query your data from the foreign tables in the specified schema after the wrapper is created."})]})}),(0,t.jsx)(j.PageSectionContent,{children:(0,t.jsxs)(f.Card,{children:[(0,t.jsx)(f.CardContent,{children:e.sourceSchemaOption&&(0,t.jsx)(S.default,{control:q.control,option:e.sourceSchemaOption})}),(0,t.jsx)(f.CardContent,{children:(0,t.jsx)(S.default,{control:q.control,option:{name:"target_schema",label:"Specify a new schema to create all wrapper tables in",description:"A new schema will be created. For security purposes, the wrapper tables from the foreign schema cannot be created within an existing schema.",required:!0,encrypted:!1,secureEntry:!1}})})]})})]})]}),(0,t.jsxs)(d.SheetFooter,{children:[(0,t.jsx)(l.Button,{size:"tiny",type:"default",htmlType:"button",onClick:i,disabled:W,children:"Cancel"}),(0,t.jsx)(l.Button,{size:"tiny",type:"primary",form:T,htmlType:"submit",loading:W,disabled:W||!B,children:"Create wrapper"})]})]})})})})};var O=e.i(657811),B=e.i(615515),K=e.i(736540),$=e.i(167892),Q=e.i(336908),W=e.i(215312),L=e.i(450972),V=e.i(2579),U=e.i(412385);let H=()=>{let{id:e}=(0,i.useParams)(),a=B.WRAPPERS.find(t=>t.name===e),[r,n]=(0,o.useState)(!1),[l,c]=(0,s.useQueryState)("new",s.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),{confirmOnClose:u,handleOpenChange:m,modalProps:p}=(0,U.useConfirmOnClose)({checkIsDirty:()=>r,onClose:()=>{c(!1),n(!1)}}),g=a?a.customComponent?"iceberg_wrapper"===a.name?M:null:O.CreateWrapperSheet:null;return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-5",children:[(0,t.jsx)("p",{children:"Recent wrappers"}),(0,t.jsx)(K.WrapperTable,{})]}),!!g&&!!a&&(0,t.jsx)(d.Sheet,{open:!!l,onOpenChange:m,children:(0,t.jsx)(d.SheetContent,{size:"lg",tabIndex:void 0,children:(0,t.jsx)(g,{wrapperMeta:a,onDirty:n,onClose:()=>c(!1),onCloseWithConfirmation:u})})}),(0,t.jsx)(Q.DiscardChangesConfirmationDialog,{...p})]})},Y=()=>{let{id:e}=(0,i.useParams)(),{data:r}=(0,P.useSelectedProjectQuery)(),[,o]=(0,s.useQueryState)("new",s.parseAsBoolean.withDefault(!1).withOptions({history:"push",clearOnDefault:!0})),{can:d}=(0,V.useAsyncCheckPermissions)(a.PermissionAction.TENANT_SQL_ADMIN_WRITE,"wrappers"),{data:u}=(0,L.useDatabaseExtensionsQuery)({projectRef:r?.ref,connectionString:r?.connectionString}),m=B.WRAPPERS.find(t=>t.name===e),p=u?.find(e=>"wrappers"===e.name),g=!!p?.installed_version,x=(p?.installed_version??"")>=(m?.minimumExtensionVersion??""),h=p?.installed_version===p?.default_version;return m&&g&&!x?(0,t.jsxs)(c.Admonition,{type:"warning",title:"Your extension version is outdated for this wrapper",children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-2 [&>p]:mb-0!",children:[(0,t.jsxs)("p",{children:["The ",m.label," wrapper requires a minimum extension version of"," ",m.minimumExtensionVersion,". You have version"," ",p?.installed_version," installed. Please"," ",h&&"upgrade your database then ","update the extension by disabling and enabling the ",(0,t.jsx)("code",{className:"text-code-inline",children:"wrappers"})," extension to create this wrapper."]}),(0,t.jsx)("p",{className:"text-warning",children:"Warning: Before reinstalling the wrapper extension, you must first remove all existing wrappers. Afterward, you can recreate the wrappers."})]}),(0,t.jsx)(l.Button,{asChild:!0,type:"default",className:"w-min mt-3",children:(0,t.jsx)(n.default,{href:h?`/project/${r?.ref}/settings/infrastructure`:`/project/${r?.ref}/database/extensions?filter=wrappers`,children:h?"Upgrade database":"View wrappers extension"})})]}):(0,t.jsx)("div",{className:"py-3 px-5 border rounded-md",children:(0,t.jsx)(W.ButtonTooltip,{type:"default",onClick:()=>o(!0),disabled:!d,tooltip:{content:{text:d?void 0:"You need additional permissions to create a foreign data wrapper"}},children:"Add new wrapper"})})};e.s(["WrapperOverviewTab",0,()=>{let{id:e}=(0,i.useParams)(),{data:a}=(0,P.useSelectedProjectQuery)(),n=(0,r.useFlag)("marketplaceIntegrations"),{data:s=[]}=(0,p.useAvailableIntegrations)(),o=s.find(t=>t.id===e),l=B.WRAPPERS.find(t=>t.name===e),{data:d}=(0,L.useDatabaseExtensionsQuery)({projectRef:a?.ref,connectionString:a?.connectionString}),c=(d??[]).filter(e=>(o?.requiredExtensions??[]).includes(e.name)).every(e=>e.installed_version);return l?n?(0,t.jsx)(m.IntegrationOverviewTabV2,{children:c&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(Y,{}),(0,t.jsx)(H,{})]})}):(0,t.jsx)(u.IntegrationOverviewTab,{actions:(0,t.jsx)(Y,{}),children:(0,t.jsx)("div",{className:"mx-10",children:(0,t.jsx)(H,{})})}):(0,t.jsx)($.ScaffoldContainer,{children:(0,t.jsx)($.ScaffoldSection,{isFullWidth:!0,children:(0,t.jsx)("p",{className:"text-sm text-foreground-light",children:"Unsupported integration type"})})})}],966494)},865243,e=>{e.n(e.i(966494))},185246,e=>{e.v(t=>Promise.all(["static/chunks/08~qzvogqaaio.js"].map(t=>e.l(t))).then(()=>t(911142)))},434962,e=>{e.v(t=>Promise.all(["static/chunks/0mt1bd4o59er8.js"].map(t=>e.l(t))).then(()=>t(481162)))},216511,e=>{e.v(t=>Promise.all(["static/chunks/141scz7lioi__.js"].map(t=>e.l(t))).then(()=>t(575213)))},326546,e=>{e.v(t=>Promise.all(["static/chunks/12zy-nznlh7az.js"].map(t=>e.l(t))).then(()=>t(266186)))},780799,e=>{e.v(t=>Promise.all(["static/chunks/11pan2l1emfzx.js"].map(t=>e.l(t))).then(()=>t(567789)))},105568,e=>{e.v(t=>Promise.all(["static/chunks/0b80oynnurqnz.js"].map(t=>e.l(t))).then(()=>t(956849)))},43799,e=>{e.v(t=>Promise.all(["static/chunks/175v6ap~7k-_-.js"].map(t=>e.l(t))).then(()=>t(476149)))},479686,e=>{e.v(t=>Promise.all(["static/chunks/0ilvo.4ihrw.n.js"].map(t=>e.l(t))).then(()=>t(682117)))},790935,e=>{e.v(t=>Promise.all(["static/chunks/11.2jerslxqpe.js"].map(t=>e.l(t))).then(()=>t(918317)))},675240,e=>{e.v(t=>Promise.all(["static/chunks/0y7ynm3t00xgx.js"].map(t=>e.l(t))).then(()=>t(259107)))},196082,e=>{e.v(t=>Promise.all(["static/chunks/00p1trb5la_fj.js"].map(t=>e.l(t))).then(()=>t(725449)))},141281,e=>{e.v(t=>Promise.all(["static/chunks/0vmhs9_eiqaba.js"].map(t=>e.l(t))).then(()=>t(476854)))},401546,e=>{e.v(t=>Promise.all(["static/chunks/0-ffctee06z5q.js"].map(t=>e.l(t))).then(()=>t(427555)))},650542,e=>{e.v(t=>Promise.all(["static/chunks/0t.arw5d07tls.js"].map(t=>e.l(t))).then(()=>t(46434)))},297196,e=>{e.v(t=>Promise.all(["static/chunks/0akxsfqq-vl25.js"].map(t=>e.l(t))).then(()=>t(983259)))},751169,e=>{e.v(t=>Promise.all(["static/chunks/0kr22v~s62fbr.js"].map(t=>e.l(t))).then(()=>t(211963)))},652112,e=>{e.v(t=>Promise.all(["static/chunks/00f-a5~0swwup.js"].map(t=>e.l(t))).then(()=>t(106809)))},797235,e=>{e.v(t=>Promise.all(["static/chunks/0my39hx2sjys7.js"].map(t=>e.l(t))).then(()=>t(311486)))},304455,e=>{e.v(t=>Promise.all(["static/chunks/0e6i~_4t4~pz_.js"].map(t=>e.l(t))).then(()=>t(17077)))},338107,e=>{e.v(t=>Promise.all(["static/chunks/0aod~v1mpketd.js"].map(t=>e.l(t))).then(()=>t(1152)))},870265,e=>{e.v(t=>Promise.all(["static/chunks/17bpehtvrbq27.js"].map(t=>e.l(t))).then(()=>t(302280)))},441486,e=>{e.v(t=>Promise.all(["static/chunks/0pcp9er0q6-ly.js"].map(t=>e.l(t))).then(()=>t(659562)))},362060,e=>{e.v(t=>Promise.all(["static/chunks/142ssqlash_0x.js"].map(t=>e.l(t))).then(()=>t(667994)))},993747,e=>{e.v(t=>Promise.all(["static/chunks/0jrfxywrdebvc.js"].map(t=>e.l(t))).then(()=>t(102825)))},376147,e=>{e.v(t=>Promise.all(["static/chunks/0q363y5lf~b~y.js"].map(t=>e.l(t))).then(()=>t(89290)))},458511,e=>{e.v(t=>Promise.all(["static/chunks/0shu_91ffgh2t.js"].map(t=>e.l(t))).then(()=>t(786522)))},75071,e=>{e.v(t=>Promise.all(["static/chunks/05pv0ojh_evmh.js"].map(t=>e.l(t))).then(()=>t(739236)))},693988,e=>{e.v(t=>Promise.all(["static/chunks/10758s3hhc0t4.js"].map(t=>e.l(t))).then(()=>t(167237)))}]);