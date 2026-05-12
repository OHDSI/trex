(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,236134,e=>{"use strict";var t=e.i(478902),r=e.i(162361),a=e.i(837710),i=e.i(613580),o=e.i(938933);let n=({id:e,disabled:n,className:s,children:l,header:d,visible:c,open:u,size:p="medium",loading:g,align:m="right",hideFooter:x=!1,customFooter:f,onConfirm:b,onCancel:h,confirmText:y="Confirm",cancelText:v="Cancel",triggerElement:w,defaultOpen:_,tooltip:j,...S})=>{let C=(0,o.default)("sidepanel"),T=f||(0,t.jsxs)("div",{className:C.footer,children:[(0,t.jsx)("div",{children:(0,t.jsx)(a.Button,{disabled:g,type:"default",onClick:()=>h?h():null,children:v})}),!!b&&(0,t.jsxs)(i.Tooltip,{children:[(0,t.jsx)(i.TooltipTrigger,{asChild:!0,children:(0,t.jsx)("span",{className:"inline-block",children:(0,t.jsx)(a.Button,{htmlType:"submit",disabled:n||g,loading:g,onClick:b,children:y})})}),void 0!==j&&(0,t.jsx)(i.TooltipContent,{side:"bottom",children:j})]})]});u=u||c;let{onOpenAutoFocus:D,onCloseAutoFocus:k,onEscapeKeyDown:z,onPointerDownOutside:N,onInteractOutside:P}=S;return(0,t.jsxs)(r.Dialog.Root,{open:u,onOpenChange:function(e){void 0!==c&&!e&&h&&h()},defaultOpen:_,children:[w&&(0,t.jsx)(r.Dialog.Trigger,{asChild:!0,children:w}),(0,t.jsxs)(r.Dialog.Portal,{children:[(0,t.jsx)(r.Dialog.Overlay,{className:C.overlay}),(0,t.jsxs)(r.Dialog.Content,{className:[C.base,C.size[p],C.align[m],s&&s].join(" "),onOpenAutoFocus:D,onCloseAutoFocus:k,onEscapeKeyDown:z,onPointerDownOutside:N,onInteractOutside:e=>{e.target?.closest("#toast")&&e.preventDefault(),P&&P(e)},...S,children:[d&&(0,t.jsx)("header",{className:C.header,children:d}),(0,t.jsx)("div",{className:C.contents,children:l}),!x&&T]})]})]})};n.Content=function({children:e,className:r}){let a=(0,o.default)("sidepanel");return(0,t.jsx)("div",{className:[a.content,r].join(" ").trim(),children:e})},n.Separator=function(){let e=(0,o.default)("sidepanel");return(0,t.jsx)("div",{className:e.separator})},e.s(["default",0,n])},539013,e=>{"use strict";var t=e.i(236134);e.s(["SidePanel",()=>t.default])},378277,e=>{"use strict";var t=e.i(348481);e.s(["Input_Shadcn_",()=>t.Input])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},a={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},i={accordion:{variants:{default:{base:`
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
    `}};e.s(["default",0,i],305551);let o=(0,t.createContext)({theme:i});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(o);return r||(r=i.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),a=e.i(389959),i=e.i(843778),o=e.i(375761),n=e.i(231665),s=e.i(938933);let l=(0,a.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:p,iconContainerClassName:g,containerClassName:m,size:x="small",...f},b)=>{let[h,y]=(0,a.useState)("Copy"),[v,w]=(0,a.useState)(!0),_=(0,s.default)("input"),j=[];return x&&j.push(_.size[x]),(0,t.jsxs)(n.InputGroup,{className:m,children:[(0,t.jsx)(n.InputGroupInput,{ref:b,onFocus:e=>e.target.select(),...f,size:x,onCopy:p,type:c&&v?"password":f.type,disabled:f.disabled,className:(0,i.cn)(...j,f.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(n.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(n.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&v)?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",className:(0,i.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=f.value,void(0,o.copyToClipboard)(e,()=>{y("Copied"),setTimeout(function(){y("Copy")},3e3),p?.()})},children:h}):null,c&&v?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},466472,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(837710),i=e.i(843778),o=e.i(253214),n=e.i(710483);let s=(0,r.forwardRef)(({title:e,description:s,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:p,cancelLabel:g="Cancel",confirmLabel:m="Submit",confirmLabelLoading:x,alert:f,children:b,variant:h="default",disabled:y,className:v,...w},_)=>{let[j,S]=(0,r.useState)(void 0!==p&&p);(0,r.useEffect)(()=>{d&&void 0===p&&S(!1)},[d]),(0,r.useEffect)(()=>{void 0!==p&&S(p)},[p]);let{title:C,children:T,...D}=f?.base??{},k=f?.title?{label:f.title}:{};return(0,t.jsx)(o.Dialog,{open:d,...w,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(o.DialogContent,{"aria-describedby":void 0,ref:_,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,t.jsxs)(o.DialogHeader,{className:(0,i.cn)("border-b"),padding:"small",children:[(0,t.jsx)(o.DialogTitle,{children:e}),s&&(0,t.jsx)(o.DialogDescription,{children:s})]}),f&&(0,t.jsx)(n.Admonition,{type:h,description:f.description,...k,className:"border-x-0 rounded-none -mt-px",...D}),b&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(o.DialogSection,{padding:"small",className:v,children:b}),(0,t.jsx)(o.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(a.Button,{size:"medium",block:!0,type:"default",disabled:j,onClick:()=>c(),children:g}),(0,t.jsx)(a.Button,{block:!0,size:"medium",type:"destructive"===h?"danger":"warning"===h?"warning":"primary",htmlType:"submit",loading:j,disabled:j||y,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===p&&S(!0)},className:"truncate",children:j&&x?x:m})]})]})})});s.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,s,"default",0,s])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},228027,e=>{"use strict";var t=e.i(478902),r=e.i(766181),a=e.i(843778);let i=(0,r.cva)(["pt-12 last:pb-12 gap-6"],{variants:{orientation:{horizontal:"grid @3xl:grid-cols-[1fr_2fr] @3xl:gap-12",vertical:"flex flex-col"}},defaultVariants:{orientation:"vertical"}}),o=({className:e,orientation:r="vertical",children:o,...n})=>(0,t.jsx)("div",{"data-slot":"page-section","data-orientation":r,className:(0,a.cn)(i({orientation:r}),e),...n,children:o});o.displayName="PageSectionRoot";let n=({className:e,children:r,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-summary",className:(0,a.cn)("flex flex-col gap-1",e),...i,children:r});n.displayName="PageSectionSummary";let s=({className:e,children:r,...i})=>(0,t.jsx)("h2",{"data-slot":"page-section-title",className:(0,a.cn)("heading-section",e),...i,children:r});s.displayName="PageSectionTitle";let l=({className:e,children:r,...i})=>(0,t.jsx)("div",{"data-slot":"page-section-description",className:(0,a.cn)("text-sm text-foreground-light",e),style:{textBoxTrim:"trim-end"},...i,children:r});l.displayName="PageSectionDescription";let d=({className:e,...r})=>(0,t.jsx)("div",{"data-slot":"page-section-aside",className:(0,a.cn)("flex items-center gap-2","@xl:self-end",e),...r});d.displayName="PageSectionAside";let c=({className:e,children:r,...i})=>(0,t.jsx)("div",{className:"@container",children:(0,t.jsx)("div",{"data-slot":"page-section-meta",className:(0,a.cn)("flex flex-col @xl:flex-row @xl:justify-between @xl:items-center gap-4",'*:data-[slot="page-section-summary"]:flex-1','*:data-[slot="page-section-summary"]:@xl:self-center','*:data-[slot="page-section-aside"]:shrink-0',e),...i,children:r})});c.displayName="PageSectionMeta";let u=({className:e,...r})=>(0,t.jsx)("div",{"data-slot":"page-section-content",className:(0,a.cn)(e),...r});u.displayName="PageSectionContent",e.s(["PageSection",0,o,"PageSectionAside",0,d,"PageSectionContent",0,u,"PageSectionDescription",0,l,"PageSectionMeta",0,c,"PageSectionSummary",0,n,"PageSectionTitle",0,s])},271332,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778),i=e.i(837710),o=e.i(253214);let n=(0,r.forwardRef)(({children:e,customFooter:n,description:s,hideFooter:l=!1,alignFooter:d="left",layout:c="horizontal",loading:u=!1,cancelText:p="Cancel",onConfirm:g=()=>{},onCancel:m=()=>{},confirmText:x="Confirm",showCloseButton:f=!0,footerBackground:b,variant:h="success",visible:y=!1,size:v="large",style:w,overlayStyle:_,contentStyle:j,triggerElement:S,header:C,modal:T,defaultOpen:D,...k},z)=>{let[N,P]=r.default.useState(!!y&&y);(0,r.useEffect)(()=>{P(y)},[y]);let A=n||(0,t.jsxs)("div",{className:"flex w-full space-x-2",style:{width:"100%",justifyContent:"vertical"===c?"center":"right"===d?"flex-end":"flex-start"},children:[(0,t.jsx)(i.Button,{type:"default",onClick:m,disabled:u,children:p}),(0,t.jsx)(i.Button,{onClick:g,disabled:u,loading:u,type:"danger"===h?"danger":"warning"===h?"warning":"primary",children:x})]});return(0,t.jsxs)(o.Dialog,{open:N,defaultOpen:D,onOpenChange:function(e){void 0===y||e?P(e):m()},modal:T,children:[S&&(0,t.jsx)(o.DialogTrigger,{children:S}),(0,t.jsxs)(o.DialogContent,{ref:z,hideClose:!f,...k,size:v,children:[C||s?(0,t.jsxs)(o.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[C&&(0,t.jsx)(o.DialogTitle,{children:C}),s&&(0,t.jsx)(o.DialogDescription,{children:s})]}):null,e,!l&&(0,t.jsx)(o.DialogFooter,{padding:"small",children:A})]})]})}),s=(0,r.forwardRef)(({...e},r)=>(0,t.jsx)(o.DialogSection,{ref:r,...e,padding:"small",className:(0,a.cn)(e.className)})),l=(0,r.forwardRef)(({...e},r)=>(0,t.jsx)(o.DialogSectionSeparator,{ref:r,...e}));n.Content=s,n.Separator=l,e.s(["default",0,n])},40892,e=>{"use strict";var t=e.i(271332);e.s(["Modal",()=>t.default])},53071,e=>{"use strict";let t=(0,e.i(388019).default)("SquarePen",[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]]);e.s(["Edit",0,t],53071)},336908,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:i,onCancel:o,title:n="Unsaved changes",description:s="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:d="Keep editing",size:c="tiny"})=>{let u=(0,r.useRef)(!1);(0,r.useEffect)(()=>{e&&(u.current=!1)},[e]);let p=(0,r.useCallback)(()=>{u.current=!0,i()},[i]),g=(0,r.useCallback)(e=>{if(!e){if(u.current){u.current=!1;return}o()}},[o]);return(0,t.jsx)(a.AlertDialog,{open:e,onOpenChange:g,children:(0,t.jsxs)(a.AlertDialogContent,{size:c,children:[(0,t.jsxs)(a.AlertDialogHeader,{children:[(0,t.jsx)(a.AlertDialogTitle,{children:n}),null!=s&&(0,t.jsx)(a.AlertDialogDescription,{children:s})]}),(0,t.jsxs)(a.AlertDialogFooter,{children:[(0,t.jsx)(a.AlertDialogCancel,{children:d}),(0,t.jsx)(a.AlertDialogAction,{variant:"danger",onClick:p,children:l})]})]})})}])},412385,e=>{"use strict";var t=e.i(389959),r=e.i(323796);e.s(["useConfirmOnClose",0,({checkIsDirty:e,onClose:a})=>{let[i,o]=(0,t.useState)(!1),n=(0,r.default)(e),s=(0,r.default)(a),l=(0,t.useCallback)(()=>{n.current()?o(!0):s.current()},[]),d=(0,t.useCallback)(e=>{e||l()},[l]),c=(0,t.useCallback)(()=>{o(!1),s.current()},[]),u=(0,t.useCallback)(()=>{o(!1)},[]),p=(0,t.useMemo)(()=>({visible:i,onClose:c,onCancel:u}),[i,c,u]);return(0,t.useMemo)(()=>({confirmOnClose:l,handleOpenChange:d,modalProps:p}),[l,d,p])}])},843142,e=>{"use strict";var t=e.i(130843);e.s(["SelectSeparator_Shadcn_",()=>t.SelectSeparator])},742578,e=>{"use strict";e.s(["vaultSecretsKeys",0,{list:e=>["projects",e,"secrets"],getDecryptedValue:(e,t)=>["projects",e,"secrets",t].filter(Boolean)}])},667954,e=>{"use strict";e.i(850036);var t=e.i(479084),r=e.i(721490),a=e.i(242882),i=e.i(742578),o=e.i(714403);let n=async({projectRef:e,connectionString:a,id:n},s)=>{if(!n)throw Error("ID is required");let l=new r.Query().from("decrypted_secrets","vault").select(t.safeSql`decrypted_secret`).match({id:n}).toSql(),{result:d}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:l,queryKey:i.vaultSecretsKeys.getDecryptedValue(e,n)},s);return d},s=async({projectRef:e,connectionString:a,ids:i},n)=>{let s=new r.Query().from("decrypted_secrets","vault").select(t.safeSql`id,decrypted_secret`).filter("id","in",i).toSql(),{result:l}=await (0,o.executeSql)({projectRef:e,connectionString:a,sql:s},n);return l.reduce((e,t)=>({...e,[t.id]:t.decrypted_secret}),{})};e.s(["getDecryptedValue",0,n,"getDecryptedValues",0,s,"useVaultSecretDecryptedValueQuery",0,({projectRef:e,connectionString:t,id:r},{enabled:o=!0,...s}={})=>(0,a.useQuery)({queryKey:i.vaultSecretsKeys.getDecryptedValue(e,r),queryFn:({signal:a})=>n({projectRef:e,connectionString:t,id:r},a),select:e=>e[0]?.decrypted_secret??"",enabled:o&&void 0!==e&&void 0!==r,...s})])},143692,e=>{"use strict";let t=(0,e.i(388019).default)("Calendar",[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}]]);e.s(["default",0,t])},971687,e=>{"use strict";var t=e.i(143692);e.s(["Calendar",()=>t.default])},615573,(e,t,r)=>{t.exports=function(e,t){var r=-1,a=e.length;for(t||(t=Array(a));++r<a;)t[r]=e[r];return t}},507648,(e,t,r)=>{var a=e.r(203941),i=e.r(297926),o=e.r(615573),n=e.r(145948);t.exports=function(){var e=arguments.length;if(!e)return[];for(var t=Array(e-1),r=arguments[0],s=e;s--;)t[s-1]=arguments[s];return a(n(r)?o(r):[r],i(t,1))}},707409,e=>{"use strict";var t=e.i(507648),r=e.i(827047);let a=["int2","int4","int8","float4","float8","numeric","double precision"],i=["json","jsonb"],o=["text","varchar"],n=["timestamp","timestamptz"],s=["date"],l=["time","timetz"],d=(0,t.default)(n,s,l),c=["uuid","bool","vector","bytea"],u=(0,r.default)((0,t.default)(a,i,o,d,c));e.s(["DATETIME_TYPES",0,d,"DATE_TYPES",0,s,"JSON_TYPES",0,i,"NUMERICAL_TYPES",0,a,"OTHER_DATA_TYPES",0,c,"POSTGRES_DATA_TYPES",0,u,"POSTGRES_DATA_TYPE_OPTIONS",0,[{name:"int2",description:"Signed two-byte integer",type:"number"},{name:"int4",description:"Signed four-byte integer",type:"number"},{name:"int8",description:"Signed eight-byte integer",type:"number"},{name:"float4",description:"Single precision floating-point number (4 bytes)",type:"number"},{name:"float8",description:"Double precision floating-point number (8 bytes)",type:"number"},{name:"numeric",description:"Exact numeric of selectable precision",type:"number"},{name:"json",description:"Textual JSON data",type:"json"},{name:"jsonb",description:"Binary JSON data, decomposed",type:"json"},{name:"text",description:"Variable-length character string",type:"text"},{name:"varchar",description:"Variable-length character string",type:"text"},{name:"uuid",description:"Universally unique identifier",type:"text"},{name:"date",description:"Calendar date (year, month, day)",type:"time"},{name:"time",description:"Time of day (no time zone)",type:"time"},{name:"timetz",description:"Time of day, including time zone",type:"time"},{name:"timestamp",description:"Date and time (no time zone)",type:"time"},{name:"timestamptz",description:"Date and time, including time zone",type:"time"},{name:"bool",description:"Logical boolean (true/false)",type:"bool"},{name:"bytea",description:"Variable-length binary string",type:"others"}],"RECOMMENDED_ALTERNATIVE_DATA_TYPE",0,{varchar:{alternative:"text",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_varchar.28n.29_by_default"},json:{alternative:"jsonb",reference:"https://www.postgresql.org/docs/current/datatype-json.html"},timetz:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timetz"},timestamp:{alternative:"timestamptz",reference:"https://wiki.postgresql.org/wiki/Don't_Do_This#Don.27t_use_timestamp_.28without_time_zone.29"}},"TEXT_TYPES",0,o,"TIMESTAMP_TYPES",0,n,"TIME_TYPES",0,l])},647307,e=>{"use strict";var t=e.i(850036),r=e.i(38429),a=e.i(356003),i=e.i(355901),o=e.i(801834),n=e.i(714403);async function s({name:e,projectRef:r,connectionString:a}){let i=t.default.schemas.create({name:e,owner:"postgres"}).sql,{result:o}=await (0,n.executeSql)({projectRef:r,connectionString:a,sql:i,queryKey:["schema","create"]});return o}e.s(["useSchemaCreateMutation",0,({onSuccess:e,onError:t,...n}={})=>{let l=(0,a.useQueryClient)();return(0,r.useMutation)({mutationFn:e=>s(e),async onSuccess(t,r,a){let{projectRef:i}=r;await (0,o.invalidateSchemasQuery)(l,i),await e?.(t,r,a)},async onError(e,r,a){void 0===t?i.toast.error(`Failed to create schema: ${e.message}`):t(e,r,a)},...n})}])},433857,e=>{"use strict";let t=(0,e.i(388019).default)("ListPlus",[["path",{d:"M11 12H3",key:"51ecnj"}],["path",{d:"M16 6H3",key:"1wxfjs"}],["path",{d:"M16 18H3",key:"12xzn7"}],["path",{d:"M18 9v6",key:"1twb98"}],["path",{d:"M21 12h-6",key:"bt1uis"}]]);e.s(["ListPlus",0,t],433857)},272299,257320,e=>{"use strict";var t=e.i(388019);let r=(0,t.default)("ToggleRight",[["rect",{width:"20",height:"12",x:"2",y:"6",rx:"6",ry:"6",key:"f2vt7d"}],["circle",{cx:"16",cy:"12",r:"2",key:"4ma0v8"}]]);e.s(["ToggleRight",0,r],272299);let a=(0,t.default)("Type",[["polyline",{points:"4 7 4 4 20 4 20 7",key:"1nosan"}],["line",{x1:"9",x2:"15",y1:"20",y2:"20",key:"swin9y"}],["line",{x1:"12",x2:"12",y1:"4",y2:"20",key:"1tx1rr"}]]);e.s(["Type",0,a],257320)},973512,e=>{"use strict";var t=e.i(478902),r=e.i(802715),a=e.i(389959),i=e.i(837710),o=e.i(788070),n=e.i(368136),s=e.i(194125);e.s(["ActionBar",0,({loading:e=!1,disableApply:l=!1,hideApply:d=!1,children:c,applyButtonLabel:u="Apply",backButtonLabel:p="Back",applyFunction:g,closePanel:m=r.default,formId:x,visible:f=!0})=>{let[b,h]=(0,a.useState)(!1),y=(0,a.useCallback)(async()=>{h(!0),await new Promise(e=>g?.(e)),h(!1)},[g]),v=(0,a.useCallback)(()=>{if(!b&&!e&&!l&&!d)if(x){let e=document.getElementById(x);e&&e.requestSubmit()}else g&&y()},[b,e,l,d,x,g,y]);return(0,s.useShortcut)(n.SHORTCUT_IDS.ACTION_BAR_SAVE,v,{enabled:f}),(0,t.jsxs)("div",{className:"flex w-full items-center gap-3 border-t border-default px-3 py-4",children:[c,(0,t.jsxs)("div",{className:"flex items-center gap-3 ml-auto",children:[(0,t.jsx)(i.Button,{type:"default",htmlType:"button",onClick:m,disabled:b||e,children:p}),void 0!==g?(0,t.jsx)(i.Button,{onClick:y,disabled:l||b||e,loading:b||e,iconRight:b||e?void 0:(0,t.jsx)(o.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u}):d?(0,t.jsx)("div",{}):(0,t.jsx)(i.Button,{disabled:e||l,loading:e,"data-testid":"action-bar-save-row",htmlType:"submit",form:x,iconRight:e?void 0:(0,t.jsx)(o.KeyboardShortcut,{keys:["Meta","Enter"],variant:"inline"}),children:u})]})]})}])},534499,e=>{"use strict";let t={list:e=>["projects",e,"foreignTables"],listBySchema:(e,r)=>[...t.list(e),r]};e.s(["foreignTableKeys",0,t])},760377,e=>{"use strict";e.i(850036);var t=e.i(33942),r=e.i(332357),a=e.i(38429),i=e.i(356003),o=e.i(355901),n=e.i(584258),s=e.i(497761),l=e.i(534499),d=e.i(714403),c=e.i(742578);async function u({projectRef:e,connectionString:a,...i}){let o=(0,r.wrapWithTransaction)((0,t.getCreateFDWSql)(i)),{result:n}=await (0,d.executeSql)({projectRef:e,connectionString:a,sql:o});return n}e.s(["useFDWCreateMutation",0,({onSuccess:e,onError:t,...r}={})=>{let d=(0,i.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>u(e),async onSuccess(t,r,a){let{projectRef:i}=r;await Promise.all([d.invalidateQueries({queryKey:n.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:s.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,r,a)},async onError(e,r,a){void 0===t?o.toast.error(`Failed to create ${r.wrapperMeta.label} foreign data wrapper: ${e.message}`):t(e,r,a)},...r})}])},900341,874406,e=>{"use strict";e.i(850036);var t=e.i(33942),r=e.i(332357),a=e.i(38429),i=e.i(356003),o=e.i(355901),n=e.i(584258),s=e.i(497761),l=e.i(534499),d=e.i(714403),c=e.i(742578);async function u({projectRef:e,connectionString:a,wrapper:i,wrapperMeta:o}){let n=(0,r.wrapWithTransaction)((0,t.getDeleteFDWSql)({wrapper:i,wrapperMeta:o})),{result:s}=await (0,d.executeSql)({projectRef:e,connectionString:a,sql:n});return s}async function p({projectRef:e,connectionString:a,wrapper:i,wrapperMeta:o,formState:n,tables:s}){let l=(0,r.wrapWithTransaction)((0,t.getUpdateFDWSql)({wrapper:i,wrapperMeta:o,formState:n,tables:s})),{result:c}=await (0,d.executeSql)({projectRef:e,connectionString:a,sql:l});return c}e.s(["useFDWDeleteMutation",0,({onSuccess:e,onError:t,...r}={})=>{let d=(0,i.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>u(e),async onSuccess(t,r,a){let{projectRef:i}=r;await Promise.all([d.invalidateQueries({queryKey:n.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:s.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,r,a)},async onError(e,r,a){void 0===t?o.toast.error(`Failed to disable ${r.wrapper.name} foreign data wrapper: ${e.message}`):t(e,r,a)},...r})}],900341),e.s(["useFDWUpdateMutation",0,({onSuccess:e,onError:t,...r}={})=>{let d=(0,i.useQueryClient)();return(0,a.useMutation)({mutationFn:e=>p(e),async onSuccess(t,r,a){let{projectRef:i,skipInvalidation:o=!1}=r;o||await Promise.all([d.invalidateQueries({queryKey:n.fdwKeys.list(i),refetchType:"all"}),d.invalidateQueries({queryKey:s.entityTypeKeys.list(i)}),d.invalidateQueries({queryKey:l.foreignTableKeys.list(i)}),d.invalidateQueries({queryKey:c.vaultSecretsKeys.list(i)})]),await e?.(t,r,a)},async onError(e,r,a){void 0===t?o.toast.error(`Failed to update ${r.wrapper.name} foreign data wrapper: ${e.message}`):t(e,r,a)},...r})}],874406)},670793,e=>{"use strict";var t=e.i(478902),r=e.i(26898);e.i(128328);var a=e.i(158639),i=e.i(389959),o=e.i(725137),n=e.i(657811),s=e.i(615515),l=e.i(12214),d=e.i(736540),c=e.i(336908),u=e.i(215312),p=e.i(298625),g=e.i(2579),m=e.i(635494),x=e.i(412385);e.s(["WrappersTab",0,()=>{let{id:e}=(0,a.useParams)(),{data:f}=(0,m.useSelectedProjectQuery)(),[b,h]=(0,i.useState)(!1),{can:y}=(0,g.useAsyncCheckPermissions)(r.PermissionAction.TENANT_SQL_ADMIN_WRITE,"wrappers"),{data:v}=(0,p.useFDWsQuery)({projectRef:f?.ref,connectionString:f?.connectionString}),w=s.WRAPPERS.find(t=>t.name===e),_=w?(v??[]).filter(e=>(0,l.wrapperMetaComparator)(w,e)):[],[j,S]=(0,i.useState)(!1),{confirmOnClose:C,handleOpenChange:T,modalProps:D}=(0,x.useConfirmOnClose)({checkIsDirty:(0,i.useCallback)(()=>j,[j]),onClose:(0,i.useCallback)(()=>{h(!1),S(!1)},[])}),k=(0,i.useCallback)(({...e})=>(0,t.jsxs)("div",{className:"w-full mx-10 py-10 ",children:[e.children,(0,t.jsx)(o.Sheet,{open:!!b,onOpenChange:T,children:(0,t.jsx)(o.SheetContent,{size:"lg",tabIndex:void 0,children:w&&(0,t.jsx)(n.CreateWrapperSheet,{wrapperMeta:w,onDirty:S,onClose:()=>h(!1),onCloseWithConfirmation:C})})})]}),[b,T,w,C]);return w?0===_.length?(0,t.jsx)(k,{children:(0,t.jsx)("div",{className:" w-full h-48 max-w-4xl",children:(0,t.jsxs)("div",{className:"border rounded-lg h-full flex flex-col gap-y-2 items-center justify-center",children:[(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:["No ",w.label," wrappers have been installed"]}),(0,t.jsx)(u.ButtonTooltip,{type:"default",onClick:()=>h(!0),disabled:!y,tooltip:{content:{text:y?void 0:"You need additional permissions to create a foreign data wrapper"}},children:"Add new wrapper"})]})})}):(0,t.jsxs)(k,{children:[(0,t.jsx)(d.WrapperTable,{}),(0,t.jsx)(c.DiscardChangesConfirmationDialog,{...D})]}):(0,t.jsx)("div",{children:"Missing integration."})}])},674412,e=>{e.n(e.i(670793))}]);