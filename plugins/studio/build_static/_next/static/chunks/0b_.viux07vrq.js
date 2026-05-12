(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,567558,e=>{"use strict";var t=e.i(478902),a=e.i(26898),i=e.i(389959),r=e.i(837710),s=e.i(710483),n=e.i(196621),o=e.i(967052);let l=({projectRef:e,subject:i,error:s})=>(0,t.jsx)(r.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(n.SupportLink,{queryParams:{category:a.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:i,error:s?.message},children:"Contact support"})}),d=({projectRef:e,subject:a,description:r="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:n,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:m=!0,showErrorPrefix:p=!0,children:g,additionalActions:h})=>{let x=(0,o.useTrack)(),f=(0,i.useRef)(!1),b=n?.message?.includes("503")?"503 Service Temporarily Unavailable":n?.message;return(0,i.useEffect)(()=>{!f.current&&(f.current=!0,.1>Math.random()&&x("dashboard_error_created",{source:"admonition"}))},[x]),(0,t.jsx)(s.Admonition,{type:"warning",layout:h?"vertical":u,showIcon:c,title:a,description:(0,t.jsxs)(t.Fragment,{children:[n?.message&&(0,t.jsxs)("p",{children:[p&&"Error: ",b]}),m&&(0,t.jsx)("p",{children:r}),g]}),actions:h?(0,t.jsxs)(t.Fragment,{children:[h,(0,t.jsx)(l,{projectRef:e,subject:a,error:n})]}):(0,t.jsx)(l,{projectRef:e,subject:a,error:n}),className:d})};e.s(["AlertError",0,d,"default",0,d])},378277,e=>{"use strict";var t=e.i(348481);e.s(["Input_Shadcn_",()=>t.Input])},938933,305551,e=>{"use strict";var t=e.i(389959);let a={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},i={tiny:`${a.size.text.tiny} ${a.size.padding.tiny}`,small:`${a.size.text.small} ${a.size.padding.small}`,medium:`${a.size.text.medium} ${a.size.padding.medium}`,large:`${a.size.text.large} ${a.size.padding.large}`,xlarge:`${a.size.text.xlarge} ${a.size.padding.xlarge}`},r={accordion:{variants:{default:{base:`
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
      `},block:"w-full flex items-center justify-center",size:{...i},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
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
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...i},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `,size:{...i},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,r],305551);let s=(0,t.createContext)({theme:r});e.s(["default",0,function(e){let{theme:{[e]:a}}=(0,t.useContext)(s);return a||(a=r.accordion),a=JSON.parse(a=JSON.stringify(a).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),a=e.i(816467),i=e.i(389959),r=e.i(843778),s=e.i(375761),n=e.i(231665),o=e.i(938933);let l=(0,i.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:m,iconContainerClassName:p,containerClassName:g,size:h="small",...x},f)=>{let[b,v]=(0,i.useState)("Copy"),[y,w]=(0,i.useState)(!0),j=(0,o.default)("input"),S=[];return h&&S.push(j.size[h]),(0,t.jsxs)(n.InputGroup,{className:g,children:[(0,t.jsx)(n.InputGroupInput,{ref:f,onFocus:e=>e.target.select(),...x,size:h,onCopy:m,type:c&&y?"password":x.type,disabled:x.disabled,className:(0,r.cn)(...S,x.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(n.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(n.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",className:(0,r.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(a.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=x.value,void(0,s.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),m?.()})},children:b}):null,c&&y?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},466472,e=>{"use strict";var t=e.i(478902),a=e.i(389959),i=e.i(837710),r=e.i(843778),s=e.i(253214),n=e.i(710483);let o=(0,a.forwardRef)(({title:e,description:o,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:m,cancelLabel:p="Cancel",confirmLabel:g="Submit",confirmLabelLoading:h,alert:x,children:f,variant:b="default",disabled:v,className:y,...w},j)=>{let[S,_]=(0,a.useState)(void 0!==m&&m);(0,a.useEffect)(()=>{d&&void 0===m&&_(!1)},[d]),(0,a.useEffect)(()=>{void 0!==m&&_(m)},[m]);let{title:k,children:N,...C}=x?.base??{},A=x?.title?{label:x.title}:{};return(0,t.jsx)(s.Dialog,{open:d,...w,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(s.DialogContent,{"aria-describedby":void 0,ref:j,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(s.DialogHeader,{className:(0,r.cn)("border-b"),padding:"small",children:[(0,t.jsx)(s.DialogTitle,{children:e}),o&&(0,t.jsx)(s.DialogDescription,{children:o})]}),x&&(0,t.jsx)(n.Admonition,{type:b,description:x.description,...A,className:"border-x-0 rounded-none -mt-px",...C}),f&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(s.DialogSection,{padding:"small",className:y,children:f}),(0,t.jsx)(s.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(i.Button,{size:"medium",block:!0,type:"default",disabled:S,onClick:()=>c(),children:p}),(0,t.jsx)(i.Button,{block:!0,size:"medium",type:"destructive"===b?"danger":"warning"===b?"warning":"primary",htmlType:"submit",loading:S,disabled:S||v,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===m&&_(!0)},className:"truncate",children:S&&h?h:g})]})]})})});o.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,o,"default",0,o])},592383,e=>{"use strict";var t=e.i(478902),a=e.i(755146),i=e.i(861833),r=e.i(843778),s=e.i(937942);let n=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),o=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:a})=>(0,t.jsx)(s.InlineLink,{href:e??"/",children:a});e.s(["Markdown",0,({children:e,className:s,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,r.cn)("text-sm",s),children:(0,t.jsx)(a.default,{remarkPlugins:[i.default],components:{h3:n,code:o,a:l},...u,children:e??d})})])},388034,e=>{"use strict";let t=(0,e.i(388019).default)("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);e.s(["default",0,t])},610144,e=>{"use strict";e.i(850036);var t=e.i(53336),a=e.i(38429),i=e.i(356003),r=e.i(355901),s=e.i(667286),n=e.i(78162),o=e.i(714403);async function l({projectRef:e,connectionString:a,schema:i,name:r,version:s,cascade:n=!1,createSchema:d=!1}){let c=new Headers;a&&c.set("x-connection-encrypted",a);let u=(0,t.getEnableDatabaseExtensionSQL)({schema:i,name:r,version:s,cascade:n,createSchema:d}),{result:m}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:u,queryKey:["extension","create"]});return m}e.s(["useDatabaseExtensionEnableMutation",0,({onSuccess:e,onError:t,...o}={})=>{let d=(0,i.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>l(e),async onSuccess(t,a,i){let{projectRef:r}=a;await Promise.all([d.invalidateQueries({queryKey:s.databaseExtensionsKeys.list(r)}),d.invalidateQueries({queryKey:n.configKeys.upgradeEligibility(r)})]),await e?.(t,a,i)},async onError(e,a,i){void 0===t?r.toast.error(`Failed to enable database extension: ${e.message}`):t(e,a,i)},...o})}])},495486,e=>{"use strict";let t=(0,e.i(388019).default)("Table",[["path",{d:"M12 3v18",key:"108xh3"}],["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M3 9h18",key:"1pudct"}],["path",{d:"M3 15h18",key:"5xshup"}]]);e.s(["Table",0,t],495486)},843142,e=>{"use strict";var t=e.i(130843);e.s(["SelectSeparator_Shadcn_",()=>t.SelectSeparator])},944334,e=>{"use strict";e.s(["EXTENSION_DISABLE_WARNINGS",0,{pg_cron:"Disabling this extension will delete all scheduled jobs. This cannot be undone.",pg_partman:"Disabling this extension will stop automatic partition management for any partitioned queues. New partitions will no longer be created and retention policies will no longer be enforced."},"HIDDEN_EXTENSIONS",0,["adminpack","amcheck","file_fdw","lo","old_snapshot","pageinspect","pg_buffercache","pg_freespacemap","pg_surgery","pg_visibility","supabase_vault","supautils","intagg","xml2","pg_tle","pg_stat_monitor"],"SEARCH_TERMS",0,{vector:["pgvector","pg_vector"],pg_partman:["partman","partition","partitioned"]},"extensionsWithRecommendedSchemas",0,{wrappers:"extensions"}])},121832,e=>{"use strict";var t=e.i(478902),a=e.i(283607),i=e.i(655744),r=e.i(355901),s=e.i(587433),n=e.i(837710),o=e.i(253214),l=e.i(20482),d=e.i(378277),c=e.i(449123),u=e.i(451031),m=e.i(831927),p=e.i(843142),g=e.i(156722),h=e.i(719754),x=e.i(710483),f=e.i(538482),b=e.i(108151),v=e.i(531837),y=e.i(249909),w=e.i(944334),j=e.i(513826),S=e.i(610144),_=e.i(801834),k=e.i(635494),N=e.i(392491),C=e.i(10429);let A=["vector","postgis"],I=v.object({name:v.string(),schema:v.string()}).superRefine((e,t)=>{"custom"===e.schema&&0===e.name.length&&t.addIssue({code:y.ZodIssueCode.custom,path:["name"],message:"Please provide a name for the schema"})});e.s(["EnableExtensionModal",0,({visible:e,extension:v,onCancel:y})=>{let E=(0,k.useIsOrioleDb)(),{data:z}=(0,k.useSelectedProjectQuery)(),{data:T}=(0,N.useProtectedSchemas)({excludeSchemas:["extensions"]}),U=w.extensionsWithRecommendedSchemas[v.name],{data:D=[],isPending:R}=(0,_.useSchemasQuery)({projectRef:z?.ref,connectionString:z?.connectionString},{enabled:e}),P=D.filter(e=>e.name===U||!T.some(t=>t.name===e.name)),F="pg_cron"===v.name?"pg_catalog":v.default_version_schema,{mutate:q,isPending:B}=(0,S.useDatabaseExtensionEnableMutation)({onSuccess:()=>{r.toast.success(`Extension "${v.name}" is now enabled`),y()},onError:e=>{r.toast.error(`Failed to enable ${v.name}: ${e.message}`)}}),L={name:v.name,schema:U??"extensions"},O=(0,i.useForm)({mode:"onBlur",reValidateMode:"onBlur",resolver:(0,a.zodResolver)(I),defaultValues:L}),{schema:$}=O.watch(),M=async e=>{if(void 0===z)return console.error("Project is required");let t=null!=F?F:"custom"===e.schema?e.name:e.schema;q({projectRef:z.ref,connectionString:z?.connectionString,schema:t,name:v.name,version:v.default_version,cascade:!0,createSchema:!t.startsWith("pg_")})};return(0,t.jsx)(o.Dialog,{open:e,onOpenChange:e=>{e||y()},children:(0,t.jsxs)(o.DialogContent,{size:"small","aria-describedby":void 0,children:[(0,t.jsx)(o.DialogHeader,{children:(0,t.jsxs)(o.DialogTitle,{children:["Enable ",v.name]})}),(0,t.jsx)(o.DialogSectionSeparator,{}),E&&A.includes(v.name)&&(0,t.jsxs)(x.Admonition,{type:"default",title:"Extension is limited by OrioleDB",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsxs)("span",{className:"block",children:[v.name," cannot be accelerated by indexes on tables that are using the OrioleDB access method"]}),(0,t.jsx)(j.DocsButton,{abbrev:!1,className:"mt-2",href:`${C.DOCS_URL}`})]}),"pg_cron"===v.name&&z?.cloud_provider==="FLY"&&(0,t.jsxs)(x.Admonition,{type:"warning",title:"The pg_cron extension is not fully supported for Fly projects",className:"border-x-0 border-t-0 rounded-none",children:[(0,t.jsx)("p",{children:"You can still enable the extension, but pg_cron jobs may not run due to the behavior of Fly projects."}),(0,t.jsx)(j.DocsButton,{className:"mt-2",href:`${C.DOCS_URL}/guides/platform/fly-postgres#limitations`})]}),(0,t.jsx)(o.DialogSection,{children:(0,t.jsx)(l.Form,{...O,children:(0,t.jsx)("form",{id:"enable-extensions-form",onSubmit:O.handleSubmit(M),children:R?(0,t.jsxs)("div",{className:"space-y-2",children:[(0,t.jsx)(b.ShimmeringLoader,{}),(0,t.jsx)("div",{className:"w-3/4",children:(0,t.jsx)(b.ShimmeringLoader,{})})]}):F?(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(f.FormItemLayout,{isReactForm:!1,label:"Select a schema to enable the extension for",children:(0,t.jsx)(d.Input_Shadcn_,{disabled:!0,value:F})}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Extension must be installed in the "',F,'" schema.']})]}):(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(l.FormField,{name:"schema",control:O.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"schema",label:"Select a schema to enable the extension for",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsxs)(c.Select_Shadcn_,{value:e.value,onValueChange:e.onChange,disabled:!!F,children:[(0,t.jsx)(g.SelectTrigger_Shadcn_,{children:(0,t.jsx)(h.SelectValue_Shadcn_,{placeholder:"Select a schema"})}),(0,t.jsxs)(u.SelectContent_Shadcn_,{children:[(0,t.jsxs)(m.SelectItem_Shadcn_,{value:"custom",children:["Create a new schema"," ",(0,t.jsx)("code",{className:"text-code-inline",children:v.name})]}),(0,t.jsx)(p.SelectSeparator_Shadcn_,{}),P.map(e=>(0,t.jsxs)(m.SelectItem_Shadcn_,{value:e.name,children:[e.name,e.name===U?(0,t.jsx)(s.Badge,{className:"ml-2",variant:"success",children:"Recommended"}):F||"extensions"!==e.name?null:(0,t.jsx)(s.Badge,{className:"ml-2",children:"Default"})]},e.id))]})]})})})},"schema"),!!U&&(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:['Use the "',U,'" schema for full compatibility with related features.']}),"custom"===$&&(0,t.jsx)(l.FormField,{name:"name",control:O.control,render:({field:e})=>(0,t.jsx)(f.FormItemLayout,{name:"name",label:"Schema name",children:(0,t.jsx)(l.FormControl,{children:(0,t.jsx)(d.Input_Shadcn_,{...e})})})},"name")]})})})}),(0,t.jsxs)(o.DialogFooter,{children:[(0,t.jsx)(n.Button,{type:"default",disabled:B,onClick:()=>y(),children:"Cancel"}),(0,t.jsx)(n.Button,{htmlType:"submit",form:"enable-extensions-form",loading:B,disabled:R||B,children:"Enable extension"})]})]})})}])},29892,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),i=e.i(843778),r=e.i(79745),s=e.i(389959),n=e.i(253214);let o=({files:e})=>{let[a,r]=(0,s.useState)(e[0]),[o,l]=(0,s.useState)(!1);return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("button",{onClick:()=>l(!0),children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border object-cover aspect-video"})}),e.length>1&&(0,t.jsx)("div",{className:"grid grid-cols-10 gap-x-2",children:e.map(e=>(0,t.jsx)("button",{onClick:()=>r(e),children:(0,t.jsx)("img",{alt:e,src:e,className:(0,i.cn)("col-span-1 bg-surface-100 rounded-md object-cover aspect-square border transition",a===e?"border-button-hover":"border-secondary")})},e))})]}),(0,t.jsx)(n.Dialog,{open:o,onOpenChange:l,children:(0,t.jsx)(n.DialogContent,{size:"xxlarge",children:(0,t.jsx)("img",{alt:a,src:a,className:"rounded-md border"})})})]})};var l=e.i(592383);let d=({content:a,integrationId:i})=>{let[r,n]=(0,s.useState)(""),o=a||r;return(0,s.useEffect)(()=>{i&&!o&&e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${i}/overview.md`).then(e=>n(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[i,o]),(0,t.jsx)(l.Markdown,{className:"flex flex-col gap-y-4 text-foreground-light",children:o})};var c=e.i(937942);e.s(["IntegrationOverviewTabV2",0,({children:e})=>{let{id:s}=(0,a.useParams)(),{data:n}=(0,r.useAvailableIntegrations)(),l=n.find(e=>e.id===s);if(!l)return(0,t.jsx)("div",{children:"Unsupported integration type"});let{type:u,content:m,docsUrl:p,siteUrl:g,files:h=[]}=l,x=p?.includes("supabase.com/docs")?"Supabase Docs":(e=>{if(!e)return!1;try{let t=new URL(e).hostname.toLowerCase();return"github.com"===t||t.endsWith(".github.com")}catch(e){return!1}})(p)?"GitHub Docs":"Documentation",f=(e=>{if(e)try{return new URL(e).origin}catch(e){return}})(g);return(0,t.jsxs)("div",{className:"grid grid-cols-3 gap-x-8 px-10 py-8",children:[(0,t.jsxs)("div",{className:"col-span-2 flex flex-col gap-y-8",children:[h.length>0&&(0,t.jsx)(o,{files:h}),(0,t.jsx)(d,{integrationId:s,content:m}),e]}),(0,t.jsx)("div",{className:"text-sm col-span-1 flex flex-col gap-y-8",children:(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("p",{children:"Details"}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Type"}),(0,t.jsx)("p",{className:"capitalize",children:"oauth"===u?"OAuth":u.replaceAll("_"," ")})]}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Built by"}),(0,t.jsx)("p",{className:(0,i.cn)(!l.author.name&&"text-foreground-lighter"),children:l.author.name||"Unknown Author"})]}),p&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Docs"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:p,className:c.InlineLinkClassName,children:x})]}),g&&(0,t.jsxs)("div",{className:"flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"font-mono uppercase text-foreground-light",children:"Website"}),(0,t.jsx)("a",{target:"_blank",rel:"noreferrer",href:g,className:c.InlineLinkClassName,children:f})]})]})})]})}],29892)},135642,e=>{"use strict";var t=e.i(478902);e.i(128328);var a=e.i(158639),i=e.i(587433),r=e.i(627069),s=e.i(843778),n=e.i(479095),o=e.i(933275),l=e.i(636900),d=e.i(345594),c=e.i(389959);let u=(0,c.forwardRef)(({integration:e,status:a,className:i,...r},n)=>{let{docsUrl:o}=e,{name:c,websiteUrl:u}=e?.author??{};return c||o||u?(0,t.jsxs)("div",{ref:n,className:(0,s.cn)("flex flex-wrap items-center gap-8 md:gap-10 px-4 md:px-10",i),...r,children:[a&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"STATUS"}),(0,t.jsx)("div",{children:a})]}),c&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"BUILT BY"}),(0,t.jsx)("div",{className:"text-foreground-light text-sm",children:c})]}),o&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"DOCS"}),(0,t.jsxs)(d.default,{href:o,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm flex items-center gap-2",children:[(0,t.jsx)(l.Book,{size:16}),o.includes("supabase.com/docs")?"Supabase Docs":o.includes("github.com")?"GitHub Docs":"Documentation"]})]}),u&&(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"text-foreground-lighter font-mono text-xs mb-1",children:"WEBSITE"}),(0,t.jsx)(d.default,{href:u,target:"_blank",rel:"noreferrer",className:"text-foreground-light hover:text-foreground text-sm",children:u.replace("https://","")})]})]}):null});u.displayName="BuiltBySection";var m=e.i(858018),p=e.i(592383);let g=({integrationId:a,initiallyExpanded:i})=>{let[r,n]=(0,c.useState)(""),[o,l]=(0,c.useState)(i??!1);(0,c.useEffect)(()=>{e.f({"@/static-data/integrations/airtable_wrapper/overview.md":{id:()=>185246,module:()=>e.A(185246)},"@/static-data/integrations/auth0_wrapper/overview.md":{id:()=>434962,module:()=>e.A(434962)},"@/static-data/integrations/bigquery_wrapper/overview.md":{id:()=>216511,module:()=>e.A(216511)},"@/static-data/integrations/cal_wrapper/overview.md":{id:()=>326546,module:()=>e.A(326546)},"@/static-data/integrations/calendly_wrapper/overview.md":{id:()=>780799,module:()=>e.A(780799)},"@/static-data/integrations/cfd1_wrapper/overview.md":{id:()=>105568,module:()=>e.A(105568)},"@/static-data/integrations/clickhouse_wrapper/overview.md":{id:()=>43799,module:()=>e.A(43799)},"@/static-data/integrations/cognito_wrapper/overview.md":{id:()=>479686,module:()=>e.A(479686)},"@/static-data/integrations/cron/overview.md":{id:()=>790935,module:()=>e.A(790935)},"@/static-data/integrations/data_api/overview.md":{id:()=>675240,module:()=>e.A(675240)},"@/static-data/integrations/firebase_wrapper/overview.md":{id:()=>196082,module:()=>e.A(196082)},"@/static-data/integrations/graphiql/overview.md":{id:()=>141281,module:()=>e.A(141281)},"@/static-data/integrations/hubspot_wrapper/overview.md":{id:()=>401546,module:()=>e.A(401546)},"@/static-data/integrations/iceberg_wrapper/overview.md":{id:()=>650542,module:()=>e.A(650542)},"@/static-data/integrations/logflare_wrapper/overview.md":{id:()=>297196,module:()=>e.A(297196)},"@/static-data/integrations/mssql_wrapper/overview.md":{id:()=>751169,module:()=>e.A(751169)},"@/static-data/integrations/orb_wrapper/overview.md":{id:()=>652112,module:()=>e.A(652112)},"@/static-data/integrations/paddle_wrapper/overview.md":{id:()=>797235,module:()=>e.A(797235)},"@/static-data/integrations/queues/overview.md":{id:()=>304455,module:()=>e.A(304455)},"@/static-data/integrations/redis_wrapper/overview.md":{id:()=>338107,module:()=>e.A(338107)},"@/static-data/integrations/s3_vectors_wrapper/overview.md":{id:()=>870265,module:()=>e.A(870265)},"@/static-data/integrations/s3_wrapper/overview.md":{id:()=>441486,module:()=>e.A(441486)},"@/static-data/integrations/slack_wrapper/overview.md":{id:()=>362060,module:()=>e.A(362060)},"@/static-data/integrations/snowflake_wrapper/overview.md":{id:()=>993747,module:()=>e.A(993747)},"@/static-data/integrations/stripe_sync_engine/overview.md":{id:()=>376147,module:()=>e.A(376147)},"@/static-data/integrations/stripe_wrapper/overview.md":{id:()=>458511,module:()=>e.A(458511)},"@/static-data/integrations/vault/overview.md":{id:()=>75071,module:()=>e.A(75071)},"@/static-data/integrations/webhooks/overview.md":{id:()=>693988,module:()=>e.A(693988)}}).import(`@/static-data/integrations/${a}/overview.md`).then(e=>n(String(e.default))).catch(e=>console.error("Error loading markdown:",e))},[a]);let d=o?r:r.slice(0,500),u=r.length>500||(r.match(/\n/g)||[]).length>1;return 0===d.length?null:(0,t.jsx)("div",{className:"px-10",children:(0,t.jsxs)("div",{className:"relative",children:[(0,t.jsx)(m.motion.div,{initial:!1,animate:{height:o?"auto":80},className:"overflow-hidden",transition:{duration:.4},children:(0,t.jsx)(p.Markdown,{content:d,className:"max-w-3xl!"})}),!o&&(0,t.jsx)("div",{className:(0,s.cn)("bottom-0 left-0 right-0 h-24",u&&"bg-linear-to-t from-background-200 to-transparent",o?"relative":"absolute")}),u&&(0,t.jsx)("div",{className:(0,s.cn)("bottom-0",o?"relative mt-3":"absolute"),children:(0,t.jsx)("button",{className:"text-foreground-light hover:text-foreground underline text-sm",onClick:()=>l(!o),children:o?"Show less":"Read more"})})]})})};var h=e.i(837710),x=e.i(121832);let f=({extension:e})=>{let[a,i]=(0,c.useState)(!1);return e?.installed_version?null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(h.Button,{type:"primary",className:"w-min",onClick:()=>i(!0),children:["Enable ",e.name]}),(0,t.jsx)(x.EnableExtensionModal,{visible:a,extension:e,onCancel:()=>i(!1)})]})};var b=e.i(450972),v=e.i(635494);e.s(["IntegrationOverviewTab",0,({actions:e,alert:l,status:d,children:c,hideRequiredExtensionsSection:m=!1})=>{let{id:p}=(0,a.useParams)(),{data:h}=(0,v.useSelectedProjectQuery)(),x=o.INTEGRATIONS.find(e=>e.id===p),{data:y}=(0,b.useDatabaseExtensionsQuery)({projectRef:h?.ref,connectionString:h?.connectionString});if(!x)return(0,t.jsx)("div",{children:"Unsupported integration type"});let w=(x.requiredExtensions??[]).length>0,j=(y??[]).filter(e=>(x.requiredExtensions??[]).includes(e.name)),S=j.some(e=>!e.installed_version),_=j.length!==x.requiredExtensions.length;return(0,t.jsxs)("div",{className:"flex flex-col gap-8 py-10",children:[(0,t.jsx)(u,{integration:x,status:d}),!!l&&(0,t.jsx)("div",{className:"px-10 max-w-4xl",children:l}),(0,t.jsx)(g,{integrationId:x.id},x.id),(0,t.jsx)(n.Separator,{}),w&&!m&&(0,t.jsxs)("div",{className:"px-4 md:px-10 max-w-4xl flex flex-col gap-y-4",children:[(0,t.jsx)("h4",{children:"Required extensions"}),(0,t.jsx)(r.Card,{children:(0,t.jsxs)(r.CardContent,{className:"p-0",children:[(0,t.jsx)("ul",{className:"text-foreground-light text-sm",children:(x.requiredExtensions??[]).map((e,a)=>{let r=(y??[]).find(t=>t.name===e),n=!!r?.installed_version,o=a===(x.requiredExtensions?.length??0)-1;return(0,t.jsxs)("li",{className:(0,s.cn)("flex items-center justify-between gap-3 py-2 px-3",o?"":"border-b"),children:[(0,t.jsx)("code",{className:"text-xs",children:e}),(0,t.jsx)("div",{className:"shrink-0",children:r?n?(0,t.jsx)(i.Badge,{children:"Installed"}):(0,t.jsx)(f,{extension:r}):(0,t.jsx)("span",{className:"text-foreground-muted",children:"Unavailable"})})]},e)})}),_&&(0,t.jsx)("div",{className:"py-3 px-4 border-t",children:x.missingExtensionsAlert})]})})]}),!!e&&(0,t.jsx)("div",{"aria-disabled":S&&!m,className:(0,s.cn)("px-10 max-w-4xl",S&&!m&&"opacity-25 [&_button]:pointer-events-none"),children:e}),c]})}],135642)},262914,e=>{"use strict";var t=e.i(388034);e.s(["RefreshCwIcon",()=>t.default])},14092,e=>{"use strict";var t=e.i(478902),a=e.i(283607),i=e.i(26898);e.i(128328);var r=e.i(657588),s=e.i(17203),n=e.i(345594),o=e.i(389959),l=e.i(655744),d=e.i(355901),c=e.i(837710),u=e.i(20482),m=e.i(725137),p=e.i(710483),g=e.i(746301),h=e.i(466472),x=e.i(538482),f=e.i(531837),b=e.i(135642),v=e.i(29892),y=e.i(559398),w=e.i(567558);let j=({error:e,handleUninstall:a,handleOpenInstallSheet:i,isUpgrade:r,installing:s,uninstalling:n})=>{let{schemaComment:{errorMessage:o}}=(0,y.useStripeSyncStatus)();return"uninstall"===e?(0,t.jsx)(w.default,{layout:"horizontal",subject:"Failed to uninstall Stripe Sync Engine",error:o?{message:o}:void 0,description:"There was an error during the uninstallation of the Stripe Sync Engine, please try again. If the problem persists, contact support.",additionalActions:(0,t.jsx)(c.Button,{type:"default",onClick:a,disabled:n,loading:n,children:"Retry uninstallation"})}):"install"===e?(0,t.jsx)(w.default,{subject:r?"Failed to upgrade Stripe Sync Engine":"Failed to install Stripe Sync Engine",error:o?{message:o}:void 0,description:r?"There was an error during the upgrade of the Stripe Sync Engine, please try again. If the problem persists, contact support.":"There was an error during the installation of the Stripe Sync Engine, please try reinstalling the integration. If the problem persists, contact support.",additionalActions:(0,t.jsx)(c.Button,{type:"default",onClick:i,disabled:s,loading:s,children:r?"Retry upgrade":"Retry installation"})}):null};var S=e.i(843778),_=e.i(427459),k=e.i(215312),N=e.i(2579);let C=({className:e,disabled:a,upgradeAvailable:r,installing:s,uninstalling:n,setShowUninstallModal:o,setShouldShowInstallSheet:l})=>{let{can:d}=(0,N.useAsyncCheckPermissions)(i.PermissionAction.FUNCTIONS_SECRET_WRITE,"*"),{schemaComment:{status:c}}=(0,y.useStripeSyncStatus)(),u=(0,_.hasUninstallError)(c);return(0,t.jsx)(t.Fragment,{children:(0,t.jsxs)("div",{className:(0,S.cn)("flex gap-x-2 justify-end",e),children:[r&&!u&&!n&&(0,t.jsx)(k.ButtonTooltip,{type:"primary",onClick:()=>l(!0),disabled:a,loading:s,tooltip:{content:{text:d?void 0:"You need additional permissions to upgrade the Stripe Sync Engine."}},children:"Upgrade integration"}),(0,t.jsx)(k.ButtonTooltip,{type:"default",onClick:()=>o(!0),disabled:a,loading:n,tooltip:{content:{text:d?void 0:"You need additional permissions to uninstall the Stripe Sync Engine."}},children:u?"Retry uninstallation":"Uninstall integration"})]})})},A=({className:e,installing:a,canInstall:r,isUninstallRequested:s,hideInstallCTA:n=!1,handleUninstall:o,setShouldShowInstallSheet:l})=>{let{can:d}=(0,N.useAsyncCheckPermissions)(i.PermissionAction.FUNCTIONS_SECRET_WRITE,"*"),{schemaComment:{status:u}}=(0,y.useStripeSyncStatus)(),m=(0,_.hasInstallError)(u);return(0,t.jsxs)("div",{className:(0,S.cn)("flex gap-x-2 justify-end",e),children:[!n&&(0,t.jsx)(k.ButtonTooltip,{type:"primary",onClick:()=>l(!0),disabled:!r||!d,loading:a,tooltip:{content:{text:r?d?void 0:"You need additional permissions to install the Stripe Sync Engine.":'Your database already uses a schema named "stripe"'}},children:m?"Retry installation":"Install integration"}),m&&(0,t.jsx)(c.Button,{type:"default",loading:s,onClick:o,children:"Uninstall"})]})};var I=e.i(867637),E=e.i(370410),z=e.i(262914);let T=({status:e,isInstallRequested:a,isInstallInitiated:i,isUninstallRequested:r,isUninstallInitiated:s,isUpgrade:n,timedOut:o})=>{let l=(0,_.isInstalled)(e),d=(0,_.hasInstallError)(e),c=(0,_.hasUninstallError)(e),u=(0,_.isInstalling)(e);return((0,_.isUninstalling)(e)||r||s)&&!o?(0,t.jsxs)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:[(0,t.jsx)(z.RefreshCwIcon,{size:14,className:"animate-spin text-foreground-lighter"}),"Uninstalling..."]}):c?(0,t.jsxs)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:[(0,t.jsx)(I.AlertCircle,{size:14,className:"text-destructive"}),"Uninstallation error"]}):(u||a||i)&&!o?(0,t.jsxs)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:[(0,t.jsx)(z.RefreshCwIcon,{size:14,className:"animate-spin text-foreground-lighter"}),n?"Upgrading...":"Installing..."]}):d?(0,t.jsxs)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:[(0,t.jsx)(I.AlertCircle,{size:14,className:"text-destructive"}),n?"Upgrade error":"Installation error"]}):l?(0,t.jsxs)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:[(0,t.jsx)(E.Check,{size:14,strokeWidth:1.5,className:"text-brand"})," Installed"]}):(0,t.jsx)("span",{className:"flex items-center gap-2 text-foreground-light text-sm",children:"Not installed"})};e.i(481541);var U=e.i(114970),D=e.i(796238),R=e.i(774803),P=e.i(495486),F=e.i(627069);let q="flex items-center gap-x-3 py-2 px-3 border-b",B=({installationStatus:e,className:a,isUpgrade:i})=>{let r=(0,_.isInstalled)(e),s=(0,_.hasInstallError)(e),n=(0,_.hasUninstallError)(e),o=(0,_.isInstalling)(e),l=(0,_.isUninstalling)(e),d=(0,_.isInstallDone)(e),c=(0,_.isUninstallDone)(e),u=o||l,m=r&&i,p=m?"This integration will upgrade your Supabase project:":c||s?"This integration will modify your Supabase project:":u?"This integration is modifying your Supabase project:":d||r||n?"This integration has modified your Supabase project:":"",g=m?"Upgrades the database schema named":c||s?"Creates a new database schema named":o?i?"Upgrading database schema named":"Creating a new database schema named":d||r||n?"Created a new database schema named":l?"Dropping database schema named":"",h=m?"Upgrades tables and views in the":c||s?"Creates tables and views in the":o?i?"Upgrading tables and views in the":"Creating tables and views in the":d||r||n?"Created tables and views in the":l?"Dropping tables and views in the":"",x=m?"Upgrades Edge Functions to handle incoming webhooks from Stripe":c||s?"Deploys Edge Functions to handle incoming webhooks from Stripe":o?i?"Upgrading Edge Functions to handle incoming webhooks from Stripe":"Deploying Edge Functions to handle incoming webhooks from Stripe":d||r||n?"Deployed Edge Functions to handle incoming webhooks from Stripe":l?"Undeploying Edge Functions to handle incoming webhooks from Stripe":"",f=m?"Upgrades automatic Stripe data syncs using Supabase Queues":c||s?"Schedules automatic Stripe data syncs using Supabase Queues":o?i?"Upgrading automatic Stripe data syncs using Supabase Queues":"Scheduling automatic Stripe data syncs using Supabase Queues":d||r||n?"Scheduled automatic Stripe data syncs using Supabase Queues":l?"Unscheduling automatic Stripe data syncs using Supabase Queues":"";return(0,t.jsxs)("div",{className:"flex flex-col gap-y-4",children:[(0,t.jsx)("h4",{children:p}),(0,t.jsx)(F.Card,{className:(0,S.cn)(a),children:(0,t.jsx)(F.CardContent,{className:"p-0",children:(0,t.jsxs)("ul",{className:"text-foreground-light text-sm",children:[(0,t.jsxs)("li",{className:q,children:[u?(0,t.jsx)(R.Loader2,{size:16,className:"animate-spin"}):(0,t.jsx)(P.Table,{size:16,strokeWidth:1.5,className:"text-foreground-lighter shrink-0"}),(0,t.jsxs)("span",{children:[g," ",(0,t.jsx)("code",{className:"text-code-inline",children:"stripe"})]})]}),(0,t.jsxs)("li",{className:q,children:[u?(0,t.jsx)(R.Loader2,{size:16,className:"animate-spin"}):(0,t.jsx)(P.Table,{size:16,strokeWidth:1.5,className:"text-foreground-lighter shrink-0"}),(0,t.jsxs)("span",{children:[h," ",(0,t.jsx)("code",{className:"text-code-inline",children:"stripe"})," schema for synced Stripe data"]})]}),(0,t.jsxs)("li",{className:q,children:[u?(0,t.jsx)(R.Loader2,{size:16,className:"animate-spin"}):(0,t.jsx)(U.EdgeFunctions,{size:16,strokeWidth:1.5,className:"text-foreground-lighter shrink-0"}),(0,t.jsx)("span",{children:x})]}),(0,t.jsxs)("li",{className:"flex items-center gap-x-3 py-2 px-3",children:[u?(0,t.jsx)(R.Loader2,{size:16,className:"animate-spin"}):(0,t.jsx)(D.Layers,{size:16,strokeWidth:1.5,className:"text-foreground-lighter shrink-0"}),(0,t.jsx)("span",{children:f})]})]})})})]})};var L=e.i(297808),O=e.i(38429),$=e.i(356003),M=e.i(704206),Q=e.i(918018),W=e.i(246230),K=e.i(10429),G=e.i(967052);async function H({projectRef:e,startTime:t}){let a=await (0,M.getAccessToken)(),i=await fetch(`${K.BASE_PATH}/api/integrations/stripe-sync`,{method:"DELETE",headers:{"Content-Type":"application/json",Authorization:`Bearer ${a}`},body:JSON.stringify({projectRef:e,startTime:t})}),r=await i.json();if(!i.ok)throw Error(r.error?.message||"Failed to uninstall Stripe Sync");return r}var V=e.i(801834),Y=e.i(635494);let J=f.object({stripeSecretKey:f.string().min(1,"Stripe API key is required")});e.s(["StripeSyncEngineOverviewTab",0,()=>{let e,f,w=(0,G.useTrack)(),S=(0,o.useRef)(!1),{data:k}=(0,Y.useSelectedProjectQuery)(),I=(0,r.useFlag)("marketplaceIntegrations"),[E,z]=(0,o.useState)(!1),[U,D]=(0,o.useState)(!1),[R,P]=(0,o.useState)(!1),[F,q]=(0,o.useState)(!1),M="stripe-sync-install-form",K=(0,l.useForm)({resolver:(0,a.zodResolver)(J),defaultValues:{stripeSecretKey:""},mode:"onSubmit"}),{schemaComment:X,schemaComment:{status:Z},latestAvailableVersion:ee,timedOut:et}=(0,y.useStripeSyncStatus)(),{can:ea}=(0,N.useAsyncCheckPermissions)(i.PermissionAction.FUNCTIONS_SECRET_WRITE,"*"),ei=(0,_.isInstalled)(Z),er=(0,_.hasInstallError)(Z),es=(0,_.hasUninstallError)(Z),en=(0,_.isInstalling)(Z),eo=(0,_.isUninstalling)(Z),el=(0,_.isInstallDone)(Z),ed=(0,_.isUninstallDone)(Z);ei?(e=X?.newVersion,f=ee):(e=X?.oldVersion,f=X?.newVersion);let ec=!!(e&&f&&e!==f),eu=ee==X?.newVersion,{mutate:em,isPending:ep,error:eg,reset:eh}=(0,L.useStripeSyncInstallMutation)({onSuccess:()=>{d.toast.success(ec?"Stripe Sync upgrade started":"Stripe Sync installation started"),D(!1),K.reset(),P(!0)}}),{mutate:ex,isPending:ef}=(({onSuccess:e,onError:t,...a}={})=>{let i=(0,$.useQueryClient)(),r=(0,G.useTrack)();return(0,O.useMutation)({mutationFn:e=>H(e),async onSuccess(t,a,s){let{projectRef:n}=a;r("integration_uninstall_submitted",{integrationName:"stripe_sync_engine"}),await i.invalidateQueries({queryKey:W.databaseKeys.schemas(n)}),await i.invalidateQueries({queryKey:Q.stripeSyncKeys.all}),await e?.(t,a,s)},async onError(e,a,i){void 0===t?d.toast.error(`Failed to uninstall Stripe Sync: ${e.message}`):t(e,a,i)},...a})})({onSuccess:()=>{d.toast.success("Stripe Sync uninstallation started"),z(!1),q(!0)}}),eb=(en||ep||R)&&!et,ev=(eo||ef||F)&&!et,ey=(0,_.canInstall)(Z)&&!ei&&!eb,ew=(es||er)&&(!ev&&!eb||et);(0,V.useSchemasQuery)({projectRef:k?.ref,connectionString:k?.connectionString},{refetchInterval:(!!eb||!!ev)&&5e3});let ej=(0,o.useCallback)(()=>{k?.ref&&ex({projectRef:k.ref,startTime:Date.now()})},[k?.ref,ex]),eS=(0,o.useCallback)(()=>{eh(),D(!0)},[eh]),e_=e=>{!ep&&(D(e),e||(K.reset(),eh()))};return(0,o.useEffect)(()=>{if(!er){S.current=!1;return}S.current||(S.current=!0,w("integration_install_failed",{integrationName:"stripe_sync_engine"}))},[er,w]),(0,o.useEffect)(()=>{R&&el&&eu&&!er&&P(!1)},[R,el,eu,er]),(0,o.useEffect)(()=>{F&&ed&&q(!1)},[F,ed]),(0,t.jsxs)(t.Fragment,{children:[I?(0,t.jsxs)(v.IntegrationOverviewTabV2,{children:[ew&&(0,t.jsx)(j,{error:es?"uninstall":"install",handleUninstall:ej,handleOpenInstallSheet:eS,isUpgrade:ec,installing:eb,uninstalling:ev}),ei||ev||es?(ei||ev||es)&&(0,t.jsx)(C,{disabled:eb||ev||!ea,upgradeAvailable:ec,installing:eb,uninstalling:ev,isUninstallRequested:ef,setShouldShowInstallSheet:D,setShowUninstallModal:z}):(0,t.jsx)(A,{hideInstallCTA:!0,installing:eb,canInstall:ey,isUninstallRequested:ef,handleUninstall:ej,setShouldShowInstallSheet:D})]}):(0,t.jsx)(b.IntegrationOverviewTab,{alert:ew?(0,t.jsx)(j,{error:es?"uninstall":"install",handleUninstall:ej,handleOpenInstallSheet:eS,isUpgrade:ec,installing:eb,uninstalling:ev}):null,status:(0,t.jsx)(T,{status:Z,isInstallRequested:ep,isInstallInitiated:R,isUninstallRequested:ef,isUninstallInitiated:F,isUpgrade:ec,timedOut:et}),actions:ei||ev||es?ei||ev||es?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(B,{installationStatus:Z,isUpgrade:ec}),(0,t.jsx)(C,{className:"mt-4",disabled:eb||ev||!ea,upgradeAvailable:ec,installing:eb,uninstalling:ev,isUninstallRequested:ef,setShouldShowInstallSheet:D,setShowUninstallModal:z})]}):null:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(B,{installationStatus:Z,isUpgrade:ec}),(0,t.jsx)(A,{className:"mt-4",installing:eb,canInstall:ey,isUninstallRequested:ef,handleUninstall:ej,setShouldShowInstallSheet:D})]}),children:(0,t.jsx)(m.Sheet,{open:!!U,onOpenChange:e_,children:(0,t.jsx)(m.SheetContent,{size:"lg",tabIndex:void 0,className:"flex flex-col gap-0",children:(0,t.jsx)(u.Form,{...K,children:(0,t.jsxs)("form",{id:M,onSubmit:K.handleSubmit(({stripeSecretKey:e})=>{k?.ref&&em({projectRef:k.ref,stripeSecretKey:e,startTime:Date.now()})}),className:"overflow-auto grow px-0 flex flex-col",children:[(0,t.jsx)(m.SheetHeader,{children:(0,t.jsxs)(m.SheetTitle,{children:[ec?"Upgrade":"Install"," Stripe Sync Engine"]})}),(0,t.jsxs)(m.SheetSection,{className:"flex-1 flex flex-col gap-y-6",children:[(0,t.jsx)(B,{installationStatus:Z,isUpgrade:ec}),(0,t.jsx)("h3",{className:"heading-default",children:"Configuration"}),(0,t.jsxs)("div",{className:"flex flex-col gap-y-2",children:[(0,t.jsx)(u.FormField,{control:K.control,name:"stripeSecretKey",render:({field:e})=>(0,t.jsx)(x.FormItemLayout,{layout:"flex-row-reverse",label:"Stripe API secret key",description:"Your Stripe secret key. Requires write access to Webhook Endpoints and read-only access to all other categories.",children:(0,t.jsx)(u.FormControl,{className:"col-span-8",children:(0,t.jsx)(g.Input,{id:"stripe_api_key",name:"stripe_api_key",placeholder:"Enter your Stripe API key",autoComplete:"stripe-api-key",reveal:!1,disabled:ep,type:"password",value:e.value,onChange:t=>e.onChange(t.target.value)})})})}),(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)(c.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(s.ExternalLink,{}),children:(0,t.jsx)(n.default,{target:"_blank",rel:"noopener noreferrer",href:"https://dashboard.stripe.com/apikeys",children:"Get Stripe API key"})}),(0,t.jsx)(c.Button,{asChild:!0,type:"default",icon:(0,t.jsx)(s.ExternalLink,{}),children:(0,t.jsx)(n.default,{target:"_blank",rel:"noopener noreferrer",href:"https://support.stripe.com/questions/what-are-stripe-api-keys-and-how-to-find-them",children:"What are Stripe API keys?"})})]})]}),eg&&(0,t.jsx)(p.Admonition,{type:"destructive",title:"Installation failed",description:eg.message})]}),(0,t.jsxs)(m.SheetFooter,{children:[(0,t.jsx)(c.Button,{type:"default",disabled:ep,onClick:()=>e_(!1),children:"Cancel"}),(0,t.jsx)(c.Button,{form:M,htmlType:"submit",type:"primary",loading:ep,disabled:!K.formState.isValid||ep,children:ep?ec?"Upgrading":"Installing":ec?"Upgrade integration":"Install integration"})]})]})})})})}),(0,t.jsxs)(h.default,{visible:E,title:"Uninstall Stripe Sync Engine",confirmLabel:"Uninstall",confirmLabelLoading:"Uninstalling...",variant:"destructive",loading:ef,onCancel:()=>z(!1),onConfirm:ej,children:[(0,t.jsx)("p",{className:"text-sm text-foreground-light",children:"Are you sure you want to uninstall the Stripe Sync Engine? This will:"}),(0,t.jsxs)("ul",{className:"list-disc pl-5 mt-2 text-sm text-foreground-light space-y-1",children:[(0,t.jsxs)("li",{children:["Remove the ",(0,t.jsx)("code",{className:"text-code-inline",children:"stripe"})," schema and all tables"]}),(0,t.jsx)("li",{children:"Delete all synced Stripe data"}),(0,t.jsx)("li",{children:"Remove the associated Edge Functions"}),(0,t.jsx)("li",{children:"Remove the scheduled sync jobs"})]}),(0,t.jsx)("p",{className:"mt-4 text-sm text-foreground-light font-medium",children:"This action cannot be undone."})]})]})}],14092)},140017,e=>{e.n(e.i(14092))},185246,e=>{e.v(t=>Promise.all(["static/chunks/08~qzvogqaaio.js"].map(t=>e.l(t))).then(()=>t(911142)))},434962,e=>{e.v(t=>Promise.all(["static/chunks/0mt1bd4o59er8.js"].map(t=>e.l(t))).then(()=>t(481162)))},216511,e=>{e.v(t=>Promise.all(["static/chunks/141scz7lioi__.js"].map(t=>e.l(t))).then(()=>t(575213)))},326546,e=>{e.v(t=>Promise.all(["static/chunks/12zy-nznlh7az.js"].map(t=>e.l(t))).then(()=>t(266186)))},780799,e=>{e.v(t=>Promise.all(["static/chunks/11pan2l1emfzx.js"].map(t=>e.l(t))).then(()=>t(567789)))},105568,e=>{e.v(t=>Promise.all(["static/chunks/0b80oynnurqnz.js"].map(t=>e.l(t))).then(()=>t(956849)))},43799,e=>{e.v(t=>Promise.all(["static/chunks/175v6ap~7k-_-.js"].map(t=>e.l(t))).then(()=>t(476149)))},479686,e=>{e.v(t=>Promise.all(["static/chunks/0ilvo.4ihrw.n.js"].map(t=>e.l(t))).then(()=>t(682117)))},790935,e=>{e.v(t=>Promise.all(["static/chunks/11.2jerslxqpe.js"].map(t=>e.l(t))).then(()=>t(918317)))},675240,e=>{e.v(t=>Promise.all(["static/chunks/0y7ynm3t00xgx.js"].map(t=>e.l(t))).then(()=>t(259107)))},196082,e=>{e.v(t=>Promise.all(["static/chunks/00p1trb5la_fj.js"].map(t=>e.l(t))).then(()=>t(725449)))},141281,e=>{e.v(t=>Promise.all(["static/chunks/0vmhs9_eiqaba.js"].map(t=>e.l(t))).then(()=>t(476854)))},401546,e=>{e.v(t=>Promise.all(["static/chunks/0-ffctee06z5q.js"].map(t=>e.l(t))).then(()=>t(427555)))},650542,e=>{e.v(t=>Promise.all(["static/chunks/0t.arw5d07tls.js"].map(t=>e.l(t))).then(()=>t(46434)))},297196,e=>{e.v(t=>Promise.all(["static/chunks/0akxsfqq-vl25.js"].map(t=>e.l(t))).then(()=>t(983259)))},751169,e=>{e.v(t=>Promise.all(["static/chunks/0kr22v~s62fbr.js"].map(t=>e.l(t))).then(()=>t(211963)))},652112,e=>{e.v(t=>Promise.all(["static/chunks/00f-a5~0swwup.js"].map(t=>e.l(t))).then(()=>t(106809)))},797235,e=>{e.v(t=>Promise.all(["static/chunks/0my39hx2sjys7.js"].map(t=>e.l(t))).then(()=>t(311486)))},304455,e=>{e.v(t=>Promise.all(["static/chunks/0e6i~_4t4~pz_.js"].map(t=>e.l(t))).then(()=>t(17077)))},338107,e=>{e.v(t=>Promise.all(["static/chunks/0aod~v1mpketd.js"].map(t=>e.l(t))).then(()=>t(1152)))},870265,e=>{e.v(t=>Promise.all(["static/chunks/17bpehtvrbq27.js"].map(t=>e.l(t))).then(()=>t(302280)))},441486,e=>{e.v(t=>Promise.all(["static/chunks/0pcp9er0q6-ly.js"].map(t=>e.l(t))).then(()=>t(659562)))},362060,e=>{e.v(t=>Promise.all(["static/chunks/142ssqlash_0x.js"].map(t=>e.l(t))).then(()=>t(667994)))},993747,e=>{e.v(t=>Promise.all(["static/chunks/0jrfxywrdebvc.js"].map(t=>e.l(t))).then(()=>t(102825)))},376147,e=>{e.v(t=>Promise.all(["static/chunks/0q363y5lf~b~y.js"].map(t=>e.l(t))).then(()=>t(89290)))},458511,e=>{e.v(t=>Promise.all(["static/chunks/0shu_91ffgh2t.js"].map(t=>e.l(t))).then(()=>t(786522)))},75071,e=>{e.v(t=>Promise.all(["static/chunks/05pv0ojh_evmh.js"].map(t=>e.l(t))).then(()=>t(739236)))},693988,e=>{e.v(t=>Promise.all(["static/chunks/10758s3hhc0t4.js"].map(t=>e.l(t))).then(()=>t(167237)))}]);