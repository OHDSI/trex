(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,938933,305551,e=>{"use strict";var t=e.i(389959);let r={bg:{brand:{primary:"bg-purple-600",secondary:"bg-purple-200"}},text:{brand:"text-purple-600",body:"text-foreground-light",title:"text-foreground"},border:{brand:"border-brand-600",primary:"border-default",secondary:"border-secondary",alternative:"border-alternative"},placeholder:"placeholder-foreground-muted",focus:`
    outline-hidden
    focus:ring-current focus:ring-2
  `,"focus-visible":`
    outline-hidden
    transition-all
    outline-0
    focus-visible:outline-4
    focus-visible:outline-offset-1
  `,size:{text:{tiny:"text-xs",small:"text-base md:text-sm leading-4",medium:"text-base md:text-sm",large:"text-base",xlarge:"text-base"},padding:{tiny:"px-2.5 py-1",small:"px-3 py-2",medium:"px-4 py-2",large:"px-4 py-2",xlarge:"px-6 py-3"}},overlay:{base:"absolute inset-0 bg-background opacity-50",container:"fixed inset-0 transition-opacity"}},o={tiny:`${r.size.text.tiny} ${r.size.padding.tiny}`,small:`${r.size.text.small} ${r.size.padding.small}`,medium:`${r.size.text.medium} ${r.size.padding.medium}`,large:`${r.size.text.large} ${r.size.padding.large}`,xlarge:`${r.size.text.xlarge} ${r.size.padding.xlarge}`},i={accordion:{variants:{default:{base:`
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
    `}};e.s(["default",0,i],305551);let a=(0,t.createContext)({theme:i});e.s(["default",0,function(e){let{theme:{[e]:r}}=(0,t.useContext)(a);return r||(r=i.accordion),r=JSON.parse(r=JSON.stringify(r).replace(/\\n/g,"").replace(/\s\s+/g," "))}],938933)},744061,e=>{"use strict";var t=e.i(478902),r=e.i(938933),o=e.i(843778);function i({children:e,tag:r="div",style:o}){let a=`${r}`;return(0,t.jsx)(a,{style:o,children:e})}i.Title=function({level:e=1,children:r,style:o}){let i=`h${e}`;return(0,t.jsx)(i,{style:o,children:r})},i.Text=function({children:e,style:r,mark:o,code:i,keyboard:a,strong:n}){return i?(0,t.jsx)("code",{style:r,children:e}):o?(0,t.jsx)("mark",{style:r,children:e}):a?(0,t.jsx)("kbd",{style:r,children:e}):n?(0,t.jsx)("strong",{style:r,children:e}):(0,t.jsx)("span",{style:r,children:e})},i.Link=function({children:e,target:r="_blank",href:o,onClick:i,style:a}){return(0,t.jsx)("a",{onClick:i,href:o,target:r,rel:"noopener noreferrer",style:a,children:e})};var a=e.i(389959);let n=(0,a.createContext)({type:"text"}),s=e=>{let{type:r}=e;return(0,t.jsx)(n.Provider,{value:{type:r},children:e.children})},l=()=>{let e=(0,a.useContext)(n);if(void 0===e)throw Error("MenuContext must be used within a MenuContextProvider.");return e};function d({children:e,className:r,ulClassName:o,style:i,type:a="text"}){return(0,t.jsx)("nav",{role:"menu","aria-label":"Sidebar","aria-orientation":"vertical","aria-labelledby":"options-menu",className:r,style:i,children:(0,t.jsx)(s,{type:a,children:(0,t.jsx)("ul",{className:o,children:e})})})}d.Item=function({children:e,icon:i,active:a,onClick:n,style:s}){let d=(0,r.default)("menu"),{type:c}=l(),u=[d.item.base];u.push(d.item.variants[c].base),a?u.push(d.item.variants[c].active):u.push(d.item.variants[c].normal);let g=[d.item.content.base];a?g.push(d.item.content.active):g.push(d.item.content.normal);let x=[d.item.icon.base];return a?x.push(d.item.icon.active):x.push(d.item.icon.normal),(0,t.jsxs)("li",{role:"menuitem",className:(0,o.cn)("outline-hidden",u),style:s,onClick:n,"aria-current":a?"page":void 0,children:[i&&(0,t.jsx)("div",{className:`${x.join(" ")} min-w-fit`,children:i}),(0,t.jsx)("span",{className:g.join(" "),children:e})]})},d.Group=function({children:e,icon:o,title:i}){let a=(0,r.default)("menu"),{type:n}=l();return(0,t.jsxs)("div",{className:[a.group.base,a.group.variants[n]].join(" "),children:[o&&(0,t.jsx)("span",{className:a.group.icon,children:o}),(0,t.jsx)("span",{className:a.group.content,children:i}),e]})},d.Misc=function({children:e}){return(0,t.jsx)("div",{children:(0,t.jsx)(i.Text,{children:(0,t.jsx)("span",{children:e})})})},e.s(["default",0,d],744061)},862326,e=>{"use strict";var t=e.i(744061);e.s(["Menu",()=>t.default])},388147,e=>{"use strict";var t=e.i(478902),r=e.i(587433),o=e.i(862326),i=e.i(345594),a=e.i(837710),n=e.i(654894);let s=({item:e,isActive:s,target:l="_self",hoverText:d="",onClick:c})=>{let{name:u="",url:g="",icon:x,rightIcon:f,isExternal:m,label:p,disabled:b,shortcutId:h}=e,v=(0,t.jsx)(o.Menu.Item,{icon:x,active:s,onClick:c,children:(0,t.jsxs)("div",{className:"flex w-full items-center justify-between gap-1",children:[(0,t.jsxs)("div",{className:"flex items-center gap-1 min-w-0 flex-1",title:h?void 0:d||("string"==typeof u?u:""),children:[(0,t.jsx)("span",{className:"truncate flex-1 min-w-0",children:u}),void 0!==p&&(0,t.jsx)(r.Badge,{className:"shrink-0",variant:"new"===p.toLowerCase()?"success":"warning",children:p})]}),f&&(0,t.jsx)("div",{children:f})]})});if(b)return(0,t.jsx)("div",{className:"opacity-50 pointer-events-none",children:v});if(g){if(m){let e=(0,t.jsx)(a.Button,{asChild:!0,block:!0,className:"justify-start!",type:"text",size:"small",icon:x,children:(0,t.jsx)(i.default,{href:g,target:"_blank",rel:"noreferrer",children:u})});return h?(0,t.jsx)(n.ShortcutTooltip,{shortcutId:h,side:"right",delayDuration:1e3,children:e}):e}let e=(0,t.jsx)(i.default,{href:g,className:"block",target:l,onClick:c,children:v});return h?(0,t.jsx)(n.ShortcutTooltip,{shortcutId:h,side:"right",delayDuration:1e3,children:e}):e}return v};e.s(["ProductMenu",0,({page:e,menu:i,onItemClick:a})=>(0,t.jsx)("div",{className:"flex flex-col space-y-4",children:(0,t.jsx)(o.Menu,{type:"pills",children:i.map((n,l)=>(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"my-4 space-y-4",children:(0,t.jsxs)("div",{className:"md:mx-3",children:[(0,t.jsx)(o.Menu.Group,{title:n.title?(0,t.jsxs)("div",{className:"flex flex-col space-y-2 uppercase font-mono",children:[(0,t.jsx)("span",{children:n.title}),n.isPreview&&(0,t.jsx)(r.Badge,{variant:"warning",children:"Not production ready"})]}):null}),(0,t.jsx)("div",{children:n.items.map(r=>{let o=r.pages?r.pages.includes(e??""):e===r.key;return(0,t.jsx)(s,{item:r,isActive:o,target:r.isExternal?"_blank":"_self",onClick:a},r.key)})})]})}),l!==i.length-1&&(0,t.jsx)("div",{className:"h-px w-[calc(100%-1.5rem)] mx-auto md:w-full bg-border-overlay"})]},n.key||n.title))})})],388147)},919722,407127,385809,e=>{"use strict";var t=e.i(478902),r=e.i(3036),o=e.i(345594),i=e.i(843778);function a(e){return Array.isArray(e)?e.filter(e=>null!=e&&"object"==typeof e).map(e=>({key:e.key??"",heading:e.heading,links:(e.links??[]).filter(e=>null!=e&&"object"==typeof e&&e.key&&null!=e.label).map(e=>({key:e.key,label:e.label,href:e.href}))})).filter(e=>e.key||e.heading):[]}function n(e){if(Array.isArray(e))for(let t of e){if(!t?.links||!Array.isArray(t.links))continue;let e=t.links.find(e=>e?.isActive===!0);if(e?.key)return e.key}}e.s(["getActiveKey",0,n,"toSubMenuSections",0,a],407127);var s=e.i(389959),l=e.i(388147);function d({sections:e,page:r,onItemClick:o}){let i=(0,s.useMemo)(()=>e.map(e=>({key:e.key,title:e.heading,items:e.links.map(e=>({key:e.key,name:e.label,url:e.href??"#"}))})),[e]);return(0,t.jsx)(l.ProductMenu,{page:r,menu:i,onItemClick:o})}e.s(["SubMenu",0,d],385809);let c=({header:e,sections:s,backToDashboardURL:l,className:c})=>{let u=n(s),g=a(s);return(0,t.jsx)(t.Fragment,{children:(0,t.jsx)("div",{id:"with-sidebar",className:(0,i.cn)("h-full bg-dash-sidebar flex flex-col justify-between","hide-scrollbar w-full md:w-64 md:border-r border-default",c),children:(0,t.jsxs)("div",{className:"flex-1 flex flex-col",children:[l&&(0,t.jsx)("div",{className:"shrink-0 hidden md:block",children:(0,t.jsx)("div",{className:"flex h-12 max-h-12 items-center border-b px-6 border-default",children:(0,t.jsxs)(o.default,{href:l,className:"flex text-sm flex-row gap-2 items-center text-foreground-lighter focus-visible:text-foreground hover:text-foreground",children:[(0,t.jsx)(r.ArrowLeft,{strokeWidth:1.5,size:16}),"Back to dashboard"]})})}),e&&e,(0,t.jsx)("div",{className:"flex-1 overflow-auto",children:(0,t.jsx)("div",{className:"flex flex-col",children:(0,t.jsx)(d,{sections:g,page:u})})})]})})})};e.s(["WithSidebar",0,({title:e,header:r,children:o,sections:i,backToDashboardURL:a})=>{let n=!i;return(0,t.jsxs)("div",{className:"flex flex-col md:flex-row h-full",children:[!n&&(0,t.jsx)(c,{title:e,header:r,sections:i,backToDashboardURL:a,className:"hidden md:flex"}),(0,t.jsx)("div",{className:"flex flex-1 flex-col",children:(0,t.jsx)("div",{className:"flex-1 grow overflow-y-auto",children:o})})]})}],919722)},483239,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(657588),o=e.i(158639),i=e.i(463333),a=e.i(919722),n=e.i(989567),s=e.i(912793);let l=e=>e.split("#")[0],d=({currentPath:e,slug:t,showSecuritySettings:r=!0,showSsoSettings:o=!0,showLegalDocuments:i=!0,showPlatformWebhooks:a=!0,showPrivateApps:n=!1})=>{let s=(t,r)=>"webhooks"===t?e===r||e.startsWith(`${r}/`):e===r,l=[{key:"general",label:"General",href:`/org/${t}/general`},...r?[{key:"security",label:"Security",href:`/org/${t}/security`}]:[],...o?[{key:"sso",label:"SSO",href:`/org/${t}/sso`}]:[]],d=[{key:"apps",label:"OAuth Apps",href:`/org/${t}/apps`},...n?[{key:"private-apps",label:"Private Apps",href:`/org/${t}/private-apps`}]:[],...a?[{key:"webhooks",label:"Webhooks",href:`/org/${t}/webhooks`}]:[]],c=[{key:"audit",label:"Audit Logs",href:`/org/${t}/audit`},...i?[{key:"documents",label:"Legal Documents",href:`/org/${t}/documents`}]:[]];return[{key:"configuration",heading:"Configuration",links:l.map(e=>({...e,isActive:s(e.key,e.href)}))},{key:"connections",heading:"Connections",links:d.map(e=>({...e,isActive:s(e.key,e.href)}))},{key:"compliance",heading:"Compliance",links:c.map(e=>({...e,isActive:s(e.key,e.href)}))}]};e.s(["OrganizationSettingsLayout",0,function({children:e}){let c,{slug:u}=(0,o.useParams)(),g=(0,i.useIsPlatformWebhooksEnabled)(),x=(0,r.useFlag)("privateApps"),f=l((c=(0,n.useRouter)()).isReady?c.asPath.split("?")[0]:""),{organizationShowSsoSettings:m,organizationShowSecuritySettings:p,organizationShowLegalDocuments:b}=(0,s.useIsFeatureEnabled)(["organization:show_sso_settings","organization:show_security_settings","organization:show_legal_documents"]),h=d({currentPath:f,slug:u,showSecuritySettings:p,showSsoSettings:m,showLegalDocuments:b,showPlatformWebhooks:g,showPrivateApps:x});return(0,t.jsx)(a.WithSidebar,{title:"Organization Settings",sections:h,header:(0,t.jsx)("div",{className:"border-default flex min-h-(--header-height) items-center border-b px-6",children:(0,t.jsx)("h4",{className:"text-lg",children:"Settings"})}),children:e})},"generateOrganizationSettingsSections",0,d,"normalizeOrganizationSettingsPath",0,l],483239)},601484,e=>{"use strict";var t=e.i(478902);e.i(128328);var r=e.i(657588),o=e.i(158639),i=e.i(989567),a=e.i(483239),n=e.i(463333),s=e.i(385809),l=e.i(912793),d=e.i(980533);e.s(["OrganizationSettingsMenu",0,function({onCloseSheet:e}){let c=(0,i.useRouter)(),{slug:u}=(0,o.useParams)(),g=u??c.query.orgSlug??"",x=(0,d.getPathnameWithoutQuery)(c.asPath,c.pathname),f=(0,a.normalizeOrganizationSettingsPath)(x),m=(0,n.useIsPlatformWebhooksEnabled)(),p=(0,r.useFlag)("privateApps"),{organizationShowSsoSettings:b,organizationShowSecuritySettings:h,organizationShowLegalDocuments:v}=(0,l.useIsFeatureEnabled)(["organization:show_sso_settings","organization:show_security_settings","organization:show_legal_documents"]),y=(0,a.generateOrganizationSettingsSections)({slug:g,currentPath:f,showSecuritySettings:h,showSsoSettings:b,showLegalDocuments:v,showPlatformWebhooks:m,showPrivateApps:p}),w=f.split("/").filter(Boolean).pop();return(0,t.jsx)(s.SubMenu,{sections:y,page:w,onItemClick:e})}])}]);