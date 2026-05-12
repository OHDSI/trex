(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,592383,e=>{"use strict";var t=e.i(478902),r=e.i(755146),n=e.i(861833),o=e.i(843778),i=e.i(937942);let a=({children:e})=>(0,t.jsx)("h3",{className:"mb-1",children:e}),l=({children:e})=>(0,t.jsx)("code",{className:"text-code-inline",children:e}),s=({href:e,children:r})=>(0,t.jsx)(i.InlineLink,{href:e??"/",children:r});e.s(["Markdown",0,({children:e,className:i,content:d="",extLinks:c=!1,...u})=>(0,t.jsx)("div",{className:(0,o.cn)("text-sm",i),children:(0,t.jsx)(r.default,{remarkPlugins:[n.default],components:{h3:a,code:l,a:s},...u,children:e??d})})])},466472,e=>{"use strict";var t=e.i(478902),r=e.i(389959),n=e.i(837710),o=e.i(843778),i=e.i(253214),a=e.i(710483);let l=(0,r.forwardRef)(({title:e,description:l,size:s="small",visible:d,onCancel:c,onConfirm:u,loading:f,cancelLabel:p="Cancel",confirmLabel:g="Submit",confirmLabelLoading:m,alert:b,children:x,variant:h="default",disabled:v,className:y,...w},j)=>{let[_,O]=(0,r.useState)(void 0!==f&&f);(0,r.useEffect)(()=>{d&&void 0===f&&O(!1)},[d]),(0,r.useEffect)(()=>{void 0!==f&&O(f)},[f]);let{title:k,children:z,...M}=b?.base??{},C=b?.title?{label:b.title}:{};return(0,t.jsx)(i.Dialog,{open:d,...w,onOpenChange:()=>{d&&c()},children:(0,t.jsxs)(i.DialogContent,{"aria-describedby":void 0,ref:j,className:"p-0 gap-0 pb-5 block!",size:s,children:[(0,t.jsxs)(i.DialogHeader,{className:(0,o.cn)("border-b"),padding:"small",children:[(0,t.jsx)(i.DialogTitle,{children:e}),l&&(0,t.jsx)(i.DialogDescription,{children:l})]}),b&&(0,t.jsx)(a.Admonition,{type:h,description:b.description,...C,className:"border-x-0 rounded-none -mt-px",...M}),x&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(i.DialogSection,{padding:"small",className:y,children:x}),(0,t.jsx)(i.DialogSectionSeparator,{})]}),(0,t.jsxs)("div",{className:"flex gap-2 px-5 pt-5",children:[(0,t.jsx)(n.Button,{size:"medium",block:!0,type:"default",disabled:_,onClick:()=>c(),children:p}),(0,t.jsx)(n.Button,{block:!0,size:"medium",type:"destructive"===h?"danger":"warning"===h?"warning":"primary",htmlType:"submit",loading:_,disabled:_||v,onClick:e=>{e.preventDefault(),e.stopPropagation(),u(),void 0===f&&O(!0)},className:"truncate",children:_&&m?m:g})]})]})})});l.displayName="ConfirmationModal",e.s(["ConfirmationModal",0,l,"default",0,l])},211570,570575,e=>{"use strict";let t=(0,e.i(388019).default)("Trash",[["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",key:"4alrt4"}],["path",{d:"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",key:"v07s0e"}]]);e.s(["default",0,t],570575),e.s(["Trash",0,t],211570)},170149,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(657588),n=e.i(283607),o=e.i(370410),i=e.i(816467),a=e.i(389959),l=e.i(655744),s=e.i(837710),d=e.i(843778),c=e.i(375761),u=e.i(253214),f=e.i(20482),p=e.i(378277),g=e.i(97429),m=e.i(710483);let b=(0,a.forwardRef)(({title:e,size:r="small",onConfirm:b,visible:x,onCancel:h,loading:v,cancelLabel:y="Cancel",confirmLabel:w="Submit",confirmPlaceholder:j,confirmString:_,alert:O,input:k,label:z,description:M,formMessage:C,text:S,children:E,blockDeleteButton:T=!0,variant:N="default",errorMessage:R="Value entered does not match",enableCopy:P=!1,...D},I)=>{let[L,A]=(0,a.useState)(!1),F=g.z.object({confirmValue:g.z.preprocess(e=>"string"==typeof e?e.trim():e,g.z.literal(_.trim(),{errorMap:()=>({message:R})}))}),V=(0,l.useForm)({resolver:(0,n.zodResolver)(F),reValidateMode:"onChange",defaultValues:{confirmValue:""}}),$=V.formState.isValid;(0,a.useEffect)(()=>{_&&V.reset()},[_]),(0,a.useEffect)(()=>{if(!L)return;let e=setTimeout(()=>A(!1),2e3);return()=>clearTimeout(e)},[L]);let{title:B,children:q,...U}=O?.base??{},G=O?.title?{label:O.title}:{};return(0,t.jsx)(u.Dialog,{open:x,...D,onOpenChange:()=>{x&&h()},children:(0,t.jsxs)(u.DialogContent,{ref:I,className:"p-0 gap-0 pb-5 block!",size:r,children:[(0,t.jsx)(u.DialogHeader,{className:(0,d.cn)("border-b"),padding:"small",children:(0,t.jsx)(u.DialogTitle,{className:"",children:e})}),O&&(0,t.jsx)(m.Admonition,{type:N,description:O.description,...G,className:"border-x-0 rounded-none -mt-px",...U}),E&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{padding:"small",children:E}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),void 0!==S&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(u.DialogSection,{className:"p-5",padding:"small",children:(0,t.jsx)("p",{className:"text-foreground-light text-sm",children:S})}),(0,t.jsx)(u.DialogSectionSeparator,{})]}),(0,t.jsx)(f.Form,{...V,children:(0,t.jsxs)("form",{autoComplete:"off",onSubmit:V.handleSubmit(function(e){b()}),className:"px-5 flex flex-col gap-y-3 pt-3",children:[(0,t.jsx)(f.FormField,{control:V.control,name:"confirmValue",render:({field:e})=>(0,t.jsxs)(f.FormItem,{className:"flex flex-col gap-y-2",children:[(0,t.jsxs)(f.FormLabel,{...z,enableSelection:!P,children:["Type"," ",P?(0,t.jsx)(s.Button,{type:"default",className:"h-[23px] px-1.5 py-0 border-muted text-sm whitespace-pre break-all",iconRight:L?(0,t.jsx)(o.Check,{strokeWidth:2,className:"text-brand"}):(0,t.jsx)(i.Copy,{}),onClick:()=>{A(!0),(0,c.copyToClipboard)(_)},children:_}):(0,t.jsx)("span",{className:"text-foreground break-all whitespace-pre",children:_})," ","to confirm."]}),(0,t.jsx)(f.FormControl,{children:(0,t.jsx)(p.Input_Shadcn_,{autoComplete:"off",placeholder:j,...k,...e})}),!!M&&(0,t.jsx)(f.FormDescription,{...M}),(0,t.jsx)(f.FormMessage,{...C})]})}),(0,t.jsxs)("div",{className:"flex gap-2",children:[!T&&(0,t.jsx)(s.Button,{size:"medium",block:!0,type:"default",disabled:v,onClick:h,children:y}),(0,t.jsx)(s.Button,{block:!0,size:"medium",type:"destructive"===N?"danger":"warning"===N?"warning":"primary",htmlType:"submit",loading:v,disabled:!$||v,className:"truncate",children:w})]})]})})]})})});b.displayName="TextConfirmModal",e.s(["TextConfirmModal",0,e=>{let n=(0,r.useFlag)("textConfirmationModalClickToCopy");return(0,t.jsx)(b,{...e,enableCopy:n})}],170149)},567558,e=>{"use strict";var t=e.i(478902),r=e.i(26898),n=e.i(389959),o=e.i(837710),i=e.i(710483),a=e.i(196621),l=e.i(967052);let s=({projectRef:e,subject:n,error:i})=>(0,t.jsx)(o.Button,{asChild:!0,type:"default",className:"w-min",children:(0,t.jsx)(a.SupportLink,{queryParams:{category:r.SupportCategories.DASHBOARD_BUG,projectRef:e,subject:n,error:i?.message},children:"Contact support"})}),d=({projectRef:e,subject:r,description:o="Try refreshing your browser, but if the issue persists for more than a few minutes, please reach out to us via support.",error:a,className:d,showIcon:c=!0,layout:u="responsive",showInstructions:f=!0,showErrorPrefix:p=!0,children:g,additionalActions:m})=>{let b=(0,l.useTrack)(),x=(0,n.useRef)(!1),h=a?.message?.includes("503")?"503 Service Temporarily Unavailable":a?.message;return(0,n.useEffect)(()=>{!x.current&&(x.current=!0,.1>Math.random()&&b("dashboard_error_created",{source:"admonition"}))},[b]),(0,t.jsx)(i.Admonition,{type:"warning",layout:m?"vertical":u,showIcon:c,title:r,description:(0,t.jsxs)(t.Fragment,{children:[a?.message&&(0,t.jsxs)("p",{children:[p&&"Error: ",h]}),f&&(0,t.jsx)("p",{children:o}),g]}),actions:m?(0,t.jsxs)(t.Fragment,{children:[m,(0,t.jsx)(s,{projectRef:e,subject:r,error:a})]}):(0,t.jsx)(s,{projectRef:e,subject:r,error:a}),className:d})};e.s(["AlertError",0,d,"default",0,d])},938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},n={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},o={accordion:{variants:{default:{base:`
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
      `},block:"w-full flex items-center justify-center",size:{...n},scrollable:"overflow-auto whitespace-nowrap no-scrollbar mask-fadeout-right",wrappable:"flex-wrap",content:"focus:outline-hidden transition-height"},input:{base:`
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
       `},container:"relative",with_icon:{tiny:"pl-7",small:"pl-8",medium:"pl-8",large:"pl-10",xlarge:"pl-11"},size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",textarea_actions_container:"absolute inset-y-1.5 right-0 pl-3 pr-1 flex space-x-1 items-start",textarea_actions_container_items:"flex items-center"},sidepanel:{base:`
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
    `,size:{...n},disabled:"opacity-50",actions_container:"absolute inset-y-0 right-0 pl-3 pr-1 flex space-x-1 items-center",chevron_container:"absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none",chevron:"h-5 w-5 text-foreground-muted",option:`
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
    `}};e.s(["default",0,o],305551);let i=(0,t.createContext)({theme:o});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(i);return r||(r=o.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},746301,e=>{"use strict";var t=e.i(478902),r=e.i(816467),n=e.i(389959),o=e.i(843778),i=e.i(375761),a=e.i(231665),l=e.i(938933);let s=(0,n.forwardRef)(({copy:e,showCopyOnHover:s=!1,icon:d,reveal:c=!1,actions:u,onCopy:f,iconContainerClassName:p,containerClassName:g,size:m="small",...b},x)=>{let[h,v]=(0,n.useState)("Copy"),[y,w]=(0,n.useState)(!0),j=(0,l.default)("input"),_=[];return m&&_.push(j.size[m]),(0,t.jsxs)(a.InputGroup,{className:g,children:[(0,t.jsx)(a.InputGroupInput,{ref:x,onFocus:e=>e.target.select(),...b,size:m,onCopy:f,type:c&&y?"password":b.type,disabled:b.disabled,className:(0,o.cn)(..._,b.className),"data-1p-ignore":!0,"data-lpignore":"true","data-form-type":"other","data-bwignore":!0}),d&&(0,t.jsx)(a.InputGroupAddon,{align:"inline-start",children:d}),e||u?(0,t.jsxs)(a.InputGroupAddon,{align:"inline-end",className:"pr-1 has-[>button]:mr-0 has-[>kbd]:mr-0",children:[e&&!(c&&y)?(0,t.jsx)(a.InputGroupButton,{size:"tiny",type:"default",className:(0,o.cn)(s&&"opacity-0 group-hover:opacity-100 transition"),icon:(0,t.jsx)(r.Copy,{size:16,className:"text-foreground-muted"}),onClick:()=>{var e;return e=b.value,void(0,i.copyToClipboard)(e,()=>{v("Copied"),setTimeout(function(){v("Copy")},3e3),f?.()})},children:h}):null,c&&y?(0,t.jsx)(a.InputGroupButton,{size:"tiny",type:"default",onClick:function(){w(!1)},children:"Reveal"}):null,u&&u]}):null]})});e.s(["Input",0,s])},836764,e=>{e.v({dash:"loading-anim-module__T3MC1q__dash",loading:"loading-anim-module__T3MC1q__loading"})},724945,e=>{"use strict";var t=e.i(478902),r=e.i(836764);e.s(["default",0,()=>(0,t.jsx)("div",{className:"w-full h-full flex flex-col items-center justify-center",children:(0,t.jsx)("div",{children:(0,t.jsx)("svg",{width:"60",height:"62",viewBox:"0 0 60 62",fill:"none",xmlns:"http://www.w3.org/2000/svg",className:r.default.loading,children:(0,t.jsx)("path",{d:"M30.2571 4.12811L30.257 4.12389C30.2133 1.21067 26.5349 -0.034778 24.7224 2.24311L1.76109 31.0996C-1.21104 34.8348 1.45637 40.34 6.23131 40.34H29.4845L29.7563 58.4432C29.8 61.3564 33.4783 62.6016 35.2908 60.324L34.8996 60.0127L35.2908 60.324L58.2521 31.4674C61.2241 27.7322 58.5568 22.227 53.782 22.227H30.3762L30.2571 4.12811Z",stroke:"hsl(var(--brand-default))",strokeWidth:2,strokeLinecap:"round"})})})})])},818843,e=>{"use strict";var t=e.i(724945);e.s(["LogoLoader",()=>t.default])},156054,350660,e=>{"use strict";function t(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,n)}return r}function r(e){for(var r=1;r<arguments.length;r++){var n=null!=arguments[r]?arguments[r]:{};r%2?t(Object(n),!0).forEach(function(t){var r;r=n[t],t in e?Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}):e[t]=r}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):t(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}function n(e,t){(null==t||t>e.length)&&(t=e.length);for(var r=0,n=Array(t);r<t;r++)n[r]=e[r];return n}function o(e,t){var r=Object.keys(e);if(Object.getOwnPropertySymbols){var n=Object.getOwnPropertySymbols(e);t&&(n=n.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),r.push.apply(r,n)}return r}function i(e){for(var t=1;t<arguments.length;t++){var r=null!=arguments[t]?arguments[t]:{};t%2?o(Object(r),!0).forEach(function(t){var n;n=r[t],t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(r)):o(Object(r)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(r,t))})}return e}function a(e){return function t(){for(var r=this,n=arguments.length,o=Array(n),i=0;i<n;i++)o[i]=arguments[i];return o.length>=e.length?e.apply(this,o):function(){for(var e=arguments.length,n=Array(e),i=0;i<e;i++)n[i]=arguments[i];return t.apply(r,[].concat(o,n))}}}function l(e){return({}).toString.call(e).includes("Object")}function s(e){return"function"==typeof e}var d,c,u=a(function(e,t){throw Error(e[t]||e.default)})({initialIsRequired:"initial state is required",initialType:"initial state should be an object",initialContent:"initial state shouldn't be an empty object",handlerType:"handler should be an object or a function",handlersType:"all handlers should be a functions",selectorType:"selector should be a function",changeType:"provided value of changes should be an object",changeField:'it seams you want to change a field in the state which is not specified in the "initial" state',default:"an unknown error accured in `state-local` package"}),f=function(e,t){return l(t)||u("changeType"),Object.keys(t).some(function(t){return!Object.prototype.hasOwnProperty.call(e,t)})&&u("changeField"),t},p=function(e){s(e)||u("selectorType")},g=function(e){s(e)||l(e)||u("handlerType"),l(e)&&Object.values(e).some(function(e){return!s(e)})&&u("handlersType")},m=function(e){e||u("initialIsRequired"),l(e)||u("initialType"),Object.keys(e).length||u("initialContent")};function b(e,t){return s(t)?t(e.current):t}function x(e,t){return e.current=i(i({},e.current),t),t}function h(e,t,r){return s(t)?t(e.current):Object.keys(r).forEach(function(r){var n;return null==(n=t[r])?void 0:n.call(t,e.current[r])}),r}var v={configIsRequired:"the configuration object is required",configType:"the configuration object should be an object",default:"an unknown error accured in `@monaco-editor/loader` package",deprecation:"Deprecation warning!\n    You are using deprecated way of configuration.\n\n    Instead of using\n      monaco.config({ urls: { monacoBase: '...' } })\n    use\n      monaco.config({ paths: { vs: '...' } })\n\n    For more please check the link https://github.com/suren-atoyan/monaco-loader#config\n  "},y=(d=function(e,t){throw Error(e[t]||e.default)},function e(){for(var t=this,r=arguments.length,n=Array(r),o=0;o<r;o++)n[o]=arguments[o];return n.length>=d.length?d.apply(this,n):function(){for(var r=arguments.length,o=Array(r),i=0;i<r;i++)o[i]=arguments[i];return e.apply(t,[].concat(n,o))}})(v);let w=function(e){return(e||y("configIsRequired"),({}).toString.call(e).includes("Object")||y("configType"),e.urls)?(console.warn(v.deprecation),{paths:{vs:e.urls.monacoBase}}):e},j=function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}};var _={type:"cancelation",msg:"operation is manually canceled"};let O=function(e){var t=!1,r=new Promise(function(r,n){e.then(function(e){return t?n(_):r(e)}),e.catch(n)});return r.cancel=function(){return t=!0},r};var k=function(e){if(Array.isArray(e))return e}(c=({create:function(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};m(e),g(t);var r={current:e},n=a(h)(r,t),o=a(x)(r),i=a(f)(e),l=a(b)(r);return[function(){var e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:function(e){return e};return p(e),e(r.current)},function(e){(function(){for(var e=arguments.length,t=Array(e),r=0;r<e;r++)t[r]=arguments[r];return function(e){return t.reduceRight(function(e,t){return t(e)},e)}})(n,o,i,l)(e)}]}}).create({config:{paths:{vs:"https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs"}},isInitialized:!1,resolve:null,reject:null,monaco:null}))||function(e){if("u">typeof Symbol&&Symbol.iterator in Object(e)){var t=[],r=!0,n=!1,o=void 0;try{for(var i,a=e[Symbol.iterator]();!(r=(i=a.next()).done)&&(t.push(i.value),2!==t.length);r=!0);}catch(e){n=!0,o=e}finally{try{r||null==a.return||a.return()}finally{if(n)throw o}}return t}}(c)||function(e){if(e){if("string"==typeof e)return n(e,2);var t=Object.prototype.toString.call(e).slice(8,-1);if("Object"===t&&e.constructor&&(t=e.constructor.name),"Map"===t||"Set"===t)return Array.from(e);if("Arguments"===t||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t))return n(e,2)}}(c)||function(){throw TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}(),z=k[0],M=k[1];function C(e){return document.body.appendChild(e)}function S(e){var t,r,n=z(function(e){return{config:e.config,reject:e.reject}}),o=(t="".concat(n.config.paths.vs,"/loader.js"),r=document.createElement("script"),t&&(r.src=t),r);return o.onload=function(){return e()},o.onerror=n.reject,o}function E(){var e=z(function(e){return{config:e.config,resolve:e.resolve,reject:e.reject}}),t=window.require;t.config(e.config),t(["vs/editor/editor.main"],function(t){T(t),e.resolve(t)},function(t){e.reject(t)})}function T(e){z().monaco||M({monaco:e})}var N=new Promise(function(e,t){return M({resolve:e,reject:t})});let R={config:function(e){var t=w(e),n=t.monaco,o=function(e,t){if(null==e)return{};var r,n,o=function(e,t){if(null==e)return{};var r,n,o={},i=Object.keys(e);for(n=0;n<i.length;n++)r=i[n],t.indexOf(r)>=0||(o[r]=e[r]);return o}(e,t);if(Object.getOwnPropertySymbols){var i=Object.getOwnPropertySymbols(e);for(n=0;n<i.length;n++)r=i[n],!(t.indexOf(r)>=0)&&Object.prototype.propertyIsEnumerable.call(e,r)&&(o[r]=e[r])}return o}(t,["monaco"]);M(function(e){return{config:function e(t,n){return Object.keys(n).forEach(function(r){n[r]instanceof Object&&t[r]&&Object.assign(n[r],e(t[r],n[r]))}),r(r({},t),n)}(e.config,o),monaco:n}})},init:function(){var e=z(function(e){return{monaco:e.monaco,isInitialized:e.isInitialized,resolve:e.resolve}});if(!e.isInitialized){if(M({isInitialized:!0}),e.monaco)return e.resolve(e.monaco),O(N);if(window.monaco&&window.monaco.editor)return T(window.monaco),e.resolve(window.monaco),O(N);j(C,S)(E)}return O(N)},__getMonacoInstance:function(){return z(function(e){return e.monaco})}};e.s(["default",0,R],350660);var P=e.i(389959),D={display:"flex",position:"relative",textAlign:"initial"},I={width:"100%"},L={display:"none"},A={display:"flex",height:"100%",width:"100%",justifyContent:"center",alignItems:"center"},F=function({children:e}){return P.default.createElement("div",{style:A},e)},V=(0,P.memo)(function({width:e,height:t,isEditorReady:r,loading:n,_ref:o,className:i,wrapperProps:a}){return P.default.createElement("section",{style:{...D,width:e,height:t},...a},!r&&P.default.createElement(F,null,n),P.default.createElement("div",{ref:o,style:{...I,...!r&&L},className:i}))}),$=function(e){(0,P.useEffect)(e,[])},B=function(e,t,r=!0){let n=(0,P.useRef)(!0);(0,P.useEffect)(n.current||!r?()=>{n.current=!1}:e,t)};function q(){}function U(e,t,r,n){var o,i,a,l,s,d;return o=e,i=n,o.editor.getModel(G(o,i))||(a=e,l=t,s=r,d=n,a.editor.createModel(l,s,d?G(a,d):void 0))}function G(e,t){return e.Uri.parse(t)}var H=(0,P.memo)(function({original:e,modified:t,language:r,originalLanguage:n,modifiedLanguage:o,originalModelPath:i,modifiedModelPath:a,keepCurrentOriginalModel:l=!1,keepCurrentModifiedModel:s=!1,theme:d="light",loading:c="Loading...",options:u={},height:f="100%",width:p="100%",className:g,wrapperProps:m={},beforeMount:b=q,onMount:x=q}){let[h,v]=(0,P.useState)(!1),[y,w]=(0,P.useState)(!0),j=(0,P.useRef)(null),_=(0,P.useRef)(null),O=(0,P.useRef)(null),k=(0,P.useRef)(x),z=(0,P.useRef)(b),M=(0,P.useRef)(!1);$(()=>{let e=R.init();return e.then(e=>(_.current=e)&&w(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>{let t;return j.current?(t=j.current?.getModel(),void(l||t?.original?.dispose(),s||t?.modified?.dispose(),j.current?.dispose())):e.cancel()}}),B(()=>{if(j.current&&_.current){let t=j.current.getOriginalEditor(),o=U(_.current,e||"",n||r||"text",i||"");o!==t.getModel()&&t.setModel(o)}},[i],h),B(()=>{if(j.current&&_.current){let e=j.current.getModifiedEditor(),n=U(_.current,t||"",o||r||"text",a||"");n!==e.getModel()&&e.setModel(n)}},[a],h),B(()=>{let e=j.current.getModifiedEditor();e.getOption(_.current.editor.EditorOption.readOnly)?e.setValue(t||""):t!==e.getValue()&&(e.executeEdits("",[{range:e.getModel().getFullModelRange(),text:t||"",forceMoveMarkers:!0}]),e.pushUndoStop())},[t],h),B(()=>{j.current?.getModel()?.original.setValue(e||"")},[e],h),B(()=>{let{original:e,modified:t}=j.current.getModel();_.current.editor.setModelLanguage(e,n||r||"text"),_.current.editor.setModelLanguage(t,o||r||"text")},[r,n,o],h),B(()=>{_.current?.editor.setTheme(d)},[d],h),B(()=>{j.current?.updateOptions(u)},[u],h);let C=(0,P.useCallback)(()=>{if(!_.current)return;z.current(_.current);let l=U(_.current,e||"",n||r||"text",i||""),s=U(_.current,t||"",o||r||"text",a||"");j.current?.setModel({original:l,modified:s})},[r,t,o,e,n,i,a]),S=(0,P.useCallback)(()=>{!M.current&&O.current&&(j.current=_.current.editor.createDiffEditor(O.current,{automaticLayout:!0,...u}),C(),_.current?.editor.setTheme(d),v(!0),M.current=!0)},[u,d,C]);return(0,P.useEffect)(()=>{h&&k.current(j.current,_.current)},[h]),(0,P.useEffect)(()=>{y||h||S()},[y,h,S]),P.default.createElement(V,{width:p,height:f,isEditorReady:h,loading:c,_ref:O,className:g,wrapperProps:m})}),J=function(e){let t=(0,P.useRef)();return(0,P.useEffect)(()=>{t.current=e},[e]),t.current},K=new Map,W=(0,P.memo)(function({defaultValue:e,defaultLanguage:t,defaultPath:r,value:n,language:o,path:i,theme:a="light",line:l,loading:s="Loading...",options:d={},overrideServices:c={},saveViewState:u=!0,keepCurrentModel:f=!1,width:p="100%",height:g="100%",className:m,wrapperProps:b={},beforeMount:x=q,onMount:h=q,onChange:v,onValidate:y=q}){let[w,j]=(0,P.useState)(!1),[_,O]=(0,P.useState)(!0),k=(0,P.useRef)(null),z=(0,P.useRef)(null),M=(0,P.useRef)(null),C=(0,P.useRef)(h),S=(0,P.useRef)(x),E=(0,P.useRef)(),T=(0,P.useRef)(n),N=J(i),D=(0,P.useRef)(!1),I=(0,P.useRef)(!1);$(()=>{let e=R.init();return e.then(e=>(k.current=e)&&O(!1)).catch(e=>e?.type!=="cancelation"&&console.error("Monaco initialization: error:",e)),()=>z.current?void(E.current?.dispose(),f?u&&K.set(i,z.current.saveViewState()):z.current.getModel()?.dispose(),z.current.dispose()):e.cancel()}),B(()=>{let a=U(k.current,e||n||"",t||o||"",i||r||"");a!==z.current?.getModel()&&(u&&K.set(N,z.current?.saveViewState()),z.current?.setModel(a),u&&z.current?.restoreViewState(K.get(i)))},[i],w),B(()=>{z.current?.updateOptions(d)},[d],w),B(()=>{z.current&&void 0!==n&&(z.current.getOption(k.current.editor.EditorOption.readOnly)?z.current.setValue(n):n!==z.current.getValue()&&(I.current=!0,z.current.executeEdits("",[{range:z.current.getModel().getFullModelRange(),text:n,forceMoveMarkers:!0}]),z.current.pushUndoStop(),I.current=!1))},[n],w),B(()=>{let e=z.current?.getModel();e&&o&&k.current?.editor.setModelLanguage(e,o)},[o],w),B(()=>{void 0!==l&&z.current?.revealLine(l)},[l],w),B(()=>{k.current?.editor.setTheme(a)},[a],w);let L=(0,P.useCallback)(()=>{if(!(!M.current||!k.current)&&!D.current){S.current(k.current);let s=i||r,f=U(k.current,n||e||"",t||o||"",s||"");z.current=k.current?.editor.create(M.current,{model:f,automaticLayout:!0,...d},c),u&&z.current.restoreViewState(K.get(s)),k.current.editor.setTheme(a),void 0!==l&&z.current.revealLine(l),j(!0),D.current=!0}},[e,t,r,n,o,i,d,c,u,a,l]);return(0,P.useEffect)(()=>{w&&C.current(z.current,k.current)},[w]),(0,P.useEffect)(()=>{_||w||L()},[_,w,L]),T.current=n,(0,P.useEffect)(()=>{w&&v&&(E.current?.dispose(),E.current=z.current?.onDidChangeModelContent(e=>{I.current||v(z.current.getValue(),e)}))},[w,v]),(0,P.useEffect)(()=>{if(w){let e=k.current.editor.onDidChangeMarkers(e=>{let t=z.current.getModel()?.uri;if(t&&e.find(e=>e.path===t.path)){let e=k.current.editor.getModelMarkers({resource:t});y?.(e)}});return()=>{e?.dispose()}}return()=>{}},[w,y]),P.default.createElement(V,{width:p,height:g,isEditorReady:w,loading:s,_ref:M,className:m,wrapperProps:b})});e.s(["DiffEditor",0,H,"Editor",0,W,"default",0,W,"useMonaco",0,function(){let[e,t]=(0,P.useState)(R.__getMonacoInstance());return $(()=>{let r;return e||(r=R.init()).then(e=>{t(e)}),()=>r?.cancel()}),e}],156054)}]);