(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,592383,e=>{"use strict";var t=e.i(478902),i=e.i(755146),s=e.i(861833),r=e.i(843778),a=e.i(937942);let n=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),o=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:i})=>(0,t.jsx)(a.InlineLink,{href:e??"/",children:i});e.s(["Markdown",0,({children:e,className:a,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,r.cn)("text-sm",a),children:(0,t.jsx)(i.default,{remarkPlugins:[s.default],components:{h3:n,code:o,a:l},...u,children:e??d})})])},938933,305551,e=>{"use strict";var t=e.i(389959);let i={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},s={tiny:`${i.size.text.tiny} ${i.size.padding.tiny}`,small:`${i.size.text.small} ${i.size.padding.small}`,medium:`${i.size.text.medium} ${i.size.padding.medium}`,large:`${i.size.text.large} ${i.size.padding.large}`,xlarge:`${i.size.text.xlarge} ${i.size.padding.xlarge}`},r={accordion:{variants:{default:{base:`
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
      ${i.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${i.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${i.border.secondary}
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
      `},block:"w-full flex items-center justify-center",size:{...s},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${i.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${i.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...s},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...i.size.text}},label_optional:{base:"text-foreground-lighter",size:{...i.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...i.size.text}},label_before:{base:"text-foreground-lighter ",size:{...i.size.text}},label_after:{base:"text-foreground-lighter",size:{...i.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...i.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
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
      ${i.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${i.placeholder}
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
    `,size:{...s},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,r],305551);let a=(0,t.createContext)({theme:r});e.s(["default",0,function(e){let{theme:{[e]:i}}=(0,t.useContext)(a);return i||(i=r.accordion),i=JSON.parse(i=JSON.stringify(i).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),i=e.i(816467),s=e.i(389959),r=e.i(843778),a=e.i(375761),n=e.i(231665),o=e.i(938933);let l=(0,s.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:m,iconContainerClassName:p,containerClassName:x,size:h="small",...g},f)=>{let[b,y]=(0,s.useState)("Copy"),[v,_]=(0,s.useState)(!0),j=(0,o.default)("input"),k=[];return h&&k.push(j.size[h]),(0,t.jsxs)(n.InputGroup,{className:x,children:[(0,t.jsx)(n.InputGroupInput,{ref:f,onFocus:e=>e.target.select(),...g,size:h,onCopy:m,type:c&&v?"password":g.type,disabled:g.disabled,className:(0,r.cn)(...k,g.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(n.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(n.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&v)?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",className:(0,r.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(i.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=g.value,void(0,a.copyToClipboard)(e,()=>{y("Copied"),setTimeout(function(){y("Copy")},3e3),m?.()})},children:b}):null,c&&v?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",onClick:function(){_(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},466472,e=>{"use strict";var t=e.i(478902),i=e.i(389959),s=e.i(837710),r=e.i(843778),a=e.i(253214),n=e.i(710483);let o=(0,i.forwardRef)(({title:e,description:o,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:m,cancelLabel:p="Cancel",confirmLabel:x="Submit",confirmLabelLoading:h,alert:g,children:f,variant:b="default",disabled:y,className:v,..._},j)=>{let[k,w]=(0,i.useState)(void 0!==m&&m);(0,i.useEffect)(()=>{d&&void 0===m&&w(!1)},[d]),(0,i.useEffect)(()=>{void 0!==m&&w(m)},[m]);let{title:N,children:S,...C}=g?.base??{},T=g?.title?{label:g.title}:{};return(0,t.jsx)(a.Dialog,{open:d,..._,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(a.DialogContent,{"aria-describedby":void 0,ref:j,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(a.DialogHeader,{className:(0,r.cn)("border-b"),padding:"small",children:[(0,t.jsx)(a.DialogTitle,{children:e}),o&&(0,t.jsx)(a.DialogDescription,{children:o})]}),g&&(0,t.jsx)(n.Admonition,{type:b,description:g.description,...T,className:"border-x-0 rounded-none -mt-px",...C}),f&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(a.DialogSection,{padding:"small",className:v,children:f}),(0,t.jsx)(a.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(s.Button,{size:"medium",block:!0,type:"default",disabled:k,onClick:()=>c(),children:p}),(0,t.jsx)(s.Button,{block:!0,size:"medium",type:"destructive"===b?"danger":"warning"===b?"warning":"primary",htmlType:"submit",loading:k,disabled:k||y,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===m&&w(!0)},className:"truncate",children:k&&h?h:x})]})]})})});o.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,o,"default",0,o])},613851,e=>{"use strict";let t=(0,e.i(388019).default)("Clock",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16 14",key:"68esgv"}]]);e.s(["Clock",0,t],613851)},543851,e=>{"use strict";let t=(0,e.i(388019).default)("Eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);e.s(["Eye",0,t],543851)},216518,e=>{"use strict";let t=(0,e.i(388019).default)("EyeOff",[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]);e.s(["default",0,t])},890054,e=>{"use strict";var t=e.i(216518);e.s(["EyeOff",()=>t.default])},237002,e=>{"use strict";var t=e.i(478902),i=e.i(389959),s=e.i(678001),r=e.i(274664),a=e.i(174617),n=e.i(826524),o=e.i(594661),l=e.i(374251),d=e.i(889251),c=e.i(546595),u="Checkbox",[m,p]=(0,r.createContextScope)(u),[x,h]=m(u);function g(e){let{__scopeCheckbox:s,checked:r,children:a,defaultChecked:o,disabled:l,form:d,name:c,onCheckedChange:m,required:p,value:h="on",internal_do_not_use_render:g}=e,[f,b]=(0,n.useControllableState)({prop:r,defaultProp:o??!1,onChange:m,caller:u}),[y,v]=i.useState(null),[_,j]=i.useState(null),k=i.useRef(!1),N=!y||!!d||!!y.closest("form"),S={checked:f,disabled:l,setChecked:b,control:y,setControl:v,name:c,form:d,value:h,hasConsumerStoppedPropagationRef:k,required:p,defaultChecked:!w(o)&&o,isFormControl:N,bubbleInput:_,setBubbleInput:j};return(0,t.jsx)(x,{scope:s,...S,children:"function"==typeof g?g(S):a})}var f="CheckboxTrigger",b=i.forwardRef(({__scopeCheckbox:e,onKeyDown:r,onClick:n,...o},l)=>{let{control:d,value:u,disabled:m,checked:p,required:x,setControl:g,setChecked:b,hasConsumerStoppedPropagationRef:y,isFormControl:v,bubbleInput:_}=h(f,e),j=(0,s.useComposedRefs)(l,g),k=i.useRef(p);return i.useEffect(()=>{let e=d?.form;if(e){let t=()=>b(k.current);return e.addEventListener("reset",t),()=>e.removeEventListener("reset",t)}},[d,b]),(0,t.jsx)(c.Primitive.button,{type:"button",role:"checkbox","aria-checked":w(p)?"mixed":p,"aria-required":x,"data-state":N(p),"data-disabled":m?"":void 0,disabled:m,value:u,...o,ref:j,onKeyDown:(0,a.composeEventHandlers)(r,e=>{"Enter"===e.key&&e.preventDefault()}),onClick:(0,a.composeEventHandlers)(n,e=>{b(e=>!!w(e)||!e),_&&v&&(y.current=e.isPropagationStopped(),y.current||e.stopPropagation())})})});b.displayName=f;var y=i.forwardRef((e,i)=>{let{__scopeCheckbox:s,name:r,checked:a,defaultChecked:n,required:o,disabled:l,value:d,onCheckedChange:c,form:u,...m}=e;return(0,t.jsx)(g,{__scopeCheckbox:s,checked:a,defaultChecked:n,disabled:l,required:o,onCheckedChange:c,name:r,form:u,value:d,internal_do_not_use_render:({isFormControl:e})=>(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(b,{...m,ref:i,__scopeCheckbox:s}),e&&(0,t.jsx)(k,{__scopeCheckbox:s})]})})});y.displayName=u;var v="CheckboxIndicator",_=i.forwardRef((e,i)=>{let{__scopeCheckbox:s,forceMount:r,...a}=e,n=h(v,s);return(0,t.jsx)(d.Presence,{present:r||w(n.checked)||!0===n.checked,children:(0,t.jsx)(c.Primitive.span,{"data-state":N(n.checked),"data-disabled":n.disabled?"":void 0,...a,ref:i,style:{pointerEvents:"none",...e.style}})})});_.displayName=v;var j="CheckboxBubbleInput",k=i.forwardRef(({__scopeCheckbox:e,...r},a)=>{let{control:n,hasConsumerStoppedPropagationRef:d,checked:u,defaultChecked:m,required:p,disabled:x,name:g,value:f,form:b,bubbleInput:y,setBubbleInput:v}=h(j,e),_=(0,s.useComposedRefs)(a,v),k=(0,o.usePrevious)(u),N=(0,l.useSize)(n);i.useEffect(()=>{if(!y)return;let e=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set,t=!d.current;if(k!==u&&e){let i=new Event("click",{bubbles:t});y.indeterminate=w(u),e.call(y,!w(u)&&u),y.dispatchEvent(i)}},[y,k,u,d]);let S=i.useRef(!w(u)&&u);return(0,t.jsx)(c.Primitive.input,{type:"checkbox","aria-hidden":!0,defaultChecked:m??S.current,required:p,disabled:x,name:g,value:f,form:b,...r,tabIndex:-1,ref:_,style:{...r.style,...N,position:"absolute",pointerEvents:"none",opacity:0,margin:0,transform:"translateX(-100%)"}})});function w(e){return"indeterminate"===e}function N(e){return w(e)?"indeterminate":e?"checked":"unchecked"}k.displayName=j,e.s(["Checkbox",0,y,"CheckboxIndicator",0,_,"Indicator",0,_,"Root",0,y,"createCheckboxScope",0,p,"unstable_BubbleInput",0,k,"unstable_CheckboxBubbleInput",0,k,"unstable_CheckboxProvider",0,g,"unstable_CheckboxTrigger",0,b,"unstable_Provider",0,g,"unstable_Trigger",0,b],361494);var S=e.i(361494),S=S,C=e.i(370410),T=e.i(843778);let L=i.forwardRef(({className:e,...i},s)=>(0,t.jsx)(S.Root,{ref:s,className:(0,T.cn)("peer flex items-center justify-center h-4 w-4 shrink-0 rounded-sm border border-control bg-control/25 ring-offset-background","transition-colors duration-150 ease-in-out","hover:border-strong","focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2","disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:text-background",e),...i,children:(0,t.jsx)(S.Indicator,{className:(0,T.cn)("flex items-center justify-center text-current"),children:(0,t.jsx)(C.Check,{className:"h-3 w-3 text-background",strokeWidth:4})})}));L.displayName=S.Root.displayName,e.s(["Checkbox",0,L],237002)},867987,e=>{"use strict";var t=e.i(478902);e.i(481541);var i=e.i(337394),i=i,s=e.i(102220),s=s,r=e.i(370410),a=e.i(88816),n=e.i(816467),o=e.i(389959),l=e.i(602089),d=e.i(837710),c=e.i(843778),u=e.i(375761),m=e.i(874311),p=e.i(613580),x=e.i(967052);let h=[{label:"Ask ChatGPT",url:"https://chatgpt.com/",promptParam:"q",icon:i.default,toolId:"chatgpt"},{label:"Ask Claude",url:"https://claude.ai/new",promptParam:"q",icon:s.default,toolId:"claude"}];e.s(["AiAssistantDropdown",0,function({buildPrompt:e,label:i,iconOnly:s=!1,onOpenAssistant:g,onCopyPrompt:f,telemetrySource:b,size:y="tiny",type:v="default",disabled:_=!1,loading:j=!1,className:k,tooltip:w,copyLabel:N="Copy prompt",showExternalAI:S=!1,extraDropdownItems:C,additionalDropdownItems:T}){let L=(0,x.useTrack)(),[I,R]=(0,o.useState)(!1),[$,A]=(0,o.useState)(!1);(0,o.useEffect)(()=>{if(!I)return;let e=setTimeout(()=>R(!1),2e3);return()=>clearTimeout(e)},[I]);let E=(0,t.jsxs)("div",{className:(0,c.cn)("flex items-center","gap-0"),children:[(0,t.jsx)(d.Button,{type:v,size:y,disabled:_,onClick:()=>{g(),b&&L("ai_assistant_dropdown_button_clicked",{source:b})},icon:(0,t.jsx)(l.AiIconAnimation,{size:s?16:14,loading:j}),className:(0,c.cn)("rounded-r-none border-r-0",s&&"px-1.5",k),children:!s&&i}),(0,t.jsxs)(m.DropdownMenu,{open:$,onOpenChange:A,children:[(0,t.jsx)(m.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(d.Button,{type:v,size:y,disabled:_,className:(0,c.cn)("rounded-l-none px-1",s&&"px-1"),icon:(0,t.jsx)(a.ChevronDown,{size:12})})}),(0,t.jsxs)(m.DropdownMenuContent,{align:"end",className:"w-44",children:[C,(0,t.jsxs)(m.DropdownMenuItem,{onClick:()=>{let t=e();(0,u.copyToClipboard)(t),R(!0),A(!1),f?.(),b&&L("ai_prompt_copied",{source:b})},className:"gap-2",children:[I?(0,t.jsx)(r.Check,{size:14,className:"text-brand"}):(0,t.jsx)(n.Copy,{size:14}),I?"Copied!":N]}),S&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(m.DropdownMenuSeparator,{}),h.map(i=>(0,t.jsxs)(m.DropdownMenuItem,{className:"gap-2",onClick:()=>{let t;return t=e(),void(window.open(`${i.url}?${i.promptParam}=${encodeURIComponent(t)}`,"_blank","noreferrer"),b&&L("ai_external_tool_clicked",{source:b,tool:i.toolId}))},children:[(0,t.jsx)(i.icon,{size:14}),i.label]},i.url))]}),T&&T.length>0&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(m.DropdownMenuSeparator,{}),T.map((e,i)=>(0,t.jsxs)(m.DropdownMenuItem,{onClick:e.onClick,className:"gap-2",children:[e.icon,e.label]},i))]})]})]})]});return s&&w?(0,t.jsxs)(p.Tooltip,{children:[(0,t.jsx)(p.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("div",{className:"inline-flex",children:E})}),(0,t.jsx)(p.TooltipContent,{side:"bottom",children:w})]}):E}],867987)},830495,e=>{"use strict";var t=e.i(478902),i=e.i(202584),s=e.i(802715),r=e.i(88816),a=e.i(975924),n=e.i(389959),o=e.i(837710),l=e.i(237002),d=e.i(843778),c=e.i(9679),u=e.i(689805),m=e.i(793912),p=e.i(135144),x=e.i(396831),h=e.i(746301),g=e.i(108151);e.s(["FilterPopover",0,({title:e,options:f=[],activeOptions:b=[],valueKey:y,labelKey:v,iconKey:_="icon",name:j="default",variant:k="rectangular",buttonType:w,disabled:N,labelClass:S,className:C,maxHeightClass:T="h-[205px]",clearButtonText:L="Clear",isMinimized:I=!1,showOnlyButton:R=!0,onSaveFilters:$,search:A,setSearch:E=s.default,hasNextPage:z=!1,isLoading:D=!1,isFetching:O=!1,isFetchingNextPage:P=!1,fetchNextPage:U=s.default,groups:F,renderLabel:M})=>{let[W,q]=(0,n.useState)(!1),[B,V]=(0,n.useState)([]),G=e=>{let i=e[y],s=_?e[_]:void 0,r=(0,t.jsxs)(c.Label_Shadcn_,{htmlFor:e[y],className:(0,d.cn)("flex items-center gap-x-2 text-xs cursor-pointer",S),children:[s&&(0,t.jsx)("img",{src:s,alt:e[v],className:(0,d.cn)("w-4 h-4",e.iconClass)}),(0,t.jsx)("span",{children:e[v]})]}),a=M?M(e,i):r;return(0,t.jsxs)("div",{className:"group flex items-center gap-x-2",children:[(0,t.jsx)(l.Checkbox,{id:i,checked:B.includes(i),onCheckedChange:()=>{B.includes(i)?V(B.filter(e=>e!==i)):V(B.concat(i))}}),(0,t.jsx)("div",{className:"flex-1",children:a}),R&&(0,t.jsx)("button",{className:"text-xs text-foreground-lighter hover:text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity",onClick:e=>{e.preventDefault(),V([i])},children:"Only"})]},i)},Q=(0,n.useRef)(null),[Y,K]=(0,i.useIntersectionObserver)({root:Q.current,threshold:0,rootMargin:"0px"}),H=b.map(e=>{let t=f.find(t=>t[y]===e);return t&&t[v]?t[v]:""});return(0,n.useEffect)(()=>{W||V(b),W||E("")},[W,b]),(0,n.useEffect)(()=>{W&&K?.isIntersecting&&z&&!D&&!O&&!P&&(console.log("Fetch next page"),U())},[W,K?.isIntersecting,U,z,O,P,D]),(0,t.jsxs)(u.Popover_Shadcn_,{open:W,onOpenChange:q,children:[(0,t.jsx)(p.PopoverTrigger_Shadcn_,{asChild:!0,children:(0,t.jsx)(o.Button,{asChild:!0,disabled:N,type:w??(b.length>0?"default":"dashed"),onClick:()=>q(!1),className:"rounded"===k?"rounded-full":"",iconRight:(0,t.jsx)(r.ChevronDown,{}),children:(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:j}),b.length>0&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("span",{className:"mr-1",children:":"}),I?(0,t.jsx)("span",{children:b.length}):b.length>=3?(0,t.jsxs)("span",{children:[H[0]," and ",b.length-1," others"]}):(0,t.jsx)("span",{children:H.join(", ")})]})]})})}),(0,t.jsxs)(m.PopoverContent_Shadcn_,{className:(0,d.cn)("p-0",void 0!==A?"w-64":"w-44",C),align:"start",children:[(0,t.jsx)("div",{className:"border-b border-overlay bg-surface-200 rounded-t pb-1 px-3",children:(0,t.jsx)("span",{className:"text-xs text-foreground-light",children:e??`Select ${j.toLowerCase()}`})}),void 0!==A&&(0,t.jsx)(h.Input,{size:"tiny",value:A,onChange:e=>{E&&E(e.target.value)},className:"rounded-none border-x-0 border-t-0 bg-surface-100 px-3",placeholder:"Search for a project...",actions:(A??"").length>0?(0,t.jsx)(a.X,{size:14,className:"cursor-pointer mr-1",onClick:()=>E("")}):null}),(A??"").length>0&&0===f.length&&(0,t.jsx)("p",{className:"text-xs text-foreground-lighter pt-3 px-3",children:"No results found"}),(0,t.jsxs)(x.ScrollArea,{className:f.length>7?T:"",children:[(0,t.jsx)("div",{className:"px-3 pt-3 flex flex-col gap-y-2",children:F?(0,t.jsx)(t.Fragment,{children:F.filter(e=>e.options.length>0).map((e,i)=>(0,t.jsxs)("div",{className:i>0?"py-2":"",children:[i>0&&(0,t.jsx)("div",{className:"mb-2 border-t border-overlay -mx-3"}),(0,t.jsx)("span",{className:"text-xs text-foreground-lighter font-medium mb-2 block",children:e.name}),(0,t.jsx)("div",{className:"flex flex-col gap-y-2",children:e.options.map(e=>{let t=f.find(t=>t[y]===e);return t?G(t):null})})]},e.name))}):f.map(e=>G(e))}),(0,t.jsx)("div",{ref:Y,className:"h-1 -mt-1"}),z?(0,t.jsx)("div",{className:"px-3 py-2",children:(0,t.jsx)(g.ShimmeringLoader,{className:"py-2"})}):(0,t.jsx)("div",{className:"py-1.5"})]}),(0,t.jsxs)("div",{className:"flex items-center justify-end gap-2 border-t border-overlay bg-surface-200 py-2 px-3",children:[(0,t.jsx)(o.Button,{size:"tiny",type:"default",onClick:()=>{$([]),V([]),q(!1)},children:L}),(0,t.jsx)(o.Button,{type:"primary",onClick:()=>{let e=f.map(e=>e[y]);$(B.sort((t,i)=>e.indexOf(t)-e.indexOf(i))),q(!1)},children:"Save"})]})]})]})}])},909410,e=>{"use strict";let t=(0,e.i(388019).default)("Globe",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]);e.s(["Globe",0,t],909410)},534259,690247,e=>{"use strict";let t={TableCreated:"table_created",TableDataAdded:"table_data_added",TableRLSEnabled:"table_rls_enabled"};Object.values(t),e.s(["TABLE_EVENT_ACTIONS",0,t],690247);class i{static DETECTORS=[{type:t.TableCreated,patterns:[/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))/i,/CREATE\s+TEMP(?:ORARY)?\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))/i,/CREATE\s+UNLOGGED\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))/i,/SELECT\s+.*?\s+INTO\s+(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))/is,/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))\s+AS\s+SELECT/i]},{type:t.TableDataAdded,patterns:[/INSERT\s+INTO\s+(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))/i,/COPY\s+(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+))\s+FROM/i]},{type:t.TableRLSEnabled,patterns:[/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+)).*?ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?<schema>(?:"[^"]+"|[\w]+)\.)?(?<table>(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|[\w]+)).*?ENABLE\s+RLS/i]}];cleanIdentifier(e){return e?.replace(/["`']/g,"").replace(/\.$/,"")}stripDollarQuoteBodies(e){return e.replace(/(\$[a-zA-Z0-9_]*\$)[\s\S]*?\1/g,"$1$1")}match(e){for(let{type:t,patterns:s}of i.DETECTORS)for(let i of s){let s=e.match(i);if(s?.groups)return{type:t,schema:this.cleanIdentifier(s.groups.schema),tableName:this.cleanIdentifier(s.groups.table??s.groups.object)}}return null}splitStatements(e){let t=e.match(/'([^']|'')*'|"([^"]|"")*"|\$[a-zA-Z0-9_]*\$[\s\S]*?\$[a-zA-Z0-9_]*\$|;|[^'"$;]+/g)||[],i=[],s="";for(let e of t)";"===e?(s.trim()&&i.push(s.trim()),s=""):s+=e;return s.trim()&&i.push(s.trim()),i}deduplicate(e){let t=new Set;return e.filter(e=>{let i=`${e.type}:${e.schema||""}:${e.tableName||""}`;return!t.has(i)&&(t.add(i),!0)})}removeComments(e){return e.replace(/--.*?$/gm,"").replace(/\/\*[\s\S]*?\*\//g,"")}getTableEvents(e){let t=this.splitStatements(this.removeComments(this.stripDollarQuoteBodies(e))),i=[];for(let e of t){let t=this.match(e);t&&i.push(t)}return this.deduplicate(i)}}let s=new i;e.s(["sqlEventParser",0,s],534259)},701087,e=>{"use strict";let t=(0,e.i(388019).default)("LockOpen",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 9.9-1",key:"1mm8w8"}]]);e.s(["Unlock",0,t],701087)},617361,e=>{"use strict";var t=e.i(38429),i=e.i(356003),s=e.i(355901),r=e.i(714403),a=e.i(162082),n=e.i(265735),o=e.i(534259);let l=["branches","settings-v2","addons","custom-domains","content"];e.s(["useExecuteSqlMutation",0,({onSuccess:e,onError:d,...c}={})=>{let u=(0,i.useQueryClient)(),{mutate:m}=(0,a.useSendEventMutation)(),{data:p}=(0,n.useSelectedOrganizationQuery)();return(0,t.useMutation)({mutationFn:e=>(0,r.executeSql)(e),async onSuccess(t,i,s){let{contextualInvalidation:r,sql:a,projectRef:n}=i;try{o.sqlEventParser.getTableEvents(a).forEach(e=>{n&&m({action:e.type,properties:{method:"sql_editor",schema_name:e.schema,table_name:e.tableName},groups:{project:n,...p?.slug&&{organization:p.slug}}})})}catch(e){console.error("Failed to parse SQL for telemetry:",e)}let d=a.toLowerCase(),c=d.includes("create ")||d.includes("alter ")||d.includes("drop ");if(r&&n&&c){let e=u.getQueryCache().findAll({queryKey:["projects",n]}).map(e=>e.queryKey).filter(e=>!l.some(t=>e.includes(t)));await Promise.all(e.map(e=>u.invalidateQueries({queryKey:e})))}await e?.(t,i,s)},async onError(e,t,i){void 0===d?s.toast.error(`Failed to execute SQL: ${e.message}`):d(e,t,i)},...c})}])},602158,e=>{"use strict";let t=(0,e.i(388019).default)("TextSearch",[["path",{d:"M21 6H3",key:"1jwq7v"}],["path",{d:"M10 12H3",key:"1ulcyk"}],["path",{d:"M10 18H3",key:"13769t"}],["circle",{cx:"17",cy:"15",r:"3",key:"1upz2a"}],["path",{d:"m21 19-1.9-1.9",key:"dwi7p8"}]]);e.s(["TextSearch",0,t],602158)},772920,e=>{"use strict";var t=e.i(478902),i=e.i(479084),s=e.i(356003),r=e.i(890054),a=e.i(250503),n=e.i(389959),o=e.i(355901),l=e.i(587433),d=e.i(837710),c=e.i(710483),u=e.i(466472),m=e.i(937942),p=e.i(915993),x=e.i(617361),h=e.i(635494);let g=["pg_graphql_anon_table_exposed","pg_graphql_authenticated_table_exposed"],f={pg_graphql_anon_table_exposed:"anon",pg_graphql_authenticated_table_exposed:"authenticated"},b={pg_graphql_anon_table_exposed:{lower:"anonymous users",upper:"Anonymous users"},pg_graphql_authenticated_table_exposed:{lower:"signed-in users",upper:"Signed-in users"}},y={pg_graphql_anon_table_exposed:"Remove access for anonymous users",pg_graphql_authenticated_table_exposed:"Remove access for signed-in users"};e.s(["GraphqlExposureCallout",0,({projectRef:e})=>(0,t.jsx)(c.Admonition,{type:"default",title:"Why this appears",description:(0,t.jsxs)("p",{children:["These warnings are triggered by GraphQL exposing your table schemas. If you're not using GraphQL, disable it from the"," ",(0,t.jsx)(m.InlineLink,{href:`/project/${e}/database/extensions`,children:"Database extensions page"}),"."]})}),"GraphqlExposureLintCTA",0,({lintName:e,projectRef:g,metadata:v,onAfterAction:_})=>{let{data:j}=(0,h.useSelectedProjectQuery)(),k=(0,s.useQueryClient)(),[w,N]=(0,n.useState)(!1),S=v?.schema,C=v?.name,T=v?.type??"object",L=f[e],I=b[e],R=!!S&&!!C,$=S&&C?i.safeSql`revoke all on ${(0,i.ident)(S)}.${(0,i.ident)(C)} from ${(0,i.ident)(L)};`:void 0,{mutate:A,isPending:E}=(0,x.useExecuteSqlMutation)({onSuccess:async()=>{o.toast.success(`Revoked access to ${S}.${C} from ${L}. ${I.upper} can no longer query this ${T} via GraphQL or Data API.`),N(!1),await k.invalidateQueries({queryKey:p.lintKeys.lint(g)}),_?.()},onError:e=>{o.toast.error(`Failed to revoke access: ${e.message}`)}});return(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(d.Button,{type:"primary",disabled:!R,onClick:()=>N(!0),children:y[e]}),(0,t.jsxs)(u.default,{visible:w,size:"xlarge",title:R?`Remove access to ${S}.${C} for ${I.lower}?`:`Remove access for ${I.lower}?`,confirmLabel:"Remove access",confirmLabelLoading:"Removing access...",cancelLabel:"Cancel",loading:E,onCancel:()=>N(!1),onConfirm:()=>{$&&A({projectRef:g,connectionString:j?.connectionString,sql:$})},children:[(0,t.jsxs)("div",{className:"text-sm text-foreground mb-6",children:[(0,t.jsxs)("p",{children:["This change affects both schema visibility and data access for ",I.lower,"."]}),(0,t.jsxs)("p",{children:["Alternatively, you can"," ",(0,t.jsx)(m.InlineLink,{href:`/project/${g}/database/extensions`,children:"disable GraphQL"})," ","to remove schema visibility."]})]}),(0,t.jsxs)("div",{className:"space-y-5",children:[(0,t.jsxs)("div",{className:"flex gap-3",children:[(0,t.jsx)(a.Lock,{className:"text-foreground-light shrink-0 mt-0.5",size:20,strokeWidth:1.5}),(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)("p",{className:"text-sm text-foreground",children:"Data API access removed"}),(0,t.jsx)(l.Badge,{variant:"warning",children:"Breaking change"})]}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light mt-1",children:[I.upper," will no longer be able to read or write to this ",T," via Supabase APIs (GraphQL or Data API), even if RLS policies allow it."]})]})]}),(0,t.jsxs)("div",{className:"flex gap-3",children:[(0,t.jsx)(r.EyeOff,{className:"text-foreground-light shrink-0 mt-0.5",size:20,strokeWidth:1.5}),(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"text-sm text-foreground",children:"Schema hidden from GraphQL"}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light mt-1",children:["This ",T," will no longer appear in the GraphQL schema. ",I.upper," ","won't be able to discover its name, columns, or relationships."]})]})]})]}),(0,t.jsx)(c.Admonition,{type:"warning",title:"When to keep access",description:`If your app needs ${I.lower} to query this ${T}, keep access and ignore this warning. Be aware that this ${T}'s schema will remain visible via the GraphQL API.`,className:"mt-6"}),(0,t.jsx)("p",{className:"text-sm text-foreground-light mt-6",children:"The following statement will be executed:"}),(0,t.jsx)("pre",{className:"mt-2 px-3 py-2 rounded bg-surface-200 text-xs font-mono whitespace-pre-wrap break-all",children:$})]})]})},"asGraphqlExposureLint",0,e=>e&&g.includes(e)?e:null])},486868,112176,455975,e=>{"use strict";var t=e.i(76257);e.s(["LockIcon",()=>t.default],486868);var i=e.i(388019);let s=(0,i.default)("Ruler",[["path",{d:"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",key:"icamh8"}],["path",{d:"m14.5 12.5 2-2",key:"inckbg"}],["path",{d:"m11.5 9.5 2-2",key:"fmmyf7"}],["path",{d:"m8.5 6.5 2-2",key:"vc6u1g"}],["path",{d:"m17.5 15.5 2-2",key:"wo5hmg"}]]);e.s(["Ruler",0,s],112176);let r=(0,i.default)("Scaling",[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M14 15H9v-5",key:"pi4jk9"}],["path",{d:"M16 3h5v5",key:"1806ms"}],["path",{d:"M21 3 9 15",key:"15kdhq"}]]);e.s(["Scaling",0,r],455975)},775114,e=>{"use strict";var t,i=((t={}).ERROR="ERROR",t.WARN="WARN",t.INFO="INFO",t);e.s(["LINTER_LEVELS",()=>i,"LINT_TABS",0,[{id:"ERROR",label:"Errors",description:"You should consider these issues urgent and fix them as soon as you can.",descriptionShort:"Require immediate attention"},{id:"WARN",label:"Warnings",description:"You should try and read through these issues and fix them if necessary.",descriptionShort:"To resolve only if necessary"},{id:"INFO",label:"Info",description:"You should read through these suggestions and consider implementing them.",descriptionShort:"For consideration to implement"}]])},296003,e=>{"use strict";var t=e.i(478902),i=e.i(881685),s=e.i(613851),r=e.i(543851),a=e.i(250503),n=e.i(486868),o=e.i(112176),l=e.i(455975),d=e.i(219195),c=e.i(602158),u=e.i(701087),m=e.i(659016),p=e.i(345594),x=e.i(587433),h=e.i(837710),g=e.i(772920),f=e.i(775114),b=e.i(10429);let y=[{name:"unindexed_foreign_keys",title:"Unindexed foreign keys",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/indexes?schema=${encodeURIComponent(t?.schema??"")}`,linkText:"Create an index",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0001_unindexed_foreign_keys`,category:"performance"},{name:"auth_users_exposed",title:"Exposed Auth Users",icon:(0,t.jsx)(a.Lock,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:({projectRef:e})=>`/project/${e}/editor`,linkText:"View table",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0002_auth_users_exposed`,category:"security"},{name:"auth_rls_initplan",title:"Auth RLS Initialization Plan",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/policies`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0003_auth_rls_initplan`,category:"performance"},{name:"no_primary_key",title:"No Primary Key",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/editor`,linkText:"View table",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0004_no_primary_key`,category:"performance"},{name:"unused_index",title:"Unused Index",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/indexes?schema=${encodeURIComponent(t?.schema??"")}&table=${encodeURIComponent(t?.name??"")}`,linkText:"View index",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0005_unused_index`,category:"performance"},{name:"multiple_permissive_policies",title:"Multiple Permissive Policies",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/auth/policies?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0006_multiple_permissive_policies`,category:"performance"},{name:"policy_exists_rls_disabled",title:"Policy Exists RLS Disabled",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/auth/policies?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0007_policy_exists_rls_disabled`,category:"security"},{name:"rls_enabled_no_policy",title:"RLS Enabled No Policy",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/auth/policies?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View table",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0008_rls_enabled_no_policy`,category:"security"},{name:"duplicate_index",title:"Duplicate Index",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/indexes?schema=${encodeURIComponent(t?.schema??"")}&table=${encodeURIComponent(t?.name??"")}`,linkText:"View index",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0009_duplicate_index`,category:"performance"},{name:"security_definer_view",title:"Security Definer View",icon:(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:()=>`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0010_security_definer_view`,linkText:"View docs",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0010_security_definer_view`,category:"security"},{name:"function_search_path_mutable",title:"Function Search Path Mutable",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/functions?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View functions",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0011_function_search_path_mutable`,category:"security"},{name:"auth_allow_anonymous_sign_ins",title:"Anonymous Sign-Ins Allowed",icon:(0,t.jsx)(m.User,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins`,category:"security"},{name:"rls_disabled_in_public",title:"RLS Disabled in Public",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/auth/policies?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0013_rls_disabled_in_public`,category:"security"},{name:"extension_in_public",title:"Extension in Public",icon:(0,t.jsx)(u.Unlock,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/extensions?filter=${encodeURIComponent(t?.name??"")}`,linkText:"View extension",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0014_extension_in_public`,category:"security"},{name:"auth_otp_long_expiry",title:"Auth OTP Long Expiry",icon:(0,t.jsx)(s.Clock,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/going-into-prod#security`,category:"security"},{name:"auth_otp_short_length",title:"Auth OTP Short Length",icon:(0,t.jsx)(o.Ruler,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/going-into-prod#security`,category:"security"},{name:"auth_db_connections_absolute",title:"Auth Absolute Connection Management Strategy",icon:(0,t.jsx)(l.Scaling,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/performance`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/going-into-prod`,category:"performance"},{name:"rls_references_user_metadata",title:"RLS references user metadata",icon:(0,t.jsx)(m.User,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/policies`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?queryGroups=lint&lint=0015_rls_references_user_metadata`,category:"security"},{name:"materialized_view_in_api",title:"Materialized View in API",icon:(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:()=>`${b.DOCS_URL}/guides/database/database-advisors?lint=0016_materialized_view_in_api`,linkText:"View docs",docsLink:`${b.DOCS_URL}/guides/database/database-advisors?lint=0016_materialized_view_in_api`,category:"security"},{name:"foreign_table_in_api",title:"Foreign Table in API",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:()=>`${b.DOCS_URL}/guides/database/database-linter?lint=0017_foreign_table_in_api`,linkText:"View docs",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0017_foreign_table_in_api`,category:"security"},{name:"unsupported_reg_types",title:"Unsupported reg types",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:()=>`${b.DOCS_URL}/guides/database/database-advisors?lint=0018_unsupported_reg_types&queryGroups=lint`,linkText:"View docs",docsLink:`${b.DOCS_URL}/guides/database/database-advisors?lint=0018_unsupported_reg_types&queryGroups=lint`,category:"security"},{name:"ssl_not_enforced",title:"SSL not enforced",icon:(0,t.jsx)(o.Ruler,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/database/settings`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/ssl-enforcement`,category:"security"},{name:"network_restrictions_not_set",title:"No network restrictions",icon:(0,t.jsx)(o.Ruler,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/database/settings`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/network-restrictions`,category:"security"},{name:"password_requirements_min_length",title:"Minimum password length not set or inadequate",icon:(0,t.jsx)(o.Ruler,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers?provider=Email`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/going-into-prod#security`,category:"security"},{name:"pitr_not_enabled",title:"PITR not enabled",icon:(0,t.jsx)(o.Ruler,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/database/backups/pitr`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/backups#point-in-time-recovery`,category:"security"},{name:"auth_leaked_password_protection",title:"Leaked Password Protection Disabled",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers?provider=Email`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/auth/password-security#password-strength-and-leaked-password-protection`,category:"security"},{name:"auth_insufficient_mfa_options",title:"Insufficient MFA Options",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/mfa`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/auth/auth-mfa`,category:"security"},{name:"auth_password_policy_missing",title:"Password Policy Missing",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/providers?provider=Email`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/auth/password-security`,category:"security"},{name:"leaked_service_key",title:"Leaked Service Key Detected",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/settings/api-keys`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/api/api-keys#the-servicerole-key`,category:"security"},{name:"no_backup_admin",title:"No Backup Admin Detected",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/auth/mfa`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/auth/auth-mfa`,category:"security"},{name:"vulnerable_postgres_version",title:"Postgres version has security patches available",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e})=>`/project/${e}/settings/infrastructure`,linkText:"View settings",docsLink:`${b.DOCS_URL}/guides/platform/upgrading`,category:"security"},{name:"sensitive_columns_exposed",title:"Sensitive Columns Exposed",icon:(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:({projectRef:e,metadata:t})=>`/project/${e}/editor?schema=${encodeURIComponent(t?.schema??"")}&table=${encodeURIComponent(t?.name??"")}`,linkText:"View table",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0023_sensitive_columns_exposed`,category:"security"},{name:"rls_policy_always_true",title:"RLS Policy Always True",icon:(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/auth/policies?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View policies",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0024_permissive_rls_policy`,category:"security"},{name:"public_bucket_allows_listing",title:"Public Bucket Allows Listing",icon:(0,t.jsx)(i.Box,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:({projectRef:e,metadata:t})=>{let i=t?.bucket_id;return`/project/${e}/storage/files/buckets/${encodeURIComponent(i??t?.name??"")}`},linkText:"View bucket",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0025_public_bucket_allows_listing`,category:"security"},{name:"pg_graphql_anon_table_exposed",title:"Public Can See Object in GraphQL Schema",icon:(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:({projectRef:e,metadata:t})=>`/project/${e}/editor?schema=${encodeURIComponent(t?.schema??"")}&table=${encodeURIComponent(t?.name??"")}`,linkText:"View object",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0026_pg_graphql_anon_table_exposed`,category:"security"},{name:"pg_graphql_authenticated_table_exposed",title:"Signed-In Users Can See Object in GraphQL Schema",icon:(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5}),link:({projectRef:e,metadata:t})=>`/project/${e}/editor?schema=${encodeURIComponent(t?.schema??"")}&table=${encodeURIComponent(t?.name??"")}`,linkText:"View object",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed`,category:"security"},{name:"anon_security_definer_function_executable",title:"Public Can Execute SECURITY DEFINER Function",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/functions?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View function",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0028_anon_security_definer_function_executable`,category:"security"},{name:"authenticated_security_definer_function_executable",title:"Signed-In Users Can Execute SECURITY DEFINER Function",icon:(0,t.jsx)(n.LockIcon,{className:"text-foreground-muted",size:15,strokeWidth:1}),link:({projectRef:e,metadata:t})=>`/project/${e}/database/functions?schema=${encodeURIComponent(t?.schema??"")}&search=${encodeURIComponent(t?.name??"")}`,linkText:"View function",docsLink:`${b.DOCS_URL}/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable`,category:"security"}],v=e=>{if(e){if(e.entity)return e.entity;if(e.schema&&e.name){let t="string"==typeof e.arguments?e.arguments:void 0;return`${e.schema}.${e.name}${void 0!==t?`(${t})`:""}`}}};e.s(["EntityTypeIcon",0,({type:e})=>{switch(e){case"table":return(0,t.jsx)(d.Table2,{className:"text-foreground-muted",size:15,strokeWidth:1});case"view":return(0,t.jsx)(r.Eye,{className:"text-foreground-muted",size:15,strokeWidth:1.5});case"auth":return(0,t.jsx)(a.Lock,{className:"text-foreground-muted",size:15,strokeWidth:1.5});default:return(0,t.jsx)(i.Box,{className:"text-foreground-muted",size:15,strokeWidth:1.5})}},"LintCTA",0,({title:e,projectRef:i,metadata:s,onAfterAction:r})=>{let a=y.find(t=>t.name===e);if(!a)return null;let n=(0,g.asGraphqlExposureLint)(e);if(n)return(0,t.jsx)(g.GraphqlExposureLintCTA,{lintName:n,projectRef:i,metadata:s,onAfterAction:r});let o=a.link({projectRef:i,metadata:s}),l=a.linkText;return(0,t.jsx)(h.Button,{asChild:!0,type:"default",children:(0,t.jsx)(p.default,{href:o,rel:"noreferrer",className:"no-underline",children:l})})},"LintCategoryBadge",0,({category:e})=>(0,t.jsx)(x.Badge,{variant:"SECURITY"===e?"destructive":"warning",children:e.toLowerCase()}),"LintEntity",0,({metadata:e})=>v(e),"NoIssuesFound",0,({level:e})=>{let i=e===f.LINTER_LEVELS.ERROR?"errors":"warnings";return(0,t.jsxs)("div",{className:"absolute top-28 px-6 flex flex-col items-center justify-center w-full gap-y-2",children:[(0,t.jsx)(c.TextSearch,{className:"text-foreground-muted",strokeWidth:1}),(0,t.jsxs)("div",{className:"text-center",children:[(0,t.jsxs)("p",{className:"text-foreground",children:["No ",i," detected"]}),(0,t.jsxs)("p",{className:"text-foreground-light",children:["Congrats! There are no ",i," detected for this database"]})]})]})},"createLintSummaryPrompt",0,e=>{let t=y.find(t=>t.name===e.name)?.title??e.title,i=v(e.metadata)||"N/A",s=e.metadata?.schema??"N/A",r=e.detail?e.detail.replace(/\\`/g,"`"):"N/A",a=e.description?e.description.replace(/\\`/g,"`"):"N/A";return`Summarize the issue and suggest fixes for the following lint item:
Title: ${t}
Entity: ${i}
Schema: ${s}
Issue Details: ${r}
Description: ${a}`},"lintInfoMap",0,y])},869679,e=>{"use strict";var t=e.i(478902),i=e.i(17203),s=e.i(345594),r=e.i(837710),a=e.i(592383),n=e.i(772920),o=e.i(296003),l=e.i(215618),d=e.i(867987),c=e.i(10429),u=e.i(967052),m=e.i(317040),p=e.i(441081);e.s(["LintDetail",0,({lint:e,projectRef:x,onAskAssistant:h,onAfterAction:g})=>{let f=(0,u.useTrack)(),b=(0,m.useAiAssistantStateSnapshot)(),{openSidebar:y}=(0,p.useSidebarManagerSnapshot)(),v=!!(0,n.asGraphqlExposureLint)(e.name);return(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Entity"}),(0,t.jsxs)("div",{className:"flex items-center gap-1 px-2 py-0.5 bg-surface-200 border rounded-lg text-sm mb-6 w-fit",children:[(0,t.jsx)(o.EntityTypeIcon,{type:e.metadata?.type}),(0,t.jsx)(o.LintEntity,{metadata:e.metadata})]}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Issue"}),(0,t.jsx)(a.Markdown,{className:"leading-6 text-sm text-foreground-light mb-6",children:e.detail.replace(/\\`/g,"`")}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Description"}),(0,t.jsx)(a.Markdown,{className:"text-sm text-foreground-light mb-6",children:e.description.replace(/\\`/g,"`")}),v&&(0,t.jsx)("div",{className:"mb-4",children:(0,t.jsx)(n.GraphqlExposureCallout,{projectRef:x})}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Resolve"}),(0,t.jsxs)("div",{className:"flex flex-wrap items-center gap-2",children:[(0,t.jsx)(d.AiAssistantDropdown,{label:"Ask Assistant",buildPrompt:()=>(0,o.createLintSummaryPrompt)(e),onOpenAssistant:()=>{f("advisor_assistant_button_clicked",{origin:"lint_detail",advisorCategory:e.categories[0],advisorType:e.name,advisorLevel:e.level}),h?.(),y(l.SIDEBAR_KEYS.AI_ASSISTANT),b.newChat({name:"Summarize lint",initialMessage:(0,o.createLintSummaryPrompt)(e)})},telemetrySource:"lint_detail"}),(0,t.jsx)(o.LintCTA,{title:e.name,projectRef:x,metadata:e.metadata,onAfterAction:g}),(0,t.jsx)(r.Button,{asChild:!0,type:"text",children:(0,t.jsx)(s.default,{href:o.lintInfoMap.find(t=>t.name===e.name)?.docsLink||`${c.DOCS_URL}/guides/database/database-linter`,target:"_blank",rel:"noreferrer",className:"no-underline",children:(0,t.jsxs)("span",{className:"flex items-center gap-2",children:["Learn more ",(0,t.jsx)(i.ExternalLink,{size:14})]})})})]})]})}])},421549,e=>{"use strict";let t=(0,e.i(388019).default)("Archive",[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",key:"1s80jp"}],["path",{d:"M10 12h4",key:"a56b0p"}]]);e.s(["Archive",0,t],421549)},230052,792714,e=>{"use strict";var t=e.i(991435),i=e.i(416785);let s={activeTab:"all",severityFilters:["critical","warning"],selectedItemId:void 0,selectedItemSource:void 0,notificationFilterStatuses:[],notificationFilterPriorities:[],get numNotificationFiltersApplied(){return[...this.notificationFilterStatuses,...this.notificationFilterPriorities].length}},r=(0,t.proxy)({...s,setActiveTab(e){r.activeTab=e},setSeverityFilters(e){r.severityFilters=e},clearSeverityFilters(){r.severityFilters=[]},setSelectedItem(e,t){r.selectedItemId=e,r.selectedItemSource=t},focusItem({id:e,tab:t,source:i}){t&&(r.activeTab=t),r.selectedItemId=e,r.selectedItemSource=i},setNotificationFilters:(e,t)=>{switch(t){case"status":r.notificationFilterStatuses.includes(e)?r.notificationFilterStatuses=r.notificationFilterStatuses.filter(t=>t!==e):r.notificationFilterStatuses=r.notificationFilterStatuses.concat([e]);break;case"priority":r.notificationFilterPriorities.includes(e)?r.notificationFilterPriorities=r.notificationFilterPriorities.filter(t=>t!==e):r.notificationFilterPriorities=r.notificationFilterPriorities.concat([e])}},resetNotificationFilters(){r.notificationFilterStatuses=[],r.notificationFilterPriorities=[]},reset(){Object.assign(r,s)}});e.s(["useAdvisorStateSnapshot",0,e=>(0,i.useSnapshot)(r,e)],230052);var a=e.i(55956);let n=(0,e.i(388019).default)("Gauge",[["path",{d:"m12 14 4-4",key:"9kzdfg"}],["path",{d:"M3.34 19a10 10 0 1 1 17.32 0",key:"19p75a"}]]);var o=e.i(968675),l=e.i(857889),d=e.i(296003);let c={critical:0,warning:1,info:2},u=e=>"lint"===e.source?d.lintInfoMap.find(t=>t.name===e.original.name)?.title||e.title.replace(/[`\\]/g,""):"signal"===e.source?`${e.title}`:e.title.replace(/[`\\]/g,""),m={security:l.Shield,performance:n,messages:o.Inbox};e.s(["MAX_HOMEPAGE_ADVISOR_ITEMS",0,4,"createAdvisorLintItems",0,e=>e?e.map(e=>{let t=e.categories||[],i=t.includes("SECURITY")?"security":t.includes("PERFORMANCE")?"performance":void 0;return i?{id:e.cache_key,title:e.detail,severity:(e=>{switch(e){case"ERROR":return"critical";case"WARN":return"warning";default:return"info"}})(e.level),createdAt:void 0,tab:i,source:"lint",original:e}:null}).filter(e=>null!==e):[],"createAdvisorNotificationItems",0,e=>e?e.map(e=>{let t=e.data;return{id:e.id,title:t.title,severity:(e=>{switch(e){case"Critical":return"critical";case"Warning":return"warning";default:return"info"}})(e.priority),createdAt:(0,a.default)(e.inserted_at).valueOf(),tab:"messages",source:"notification",original:e}}):[],"formatItemDate",0,e=>{let t=(0,a.default)().diff((0,a.default)(e),"day"),i=(0,a.default)(e).fromNow(),s=(0,a.default)(e).format("MMM DD, YYYY");return t>1?s:i},"getAdvisorItemDisplayTitle",0,u,"getAdvisorItemSecondaryText",0,e=>"lint"===e.source?(e=>{if(e?.metadata){if(e.metadata.entity)return e.metadata.entity;if(e.metadata.schema&&e.metadata.name){let t=e.metadata,i="string"==typeof t.arguments?t.arguments:void 0;return`${e.metadata.schema}.${e.metadata.name}${void 0!==i?`(${i})`:""}`}}})(e.original):"signal"===e.source?`Database \xb7 ${e.sourceData.ip}`:void 0,"getAdvisorPanelItemDisplayTitle",0,e=>"signal"===e.source?e.title:u(e),"severityBadgeVariants",0,{critical:"destructive",warning:"warning",info:"default"},"severityColorClasses",0,{critical:"text-destructive",warning:"text-warning",info:"text-foreground-light"},"severityLabels",0,{critical:"Critical",warning:"Warning",info:"Info"},"sortAdvisorItems",0,e=>[...e].sort((e,t)=>{let i=c[e.severity]-c[t.severity];if(0!==i)return i;let s=(t.createdAt??0)-(e.createdAt??0);return 0!==s?s:u(e).localeCompare(u(t))}),"tabIconMap",0,m],792714)},317928,e=>{"use strict";var t=e.i(478902),i=e.i(389959),s=e.i(802715);e.i(128328);var r=e.i(158639),a=e.i(890054),n=e.i(909410),o=e.i(345594),l=e.i(837710),d=e.i(613580),c=e.i(843429),u=e.i(215618),m=e.i(867987),p=e.i(937942),x=e.i(230052),h=e.i(317040),g=e.i(441081);let f=e=>[`I'm reviewing an Advisor signal for a banned IP address: ${e.sourceData.ip}.`,e.description??e.summary,"Help me assess whether this ban should remain in place, what I should investigate before removing it, and what the safest next step is.","Please include when it is reasonable to dismiss this signal versus remove the ban."].join("\n\n"),b=({item:e})=>{let{ref:i}=(0,r.useParams)(),s=(0,h.useAiAssistantStateSnapshot)(),{openSidebar:b}=(0,g.useSidebarManagerSnapshot)(),{setSelectedItem:y}=(0,x.useAdvisorStateSnapshot)(),{dismissSignal:v}=(0,c.useAdvisorSignals)({projectRef:i}),_=(0,t.jsxs)(t.Fragment,{children:["The IP address ",(0,t.jsx)("code",{className:"text-code-inline",children:e.sourceData.ip})," is temporarily blocked because of suspicious traffic or repeated failed password attempts. If this block is expected, you can dismiss this signal or remove the ban."]});return(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Entity"}),(0,t.jsxs)(d.Tooltip,{children:[(0,t.jsx)(d.TooltipTrigger,{asChild:!0,children:(0,t.jsxs)("div",{className:"flex items-center gap-2 px-2 py-0.5 bg-surface-200 border rounded-lg text-sm mb-6 w-fit",children:[(0,t.jsx)("span",{className:"flex items-center text-foreground-muted","aria-hidden":"true",children:(0,t.jsx)(n.Globe,{size:15,className:"text-foreground-muted"})}),(0,t.jsx)("span",{children:e.sourceData.ip})]})}),(0,t.jsx)(d.TooltipContent,{side:"bottom",children:"IP address currently blocked by network bans"})]}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Issue"}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light mb-6",children:[_," ",void 0!==e.docsUrl&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(p.InlineLink,{href:e.docsUrl,children:"Learn more"}),"."]})]}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Resolve"}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(m.AiAssistantDropdown,{label:"Ask Assistant",buildPrompt:()=>f(e),onOpenAssistant:()=>{b(u.SIDEBAR_KEYS.AI_ASSISTANT),s.newChat({name:`Review ${e.title.toLowerCase()}`,initialInput:f(e)})},telemetrySource:"advisor_signal_detail"}),e.actions.map(i=>(0,t.jsx)(l.Button,{type:"default",asChild:!0,children:(0,t.jsx)(o.default,{href:i.href,children:(0,t.jsx)("span",{className:"flex items-center gap-2",children:i.label})})},`${e.dismissalKey}-${i.href}`)),(0,t.jsx)(l.Button,{type:"default",icon:(0,t.jsx)(a.EyeOff,{size:14,strokeWidth:1.5}),onClick:()=>{v(e.dismissalKey),y(void 0)},children:"Dismiss"})]})]})};var y=e.i(421549);let v=(0,e.i(388019).default)("ArchiveRestore",[["rect",{width:"20",height:"5",x:"2",y:"3",rx:"1",key:"1wp1u1"}],["path",{d:"M4 8v11a2 2 0 0 0 2 2h2",key:"tvwodi"}],["path",{d:"M20 8v11a2 2 0 0 1-2 2h-2",key:"1gkqxj"}],["path",{d:"m9 15 3-3 3 3",key:"1pd0qc"}],["path",{d:"M12 12v9",key:"192myk"}]]);var _=e.i(17203),j=e.i(592383),k=e.i(811025),w=e.i(164045);let N=({notification:e,onUpdateStatus:i})=>{let s=e.data,{data:r}=(0,w.useProjectDetailQuery)({ref:s.project_ref}),{data:a}=(0,k.useOrganizationsQuery)(),n=void 0!==s.org_slug?a?.find(e=>e.slug===s.org_slug):void 0!==r?a?.find(e=>e.id===r.organization_id):void 0;return(0,t.jsxs)("div",{children:[(void 0!==r||void 0!==n)&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Context"}),(0,t.jsxs)("div",{className:"flex items-center gap-2 flex-wrap mb-6",children:[void 0!==n&&(0,t.jsx)(o.default,{title:n.name,href:`/org/${n.slug}/general`,className:"text-link",children:n.name}),void 0!==r&&(0,t.jsx)(o.default,{title:r.name,href:`/project/${r.ref}`,className:"text-link",children:r.name})]})]}),void 0!==s.message&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Message"}),(0,t.jsx)(j.Markdown,{className:"leading-6 text-sm text-foreground-light mb-6",content:s.message})]}),(0,t.jsx)("h3",{className:"text-sm mb-2",children:"Actions"}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(s.actions??[]).map((i,s)=>{let a=`${e.id}-action-${s}`;if(void 0!==i.url){let e=i.url.includes("[ref]")?i.url.replace("[ref]",r?.ref??"_"):i.url.includes("[slug]")?i.url.replace("[slug]",n?.slug??"_"):i.url;return(0,t.jsx)(l.Button,{type:"default",icon:(0,t.jsx)(_.ExternalLink,{strokeWidth:1.5}),asChild:!0,children:(0,t.jsx)(o.default,{href:e,target:"_blank",rel:"noreferrer",children:i.label})},a)}return void 0!==i.action_type?(0,t.jsx)(l.Button,{type:"default",onClick:()=>{console.log("Action",i.action_type)},children:i.label},a):null}),"archived"===e.status?(0,t.jsx)(l.Button,{type:"default",icon:(0,t.jsx)(v,{size:14,strokeWidth:1.5}),onClick:()=>i(e.id,"seen"),children:"Unarchive"}):(0,t.jsx)(l.Button,{type:"default",icon:(0,t.jsx)(y.Archive,{size:14,strokeWidth:1.5}),onClick:()=>i(e.id,"archived"),children:"Archive"})]})]})};var S=e.i(869679);let C=({item:e,projectRef:i,onUpdateNotificationStatus:r=s.default,onAfterLintAction:a})=>{if("lint"===e.source){let s=e.original;return(0,t.jsx)("div",{className:"px-6 py-6",children:(0,t.jsx)(S.LintDetail,{lint:s,projectRef:i,onAfterAction:a})})}if("signal"===e.source)return(0,t.jsx)("div",{className:"px-6 py-6",children:(0,t.jsx)(b,{item:e})});if("notification"===e.source){let i=e.original;return(0,t.jsx)("div",{className:"px-6 py-6",children:(0,t.jsx)(N,{notification:i,onUpdateStatus:r})})}return null};var T=e.i(975924),L=e.i(500850),I=e.i(314805),R=e.i(408279),$=e.i(215312),A=e.i(830495);let E=[{label:"Critical",value:"critical"},{label:"Warning",value:"warning"},{label:"Info",value:"info"}],z=[{label:"Unread",value:"unread"},{label:"Archived",value:"archived"}],D=({activeTab:e,onTabChange:i,severityFilters:s,onSeverityFiltersChange:r,statusFilters:a,onStatusFiltersChange:n,onClose:o,isPlatform:l=!1})=>(0,t.jsx)("div",{className:"border-b overflow-x-auto",children:(0,t.jsxs)("div",{className:"flex items-center justify-between gap-x-4 h-[calc(var(--header-height)-1px)]",children:[(0,t.jsx)(L.Tabs_Shadcn_,{value:e,onValueChange:i,className:"h-full pl-4",children:(0,t.jsxs)(I.TabsList_Shadcn_,{className:"border-b-0 gap-4 h-full",children:[(0,t.jsx)(R.TabsTrigger_Shadcn_,{value:"all",className:"h-full text-xs",children:"All"}),(0,t.jsx)(R.TabsTrigger_Shadcn_,{value:"security",className:"h-full text-xs",children:"Security"}),(0,t.jsx)(R.TabsTrigger_Shadcn_,{value:"performance",className:"h-full text-xs",children:"Performance"}),l&&(0,t.jsx)(R.TabsTrigger_Shadcn_,{value:"messages",className:"h-full text-xs flex items-center gap-2",children:"Messages"})]})}),(0,t.jsxs)("div",{className:"flex items-center gap-x-2 pr-3",children:[l&&(0,t.jsx)(A.FilterPopover,{name:"Status",options:z,activeOptions:[...a],valueKey:"value",labelKey:"label",isMinimized:!0,onSaveFilters:n}),(0,t.jsx)(A.FilterPopover,{name:"Severity",options:E,activeOptions:[...s],valueKey:"value",labelKey:"label",isMinimized:!0,onSaveFilters:e=>{r(e)}}),(0,t.jsx)($.ButtonTooltip,{type:"text",className:"w-7 h-7 p-0",icon:(0,t.jsx)(T.X,{strokeWidth:1.5}),onClick:o,tooltip:{content:{side:"bottom",text:"Close Advisor Center"}}})]})]})});var O=e.i(792714),P=e.i(217444),U=e.i(416050),F=e.i(968675),M=e.i(587433),W=e.i(843778),q=e.i(108151),B=e.i(602158);let V=({activeTab:e,hasFilters:i,onClearFilters:s})=>(0,t.jsxs)("div",{className:"h-full px-6 flex flex-col items-center justify-center w-full gap-y-2",children:[(0,t.jsx)(B.TextSearch,{className:"text-foreground-muted",strokeWidth:1}),(0,t.jsxs)("div",{className:"flex flex-col items-center gap-y-0.5 text-center",children:[(0,t.jsx)("h3",{className:"heading-default",children:(()=>{if(i)return"No items found";switch(e){case"security":return"No security issues detected";case"performance":return"No performance issues detected";case"messages":return"No messages";default:return"No issues detected"}})()}),(0,t.jsx)("p",{className:"text-foreground-light text-sm text-balance",children:(()=>{if(i)return"No advisor items match your current filters";switch(e){case"security":return"Congrats! There are no security issues detected for this project";case"performance":return"Congrats! There are no performance issues detected for this project";case"messages":return"Messages alert you of upcoming changes or potential issues with your project";default:return"Congrats! There are no issues detected"}})()})]}),i&&(0,t.jsx)(l.Button,{type:"outline",onClick:s,children:"Clear filters"})]}),G=()=>(0,t.jsxs)("div",{className:"absolute top-28 px-6 flex flex-col items-center justify-center w-full gap-y-2",children:[(0,t.jsx)(F.Inbox,{className:"text-foreground-muted",strokeWidth:1}),(0,t.jsxs)("div",{className:"text-center",children:[(0,t.jsx)("p",{className:"heading-default",children:"Project required"}),(0,t.jsx)("p",{className:"text-foreground-light text-sm",children:"Select a project to view security and performance advisories"})]})]}),Q=({isLoading:e,isError:i,filteredItems:s,activeTab:r,severityFilters:a,onItemClick:n,onClearFilters:o,hiddenItemsCount:d,hasAnyFilters:c,hasProjectRef:u=!0})=>u||"messages"===r||"all"===r?e?(0,t.jsx)("div",{children:(0,t.jsx)(q.GenericSkeletonLoader,{className:"w-full p-4"})}):i?(0,t.jsxs)("div",{className:"h-full mx-4 flex flex-col items-center justify-center gap-y-2",children:[(0,t.jsx)(P.AlertTriangle,{className:"text-destructive"}),(0,t.jsxs)("div",{className:"flex flex-col items-center justify-center",children:[(0,t.jsx)("h4",{className:"text-base font-normal text-foreground-light",children:"Error loading advisories"}),(0,t.jsx)("p",{className:"text-sm text-foreground-lighter",children:"Please try again later."})]})]}):0===s.length?(0,t.jsx)(V,{activeTab:r,hasFilters:c,onClearFilters:o}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"flex flex-col",children:s.map(e=>{let i=O.tabIconMap[e.tab],s=O.severityColorClasses[e.severity],r="notification"===e.source?e.original:null,a=r?.status==="new",o=(0,O.getAdvisorPanelItemDisplayTitle)(e),d=(0,O.getAdvisorItemSecondaryText)(e),c=d??(e.createdAt?(0,O.formatItemDate)(e.createdAt):void 0),u=void 0===d&&void 0!==e.createdAt;return(0,t.jsx)("div",{className:"border-b",children:(0,t.jsx)(l.Button,{type:"text",className:(0,W.cn)("justify-start w-full block rounded-none h-auto py-3 px-4 hover:text-foreground",a&&"bg-surface-100/50"),onClick:()=>n(e),children:(0,t.jsxs)("div",{className:"flex items-center justify-between gap-2",children:[(0,t.jsxs)("div",{className:"flex items-center gap-3 overflow-hidden",children:[(0,t.jsx)(i,{size:16,strokeWidth:1.5,className:(0,W.cn)("shrink-0",s)}),(0,t.jsxs)("div",{className:"text-left flex flex-col gap-0.5 truncate flex-1 min-w-0",children:[(0,t.jsx)("div",{className:"truncate",children:o}),c&&(0,t.jsx)("div",{className:"flex items-center gap-1 text-xs text-foreground-light",children:(0,t.jsx)("span",{className:(0,W.cn)("truncate",u&&"capitalize-sentence"),children:c})})]})]}),(0,t.jsxs)("div",{className:"flex items-center gap-2 shrink-0",children:["critical"===e.severity&&(0,t.jsx)(M.Badge,{variant:O.severityBadgeVariants[e.severity],children:O.severityLabels[e.severity]}),(0,t.jsx)(U.ChevronRight,{size:16,strokeWidth:1.5,className:"shrink-0 text-foreground-lighter"})]})]})})},`${e.source}-${e.id}`)})}),a.length>0&&d>0&&(0,t.jsx)("div",{className:"px-4 py-3",children:(0,t.jsxs)(l.Button,{type:"text",className:"w-full",onClick:o,children:["Show ",d," more issue",1!==d?"s":""]})})]}):(0,t.jsx)(G,{});var Y=e.i(954676);let K=({selectedItem:e,onBack:i,onClose:s})=>{let r=e?(0,O.getAdvisorPanelItemDisplayTitle)(e):void 0,a=e?(0,O.getAdvisorItemSecondaryText)(e):void 0,n=e?a??(e.createdAt?(0,O.formatItemDate)(e.createdAt):void 0):void 0,o=void 0!==e&&void 0===a&&void 0!==e.createdAt;return(0,t.jsxs)("div",{className:"border-b px-4 py-3 flex items-center gap-3",children:[(0,t.jsx)($.ButtonTooltip,{type:"text",className:"w-7 h-7 p-0 flex justify-center items-center",icon:(0,t.jsx)(Y.ChevronLeft,{size:16,strokeWidth:1.5,"aria-hidden":!0}),onClick:i,tooltip:{content:{side:"bottom",text:"Back to list"}}}),(0,t.jsxs)("div",{className:"flex items-center gap-2 overflow-hidden flex-1",children:[(0,t.jsxs)("div",{className:"flex-1 flex flex-col",children:[(0,t.jsx)("span",{className:"heading-default",children:r}),n&&(0,t.jsx)("span",{className:`text-xs text-foreground-light${o?" capitalize-sentence":""}`,children:n})]}),e&&(0,t.jsx)(M.Badge,{variant:O.severityBadgeVariants[e.severity],children:O.severityLabels[e.severity]})]}),(0,t.jsx)($.ButtonTooltip,{type:"text",className:"w-7 h-7 p-0",icon:(0,t.jsx)(T.X,{strokeWidth:1.5}),onClick:s,tooltip:{content:{side:"bottom",text:"Close Advisor Center"}}})]})};var H=e.i(438824),X=e.i(915094),Z=e.i(38429),J=e.i(356003),ee=e.i(355901),et=e.i(234745);async function ei({ids:e,status:t}){let{data:i,error:s}=await (0,et.patch)("/platform/notifications",{body:e.map(e=>({id:e,status:t})),headers:{Version:"2"}});return s&&(0,et.handleError)(s),i}var es=e.i(635494),er=e.i(10429),ea=e.i(967052);e.s(["AdvisorPanel",0,()=>{let e=(0,ea.useTrack)(),{activeTab:s,severityFilters:r,selectedItemId:a,selectedItemSource:n,setActiveTab:o,setSeverityFilters:l,clearSeverityFilters:d,setSelectedItem:m,notificationFilterStatuses:p,notificationFilterPriorities:h,setNotificationFilters:f,resetNotificationFilters:b}=(0,x.useAdvisorStateSnapshot)(),{data:y}=(0,es.useSelectedProjectQuery)(),{activeSidebar:v,closeSidebar:_}=(0,g.useSidebarManagerSnapshot)(),j=v?.id===u.SIDEBAR_KEYS.ADVISOR_PANEL,k=(0,i.useRef)([]),w=!!y?.ref,N=j&&w&&"messages"!==s,{data:S,isPending:T,isError:L}=(0,H.useProjectLintsQuery)({projectRef:y?.ref},{enabled:N}),{data:I}=(0,c.useAdvisorSignals)({projectRef:y?.ref,enabled:N}),R=j&&er.IS_PLATFORM,$=(0,i.useMemo)(()=>p.includes("archived")?"archived":p.includes("unread")?"new":void 0,[p]),A=(0,i.useMemo)(()=>({priority:h}),[h]),{data:E,isPending:z,isError:P}=(0,X.useNotificationsV2Query)({status:$,filters:A,limit:20},{enabled:R}),{mutate:U}=(({onSuccess:e,onError:t,...i}={})=>{let s=(0,J.useQueryClient)();return(0,Z.useMutation)({mutationFn:e=>ei(e),async onSuccess(t,i,r){await s.invalidateQueries({queryKey:["notifications"]}),await e?.(t,i,r)},async onError(e,i,s){void 0===t?ee.toast.error(`Failed to update notifications: ${e.message}`):t(e,i,s)},...i})})(),F=(0,i.useMemo)(()=>E?.pages.flatMap(e=>e)??[],[E?.pages]),M=()=>{k.current.length>0&&U({ids:k.current,status:"seen"})},W=(0,i.useMemo)(()=>(0,O.createAdvisorLintItems)(S??[]),[S]),q=(0,i.useMemo)(()=>er.IS_PLATFORM?(0,O.createAdvisorNotificationItems)(F):[],[F]),B=(0,i.useMemo)(()=>(0,O.sortAdvisorItems)([...W,...I,...q]),[W,I,q]),V=(0,i.useMemo)(()=>B.filter(e=>(!(r.length>0)||!!r.includes(e.severity))&&("all"===s?!!w||"notification"===e.source:e.tab===s)),[B,r,s,w]),G=(0,i.useMemo)(()=>B.filter(e=>"all"===s?!!w||"notification"===e.source:e.tab===s),[B,s,w]).length-V.length,Y=B.find(e=>e.id===a&&e.source===n),et=!!Y,en=N&&T,eo=()=>{m(void 0),M()},el=()=>{M(),_(u.SIDEBAR_KEYS.ADVISOR_PANEL)},ed=r.length>0||p.length>0;return(0,t.jsx)("div",{className:"flex h-full flex-col bg-background",children:et?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(K,{selectedItem:Y,onBack:eo,onClose:el}),(0,t.jsx)("div",{className:"flex-1 overflow-y-auto",children:Y?(0,t.jsx)(C,{item:Y,projectRef:y?.ref??"",onUpdateNotificationStatus:(e,t)=>{U({ids:[e],status:t})},onAfterLintAction:eo}):(0,t.jsx)("div",{className:"px-6 py-8",children:(0,t.jsx)("p",{className:"text-sm text-foreground-light",children:"Select an advisor item to view more details."})})})]}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(D,{activeTab:s,onTabChange:e=>{o(e),m(void 0)},severityFilters:[...r],onSeverityFiltersChange:l,statusFilters:[...p],onStatusFiltersChange:e=>{p.filter(t=>!e.includes(t)).forEach(e=>f(e,"status")),e.filter(e=>!p.includes(e)).forEach(e=>f(e,"status"))},onClose:el,isPlatform:er.IS_PLATFORM}),(0,t.jsx)("div",{className:"flex-1 overflow-y-auto",children:(0,t.jsx)(Q,{isLoading:en||R&&z,isError:L||P,filteredItems:V,activeTab:s,severityFilters:[...r],onItemClick:t=>{if(m(t.id,t.source),"notification"===t.source){let e=t.original;"new"!==e.status||k.current.includes(e.id)||k.current.push(e.id)}let i="lint"===t.source?t.original.categories.includes("SECURITY")?"SECURITY":t.original.categories.includes("PERFORMANCE")?"PERFORMANCE":void 0:"signal"===t.source?"SECURITY":void 0,s="signal"===t.source?t.type:"lint"===t.source?t.original.name:t.title,r="lint"===t.source?t.original.level:void 0;e("advisor_detail_opened",{origin:"advisor_panel",advisorCategory:i,advisorSource:t.source,advisorType:s,advisorLevel:r})},onClearFilters:()=>{d(),b()},hiddenItemsCount:G,hasAnyFilters:ed,hasProjectRef:w})})]})})}],317928)},562380,e=>{e.n(e.i(317928))}]);