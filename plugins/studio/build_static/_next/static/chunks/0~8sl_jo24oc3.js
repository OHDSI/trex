(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),a=e.i(389959),o=e.i(837710),i=e.i(710483),n=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:a,error:i})=>(0,t.jsx)(o.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(n.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:a,error:i?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:o="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:n,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:m=!0,children:x,additionalActions:f})=>{let g=(0,s.useTrack)(),h=(0,a.useRef)(!1),b=n?.message?.includes("503")?"503 Service Temporarily Unavailable":n?.message;return(0,a.useEffect)(()=>{!h.current&&(h.current=!0,.1>Math.random()&&g("dashboard_error_created",{source:"admonition"}))},[g]),(0,t.jsx)(i.Admonition,{type:"warning",layout:f?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[n?.message&&(0,t.jsxs)("p",{children:[m&&"Error: ",b]}),p&&(0,t.jsx)("p",{children:o}),x]}),actions:f?(0,t.jsxs)(t.Fragment,{children:[f,(0,t.jsx)(l,{projectRef:e,subject:r,error:n})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:n}),className:d})};e.s(["AlertError",0,d,"default",0,d])},378277,e=>{"use strict";var t=e.i(348481);e.s(["Input_Shadcn_",()=>t.Input])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),a=e.i(389959),o=e.i(843778),i=e.i(375761),n=e.i(231665),s=e.i(938933);let l=(0,a.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:p,iconContainerClassName:m,containerClassName:x,size:f="small",...g},h)=>{let[b,y]=(0,a.useState)("Copy"),[v,w]=(0,a.useState)(!0),j=(0,s.default)("input"),S=[];return f&&S.push(j.size[f]),(0,t.jsxs)(n.InputGroup,{className:x,children:[(0,t.jsx)(n.InputGroupInput,{ref:h,onFocus:e=>e.target.select(),...g,size:f,onCopy:p,type:c&&v?"password":g.type,disabled:g.disabled,className:(0,o.cn)(...S,g.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(n.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(n.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&v)?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",className:(0,o.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=g.value,void(0,i.copyToClipboard)(e,()=>{y("Copied"),setTimeout(function(){y("Copy")},3e3),p?.()})},children:b}):null,c&&v?(0,t.jsx)(n.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},423782,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778),o=e.i(874311),i=e.i(613580);let n=(0,r.forwardRef)(({...e},r)=>(0,t.jsxs)(i.Tooltip,{children:[(0,t.jsx)(i.TooltipTrigger,{asChild:!0,children:(0,t.jsx)(o.DropdownMenuItem,{ref:r,...e,className:(0,a.cn)(e.className,"pointer-events-auto!"),onClick:t=>{!e.disabled&&e.onClick&&e.onClick(t)},children:e.children})}),e.disabled&&void 0!==e.tooltip.content.text&&(0,t.jsx)(i.TooltipContent,{...e.tooltip.content,children:e.tooltip.content.text})]}));n.displayName="DropdownMenuItemTooltip",e.s(["DropdownMenuItemTooltip",0,n])},271332,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778),o=e.i(837710),i=e.i(253214);let n=(0,r.forwardRef)(({children:e,customFooter:n,description:s,hideFooter:l=!1,alignFooter:d="left",layout:c="horizontal",loading:u=!1,cancelText:p="Cancel",onConfirm:m=()=>{},onCancel:x=()=>{},confirmText:f="Confirm",showCloseButton:g=!0,footerBackground:h,variant:b="success",visible:y=!1,size:v="large",style:w,overlayStyle:j,contentStyle:S,triggerElement:_,header:N,modal:C,defaultOpen:z,...k},D)=>{let[F,q]=r.default.useState(!!y&&y);(0,r.useEffect)(()=>{q(y)},[y]);let I=n||(0,t.jsxs)("div",{className:"flex w-full space-x-2",style:{width:"100%",justifyContent:"vertical"===c?"center":"right"===d?"flex-end":"flex-start"},children:[(0,t.jsx)(o.Button,{type:"default",onClick:x,disabled:u,children:p}),(0,t.jsx)(o.Button,{onClick:m,disabled:u,loading:u,type:"danger"===b?"danger":"warning"===b?"warning":"primary",children:f})]});return(0,t.jsxs)(i.Dialog,{open:F,defaultOpen:z,onOpenChange:function(e){void 0===y||e?q(e):x()},modal:C,children:[_&&(0,t.jsx)(i.DialogTrigger,{children:_}),(0,t.jsxs)(i.DialogContent,{ref:D,hideClose:!g,...k,size:v,children:[N||s?(0,t.jsxs)(i.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[N&&(0,t.jsx)(i.DialogTitle,{children:N}),s&&(0,t.jsx)(i.DialogDescription,{children:s})]}):null,e,!l&&(0,t.jsx)(i.DialogFooter,{padding:"small",children:I})]})]})}),s=(0,r.forwardRef)(({...e},r)=>(0,t.jsx)(i.DialogSection,{ref:r,...e,padding:"small",className:(0,a.cn)(e.className)})),l=(0,r.forwardRef)(({...e},r)=>(0,t.jsx)(i.DialogSectionSeparator,{ref:r,...e}));n.Content=s,n.Separator=l,e.s(["default",0,n])},40892,e=>{"use strict";var t=e.i(271332);e.s(["Modal",()=>t.default])},388034,e=>{"use strict";let t=(0,e.i(388019).default)("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);e.s(["default",0,t])},61187,e=>{"use strict";var t=e.i(388034);e.s(["RefreshCw",()=>t.default])},543851,e=>{"use strict";let t=(0,e.i(388019).default)("Eye",[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);e.s(["Eye",0,t],543851)},216518,e=>{"use strict";let t=(0,e.i(388019).default)("EyeOff",[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]);e.s(["default",0,t])},890054,e=>{"use strict";var t=e.i(216518);e.s(["EyeOff",()=>t.default])},248210,e=>{"use strict";var t=e.i(478902),r=e.i(843778);e.s(["LoadingLine",0,({loading:e})=>(0,t.jsx)("div",{className:"relative overflow-hidden w-full h-px bg-border m-auto",children:(0,t.jsx)("span",{className:(0,r.cn)("absolute w-[80px] h-px ml-auto mr-auto left-0 right-0 text-center block top-0","transition-all","line-loading-bg-light dark:line-loading-bg",e&&"animate-line-loading-slower opacity-100",e?"opacity-100":"opacity-0")})})])},742578,e=>{"use strict";e.s(["vaultSecretsKeys",0,{list:e=>["projects",e,"secrets"],getDecryptedValue:(e,t)=>["projects",e,"secrets",t].filter(Boolean)}])},667954,e=>{"use strict";e.i(850036);var t=e.i(479084),r=e.i(721490),a=e.i(242882),o=e.i(742578),i=e.i(714403);let n=async({projectRef:e,connectionString:a,id:n},s)=>{if(!n)throw Error("ID is required");let l=new r.Query().from("decrypted_secrets","vault").select(t.safeSql`decrypted_secret`).match({id:n}).toSql(),{result:d}=await (0,i.executeSql)({projectRef:e,connectionString:a,sql:l,queryKey:o.vaultSecretsKeys.getDecryptedValue(e,n)},s);return d},s=async({projectRef:e,connectionString:a,ids:o},n)=>{let s=new r.Query().from("decrypted_secrets","vault").select(t.safeSql`id,decrypted_secret`).filter("id","in",o).toSql(),{result:l}=await (0,i.executeSql)({projectRef:e,connectionString:a,sql:s},n);return l.reduce((e,t)=>({...e,[t.id]:t.decrypted_secret}),{})};e.s(["getDecryptedValue",0,n,"getDecryptedValues",0,s,"useVaultSecretDecryptedValueQuery",0,({projectRef:e,connectionString:t,id:r},{enabled:i=!0,...s}={})=>(0,a.useQuery)({queryKey:o.vaultSecretsKeys.getDecryptedValue(e,r),queryFn:({signal:a})=>n({projectRef:e,connectionString:t,id:r},a),select:e=>e[0]?.decrypted_secret??"",enabled:i&&void 0!==e&&void 0!==r,...s})])},870657,e=>{"use strict";let t=(0,e.i(388019).default)("PenLine",[["path",{d:"M12 20h9",key:"t2du7b"}],["path",{d:"M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z",key:"1ykcvy"}]]);e.s(["Edit3",0,t],870657)},624072,e=>{"use strict";var t=e.i(478902),r=e.i(26898);e.i(128328);var a=e.i(158639),o=e.i(827047),i=e.i(61187),n=e.i(366652),s=e.i(975924),l=e.i(17313),d=e.i(389959),c=e.i(256625),u=e.i(837710),p=e.i(843778),m=e.i(248210),x=e.i(449123),f=e.i(451031),g=e.i(831927),h=e.i(156722),b=e.i(719754),y=e.i(746301),v=e.i(283607),w=e.i(655744),j=e.i(355901),S=e.i(253214),_=e.i(20482),N=e.i(378277),C=e.i(538482),z=e.i(531837);e.i(850036);var k=e.i(479084),D=e.i(38429),F=e.i(356003),q=e.i(742578),I=e.i(714403);async function M({projectRef:e,connectionString:t,...r}){let{name:a,description:o,secret:i}=r;if(!i)throw Error("Secret value is required");let n=(({secret:e,name:t,description:r})=>{let a=t?k.safeSql`, new_name := ${(0,k.literal)(t)}`:k.safeSql``,o=r?k.safeSql`, new_description := ${(0,k.literal)(r)}`:k.safeSql``;return k.safeSql`select vault.create_secret(
    new_secret := ${(0,k.literal)(e)}${a}${o}
  )`})({secret:i,name:a,description:o}),{result:s}=await (0,I.executeSql)({projectRef:e,connectionString:t,sql:n});return s}var T=e.i(635494);let $=z.object({name:z.string().min(1,"Please provide a name for your secret"),description:z.string().optional(),secret:z.string().min(1,"Please enter your secret value")}),R="add-new-secret-form",E=()=>{let{data:e}=(0,T.useSelectedProjectQuery)(),{mutateAsync:r}=(({onError:e,onSuccess:t,...r}={})=>{let a=(0,F.useQueryClient)();return(0,D.useMutation)({mutationFn:e=>M(e),async onSuccess(e,r,o){let{projectRef:i}=r;await a.invalidateQueries({queryKey:q.vaultSecretsKeys.list(i)}),await t?.(e,r,o)},async onError(t,r,a){void 0===e?j.toast.error(`Failed to create secret: ${t.message}`):e(t,r,a)},...r})})(),[a,o]=(0,l.useQueryState)("new",l.parseAsBoolean.withDefault(!1)),i=()=>{o(null),s.reset()},n=async t=>{if(!e)return console.error("Project is required");try{await r({projectRef:e.ref,connectionString:e?.connectionString,name:t.name,description:t.description,secret:t.secret}),j.toast.success(`Successfully added new secret ${t.name}`),i()}catch(e){}finally{}},s=(0,w.useForm)({resolver:(0,v.zodResolver)($),defaultValues:{name:"",description:"",secret:""}}),{isDirty:d,isSubmitting:c}=s.formState;return(0,t.jsx)(S.Dialog,{open:a,onOpenChange:i,children:(0,t.jsxs)(S.DialogContent,{className:"sm:max-w-[425px]",children:[(0,t.jsx)(S.DialogHeader,{children:(0,t.jsx)(S.DialogTitle,{children:"Add new secret"})}),(0,t.jsx)(S.DialogSectionSeparator,{}),(0,t.jsx)(S.DialogSection,{className:"space-y-4",children:(0,t.jsx)(_.Form,{...s,children:(0,t.jsxs)("form",{id:R,noValidate:!0,onSubmit:s.handleSubmit(n),className:"space-y-4",children:[(0,t.jsx)(_.FormField,{control:s.control,name:"name",render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{layout:"vertical",label:"Name",children:(0,t.jsx)(_.FormControl,{className:"col-span-6",children:(0,t.jsx)(N.Input_Shadcn_,{...e})})})}),(0,t.jsx)(_.FormField,{control:s.control,name:"description",render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{layout:"vertical",label:"Description",labelOptional:"Optional",children:(0,t.jsx)(_.FormControl,{className:"col-span-6",children:(0,t.jsx)(N.Input_Shadcn_,{...e})})})}),(0,t.jsx)(_.FormField,{control:s.control,name:"secret",render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{layout:"vertical",label:"Secret value",children:(0,t.jsx)(_.FormControl,{className:"col-span-6",children:(0,t.jsx)(y.Input,{reveal:!0,copy:!0,...e})})})})]})})}),(0,t.jsxs)(S.DialogFooter,{children:[(0,t.jsx)(u.Button,{type:"default",disabled:c,onClick:i,children:"Cancel"}),(0,t.jsx)(u.Button,{form:R,htmlType:"submit",disabled:!d||c,loading:c,children:"Add secret"})]})]})})};var P=e.i(40892),A=e.i(721490);async function Q({projectRef:e,connectionString:t,id:r}){let a=new A.Query().from("secrets","vault").delete().match({id:r}).toSql(),{result:o}=await (0,I.executeSql)({projectRef:e,connectionString:t,sql:a});return o}var L=e.i(242882);async function B({projectRef:e,connectionString:t},r){let a=new A.Query().from("secrets","vault").select(k.safeSql`id,name,description,secret,created_at,updated_at`).toSql(),{result:o}=await (0,I.executeSql)({projectRef:e,connectionString:t,sql:a,queryKey:["vault-secrets"]},r);return o}let V=({projectRef:e,connectionString:t},{enabled:r=!0,...a}={})=>(0,L.useQuery)({queryKey:q.vaultSecretsKeys.list(e),queryFn:({signal:r})=>B({projectRef:e,connectionString:t},r),enabled:r&&void 0!==e,...a}),O=()=>{let{data:e}=(0,T.useSelectedProjectQuery)(),{data:r=[],isSuccess:a}=V({projectRef:e?.ref,connectionString:e?.connectionString}),[o,i]=(0,l.useQueryState)("delete",l.parseAsString),n=r.find(e=>e.id===o),{mutate:s,isPending:c,isSuccess:u}=(({onError:e,onSuccess:t,...r}={})=>{let a=(0,F.useQueryClient)();return(0,D.useMutation)({mutationFn:e=>Q(e),async onSuccess(e,r,o){let{projectRef:i}=r;await a.invalidateQueries({queryKey:q.vaultSecretsKeys.list(i)}),await t?.(e,r,o)},async onError(t,r,a){void 0===e?j.toast.error(`Failed to delete key: ${t.message}`):e(t,r,a)},...r})})({onSuccess:()=>{j.toast.success(`Successfully deleted secret ${n?.name}`),i(null)},onError:e=>{j.toast.error(`Failed to delete secret: ${e.message}`)}}),p=async()=>{if(!e)return console.error("Project is required");n&&s({projectRef:e.ref,connectionString:e?.connectionString,id:n.id})};return(0,d.useEffect)(()=>{a&&o&&!n&&!u&&((0,j.toast)("Secret not found"),i(null))},[a,u,o,n,i]),(0,t.jsx)(P.Modal,{size:"small",variant:"danger",alignFooter:"right",header:"Confirm to delete secret",visible:!!n,loading:c,onCancel:()=>i(null),onConfirm:p,children:(0,t.jsxs)(P.Modal.Content,{className:"space-y-4",children:[(0,t.jsx)("p",{className:"text-sm",children:"The following secret will be permanently removed and cannot be recovered. Are you sure?"}),(0,t.jsxs)("div",{className:"space-y-1",children:[(0,t.jsx)("p",{className:"text-sm",children:n?.description}),(0,t.jsxs)("p",{className:"text-sm text-foreground-light",children:["ID: ",(0,t.jsx)("code",{className:"text-code-inline",children:n?.id})]})]})]})})};var K=e.i(543851),W=e.i(890054),H=e.i(108151),G=e.i(97429),U=e.i(667954);async function Y({projectRef:e,connectionString:t,id:r,...a}){let{name:o,description:i,secret:n}=a,s=(({id:e,secret:t,name:r,description:a})=>{let o=t?k.safeSql`, new_secret := ${(0,k.literal)(t)}`:k.safeSql``,i=r?k.safeSql`, new_name := ${(0,k.literal)(r)}`:k.safeSql``,n=a?k.safeSql`, new_description := ${(0,k.literal)(a)}`:k.safeSql``;return k.safeSql`select vault.update_secret(
    secret_id := ${(0,k.literal)(e)}${o}${i}${n}
  )`})({id:r,secret:n,name:o,description:i}),{result:l}=await (0,I.executeSql)({projectRef:e,connectionString:t,sql:s});return l}let J=G.z.object({name:G.z.string().min(1,"Please provide a name for your secret"),description:G.z.string().optional(),secret:G.z.string().min(1,"Please enter your secret value")}),X="edit-vault-secret-form",Z=()=>{let{data:e}=(0,T.useSelectedProjectQuery)(),{data:r=[],isSuccess:a}=V({projectRef:e?.ref,connectionString:e?.connectionString}),[o,i]=(0,l.useQueryState)("edit",l.parseAsString),n=r.find(e=>e.id===o),[s,c]=(0,d.useState)(!1),{data:p,isPending:m}=(0,U.useVaultSecretDecryptedValueQuery)({projectRef:e?.ref,id:n?.id,connectionString:e?.connectionString},{enabled:!!e?.ref}),x={name:n?.name??"",description:n?.description??"",secret:n?.decryptedSecret??p??""},f=(0,w.useForm)({resolver:(0,v.zodResolver)(J),defaultValues:x,values:x}),{mutate:g,isPending:h}=(({onError:e,onSuccess:t,...r}={})=>{let a=(0,F.useQueryClient)();return(0,D.useMutation)({mutationFn:e=>Y(e),async onSuccess(e,r,o){let{id:i,projectRef:n}=r;await Promise.all([a.removeQueries({queryKey:q.vaultSecretsKeys.getDecryptedValue(n,i)}),a.invalidateQueries({queryKey:q.vaultSecretsKeys.list(n)})]),await t?.(e,r,o)},async onError(t,r,a){void 0===e?j.toast.error(`Failed to update key: ${t.message}`):e(t,r,a)},...r})})(),b=async t=>{if(!e)return console.error("Project is required");if(!n)return console.error("Secret is required");let r={secret:t.secret};t.name!==n.name&&(r.name=t.name),t.description!==n.description&&(r.description=t.description),Object.keys(r).length>0&&g({projectRef:e.ref,connectionString:e?.connectionString,id:n.id,...r},{onSuccess:()=>{j.toast.success("Successfully updated secret"),i(null)},onError:e=>{j.toast.error(`Failed to update secret: ${e.message}`)}})};return(0,d.useEffect)(()=>{a&&o&&!n&&((0,j.toast)("Secret not found"),i(null))},[a,o,n,i]),(0,t.jsx)(S.Dialog,{open:!!n,onOpenChange:e=>{e||(f.reset(),i(null))},children:(0,t.jsxs)(S.DialogContent,{children:[(0,t.jsx)(S.DialogHeader,{children:(0,t.jsx)(S.DialogTitle,{children:"Edit secret"})}),(0,t.jsx)(S.DialogSectionSeparator,{}),m?(0,t.jsx)(S.DialogSection,{children:(0,t.jsx)(H.GenericSkeletonLoader,{})}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(S.DialogSection,{children:(0,t.jsx)(_.Form,{...f,children:(0,t.jsxs)("form",{id:X,className:"flex flex-col gap-4",autoComplete:"off",onSubmit:f.handleSubmit(b),children:[(0,t.jsx)(_.FormField,{name:"name",control:f.control,render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{name:"name",label:"Name",children:(0,t.jsx)(_.FormControl,{children:(0,t.jsx)(N.Input_Shadcn_,{id:"name",...e})})})},"name"),(0,t.jsx)(_.FormField,{name:"description",control:f.control,render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{name:"description",label:"Description",labelOptional:"Optional",children:(0,t.jsx)(_.FormControl,{children:(0,t.jsx)(N.Input_Shadcn_,{id:"description",...e,"data-lpignore":"true"})})})},"description"),(0,t.jsx)(_.FormField,{name:"secret",control:f.control,render:({field:e})=>(0,t.jsx)(C.FormItemLayout,{name:"secret",label:"Secret value",children:(0,t.jsx)(_.FormControl,{children:(0,t.jsxs)("div",{className:"relative",children:[(0,t.jsx)(N.Input_Shadcn_,{id:"secret",type:s?"text":"password",...e,"data-lpignore":"true"}),(0,t.jsx)(u.Button,{type:"default",title:s?"Hide secret value":"Show secret value","aria-label":s?"Hide secret value":"Show secret value",className:"absolute right-1 top-1 w-7",icon:s?(0,t.jsx)(W.EyeOff,{}):(0,t.jsx)(K.Eye,{}),onClick:()=>c(!s)})]})})})},"secret")]})})}),(0,t.jsxs)(S.DialogFooter,{children:[(0,t.jsx)(u.Button,{type:"default",disabled:h,onClick:()=>{f.reset(),i(null)},children:"Cancel"}),(0,t.jsx)(u.Button,{form:X,htmlType:"submit",loading:h,children:"Update secret"})]})]})]})})};var ee=e.i(55956),et=e.i(870657),er=e.i(546024),ea=e.i(585915),eo=e.i(471998),ei=e.i(211570),en=e.i(874311),es=e.i(423782),el=e.i(2579);let ed=({row:e,col:o})=>{let{ref:i}=(0,a.useParams)(),{data:n}=(0,T.useSelectedProjectQuery)(),[s,c]=(0,d.useState)(!1),p=e?.name??"No name provided",[,m]=(0,l.useQueryState)("edit",l.parseAsString),[,x]=(0,l.useQueryState)("delete",l.parseAsString),{can:f}=(0,el.useAsyncCheckPermissions)(r.PermissionAction.TENANT_SQL_ADMIN_WRITE,"tables"),{data:g,isFetching:h}=(0,U.useVaultSecretDecryptedValueQuery)({projectRef:i,connectionString:n?.connectionString,id:e.id},{enabled:!!(i&&e.id)&&s});return"actions"===o.id?(0,t.jsx)("div",{className:"flex items-center justify-end w-full",onClick:e=>e.stopPropagation(),children:(0,t.jsxs)(en.DropdownMenu,{children:[(0,t.jsx)(en.DropdownMenuTrigger,{asChild:!0,children:(0,t.jsx)(u.Button,{title:"Manage Secret",type:"text",className:"px-1",icon:(0,t.jsx)(eo.MoreVertical,{})})}),(0,t.jsxs)(en.DropdownMenuContent,{side:"bottom",align:"end",className:"w-40",children:[(0,t.jsxs)(es.DropdownMenuItemTooltip,{className:"gap-x-2",disabled:!f,onClick:()=>m(e.id),tooltip:{content:{side:"left",text:"You need additional permissions to edit secrets"}},children:[(0,t.jsx)(et.Edit3,{size:12}),(0,t.jsx)("p",{children:"Edit"})]}),(0,t.jsx)(en.DropdownMenuSeparator,{}),(0,t.jsxs)(es.DropdownMenuItemTooltip,{className:"gap-x-2",disabled:!f,onClick:()=>x(e.id),tooltip:{content:{side:"left",text:"You need additional permissions to delete secrets"}},children:[(0,t.jsx)(ei.Trash,{size:12}),(0,t.jsx)("p",{className:"text-foreground-light",children:"Delete"})]})]})]})}):"secret_value"===o.id?(0,t.jsxs)("div",{className:"flex items-center gap-2 w-full",onClick:e=>e.stopPropagation(),children:[(0,t.jsx)(u.Button,{type:"text",className:"px-1.5",icon:h&&void 0===g?(0,t.jsx)(ea.Loader,{className:"animate-spin",size:16,strokeWidth:1.5}):s?(0,t.jsx)(W.EyeOff,{size:16,strokeWidth:1.5}):(0,t.jsx)(K.Eye,{size:16,strokeWidth:1.5}),onClick:()=>c(!s)}),(0,t.jsx)("div",{className:"grow min-w-0",children:s&&void 0!==g?(0,t.jsx)(y.Input,{copy:!0,readOnly:!0,size:"tiny",className:"font-mono",value:g}):(0,t.jsx)("p",{className:"text-sm font-mono text-foreground",children:"••••••••••••••••••"})})]}):"updated_at"===o.id?(0,t.jsx)("div",{className:"w-full flex items-center justify-start",children:(0,t.jsxs)("p",{className:"text-xs text-foreground-light",children:[e.updated_at===e.created_at?"Added":"Updated"," on"," ",(0,ee.default)(e.updated_at).format("MMM D, YYYY")]})}):"id"===o.id?(0,t.jsxs)("div",{className:"w-full flex items-center",children:[(0,t.jsx)(er.Key,{size:12,strokeWidth:2,className:"text-foreground-light mr-2"}),(0,t.jsx)("p",{className:"text-foreground-light text-xs font-mono truncate",title:e.id,children:e.id})]}):(0,t.jsxs)("div",{className:"w-full flex flex-col justify-center",children:[(0,t.jsx)("p",{className:"text-xs text-foreground truncate select-text",title:p,children:p}),void 0!==e.description&&""!==e.description&&(0,t.jsx)("div",{children:(0,t.jsx)("p",{className:"text-xs text-foreground-lighter w-full truncate select-text",children:e.description})})]})},ec=[{id:"secret",name:"Secret",minWidth:300,width:360},{id:"id",name:"ID",minWidth:220,width:260},{id:"secret_value",name:"Value",minWidth:320,width:420},{id:"updated_at",name:"Last updated",minWidth:180},{id:"actions",name:"",minWidth:75,width:75}];var eu=e.i(567558),ep=e.i(215312),em=e.i(513826),ex=e.i(10429);e.s(["SecretsManagement",0,()=>{let{search:e}=(0,a.useParams)(),{data:v}=(0,T.useSelectedProjectQuery)(),[w,j]=(0,d.useState)(""),[,S]=(0,l.useQueryState)("new",l.parseAsBoolean.withDefault(!1)),[_,N]=(0,d.useState)("updated_at"),{can:C}=(0,el.useAsyncCheckPermissions)(r.PermissionAction.TENANT_SQL_ADMIN_WRITE,"tables"),{data:z,error:k,isError:D,isPending:F,isRefetching:q,refetch:I}=V({projectRef:v?.ref,connectionString:v?.connectionString}),M=(0,d.useMemo)(()=>z||[],[z]),$=(0,d.useMemo)(()=>{let e=w.length>0?M.filter(e=>(e?.name??"").toLowerCase().includes(w.trim().toLowerCase())||(e?.id??"").toLowerCase().includes(w.trim().toLowerCase())):M;return"updated_at"===_?(0,o.default)(e,e=>Number(new Date(e.updated_at))).reverse():(0,o.default)(e,e=>(e.name||"").toLowerCase())},[M,w,_]),R=(0,d.useMemo)(()=>ec.map(e=>({key:e.id,name:e.name,minWidth:e.minWidth??100,maxWidth:e.maxWidth,width:e.width,resizable:!1,sortable:!1,draggable:!1,headerCellClass:void 0,renderHeaderCell:()=>(0,t.jsx)("div",{className:(0,p.cn)("flex items-center justify-between font-normal text-xs w-full","secret"===e.id&&"ml-8"),children:(0,t.jsx)("p",{className:"text-foreground!",children:e.name})}),renderCell:({row:r})=>(0,t.jsx)(ed,{row:r,col:e})})),[]);return(0,d.useEffect)(()=>{void 0!==e&&j(e)},[e]),(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("div",{className:"h-full w-full space-y-4",children:(0,t.jsxs)("div",{className:"h-full w-full flex flex-col relative",children:[(0,t.jsxs)("div",{className:"bg-surface-200 py-3 px-10 flex items-center justify-between flex-wrap",children:[(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)(y.Input,{size:"tiny",className:"w-52",placeholder:"Search by name or key ID",icon:(0,t.jsx)(n.Search,{}),value:w??"",onChange:e=>j(e.target.value),actions:[w&&(0,t.jsx)(u.Button,{size:"tiny",type:"text",icon:(0,t.jsx)(s.X,{}),onClick:()=>j(""),className:"p-0 h-5 w-5"},"clear")]}),(0,t.jsxs)(x.Select_Shadcn_,{value:_,onValueChange:e=>N(e),children:[(0,t.jsx)(h.SelectTrigger_Shadcn_,{size:"tiny",className:"w-44",children:(0,t.jsx)(b.SelectValue_Shadcn_,{asChild:!0,children:(0,t.jsxs)(t.Fragment,{children:["Sort by ",_]})})}),(0,t.jsxs)(f.SelectContent_Shadcn_,{children:[(0,t.jsx)(g.SelectItem_Shadcn_,{value:"updated_at",className:"text-xs",children:"Updated at"}),(0,t.jsx)(g.SelectItem_Shadcn_,{value:"name",className:"text-xs",children:"Name"})]})]})]}),(0,t.jsxs)("div",{className:"flex items-center gap-x-2",children:[(0,t.jsx)(u.Button,{type:"default",icon:(0,t.jsx)(i.RefreshCw,{}),loading:q,onClick:()=>I(),children:"Refresh"}),(0,t.jsx)(em.DocsButton,{href:`${ex.DOCS_URL}/guides/database/vault`}),(0,t.jsx)(ep.ButtonTooltip,{type:"primary",disabled:!C,onClick:()=>S(!0),tooltip:{content:{side:"bottom",text:C?void 0:"You need additional permissions to add secrets"}},children:"Add new secret"})]})]}),(0,t.jsx)(m.LoadingLine,{loading:F||q}),D?(0,t.jsx)("div",{className:"grow p-4",children:(0,t.jsx)(eu.default,{error:k,subject:"Failed to load secrets"})}):(0,t.jsx)(c.default,{className:"grow border-t-0",rowHeight:52,headerRowHeight:36,columns:R,rows:$,rowKeyGetter:e=>e.id,rowClass:()=>(0,p.cn)("cursor-pointer","[&>.rdg-cell]:border-box [&>.rdg-cell]:outline-hidden [&>.rdg-cell]:shadow-none","[&>.rdg-cell:first-child>div]:pl-8"),renderers:{renderRow:(e,r)=>(0,t.jsx)(c.Row,{...r},r.row.id)}}),0!==$.length||F||D?null:(0,t.jsx)("div",{className:"absolute top-32 px-6 w-full",children:(0,t.jsxs)("div",{className:"text-center text-sm flex flex-col gap-y-1",children:[(0,t.jsx)("p",{className:"text-foreground",children:w?"No secrets found":"No secrets added yet"}),(0,t.jsx)("p",{className:"text-foreground-light",children:w?`There are currently no secrets based on the search "${w}"`:"The Vault allows you to store sensitive information like API keys"})]})})]})}),(0,t.jsx)(E,{}),(0,t.jsx)(Z,{}),(0,t.jsx)(O,{})]})}],624072)},935100,e=>{e.n(e.i(624072))}]);