(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,585915,e=>{"use strict";let t=(0,e.i(388019).default)("Loader",[["path",{d:"M12 2v4",key:"3427ic"}],["path",{d:"m16.2 7.8 2.9-2.9",key:"r700ao"}],["path",{d:"M18 12h4",key:"wj9ykh"}],["path",{d:"m16.2 16.2 2.9 2.9",key:"1bxg5t"}],["path",{d:"M12 18v4",key:"jadmvz"}],["path",{d:"m4.9 19.1 2.9-2.9",key:"bwix9q"}],["path",{d:"M2 12h4",key:"j09sii"}],["path",{d:"m4.9 4.9 2.9 2.9",key:"giyufr"}]]);e.s(["Loader",0,t],585915)},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
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
    `}};e.s(["default",0,o],305551);let s=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(s);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},725137,e=>{"use strict";var t=e.i(478902),r=e.i(162361),a=e.i(766181),o=e.i(975924),s=e.i(389959),i=e.i(843778);let n=r.Dialog.Root,l=r.Dialog.Trigger,d=r.Dialog.Close;(0,a.cva)("fixed inset-0 z-50 flex",{variants:{side:{top:"items-start",bottom:"items-end",left:"justify-start",right:"justify-end"}},defaultVariants:{side:"right"}});let c=({side:e,children:a,...o})=>(0,t.jsx)(r.Dialog.Portal,{...o,children:a});c.displayName=r.Dialog.Portal.displayName;let u=s.forwardRef(({className:e,children:a,...o},s)=>(0,t.jsx)(r.Dialog.Overlay,{className:(0,i.cn)("fixed inset-0 z-50 bg-alternative/90 backdrop-blur-xs transition-all duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in",e),...o,ref:s}));u.displayName=r.Dialog.Overlay.displayName;let f=(0,i.cn)(["fixed z-50 scale-100 gap-4 bg-studio opacity-100 shadow-lg","data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:duration-300"]),p=(0,a.cva)(f,{variants:{side:{top:"data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top w-full border-b inset-x-0 top-0",bottom:"data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom w-full border-t inset-x-0 bottom-0",left:"data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left h-full border-r inset-y-0 left-0",right:"data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right h-full border-l inset-y-0 right-0"},size:{content:"",default:"",sm:"",lg:"",xl:"",xxl:"",full:""}},compoundVariants:[{side:["top","bottom"],size:"content",class:"max-h-screen"},{side:["top","bottom"],size:"default",class:"h-1/3"},{side:["top","bottom"],size:"sm",class:"h-1/4"},{side:["top","bottom"],size:"lg",class:"h-1/2"},{side:["top","bottom"],size:"xl",class:"h-5/6"},{side:["top","bottom"],size:"full",class:"h-screen"},{side:["right","left"],size:"content",class:"max-w-screen"},{side:["right","left"],size:"default",class:"lg:w-1/3"},{side:["right","left"],size:"sm",class:"lg:w-1/4"},{side:["right","left"],size:"lg",class:"lg:w-1/2"},{side:["right","left"],size:"xl",class:"lg:w-4/6"},{side:["right","left"],size:"xxl",class:"w-5/6"},{side:["right","left"],size:"full",class:"w-screen"}],defaultVariants:{side:"right",size:"default"}}),x=s.forwardRef(({side:e,size:a,className:s,children:n,showClose:l=!0,hasOverlay:d=!0,...f},x)=>(0,t.jsxs)(c,{side:e,children:[d&&(0,t.jsx)(u,{}),(0,t.jsxs)(r.Dialog.Content,{ref:x,className:(0,i.cn)(p({side:e,size:a}),s),...f,children:[n,l?(0,t.jsxs)(r.Dialog.Close,{className:(0,i.cn)("absolute right-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary","hit-area-6"),children:[(0,t.jsx)(o.X,{className:"h-4 w-4"}),(0,t.jsx)("span",{className:"sr-only",children:"Close"})]}):null]})]}));x.displayName=r.Dialog.Content.displayName;let m=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-4 text-center sm:text-left border-b bg-dash-sidebar",e),...r});m.displayName="SheetHeader";let g=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-4",e),...r});g.displayName="SheetSection";let b=({className:e,...r})=>(0,t.jsx)("div",{className:(0,i.cn)("px-5 py-3 border-t w-full","flex flex-col-reverse sm:flex-row sm:justify-end gap-2",e),...r});b.displayName="SheetFooter";let h=s.forwardRef(({className:e,...a},o)=>(0,t.jsx)(r.Dialog.Title,{ref:o,className:(0,i.cn)("text-lg text-foreground",e),...a}));h.displayName=r.Dialog.Title.displayName;let v=s.forwardRef(({className:e,...a},o)=>(0,t.jsx)(r.Dialog.Description,{ref:o,className:(0,i.cn)("text-sm text-foreground-light",e),...a}));v.displayName=r.Dialog.Description.displayName,e.s(["Sheet",0,n,"SheetClose",0,d,"SheetContent",0,x,"SheetDescription",0,v,"SheetFooter",0,b,"SheetHeader",0,m,"SheetSection",0,g,"SheetTitle",0,h,"SheetTrigger",0,l])},877555,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let o=(0,r.forwardRef)(({variant:e="default",...r},a)=>{let o;return(o="warning"===e?n:"destructive"===e?i:"success"===e?l:s)?(0,t.jsx)(o,{ref:a,...r}):null}),s=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,a.cn)(e?"w-3 h-3 text-foreground-lighter":"w-4 h-4 p-0.5 bg-foreground-lighter text-background-surface-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z",clipRule:"evenodd"})}),i=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,a.cn)(e?"w-3 h-3 text-destructive-600":"w-4 h-4 p-0.5 bg-destructive-600 text-destructive-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 1 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",clipRule:"evenodd"})}),n=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...r,className:(0,a.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-warning-600 text-warning-200 rounded-sm",r.className),children:(0,t.jsx)("path",{fillRule:"evenodd",d:"M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",clipRule:"evenodd"})}),l=({hideBackground:e=!1,...r})=>(0,t.jsx)("svg",{xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",...r,className:(0,a.cn)(e?"w-3 h-3 text-success-600":"w-4 h-4 p-0.5 bg-foreground text-background rounded-sm",r.className),children:(0,t.jsx)("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:3,d:"m4.5 12.75 6 6 9-13.5"})});e.s(["CheckIcon",0,l,"CriticalIcon",0,i,"EyeIcon",0,({hideBackground:e=!1,...r})=>(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",...r,className:(0,a.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-warning-600 text-warning-200 rounded-sm",r.className),children:[(0,t.jsx)("path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}),(0,t.jsx)("circle",{cx:"12",cy:"12",r:"3"})]}),"EyeOffIcon",0,({hideBackground:e=!1,...r})=>(0,t.jsxs)("svg",{xmlns:"http://www.w3.org/2000/svg",width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",...r,className:(0,a.cn)(e?"w-3 h-3 text-warning":"w-4 h-4 p-0.5 bg-foreground-light text-background rounded-sm",r.className),children:[(0,t.jsx)("path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"}),(0,t.jsx)("path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242"}),(0,t.jsx)("path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"}),(0,t.jsx)("path",{d:"m2 2 20 20"})]}),"InfoIcon",0,s,"StatusIcon",0,o,"WarningIcon",0,n])},290811,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(174617),o=e.i(678001),s=e.i(274664),i=e.i(826524),n=e.i(594661),l=e.i(374251),d=e.i(546595),c="Switch",[u,f]=(0,s.createContextScope)(c),[p,x]=u(c),m=r.forwardRef((e,s)=>{let{__scopeSwitch:n,name:l,checked:u,defaultChecked:f,required:x,disabled:m,value:g="on",onCheckedChange:b,form:w,...y}=e,[j,N]=r.useState(null),S=(0,o.useComposedRefs)(s,e=>N(e)),k=r.useRef(!1),z=!j||w||!!j.closest("form"),[_,C]=(0,i.useControllableState)({prop:u,defaultProp:f??!1,onChange:b,caller:c});return(0,t.jsxs)(p,{scope:n,checked:_,disabled:m,children:[(0,t.jsx)(d.Primitive.button,{type:"button",role:"switch","aria-checked":_,"aria-required":x,"data-state":v(_),"data-disabled":m?"":void 0,disabled:m,value:g,...y,ref:S,onClick:(0,a.composeEventHandlers)(e.onClick,e=>{C(e=>!e),z&&(k.current=e.isPropagationStopped(),k.current||e.stopPropagation())})}),z&&(0,t.jsx)(h,{control:j,bubbles:!k.current,name:l,value:g,checked:_,required:x,disabled:m,form:w,style:{transform:"translateX(-100%)"}})]})});m.displayName=c;var g="SwitchThumb",b=r.forwardRef((e,r)=>{let{__scopeSwitch:a,...o}=e,s=x(g,a);return(0,t.jsx)(d.Primitive.span,{"data-state":v(s.checked),"data-disabled":s.disabled?"":void 0,...o,ref:r})});b.displayName=g;var h=r.forwardRef(({__scopeSwitch:e,control:a,checked:s,bubbles:i=!0,...d},c)=>{let u=r.useRef(null),f=(0,o.useComposedRefs)(u,c),p=(0,n.usePrevious)(s),x=(0,l.useSize)(a);return r.useEffect(()=>{let e=u.current;if(!e)return;let t=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"checked").set;if(p!==s&&t){let r=new Event("click",{bubbles:i});t.call(e,s),e.dispatchEvent(r)}},[p,s,i]),(0,t.jsx)("input",{type:"checkbox","aria-hidden":!0,defaultChecked:s,...d,tabIndex:-1,ref:f,style:{...d.style,...x,position:"absolute",pointerEvents:"none",opacity:0,margin:0}})});function v(e){return e?"checked":"unchecked"}h.displayName="SwitchBubbleInput",e.s(["Root",0,m,"Switch",0,m,"SwitchThumb",0,b,"Thumb",0,b,"createSwitchScope",0,f],736223);var w=e.i(736223),w=w,y=e.i(766181),j=e.i(843778);let N=(0,y.cva)("peer inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand data-[state=checked]:hover:bg-brand-600/90 data-[state=unchecked]:bg-control data-[state=unchecked]:hover:bg-border",{variants:{size:{small:"h-[16px] w-[28px]",medium:"h-[20px] w-[34px]",large:"h-[24px] w-[44px]"}},defaultVariants:{size:"medium"}}),S=(0,y.cva)("pointer-events-none block rounded-full bg-foreground-lighter data-[state=checked]:bg-white shadow-lg ring-0 transition-transform",{variants:{size:{small:"h-[12px] w-[12px] data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-px",medium:"h-[16px] w-[16px] data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-px",large:"h-[18px] w-[18px] data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[3px]"}},defaultVariants:{size:"medium"}}),k=r.forwardRef(({className:e,size:r,...a},o)=>(0,t.jsx)(w.Root,{className:(0,j.cn)(N({size:r}),e),tabIndex:0,...a,ref:o,children:(0,t.jsx)(w.Thumb,{className:(0,j.cn)(S({size:r}))})}));k.displayName=w.Root.displayName,e.s(["Switch",0,k],290811)},202003,e=>{"use strict";e.s(["buildStudioPageTitle",0,e=>{let t=[e.entity,e.section,e.surface,e.project,e.org,e.brand],r=[];return t.forEach(e=>{let t=(e=>{if(void 0===e)return;let t=e.trim().replace(/\s+/g," ");if(0!==t.length)return t.length<=60?t:`${t.slice(0,59).trimEnd()}…`})(e);if(!t)return;let a=r[r.length-1];(void 0===a||a.toLowerCase()!==t.toLowerCase())&&r.push(t)}),r.join(" | ")}])},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),a=e.i(389959),o=e.i(837710),s=e.i(710483),i=e.i(196621),n=e.i(967052);let l=({projectRef:e,subject:a,error:s})=>(0,t.jsx)(o.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(i.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:a,error:s?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:o="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:i,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:f=!0,showErrorPrefix:p=!0,children:x,additionalActions:m})=>{let g=(0,n.useTrack)(),b=(0,a.useRef)(!1),h=i?.message?.includes("503")?"503 Service Temporarily Unavailable":i?.message;return(0,a.useEffect)(()=>{!b.current&&(b.current=!0,.1>Math.random()&&g("dashboard_error_created",{source:"admonition"}))},[g]),(0,t.jsx)(s.Admonition,{type:"warning",layout:m?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[i?.message&&(0,t.jsxs)("p",{children:[p&&"Error: ",h]}),f&&(0,t.jsx)("p",{children:o}),x]}),actions:m?(0,t.jsxs)(t.Fragment,{children:[m,(0,t.jsx)(l,{projectRef:e,subject:r,error:i})]}):(0,t.jsx)(l,{projectRef:e,subject:r,error:i}),className:d})};e.s(["AlertError",0,d,"default",0,d])},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),a=e.i(389959),o=e.i(843778),s=e.i(375761),i=e.i(231665),n=e.i(938933);let l=(0,a.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:f,iconContainerClassName:p,containerClassName:x,size:m="small",...g},b)=>{let[h,v]=(0,a.useState)("Copy"),[w,y]=(0,a.useState)(!0),j=(0,n.default)("input"),N=[];return m&&N.push(j.size[m]),(0,t.jsxs)(i.InputGroup,{className:x,children:[(0,t.jsx)(i.InputGroupInput,{ref:b,onFocus:e=>e.target.select(),...g,size:m,onCopy:f,type:c&&w?"password":g.type,disabled:g.disabled,className:(0,o.cn)(...N,g.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(i.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(i.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&w)?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",className:(0,o.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=g.value,void(0,s.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),f?.()})},children:h}):null,c&&w?(0,t.jsx)(i.InputGroupButton,{size:"tiny",type:"default",onClick:function(){y(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},3259,100387,e=>{"use strict";var t=e.i(478902),r=e.i(106766),a=e.i(933505);e.s(["ChevronRightIcon",()=>a.default],100387);var a=a,o=e.i(389959),s=e.i(843778);let i=o.forwardRef(({...e},r)=>(0,t.jsx)("nav",{ref:r,"aria-label":"breadcrumb",...e}));i.displayName="Breadcrumb";let n=o.forwardRef(({className:e,...r},a)=>(0,t.jsx)("ol",{ref:a,className:(0,s.cn)("flex flex-wrap items-center gap-0.5 wrap-break-word text-sm text-muted-foreground sm:gap-1.5",e),...r}));n.displayName="BreadcrumbList";let l=o.forwardRef(({className:e,...r},a)=>(0,t.jsx)("li",{ref:a,className:(0,s.cn)("inline-flex text-foreground-lighter items-center gap-1.5 leading-5",e),...r}));l.displayName="BreadcrumbItem";let d=o.forwardRef(({asChild:e,className:a,...o},i)=>{let n=e?r.Slot.Slot:"a";return(0,t.jsx)(n,{ref:i,className:(0,s.cn)("transition-colors underline lg:no-underline hover:text-foreground",a),...o})});d.displayName="BreadcrumbLink";let c=o.forwardRef(({className:e,...r},a)=>(0,t.jsx)("span",{ref:a,role:"link","aria-disabled":"true","aria-current":"page",className:(0,s.cn)("no-underline text-foreground",e),...r}));c.displayName="BreadcrumbPage";let u=({children:e,className:r,...o})=>(0,t.jsx)("li",{role:"presentation","aria-hidden":"true",className:(0,s.cn)("[&>svg]:size-3.5 text-foreground-muted",r),...o,children:e??(0,t.jsx)(a.default,{})});u.displayName="BreadcrumbSeparator";let f=({className:e,...r})=>(0,t.jsxs)("span",{className:(0,s.cn)("flex h-4 w-4 items-center justify-center",e),...r,children:[(0,t.jsx)("svg",{role:"presentation","aria-hidden":"true",width:"15",height:"15",viewBox:"0 0 15 15",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,t.jsx)("path",{d:"M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z",fill:"currentColor",fillRule:"evenodd",clipRule:"evenodd"})}),(0,t.jsx)("span",{className:"sr-only",children:"More"})]});f.displayName="BreadcrumbEllipsis",e.s(["Breadcrumb",0,i,"BreadcrumbEllipsis",0,f,"BreadcrumbItem",0,l,"BreadcrumbLink",0,d,"BreadcrumbList",0,n,"BreadcrumbPage",0,c,"BreadcrumbSeparator",0,u],3259)},547723,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let o=(0,r.forwardRef)((e,r)=>(0,t.jsx)("nav",{ref:r,dir:"ltr",...e,className:(0,a.cn)("border-b",e.className),children:(0,t.jsx)("ul",{role:"menu",className:"flex gap-5",children:e.children})})),s=(0,r.forwardRef)(({children:e,className:r,active:o,...s},i)=>(0,t.jsx)("li",{ref:i,"aria-selected":o?"true":"false","data-state":o?"active":"inactive",className:(0,a.cn)("inline-flex items-center justify-center whitespace-nowrap text-sm ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground text-foreground-lighter hover:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent *:py-1.5",r),...s,children:e}));e.s(["NavMenu",0,o,"NavMenuItem",0,s])},167892,e=>{"use strict";var t=e.i(478902),r=e.i(389959),a=e.i(843778);let o="mx-auto w-full max-w-[1200px]",s="px-4 @lg:px-6 @xl:px-10",i=(0,r.forwardRef)(({className:e,bottomPadding:r,size:o="default",...i},n)=>(0,t.jsx)("div",{ref:n,...i,className:(0,a.cn)("mx-auto w-full @container",{small:"max-w-[768px]",default:"max-w-[1200px]",large:"max-w-[1600px]",full:"max-w-none"}[o],s,r&&"pb-16",e)})),n=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("header",{...r,ref:o,className:(0,a.cn)("w-full","flex-col gap-3 py-6",e)})),l=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("h1",{ref:o,...r,className:(0,a.cn)(e)})),d=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("p",{ref:o,...r,className:(0,a.cn)("text-sm text-foreground-light",e)})),c=(0,r.forwardRef)(({className:e,isFullWidth:r,topPadding:o,...s},i)=>(0,t.jsx)("div",{ref:i,...s,className:(0,a.cn)("flex flex-col first:pt-12 py-6",r?"w-full":"gap-3 @md:grid-cols-12 @lg:grid",e)})),u=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("w-full h-px bg-border shrink-0",e)})),f=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("h3",{ref:o,...r,className:(0,a.cn)("text-foreground text-xl",e)})),p=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("p",{ref:o,...r,className:(0,a.cn)("text-sm text-foreground-light",e)})),x=(0,r.forwardRef)(({className:e,children:r,title:o,...s},i)=>(0,t.jsxs)("div",{ref:i,...s,className:(0,a.cn)("col-span-4 xl:col-span-5 prose text-sm",e),children:[o&&(0,t.jsx)("h2",{children:o}),r]})),m=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("col-span-8 xl:col-span-7","flex flex-col gap-6",e)})),g=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("flex flex-col gap-3 items-center",e)})),b=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("flex w-full items-center",e)})),h=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("flex flex-row gap-3",e)})),v=(0,r.forwardRef)(({className:e,...r},o)=>(0,t.jsx)("div",{ref:o,...r,className:(0,a.cn)("flex flex-col gap-3","min-w-[420px]",e)})),w=(0,r.forwardRef)(({className:e,...r},i)=>(0,t.jsx)("div",{ref:i,...r,className:(0,a.cn)(o,s,"my-8 flex flex-col gap-8",e)}));n.displayName="ScaffoldHeader",l.displayName="ScaffoldTitle",d.displayName="ScaffoldDescription",i.displayName="ScaffoldContainer",u.displayName="ScaffoldDivider",c.displayName="ScaffoldSection",v.displayName="ScaffoldColumn",x.displayName="ScaffoldSectionDetail",m.displayName="ScaffoldSectionContent",g.displayName="ScaffoldFilterAndContent",b.displayName="ScaffoldActionsContainer",h.displayName="ScaffoldActionsGroup",w.displayName="ScaffoldContainerLegacy",f.displayName="ScaffoldSectionTitle",p.displayName="ScaffoldSectionDescription",e.s(["MAX_WIDTH_CLASSES",0,o,"PADDING_CLASSES",0,s,"ScaffoldActionsContainer",0,b,"ScaffoldActionsGroup",0,h,"ScaffoldColumn",0,v,"ScaffoldContainer",0,i,"ScaffoldContainerLegacy",0,w,"ScaffoldDescription",0,d,"ScaffoldDivider",0,u,"ScaffoldFilterAndContent",0,g,"ScaffoldHeader",0,n,"ScaffoldSection",0,c,"ScaffoldSectionContent",0,m,"ScaffoldSectionDescription",0,p,"ScaffoldSectionDetail",0,x,"ScaffoldSectionTitle",0,f,"ScaffoldTitle",0,l])},79771,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(158639),a=e.i(345594),o=e.i(989567),s=e.i(587433),i=e.i(837710),n=e.i(843778),l=e.i(547723),d=e.i(167892),c=e.i(954676),u=e.i(389959),f=e.i(3259);let p=({title:e,subtitle:o,icon:s,breadcrumbs:i=[],primaryActions:l,secondaryActions:p,className:x,isCompact:m=!1})=>{let{ref:g}=(0,r.useParams)(),b=m&&e?[...i,{label:e}]:i;return(0,t.jsxs)("div",{className:(0,n.cn)("space-y-4",x),children:[(b.length>0||m&&(e||l||p))&&(0,t.jsxs)("div",{className:(0,n.cn)("flex items-center gap-4",m?"justify-between":"mb-4"),children:[(0,t.jsx)("div",{className:"flex items-center gap-4 flex-1 min-w-0",children:i.length>0?(0,t.jsx)(f.Breadcrumb,{className:(0,n.cn)("text-foreground-muted",m&&"text-base","min-w-0 flex-1"),children:(0,t.jsxs)(f.BreadcrumbList,{className:(0,n.cn)(m?"text-base":"text-xs","min-w-0"),children:[i.map((e,r)=>(0,t.jsxs)(u.Fragment,{children:[(0,t.jsx)(f.BreadcrumbItem,{children:e.element?e.element:e.href?(0,t.jsx)(f.BreadcrumbLink,{asChild:!0,className:"flex items-center gap-2",children:(0,t.jsxs)(a.default,{href:g?e.href.replace("[ref]",g):e.href,children:[1===i.length&&!m&&(0,t.jsx)(c.ChevronLeft,{size:16,strokeWidth:1.5}),e.label]})}):(0,t.jsxs)(f.BreadcrumbPage,{className:"flex items-center gap-2",children:[1===i.length&&(0,t.jsx)(c.ChevronLeft,{size:16,strokeWidth:1.5}),e.label]})}),r<i.length-1&&(0,t.jsx)(f.BreadcrumbSeparator,{})]},e.label||`breadcrumb-${r}`)),m&&e&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(f.BreadcrumbSeparator,{}),(0,t.jsx)(f.BreadcrumbItem,{className:"min-w-0 flex-1",children:(0,t.jsx)(f.BreadcrumbPage,{className:"min-w-0",children:e})})]})]})}):m?(0,t.jsx)("div",{className:"min-w-0 flex-1",children:e}):null}),m&&(0,t.jsxs)("div",{className:"flex items-center gap-2 shrink-0",children:[p&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:p}),l&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:l})]})]}),!m&&(0,t.jsxs)("div",{className:"flex items-center justify-between gap-4",children:[(0,t.jsx)("div",{className:"space-y-4",children:(0,t.jsxs)("div",{className:"flex items-center gap-4",children:[s&&(0,t.jsx)("div",{className:"text-foreground-light",children:s}),(0,t.jsxs)("div",{className:"space-y-1",children:[e&&("string"==typeof e?(0,t.jsx)(d.ScaffoldTitle,{children:e}):e),o&&("string"==typeof o?(0,t.jsx)(d.ScaffoldDescription,{className:"text-sm text-foreground-light",children:o}):o)]})]})}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[p&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:p}),l&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:l})]})]})]})};e.s(["PageLayout",0,({children:e,title:c,subtitle:u,icon:f,breadcrumbs:x=[],primaryActions:m,secondaryActions:g,navigationItems:b=[],className:h,size:v="default",isCompact:w=!1})=>{let{ref:y}=(0,r.useParams)(),j=(0,o.useRouter)();return(0,t.jsxs)("div",{className:(0,n.cn)("w-full min-h-full flex flex-col items-stretch",h),children:[(0,t.jsxs)(d.ScaffoldContainer,{size:v,className:(0,n.cn)("w-full mx-auto","full"===v&&(w?"max-w-none px-6! border-b pt-4":"max-w-none pt-6 px-10! border-b"),"full"!==v&&(w?"pt-4":"pt-12"),0===b.length&&"full"===v&&(w?"pb-4":"pb-8")),children:[(c||u||m||g||x.length>0)&&(0,t.jsx)(p,{title:c,subtitle:u,icon:f,breadcrumbs:x,primaryActions:m,secondaryActions:g,isCompact:w}),b.length>0&&(0,t.jsx)(l.NavMenu,{className:(0,n.cn)(w?"mt-2":"mt-4","full"===v&&"border-none"),children:b.map(e=>{let r=void 0!==e.active?e.active:j.asPath.split("?")[0]===e.href;return(0,t.jsx)(l.NavMenuItem,{active:r,children:e.href?(0,t.jsxs)(a.default,{href:e.href.includes("[ref]")&&y?e.href.replace("[ref]",y):e.href,className:(0,n.cn)("inline-flex items-center gap-2",r&&"text-foreground"),onClick:e.onClick,children:[e.icon&&(0,t.jsx)("span",{children:e.icon}),e.label,e.badge&&(0,t.jsx)(s.Badge,{variant:"default",children:e.badge})]}):(0,t.jsxs)(i.Button,{type:"link",onClick:e.onClick,className:(0,n.cn)(r&&"text-foreground font-medium"),children:[e.icon&&(0,t.jsx)("span",{className:"mr-2",children:e.icon}),e.label,e.badge&&(0,t.jsx)(s.Badge,{variant:"default",children:e.badge})]})},e.label)})})]}),e]})}],79771)}]);