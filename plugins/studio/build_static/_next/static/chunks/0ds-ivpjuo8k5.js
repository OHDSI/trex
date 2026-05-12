(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,170149,e=>{"use strict";var r=e.i(478902);e.i(128328);var t=e.i(657588),o=e.i(283607),a=e.i(370410),n=e.i(816467),i=e.i(389959),s=e.i(655744),l=e.i(837710),d=e.i(843778),c=e.i(375761),u=e.i(253214),p=e.i(20482),m=e.i(378277),f=e.i(97429),g=e.i(710483);let x=(0,i.forwardRef)(({title:e,size:t="small",onConfirm:x,visible:b,onCancel:h,loading:v,cancelLabel:y="Cancel",confirmLabel:w="Submit",confirmPlaceholder:_,confirmString:j,alert:C,input:z,label:S,description:k,formMessage:N,text:T,children:E,blockDeleteButton:R=!0,variant:D="default",errorMessage:H="Value entered does not match",enableCopy:P=!1,...F},L)=>{let[O,M]=(0,i.useState)(!1),A=f.z.object({confirmValue:f.z.preprocess(e=>"string"==typeof e?e.trim():e,f.z.literal(j.trim(),{errorMap:()=>({message:H})}))}),I=(0,s.useForm)({resolver:(0,o.zodResolver)(A),reValidateMode:"onChange",defaultValues:{confirmValue:""}}),$=I.formState.isValid;(0,i.useEffect)(()=>{j&&I.reset()},[j]),(0,i.useEffect)(()=>{if(!O)return;let e=setTimeout(()=>M(!1),2e3);return()=>clearTimeout(e)},[O]);let{title:B,children:q,...V}=C?.base??{},U=C?.title?{label:C.title}:{};return(0,r.jsx)(u.Dialog,{open:b,...F,onOpenChange:()=>{b&&h()},children:(0,r.jsxs)(u.DialogContent,{ref:L,className:"p-0 gap-0 pb-5 block!",size:t,children:[(0,r.jsx)(u.DialogHeader,{className:(0,d.cn)("border-b"),padding:"small",children:(0,r.jsx)(u.DialogTitle,{className:"",children:e})}),C&&(0,r.jsx)(g.Admonition,{type:D,description:C.description,...U,className:"border-x-0 rounded-none -mt-px",...V}),E&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(u.DialogSection,{padding:"small",children:E}),(0,r.jsx)(u.DialogSectionSeparator,{})]}),void 0!==T&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(u.DialogSection,{className:"p-5",padding:"small",children:(0,r.jsx)("p",{className:"text-foreground-light text-sm",children:T})}),(0,r.jsx)(u.DialogSectionSeparator,{})]}),(0,r.jsx)(p.Form,{...I,children:(0,r.jsxs)("form",{autoComplete:"off",onSubmit:I.handleSubmit(function(e){x()}),className:"px-5 flex flex-col gap-y-3 pt-3",children:[(0,r.jsx)(p.FormField,{control:I.control,name:"confirmValue",render:({field:e})=>(0,r.jsxs)(p.FormItem,{className:"flex flex-col gap-y-2",children:[(0,r.jsxs)(p.FormLabel,{...S,enableSelection:!P,children:["Type"," ",P?(0,r.jsx)(l.Button,{type:"default",className:"h-[23px] px-1.5 py-0 border-muted text-sm whitespace-pre break-all",iconRight:O?(0,r.jsx)(a.Check,{strokeWidth:2,className:"text-brand"}):(0,r.jsx)(n.Copy,{}),onClick:()=>{M(!0),(0,c.copyToClipboard)(j)},children:j}):(0,r.jsx)("span",{className:"text-foreground break-all whitespace-pre",children:j})," ","to confirm."]}),(0,r.jsx)(p.FormControl,{children:(0,r.jsx)(m.Input_Shadcn_,{autoComplete:"off",placeholder:_,...z,...e})}),!!k&&(0,r.jsx)(p.FormDescription,{...k}),(0,r.jsx)(p.FormMessage,{...N})]})}),(0,r.jsxs)("div",{className:"flex gap-2",children:[!R&&(0,r.jsx)(l.Button,{size:"medium",block:!0,type:"default",disabled:v,onClick:h,children:y}),(0,r.jsx)(l.Button,{block:!0,size:"medium",type:"destructive"===D?"danger":"warning"===D?"warning":"primary",htmlType:"submit",loading:v,disabled:!$||v,className:"truncate",children:w})]})]})})]})})});x.displayName="TextConfirmModal",e.s(["TextConfirmModal",0,e=>{let o=(0,t.useFlag)("textConfirmationModalClickToCopy");return(0,r.jsx)(x,{...e,enableCopy:o})}],170149)},567558,e=>{"use strict";var r=e.i(478902),t=e.i(26898),o=e.i(389959),a=e.i(837710),n=e.i(710483),i=e.i(196621),s=e.i(967052);let l=({projectRef:e,subject:o,error:n})=>(0,r.jsx)(a.Button,{asChild:!0,type:"default",className:"w-min",children:(0,r.jsx)(i.SupportLink,{queryParams:{category:t.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:o,error:n?.message},children:"Contact support"})}),d=({projectRef:e,subject:t,description:a="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:i,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:p=!0,showErrorPrefix:m=!0,children:f,additionalActions:g})=>{let x=(0,s.useTrack)(),b=(0,o.useRef)(!1),h=i?.message?.includes("503")?"503 Service Temporarily Unavailable":i?.message;return(0,o.useEffect)(()=>{!b.current&&(b.current=!0,.1>Math.random()&&x("dashboard_error_created",{source:"admonition"}))},[x]),(0,r.jsx)(n.Admonition,{type:"warning",layout:g?"vertical":u,showIcon:c,title:t,description:(0,r.jsxs)(r.Fragment,{children:[i?.message&&(0,r.jsxs)("p",{children:[m&&"Error: ",h]}),p&&(0,r.jsx)("p",{children:a}),f]}),actions:g?(0,r.jsxs)(r.Fragment,{children:[g,(0,r.jsx)(l,{projectRef:e,subject:t,error:i})]}):(0,r.jsx)(l,{projectRef:e,subject:t,error:i}),className:d})};e.s(["AlertError",0,d,"default",0,d])},938933,305551,e=>{"use strict";var r=e.i(389959);let t={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${t.size.text.tiny} ${t.size.padding.tiny}`,small:`${t.size.text.small} ${t.size.padding.small}`,medium:`${t.size.text.medium} ${t.size.padding.medium}`,large:`${t.size.text.large} ${t.size.padding.large}`,xlarge:`${t.size.text.xlarge} ${t.size.padding.xlarge}`},a={accordion:{variants:{default:{base:`
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
      ${t.border.primary}

      flex flex-col
      rounded-md shadow-lg overflow-hidden relative
    `,hoverable:"transition hover:-translate-y-1 hover:shadow-2xl",head:`px-8 py-6 flex justify-between
    border-b
      ${t.border.primary} `,content:"p-8"},tabs:{base:"w-full justify-between space-y-4",underlined:{list:`
        flex items-center border-b
        ${t.border.secondary}
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
      `},block:"w-full flex items-center justify-center",size:{...o},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
      block
      box-border
      w-full
      rounded-md
      shadow-xs
      transition-all
      text-foreground
      border
      focus-visible:shadow-md
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
      group
    `,variants:{standard:`
        bg-foreground/[.026]
        border border-control
        `,error:`
        bg-destructive-200
        border border-destructive-500
        focus:ring-destructive-400
        placeholder:text-destructive-400
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `},form_layout:{container:"grid gap-2",flex:{left:{base:"flex flex-row gap-6",content:"",labels:"order-2",data_input:"order-1"},right:{base:"flex flex-row gap-6 justify-between",content:"order-last",labels:"",data_input:"text-right"}},responsive:"md:grid md:grid-cols-12",non_responsive:"grid grid-cols-12 gap-2",labels_horizontal_layout:"flex flex-row space-x-2 justify-between col-span-12",labels_vertical_layout:"flex flex-col space-y-2 col-span-4",data_input_horizontal_layout:"col-span-12",non_box_data_input_spacing_vertical:"my-3",non_box_data_input_spacing_horizontal:"my-3 md:mt-0 mb-3",data_input_vertical_layout:"col-span-8",data_input_vertical_layout__align_right:"text-right",label:{base:"block text-foreground-light",size:{...t.size.text}},label_optional:{base:"text-foreground-lighter",size:{...t.size.text}},description:{base:"mt-2 text-foreground-lighter leading-normal",size:{...t.size.text}},label_before:{base:"text-foreground-lighter ",size:{...t.size.text}},label_after:{base:"text-foreground-lighter",size:{...t.size.text}},error:{base:`
        text-red-900
        transition-all
        data-show:mt-2
        data-show:animate-slide-down-normal
        data-hide:animate-slide-up-normal
      `,size:{...t.size.text}},size:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"}},popover:{trigger:`
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
      ${t.focus}
      focus-visible:border-foreground-muted
      focus-visible:ring-background-control
      ${t.placeholder}
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
    `,size:{...o},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,a],305551);let n=(0,r.createContext)({theme:a});e.s(["default",0,function(e){let{theme:{[e]:t}}=(0,r.useContext)(n);return t||(t=a.accordion),t=JSON.parse(t=JSON.stringify(t).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var r=e.i(478902),t=e.i(816467),o=e.i(389959),a=e.i(843778),n=e.i(375761),i=e.i(231665),s=e.i(938933);let l=(0,o.forwardRef)(({copy:e,showCopyOnHover:l=!1,icon:d,reveal:c=!1,actions:u,onCopy:p,iconContainerClassName:m,containerClassName:f,size:g="small",...x},b)=>{let[h,v]=(0,o.useState)("Copy"),[y,w]=(0,o.useState)(!0),_=(0,s.default)("input"),j=[];return g&&j.push(_.size[g]),(0,r.jsxs)(i.InputGroup,{className:f,children:[(0,r.jsx)(i.InputGroupInput,{ref:b,onFocus:e=>e.target.select(),...x,size:g,onCopy:p,type:c&&y?"password":x.type,disabled:x.disabled,className:(0,a.cn)(...j,x.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,r.jsx)(i.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,r.jsxs)(i.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,r.jsx)(i.InputGroupButton,{size:"tiny",type:"default",className:(0,a.cn)(l&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,r.jsx)(t.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=x.value,void(0,n.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),p?.()})},children:h}):null,c&&y?(0,r.jsx)(i.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,l])},592383,e=>{"use strict";var r=e.i(478902),t=e.i(755146),o=e.i(861833),a=e.i(843778),n=e.i(937942);let i=({children:e})=>(0,r.jsx)("h3",{className:"mb-1",children:e}),s=({children:e})=>(0,r.jsx)("code",{className:"text-code-inline",children:e}),l=({href:e,children:t})=>(0,r.jsx)(n.InlineLink,{href:e??"/",children:t});e.s(["Markdown",0,({children:e,className:n,content:d="",extLinks:c=!1,...u})=>(0,r.jsx)("div",{className:(0,a.cn)("text-sm",n),children:(0,r.jsx)(t.default,{remarkPlugins:[o.default],components:{h3:i,code:s,a:l},...u,children:e??d})})])},466472,e=>{"use strict";var r=e.i(478902),t=e.i(389959),o=e.i(837710),a=e.i(843778),n=e.i(253214),i=e.i(710483);let s=(0,t.forwardRef)(({title:e,description:s,size:l="small",visible:d,onCancel:c,onConfirm:u,loading:p,cancelLabel:m="Cancel",confirmLabel:f="Submit",confirmLabelLoading:g,alert:x,children:b,variant:h="default",disabled:v,className:y,...w},_)=>{let[j,C]=(0,t.useState)(void 0!==p&&p);(0,t.useEffect)(()=>{d&&void 0===p&&C(!1)},[d]),(0,t.useEffect)(()=>{void 0!==p&&C(p)},[p]);let{title:z,children:S,...k}=x?.base??{},N=x?.title?{label:x.title}:{};return(0,r.jsx)(n.Dialog,{open:d,...w,onOpenChange:()=>{d&&c()},children:(0,r.jsxs)(n.DialogContent,{"aria-describedby":void 0,ref:_,className:"p-0 gap-0 pb-5 block!",size:l,children:[(0,r.jsxs)(n.DialogHeader,{className:(0,a.cn)("border-b"),padding:"small",children:[(0,r.jsx)(n.DialogTitle,{children:e}),s&&(0,r.jsx)(n.DialogDescription,{children:s})]}),x&&(0,r.jsx)(i.Admonition,{type:h,description:x.description,...N,className:"border-x-0 rounded-none -mt-px",...k}),b&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsx)(n.DialogSection,{padding:"small",className:y,children:b}),(0,r.jsx)(n.DialogSectionSeparator,{})]}),(0,r.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,r.jsx)(o.Button,{size:"medium",block:!0,type:"default",disabled:j,onClick:()=>c(),children:m}),(0,r.jsx)(o.Button,{block:!0,size:"medium",type:"destructive"===h?"danger":"warning"===h?"warning":"primary",htmlType:"submit",loading:j,disabled:j||v,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===p&&C(!0)},className:"truncate",children:j&&g?g:f})]})]})})});s.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,s,"default",0,s])},211570,570575,e=>{"use strict";let r=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,r],570575),e.s(["Trash",0,r],211570)},345942,e=>{"use strict";var r=e.i(479084);e.s(["getDatabaseSizeSql",0,()=>r.safeSql`select sum(pg_database_size(pg_database.datname))::bigint as db_size from pg_database;`,"getLiveTupleEstimate",0,(e,t="public")=>r.safeSql`
SELECT n_live_tup AS live_tuple_estimate
FROM pg_stat_user_tables
WHERE schemaname = ${(0,r.literal)(t)}
AND relname = ${(0,r.literal)(e)};`,"getMaxConnectionsSql",0,()=>r.safeSql`show max_connections`,"replicationLagSql",0,()=>r.safeSql`
select
  case
    when (select count(*) from pg_stat_wal_receiver) = 1 and pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn()
    then 0
    else coalesce(extract(epoch from now() - pg_last_xact_replay_timestamp()),0)
  end as physical_replica_lag_second
  `])},836764,e=>{e.v({dash:"loading-anim-module__T3MC1q__dash",loading:"loading-anim-module__T3MC1q__loading"})},724945,e=>{"use strict";var r=e.i(478902),t=e.i(836764);e.s(["default",0,()=>(0,r.jsx)("div",{className:"w-full h-full flex flex-col items-center justify-center",children:(0,r.jsx)("div",{children:(0,r.jsx)("svg",{width:"60",height:"62",viewBox:"0 0 60 62",fill:"none",xmlns:"http://www.w3.org/2000/svg",className:t.default.loading,children:(0,r.jsx)("path",{d:"M30.2571 4.12811L30.257 4.12389C30.2133 1.21067 26.5349 -0.034778 24.7224 2.24311L1.76109 31.0996C-1.21104 34.8348 1.45637 40.34 6.23131 40.34H29.4845L29.7563 58.4432C29.8 61.3564 33.4783 62.6016 35.2908 60.324L34.8996 60.0127L35.2908 60.324L58.2521 31.4674C61.2241 27.7322 58.5568 22.227 53.782 22.227H30.3762L30.2571 4.12811Z",stroke:"hsl(var(--brand-default))",strokeWidth:2,strokeLinecap:"round"})})})})])},818843,e=>{"use strict";var r=e.i(724945);e.s(["LogoLoader",()=>r.default])},71049,e=>{"use strict";var r,t=e.i(478902),o=e.i(389959),a=e.i(174617),n=e.i(274664),i=e.i(826524),s=e.i(678001),l=e.i(940051),d=e.i(839518),c=e.i(889251),u=e.i(546595),p=e.i(735343),m="HoverCard",[f,g]=(0,n.createContextScope)(m,[l.createPopperScope]),x=(0,l.createPopperScope)(),[b,h]=f(m),v=e=>{let{__scopeHoverCard:r,children:a,open:n,defaultOpen:s,onOpenChange:d,openDelay:c=700,closeDelay:u=300}=e,p=x(r),f=o.useRef(0),g=o.useRef(0),h=o.useRef(!1),v=o.useRef(!1),[y,w]=(0,i.useControllableState)({prop:n,defaultProp:s??!1,onChange:d,caller:m}),_=o.useCallback(()=>{clearTimeout(g.current),f.current=window.setTimeout(()=>w(!0),c)},[c,w]),j=o.useCallback(()=>{clearTimeout(f.current),h.current||v.current||(g.current=window.setTimeout(()=>w(!1),u))},[u,w]),C=o.useCallback(()=>w(!1),[w]);return o.useEffect(()=>()=>{clearTimeout(f.current),clearTimeout(g.current)},[]),(0,t.jsx)(b,{scope:r,open:y,onOpenChange:w,onOpen:_,onClose:j,onDismiss:C,hasSelectionRef:h,isPointerDownOnContentRef:v,children:(0,t.jsx)(l.Root,{...p,children:a})})};v.displayName=m;var y="HoverCardTrigger",w=o.forwardRef((e,r)=>{let{__scopeHoverCard:o,...n}=e,i=h(y,o),s=x(o);return(0,t.jsx)(l.Anchor,{asChild:!0,...s,children:(0,t.jsx)(u.Primitive.a,{"data-state":i.open?"open":"closed",...n,ref:r,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,E(i.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,E(i.onClose)),onFocus:(0,a.composeEventHandlers)(e.onFocus,i.onOpen),onBlur:(0,a.composeEventHandlers)(e.onBlur,i.onClose),onTouchStart:(0,a.composeEventHandlers)(e.onTouchStart,e=>e.preventDefault())})})});w.displayName=y;var _="HoverCardPortal",[j,C]=f(_,{forceMount:void 0}),z=e=>{let{__scopeHoverCard:r,forceMount:o,children:a,container:n}=e,i=h(_,r);return(0,t.jsx)(j,{scope:r,forceMount:o,children:(0,t.jsx)(c.Presence,{present:o||i.open,children:(0,t.jsx)(d.Portal,{asChild:!0,container:n,children:a})})})};z.displayName=_;var S="HoverCardContent",k=o.forwardRef((e,r)=>{let o=C(S,e.__scopeHoverCard),{forceMount:n=o.forceMount,...i}=e,s=h(S,e.__scopeHoverCard);return(0,t.jsx)(c.Presence,{present:n||s.open,children:(0,t.jsx)(N,{"data-state":s.open?"open":"closed",...i,onPointerEnter:(0,a.composeEventHandlers)(e.onPointerEnter,E(s.onOpen)),onPointerLeave:(0,a.composeEventHandlers)(e.onPointerLeave,E(s.onClose)),ref:r})})});k.displayName=S;var N=o.forwardRef((e,n)=>{let{__scopeHoverCard:i,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:u,onInteractOutside:m,...f}=e,g=h(S,i),b=x(i),v=o.useRef(null),y=(0,s.useComposedRefs)(n,v),[w,_]=o.useState(!1);return o.useEffect(()=>{if(w){let e=document.body;return r=e.style.userSelect||e.style.webkitUserSelect,e.style.userSelect="none",e.style.webkitUserSelect="none",()=>{e.style.userSelect=r,e.style.webkitUserSelect=r}}},[w]),o.useEffect(()=>{if(v.current){let e=()=>{_(!1),g.isPointerDownOnContentRef.current=!1,setTimeout(()=>{document.getSelection()?.toString()!==""&&(g.hasSelectionRef.current=!0)})};return document.addEventListener("pointerup",e),()=>{document.removeEventListener("pointerup",e),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!1}}},[g.isPointerDownOnContentRef,g.hasSelectionRef]),o.useEffect(()=>{v.current&&(function(e){let r=[],t=document.createTreeWalker(e,NodeFilter.SHOW_ELEMENT,{acceptNode:e=>e.tabIndex>=0?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});for(;t.nextNode();)r.push(t.currentNode);return r})(v.current).forEach(e=>e.setAttribute("tabindex","-1"))}),(0,t.jsx)(p.DismissableLayer,{asChild:!0,disableOutsidePointerEvents:!1,onInteractOutside:m,onEscapeKeyDown:d,onPointerDownOutside:c,onFocusOutside:(0,a.composeEventHandlers)(u,e=>{e.preventDefault()}),onDismiss:g.onDismiss,children:(0,t.jsx)(l.Content,{...b,...f,onPointerDown:(0,a.composeEventHandlers)(f.onPointerDown,e=>{e.currentTarget.contains(e.target)&&_(!0),g.hasSelectionRef.current=!1,g.isPointerDownOnContentRef.current=!0}),ref:y,style:{...f.style,userSelect:w?"text":void 0,WebkitUserSelect:w?"text":void 0,"--radix-hover-card-content-transform-origin":"var(--radix-popper-transform-origin)","--radix-hover-card-content-available-width":"var(--radix-popper-available-width)","--radix-hover-card-content-available-height":"var(--radix-popper-available-height)","--radix-hover-card-trigger-width":"var(--radix-popper-anchor-width)","--radix-hover-card-trigger-height":"var(--radix-popper-anchor-height)"}})})}),T=o.forwardRef((e,r)=>{let{__scopeHoverCard:o,...a}=e,n=x(o);return(0,t.jsx)(l.Arrow,{...n,...a,ref:r})});function E(e){return r=>"touch"===r.pointerType?void 0:e()}T.displayName="HoverCardArrow",e.s(["Arrow",0,T,"Content",0,k,"HoverCard",0,v,"HoverCardArrow",0,T,"HoverCardContent",0,k,"HoverCardPortal",0,z,"HoverCardTrigger",0,w,"Portal",0,z,"Root",0,v,"Trigger",0,w,"createHoverCardScope",0,g],73929);var R=e.i(73929),R=R,D=e.i(843778);let H=R.Root,P=R.Trigger,F=o.forwardRef(({className:e,align:r="center",animate:o="zoom-in",sideOffset:a=4,...n},i)=>(0,t.jsx)(R.Portal,{children:(0,t.jsx)(R.Content,{ref:i,align:r,sideOffset:a,className:(0,D.cn)("z-50 w-64 rounded-md border bg-overlay p-4 text-popover-foreground shadow-md outline-hidden","zoom-in"===o?"animate-in zoom-in-[99%]":"animate-in fade-in-50 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",e),...n})}));F.displayName=R.Content.displayName,e.s(["HoverCard",0,H,"HoverCardContent",0,F,"HoverCardTrigger",0,P],71049)},68205,e=>{"use strict";let r=e=>Array.from(new Set(e)).sort();e.s(["edgeFunctionsKeys",0,{list:e=>["projects",e,"edge-functions"],lastHourStats:(e,t=[])=>["projects",e,"edge-functions","last-hour-stats",r(t)],detail:(e,r)=>["projects",e,"edge-function",r,"detail"],body:(e,r)=>["projects",e,"edge-function",r,"body"]},"normalizeFunctionIds",0,r])},240788,e=>{"use strict";var r=e.i(242882),t=e.i(68205),o=e.i(234745);async function a({projectRef:e},r){if(!e)throw Error("projectRef is required");let{data:t,error:n}=await (0,o.get)("/v1/projects/{ref}/functions",{params:{path:{ref:e}},signal:r});return n&&(0,o.handleError)(n),t}e.s(["useEdgeFunctionsQuery",0,({projectRef:e},{enabled:o=!0,...n}={})=>(0,r.useQuery)({queryKey:t.edgeFunctionsKeys.list(e),queryFn:({signal:r})=>a({projectRef:e},r),enabled:o&&void 0!==e,...n})])}]);