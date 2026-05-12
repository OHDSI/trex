(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,744061,e=>{"use strict";var t=e.i(478902),s=e.i(938933),a=e.i(843778);function n({children:e,tag:s="div",style:a}){let r=`${s}`;return(0,t.jsx)(r,{style:a,children:e})}n.Title=function({level:e=1,children:s,style:a}){let n=`h${e}`;return(0,t.jsx)(n,{style:a,children:s})},n.Text=function({children:e,style:s,mark:a,code:n,keyboard:r,strong:i}){return n?(0,t.jsx)("code",{style:s,children:e}):a?(0,t.jsx)("mark",{style:s,children:e}):r?(0,t.jsx)("kbd",{style:s,children:e}):i?(0,t.jsx)("strong",{style:s,children:e}):(0,t.jsx)("span",{style:s,children:e})},n.Link=function({children:e,target:s="_blank",href:a,onClick:n,style:r}){return(0,t.jsx)("a",{onClick:n,href:a,target:s,rel:"noopener noreferrer",style:r,children:e})};var r=e.i(389959);let i=(0,r.createContext)({type:"text"}),o=e=>{let{type:s}=e;return(0,t.jsx)(i.Provider,{value:{type:s},children:e.children})},l=()=>{let e=(0,r.useContext)(i);if(void 0===e)throw Error("MenuContext must be used within a MenuContextProvider.");return e};function c({children:e,className:s,ulClassName:a,style:n,type:r="text"}){return(0,t.jsx)("nav",{role:"menu","aria-label":"Sidebar","aria-orientation":"vertical","aria-labelledby":"options-menu",className:s,style:n,children:(0,t.jsx)(o,{type:r,children:(0,t.jsx)("ul",{className:a,children:e})})})}c.Item=function({children:e,icon:n,active:r,onClick:i,style:o}){let c=(0,s.default)("menu"),{type:u}=l(),d=[c.item.base];d.push(c.item.variants[u].base),r?d.push(c.item.variants[u].active):d.push(c.item.variants[u].normal);let m=[c.item.content.base];r?m.push(c.item.content.active):m.push(c.item.content.normal);let p=[c.item.icon.base];return r?p.push(c.item.icon.active):p.push(c.item.icon.normal),(0,t.jsxs)("li",{role:"menuitem",className:(0,a.cn)("outline-hidden",d),style:o,onClick:i,"aria-current":r?"page":void 0,children:[n&&(0,t.jsx)("div",{className:`${p.join(" ")} min-w-fit`,children:n}),(0,t.jsx)("span",{className:m.join(" "),children:e})]})},c.Group=function({children:e,icon:a,title:n}){let r=(0,s.default)("menu"),{type:i}=l();return(0,t.jsxs)("div",{className:[r.group.base,r.group.variants[i]].join(" "),children:[a&&(0,t.jsx)("span",{className:r.group.icon,children:a}),(0,t.jsx)("span",{className:r.group.content,children:n}),e]})},c.Misc=function({children:e}){return(0,t.jsx)("div",{children:(0,t.jsx)(n.Text,{children:(0,t.jsx)("span",{children:e})})})},e.s(["default",0,c],744061)},862326,e=>{"use strict";var t=e.i(744061);e.s(["Menu",()=>t.default])},388147,e=>{"use strict";var t=e.i(478902),s=e.i(587433),a=e.i(862326),n=e.i(345594),r=e.i(837710),i=e.i(654894);let o=({item:e,isActive:o,target:l="_self",hoverText:c="",onClick:u})=>{let{name:d="",url:m="",icon:p,rightIcon:h,isExternal:f,label:j,disabled:g,shortcutId:x}=e,v=(0,t.jsx)(a.Menu.Item,{icon:p,active:o,onClick:u,children:(0,t.jsxs)("div",{className:"flex w-full items-center justify-between gap-1",children:[(0,t.jsxs)("div",{className:"flex items-center gap-1 min-w-0 flex-1",title:x?void 0:c||("string"==typeof d?d:""),children:[(0,t.jsx)("span",{className:"truncate flex-1 min-w-0",children:d}),void 0!==j&&(0,t.jsx)(s.Badge,{className:"shrink-0",variant:"new"===j.toLowerCase()?"success":"warning",children:j})]}),h&&(0,t.jsx)("div",{children:h})]})});if(g)return(0,t.jsx)("div",{className:"opacity-50 pointer-events-none",children:v});if(m){if(f){let e=(0,t.jsx)(r.Button,{asChild:!0,block:!0,className:"justify-start!",type:"text",size:"small",icon:p,children:(0,t.jsx)(n.default,{href:m,target:"_blank",rel:"noreferrer",children:d})});return x?(0,t.jsx)(i.ShortcutTooltip,{shortcutId:x,side:"right",delayDuration:1e3,children:e}):e}let e=(0,t.jsx)(n.default,{href:m,className:"block",target:l,onClick:u,children:v});return x?(0,t.jsx)(i.ShortcutTooltip,{shortcutId:x,side:"right",delayDuration:1e3,children:e}):e}return v};e.s(["ProductMenu",0,({page:e,menu:n,onItemClick:r})=>(0,t.jsx)("div",{className:"flex flex-col space-y-4",children:(0,t.jsx)(a.Menu,{type:"pills",children:n.map((i,l)=>(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"my-4 space-y-4",children:(0,t.jsxs)("div",{className:"md:mx-3",children:[(0,t.jsx)(a.Menu.Group,{title:i.title?(0,t.jsxs)("div",{className:"flex flex-col space-y-2 uppercase font-mono",children:[(0,t.jsx)("span",{children:i.title}),i.isPreview&&(0,t.jsx)(s.Badge,{variant:"warning",children:"Not production ready"})]}):null}),(0,t.jsx)("div",{children:i.items.map(s=>{let a=s.pages?s.pages.includes(e??""):e===s.key;return(0,t.jsx)(o,{item:s,isActive:a,target:s.isExternal?"_blank":"_self",onClick:r},s.key)})})]})}),l!==n.length-1&&(0,t.jsx)("div",{className:"h-px w-[calc(100%-1.5rem)] mx-auto md:w-full bg-border-overlay"})]},i.key||i.title))})})],388147)},3259,100387,e=>{"use strict";var t=e.i(478902),s=e.i(106766),a=e.i(933505);e.s(["ChevronRightIcon",()=>a.default],100387);var a=a,n=e.i(389959),r=e.i(843778);let i=n.forwardRef(({...e},s)=>(0,t.jsx)("nav",{ref:s,"aria-label":"breadcrumb",...e}));i.displayName="Breadcrumb";let o=n.forwardRef(({className:e,...s},a)=>(0,t.jsx)("ol",{ref:a,className:(0,r.cn)("flex flex-wrap items-center gap-0.5 wrap-break-word text-sm text-muted-foreground sm:gap-1.5",e),...s}));o.displayName="BreadcrumbList";let l=n.forwardRef(({className:e,...s},a)=>(0,t.jsx)("li",{ref:a,className:(0,r.cn)("inline-flex text-foreground-lighter items-center gap-1.5 leading-5",e),...s}));l.displayName="BreadcrumbItem";let c=n.forwardRef(({asChild:e,className:a,...n},i)=>{let o=e?s.Slot.Slot:"a";return(0,t.jsx)(o,{ref:i,className:(0,r.cn)("transition-colors underline lg:no-underline hover:text-foreground",a),...n})});c.displayName="BreadcrumbLink";let u=n.forwardRef(({className:e,...s},a)=>(0,t.jsx)("span",{ref:a,role:"link","aria-disabled":"true","aria-current":"page",className:(0,r.cn)("no-underline text-foreground",e),...s}));u.displayName="BreadcrumbPage";let d=({children:e,className:s,...n})=>(0,t.jsx)("li",{role:"presentation","aria-hidden":"true",className:(0,r.cn)("[&>svg]:size-3.5 text-foreground-muted",s),...n,children:e??(0,t.jsx)(a.default,{})});d.displayName="BreadcrumbSeparator";let m=({className:e,...s})=>(0,t.jsxs)("span",{className:(0,r.cn)("flex h-4 w-4 items-center justify-center",e),...s,children:[(0,t.jsx)("svg",{role:"presentation","aria-hidden":"true",width:"15",height:"15",viewBox:"0 0 15 15",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:(0,t.jsx)("path",{d:"M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z",fill:"currentColor",fillRule:"evenodd",clipRule:"evenodd"})}),(0,t.jsx)("span",{className:"sr-only",children:"More"})]});m.displayName="BreadcrumbEllipsis",e.s(["Breadcrumb",0,i,"BreadcrumbEllipsis",0,m,"BreadcrumbItem",0,l,"BreadcrumbLink",0,c,"BreadcrumbList",0,o,"BreadcrumbPage",0,u,"BreadcrumbSeparator",0,d],3259)},336908,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(232520);e.s(["DiscardChangesConfirmationDialog",0,({visible:e,onClose:n,onCancel:r,title:i="Unsaved changes",description:o="You have unsaved changes. Are you sure you want to discard them?",confirmLabel:l="Discard changes",cancelLabel:c="Keep editing",size:u="tiny"})=>{let d=(0,s.useRef)(!1);(0,s.useEffect)(()=>{e&&(d.current=!1)},[e]);let m=(0,s.useCallback)(()=>{d.current=!0,n()},[n]),p=(0,s.useCallback)(e=>{if(!e){if(d.current){d.current=!1;return}r()}},[r]);return(0,t.jsx)(a.AlertDialog,{open:e,onOpenChange:p,children:(0,t.jsxs)(a.AlertDialogContent,{size:u,children:[(0,t.jsxs)(a.AlertDialogHeader,{children:[(0,t.jsx)(a.AlertDialogTitle,{children:i}),null!=o&&(0,t.jsx)(a.AlertDialogDescription,{children:o})]}),(0,t.jsxs)(a.AlertDialogFooter,{children:[(0,t.jsx)(a.AlertDialogCancel,{children:c}),(0,t.jsx)(a.AlertDialogAction,{variant:"danger",onClick:m,children:l})]})]})})}])},167892,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(843778);let n="mx-auto w-full max-w-[1200px]",r="px-4 @lg:px-6 @xl:px-10",i=(0,s.forwardRef)(({className:e,bottomPadding:s,size:n="default",...i},o)=>(0,t.jsx)("div",{ref:o,...i,className:(0,a.cn)("mx-auto w-full @container",{small:"max-w-[768px]",default:"max-w-[1200px]",large:"max-w-[1600px]",full:"max-w-none"}[n],r,s&&"pb-16",e)})),o=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("header",{...s,ref:n,className:(0,a.cn)("w-full","flex-col gap-3 py-6",e)})),l=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("h1",{ref:n,...s,className:(0,a.cn)(e)})),c=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("p",{ref:n,...s,className:(0,a.cn)("text-sm text-foreground-light",e)})),u=(0,s.forwardRef)(({className:e,isFullWidth:s,topPadding:n,...r},i)=>(0,t.jsx)("div",{ref:i,...r,className:(0,a.cn)("flex flex-col first:pt-12 py-6",s?"w-full":"gap-3 @md:grid-cols-12 @lg:grid",e)})),d=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("w-full h-px bg-border shrink-0",e)})),m=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("h3",{ref:n,...s,className:(0,a.cn)("text-foreground text-xl",e)})),p=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("p",{ref:n,...s,className:(0,a.cn)("text-sm text-foreground-light",e)})),h=(0,s.forwardRef)(({className:e,children:s,title:n,...r},i)=>(0,t.jsxs)("div",{ref:i,...r,className:(0,a.cn)("col-span-4 xl:col-span-5 prose text-sm",e),children:[n&&(0,t.jsx)("h2",{children:n}),s]})),f=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("col-span-8 xl:col-span-7","flex flex-col gap-6",e)})),j=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("flex flex-col gap-3 items-center",e)})),g=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("flex w-full items-center",e)})),x=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("flex flex-row gap-3",e)})),v=(0,s.forwardRef)(({className:e,...s},n)=>(0,t.jsx)("div",{ref:n,...s,className:(0,a.cn)("flex flex-col gap-3","min-w-[420px]",e)})),k=(0,s.forwardRef)(({className:e,...s},i)=>(0,t.jsx)("div",{ref:i,...s,className:(0,a.cn)(n,r,"my-8 flex flex-col gap-8",e)}));o.displayName="ScaffoldHeader",l.displayName="ScaffoldTitle",c.displayName="ScaffoldDescription",i.displayName="ScaffoldContainer",d.displayName="ScaffoldDivider",u.displayName="ScaffoldSection",v.displayName="ScaffoldColumn",h.displayName="ScaffoldSectionDetail",f.displayName="ScaffoldSectionContent",j.displayName="ScaffoldFilterAndContent",g.displayName="ScaffoldActionsContainer",x.displayName="ScaffoldActionsGroup",k.displayName="ScaffoldContainerLegacy",m.displayName="ScaffoldSectionTitle",p.displayName="ScaffoldSectionDescription",e.s(["MAX_WIDTH_CLASSES",0,n,"PADDING_CLASSES",0,r,"ScaffoldActionsContainer",0,g,"ScaffoldActionsGroup",0,x,"ScaffoldColumn",0,v,"ScaffoldContainer",0,i,"ScaffoldContainerLegacy",0,k,"ScaffoldDescription",0,c,"ScaffoldDivider",0,d,"ScaffoldFilterAndContent",0,j,"ScaffoldHeader",0,o,"ScaffoldSection",0,u,"ScaffoldSectionContent",0,f,"ScaffoldSectionDescription",0,p,"ScaffoldSectionDetail",0,h,"ScaffoldSectionTitle",0,m,"ScaffoldTitle",0,l])},547723,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(843778);let n=(0,s.forwardRef)((e,s)=>(0,t.jsx)("nav",{ref:s,dir:"ltr",...e,className:(0,a.cn)("border-b",e.className),children:(0,t.jsx)("ul",{role:"menu",className:"flex gap-5",children:e.children})})),r=(0,s.forwardRef)(({children:e,className:s,active:n,...r},i)=>(0,t.jsx)("li",{ref:i,"aria-selected":n?"true":"false","data-state":n?"active":"inactive",className:(0,a.cn)("inline-flex items-center justify-center whitespace-nowrap text-sm ring-offset-background transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground text-foreground-lighter hover:text-foreground data-[state=active]:border-foreground border-b-2 border-transparent *:py-1.5",s),...r,children:e}));e.s(["NavMenu",0,n,"NavMenuItem",0,r])},79771,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(158639),a=e.i(345594),n=e.i(989567),r=e.i(587433),i=e.i(837710),o=e.i(843778),l=e.i(547723),c=e.i(167892),u=e.i(954676),d=e.i(389959),m=e.i(3259);let p=({title:e,subtitle:n,icon:r,breadcrumbs:i=[],primaryActions:l,secondaryActions:p,className:h,isCompact:f=!1})=>{let{ref:j}=(0,s.useParams)(),g=f&&e?[...i,{label:e}]:i;return(0,t.jsxs)("div",{className:(0,o.cn)("space-y-4",h),children:[(g.length>0||f&&(e||l||p))&&(0,t.jsxs)("div",{className:(0,o.cn)("flex items-center gap-4",f?"justify-between":"mb-4"),children:[(0,t.jsx)("div",{className:"flex items-center gap-4 flex-1 min-w-0",children:i.length>0?(0,t.jsx)(m.Breadcrumb,{className:(0,o.cn)("text-foreground-muted",f&&"text-base","min-w-0 flex-1"),children:(0,t.jsxs)(m.BreadcrumbList,{className:(0,o.cn)(f?"text-base":"text-xs","min-w-0"),children:[i.map((e,s)=>(0,t.jsxs)(d.Fragment,{children:[(0,t.jsx)(m.BreadcrumbItem,{children:e.element?e.element:e.href?(0,t.jsx)(m.BreadcrumbLink,{asChild:!0,className:"flex items-center gap-2",children:(0,t.jsxs)(a.default,{href:j?e.href.replace("[ref]",j):e.href,children:[1===i.length&&!f&&(0,t.jsx)(u.ChevronLeft,{size:16,strokeWidth:1.5}),e.label]})}):(0,t.jsxs)(m.BreadcrumbPage,{className:"flex items-center gap-2",children:[1===i.length&&(0,t.jsx)(u.ChevronLeft,{size:16,strokeWidth:1.5}),e.label]})}),s<i.length-1&&(0,t.jsx)(m.BreadcrumbSeparator,{})]},e.label||`breadcrumb-${s}`)),f&&e&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(m.BreadcrumbSeparator,{}),(0,t.jsx)(m.BreadcrumbItem,{className:"min-w-0 flex-1",children:(0,t.jsx)(m.BreadcrumbPage,{className:"min-w-0",children:e})})]})]})}):f?(0,t.jsx)("div",{className:"min-w-0 flex-1",children:e}):null}),f&&(0,t.jsxs)("div",{className:"flex items-center gap-2 shrink-0",children:[p&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:p}),l&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:l})]})]}),!f&&(0,t.jsxs)("div",{className:"flex items-center justify-between gap-4",children:[(0,t.jsx)("div",{className:"space-y-4",children:(0,t.jsxs)("div",{className:"flex items-center gap-4",children:[r&&(0,t.jsx)("div",{className:"text-foreground-light",children:r}),(0,t.jsxs)("div",{className:"space-y-1",children:[e&&("string"==typeof e?(0,t.jsx)(c.ScaffoldTitle,{children:e}):e),n&&("string"==typeof n?(0,t.jsx)(c.ScaffoldDescription,{className:"text-sm text-foreground-light",children:n}):n)]})]})}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[p&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:p}),l&&(0,t.jsx)("div",{className:"flex items-center gap-2",children:l})]})]})]})};e.s(["PageLayout",0,({children:e,title:u,subtitle:d,icon:m,breadcrumbs:h=[],primaryActions:f,secondaryActions:j,navigationItems:g=[],className:x,size:v="default",isCompact:k=!1})=>{let{ref:b}=(0,s.useParams)(),y=(0,n.useRouter)();return(0,t.jsxs)("div",{className:(0,o.cn)("w-full min-h-full flex flex-col items-stretch",x),children:[(0,t.jsxs)(c.ScaffoldContainer,{size:v,className:(0,o.cn)("w-full mx-auto","full"===v&&(k?"max-w-none px-6! border-b pt-4":"max-w-none pt-6 px-10! border-b"),"full"!==v&&(k?"pt-4":"pt-12"),0===g.length&&"full"===v&&(k?"pb-4":"pb-8")),children:[(u||d||f||j||h.length>0)&&(0,t.jsx)(p,{title:u,subtitle:d,icon:m,breadcrumbs:h,primaryActions:f,secondaryActions:j,isCompact:k}),g.length>0&&(0,t.jsx)(l.NavMenu,{className:(0,o.cn)(k?"mt-2":"mt-4","full"===v&&"border-none"),children:g.map(e=>{let s=void 0!==e.active?e.active:y.asPath.split("?")[0]===e.href;return(0,t.jsx)(l.NavMenuItem,{active:s,children:e.href?(0,t.jsxs)(a.default,{href:e.href.includes("[ref]")&&b?e.href.replace("[ref]",b):e.href,className:(0,o.cn)("inline-flex items-center gap-2",s&&"text-foreground"),onClick:e.onClick,children:[e.icon&&(0,t.jsx)("span",{children:e.icon}),e.label,e.badge&&(0,t.jsx)(r.Badge,{variant:"default",children:e.badge})]}):(0,t.jsxs)(i.Button,{type:"link",onClick:e.onClick,className:(0,o.cn)(s&&"text-foreground font-medium"),children:[e.icon&&(0,t.jsx)("span",{className:"mr-2",children:e.icon}),e.label,e.badge&&(0,t.jsx)(r.Badge,{variant:"default",children:e.badge})]})},e.label)})})]}),e]})}],79771)},756441,e=>{"use strict";var t=e.i(81798);e.s(["ContextMenuContent_Shadcn_",()=>t.ContextMenuContent])},644131,e=>{"use strict";var t=e.i(81798);e.s(["ContextMenuSeparator_Shadcn_",()=>t.ContextMenuSeparator])},839941,e=>{"use strict";var t=e.i(478902);e.i(128328);var s=e.i(158639),a=e.i(989567),n=e.i(825713),r=e.i(388147),i=e.i(951138);let o=()=>{let{ref:e="default"}=(0,s.useParams)(),n=(0,a.useRouter)().pathname.split("/")[4],i=[{title:"Manage",items:[{name:"Functions",key:"main",pages:["","[functionSlug]","new"],url:`/project/${e}/functions`,items:[]},{name:"Secrets",key:"secrets",url:`/project/${e}/functions/secrets`,items:[]}]}];return(0,t.jsx)(r.ProductMenu,{page:n,menu:i})},l=(0,i.withAuth)(({children:e,title:s,browserTitle:a})=>(0,t.jsx)(n.ProjectLayout,{product:"Edge Functions",browserTitle:{...a,section:s},productMenu:(0,t.jsx)(o,{}),isBlocking:!1,children:e}));e.s(["EdgeFunctionsProductMenu",0,o,"default",0,l])},437746,e=>{"use strict";let t=(0,e.i(388019).default)("File",[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}]]);e.s(["File",0,t],437746)},809822,e=>{"use strict";var t=e.i(478902),s=e.i(336908),a=e.i(989567),n=e.i(389959),r=e.i(804222),i=e.i(10429);e.s(["PreventNavigationOnUnsavedChanges",0,({hasChanges:e,...o})=>{let{handleCancel:l,handleConfirm:c,shouldConfirm:u}=(({hasChanges:e})=>{let t=(0,a.useRouter)(),[s,o]=(0,n.useState)(),[l,c]=(0,n.useState)(!1);(0,n.useEffect)(()=>{let s=t=>{e&&(t.preventDefault(),t.returnValue="")},a=t=>{if(e&&!l)throw o(t),"Route change declined";o(void 0)};return window.addEventListener("beforeunload",s),t.events.on("routeChangeStart",a),()=>{window.removeEventListener("beforeunload",s),t.events.off("routeChangeStart",a)}},[l,e]);let u=(0,r.useStaticEffectEvent)(()=>{o(void 0)}),d=(0,r.useStaticEffectEvent)(()=>{c(!0);let e=s??"/";i.BASE_PATH&&e.startsWith(i.BASE_PATH)&&(e=e.slice(i.BASE_PATH.length)||"/"),e.startsWith("/")||(e=`/${e}`),o(void 0),t.push(e)});return(0,n.useMemo)(()=>({handleCancel:u,handleConfirm:d,shouldConfirm:!!s}),[s,u,d])})({hasChanges:e});return(0,t.jsx)(s.DiscardChangesConfirmationDialog,{visible:u,onCancel:l,onClose:c,...o})}],809822)},672296,e=>{"use strict";e.s(["sanitizeArrayOfObjects",0,function(e,t={}){let{maxDepth:s=3,redaction:a="[REDACTED]",truncationNotice:n="[REDACTED: max depth reached]",sensitiveKeys:r=[]}=t,i=new Set(["password","passwd","pwd","pass","secret","token","id_token","access_token","refresh_token","apikey","api_key","api-key","apiKey","key","privatekey","private_key","client_secret","clientSecret","auth","authorization","ssh_key","sshKey","bearer","session","cookie","csrf","xsrf","ip","ip_address","ipAddress","aws_access_key_id","aws_secret_access_key","gcp_service_account_key",...r].map(e=>e.toLowerCase())),o=[{re:/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,reason:"ip"},{re:/\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b/g,reason:"ip6"},{re:/\b(AKI|ASI)A[0-9A-Z]{16}\b/g,reason:"aws_access_key_id"},{re:/\b[0-9A-Za-z/+]{40}\b/g,reason:"aws_secret_access_key_like"},{re:/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/g,reason:"bearer"},{re:/\b[A-Za-z0-9-_]+?\.[A-Za-z0-9-_]+?\.[A-Za-z0-9-_]+?\b/g,reason:"jwt_like"},{re:/\b[A-Za-z0-9_\-]{24,64}\b/g,reason:"long_token"}],l=new WeakMap;function c(e){let t=e;for(let{re:e}of o)t=t.replace(e,a);return t}function u(e){return i.has(String(e).toLowerCase())}return e.map(e=>(function e(t,r){if(null==t||"number"==typeof t||"boolean"==typeof t||"bigint"==typeof t)return t;if("string"==typeof t)return c(t);if("function"==typeof t)return"[Function]";if(t instanceof Date)return t.toISOString();if(t instanceof RegExp)return t.toString();if(ArrayBuffer.isView(t)&&!(t instanceof DataView))return`[TypedArray byteLength=${t.byteLength}]`;if(t instanceof ArrayBuffer)return`[ArrayBuffer byteLength=${t.byteLength}]`;if(r>=s)return n;if("object"==typeof t){if(l.has(t))return"[Circular]";if(Array.isArray(t)){let s=[];l.set(t,s);for(let a=0;a<t.length;a++)s[a]=e(t[a],r+1);return s}if(function(e){if(null===e||"object"!=typeof e)return!1;let t=Object.getPrototypeOf(e);return t===Object.prototype||null===t}(t)){let s={};for(let[n,i]of(l.set(t,s),Object.entries(t)))u(n)?s[n]=a:s[n]=e(i,r+1);return s}if(t instanceof Map){let s=[];for(let[n,i]of(l.set(t,s),t.entries())){let t=u(n)?a:e(n,r+1),o=u(n)?a:e(i,r+1);s.push([t,o])}return s}if(t instanceof Set){let s=[];for(let a of(l.set(t,s),t.values()))s.push(e(a,r+1));return s}if(t instanceof URL)return t.toString();if(t instanceof Error){let e={name:t.name,message:c(t.message),stack:n};return l.set(t,e),e}try{return c(String(t))}catch{return c(Object.prototype.toString.call(t))}}return c(String(t))})(e,0))},"sanitizeUrlHashParams",0,function(e){return e.split("#")[0]}])},974200,e=>{"use strict";let t=[{value:"hello-world",name:"Simple Hello World",description:"Basic function that returns a JSON response",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface ReqPayload {
  name: string;
}

console.info("server started");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, ctx) => {
    const { name }: ReqPayload = await req.json();

    // Using 'sb_secret_xyz' bypasses RLS — use for privileged operations
    if (ctx.authType === "secret") {
      return Response.json({
        message: \`Hello \${name} admin!\`,
      });
    }

    return Response.json({
      message: \`Hello \${name}!\`,
    });
  }),
};`},{value:"database-access",name:"Supabase Database Access",description:"Example using Supabase client to query your database",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

// This endpoint uses 'user' access, credentials is required.
export default {
  fetch: withSupabase({ auth: "user" }, async (_req, { supabase }) => {
    // TODO: Change the table_name to your table
    const { data, error } = await supabase.from("table_name").select("*");

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return Response.json({ data });
  }),
};`},{value:"storage-upload",name:"Supabase Storage Upload",description:"Upload files to Supabase Storage",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { randomUUID } from "node:crypto"

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, { supabase }) => {
    const formData = await req.formData()
    const file = formData.get('file')

    // TODO: update your-bucket to the bucket you want to write files
    const { data, error } = await supabase
      .storage
      .from('your-bucket')
      .upload(
        \`\${file.name}-\${randomUUID()}\`,
        file,
        { contentType: file.type }
      )

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return Response.json({ data });
  }),
};`},{value:"node-api",name:"Node Built-in API Example",description:"Example using Node.js built-in crypto and http modules",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import process from "node:process";

const generateRandomString = (length) => {
  const buffer = randomBytes(length);
  return buffer.toString('hex');
};

const randomString = generateRandomString(10);
console.log(randomString);

const server = createServer((req, res) => {
  const message = \`Hello\`;
  res.end(message);
});

server.listen(9999);`},{value:"express",name:"Express Server",description:"Example using Express.js for routing",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import express from "npm:express@4.18.2";

const app = express();

// TODO: replace slug with Function's slug
// https://supabase.com/docs/guides/functions/routing?queryGroups=framework&framework=expressjs
app.get(/slug/(.*)/, (req, res) => {
  res.send("Welcome to Supabase");
});

app.listen(8000);`},{value:"stream-text-with-ai-sdk",name:"Stream text with AI SDK",description:"Generate and stream text with Vercel AI SDK",content:`/*
 * Setup OPENAI_API_KEY secret to get started.
 * For usage with useChat, point transport.api to this endpoint
 * and include your publishable key as ApiKey: <key> in transport.headers.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { convertToModelMessages, streamText } from "npm:ai";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "3600",
  Vary: "Access-Control-Request-Headers",
};

class ClientError extends Error {}

const openai = createOpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const SYSTEM_PROMPT = "You are a helpful AI assistant.";

export default {
  fetch: withSupabase({ auth: "publishable", cors }, async (req, _ctx) => {
    try {
      const body = await req.json().catch(() => {
        throw new ClientError("Invalid JSON payload");
      }) as { messages?: unknown; model?: unknown };

      const { messages, model: modelName } = body;

      if (!Array.isArray(messages)) {
        throw new ClientError("Request must include a messages array");
      }

      const normalizedMessages = await convertToModelMessages(messages);

      const model = openai(
        typeof modelName === "string" ? modelName : "gpt-5.1-chat-latest",
      );

      const result = streamText({
        model,
        messages: normalizedMessages,
        system: SYSTEM_PROMPT,
      });

      return result.toUIMessageStreamResponse({
        sendReasoning: true,
        sendSources: true,
      });
    } catch (err) {
      if (err instanceof ClientError) {
        return Response.json({ error: err.message }, { status: 400 });
      }

      console.error("Assistant chat error:", err);
      return Response.json({
        error: "Failed to process chat request",
        details: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }),
};`},{value:"generate-recipes-with-ai-sdk",name:"Generate recipes with AI SDK",description:"Generate structured cooking recipes with Vercel AI SDK",content:`/*
 * 1) Setup OPENAI_API_KEY secret to get started.
 * 2) Call this endpoint with { prompt, model? } to generate a recipe object matching the schema below.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { generateText, Output } from "npm:ai";
import { z } from "npm:zod";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "3600",
  Vary: "Access-Control-Request-Headers",
};

class ClientError extends Error {}

const openai = createOpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const RecipeSchema = z.object({
  recipe: z.object({
    name: z.string(),
    ingredients: z.array(z.string()),
    steps: z.array(z.string()),
  }),
});

const SYSTEM_PROMPT =
  "You are a recipe generator. Always return a structured recipe matching the given schema.";

export default {
  fetch: withSupabase({ auth: "publishable", cors }, async (req, _ctx) => {
    try {
      const body = await req.json().catch(() => {
        throw new ClientError("Invalid JSON payload");
      }) as {
        model?: unknown;
        prompt?: unknown;
      };

      const { model: modelName, prompt } = body;

      if (typeof prompt !== "string" || !prompt.trim()) {
        throw new ClientError("Request must include a non-empty prompt string");
      }

      const model = openai(
        typeof modelName === "string" ? modelName : "gpt-5.1-chat-latest",
      );

      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        output: Output.object({
          schema: RecipeSchema,
        }),
      });

      return Response.json(result.output, { status: 200 });
    } catch (err) {
      if (err instanceof ClientError) {
        return Response.json({ error: err.message }, { status: 400 });
      }

      console.error("generateText error:", err);
      console.error("Assistant chat error:", err);
      return Response.json({
        error: "Failed to process generateText request",
        details: err instanceof Error ? err.message : String(err),
      }, { status: 500 });
    }
  }),
};`},{value:"stripe-webhook",name:"Stripe Webhook Example",description:"Handle Stripe webhook events securely",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "npm:stripe";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

export default {
  fetch: withSupabase({ auth: "none" }, async (req, { supabaseAdmin }) => {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature")!;

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        sig,
        Deno.env.get("STRIPE_WEBHOOK_SECRET")!,
      );
    } catch {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    /*
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await supabaseAdmin
          .from("orders")
          .update({ status: "paid" })
          .eq("stripe_session_id", session.id);
        break;
      }
    }
    */

    console.log(\`🔔 Event received: \${event.id}\`)
    return Response.json({ received: true });
  }),
};
`},{value:"resend-email",name:"Send Emails",description:"Send emails using the Resend API",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, _ctx) => {
    const { to, subject, html } = await req.json();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${RESEND_API_KEY}\`,
      },
      body: JSON.stringify({
        from: "you@example.com",
        to,
        subject,
        html,
      }),
    });
    const data = await res.json();

    return Response.json(data);
  }),
};`},{value:"image-transform",name:"Image Transformation",description:"Transform images using ImageMagick WASM",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import {
  ImageMagick,
  initializeImageMagick,
} from "npm:@imagemagick/magick-wasm@0.0.30";

await initializeImageMagick();

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, _ctx) => {
    const formData = await req.formData();
    const file = formData.get("file");
    const content = await file.arrayBuffer();

    const result = await ImageMagick.read(new Uint8Array(content), (img) => {
      img.resize(500, 300);
      img.blur(60, 5);
      return img.write((data) => data);
    });

    return new Response(
      result,
      { headers: { "Content-Type": "image/png" } },
    );
  }),
};`},{value:"websocket-server",name:"WebSocket Server Example",description:"Create a real-time WebSocket server",content:`// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, _ctx) => {
    const upgrade = req.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() != "websocket") {
      return new Response("request isn't trying to upgrade to websocket.");
    }

    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      console.log("client connected!");
      socket.send("Welcome to Supabase Edge Functions!");
    };

    socket.onmessage = (e) => {
      console.log("client sent message:", e.data);
      socket.send(new Date().toString());
    };

    return response;
  }),
};`}];e.s(["EDGE_FUNCTION_TEMPLATES",0,t])},358752,(e,t,s)=>{"use strict";var a=e.r(971131);s.createRoot=a.createRoot,s.hydrateRoot=a.hydrateRoot},60788,996941,835453,387667,278408,e=>{"use strict";let t="u"<typeof __SENTRY_DEBUG__||__SENTRY_DEBUG__;e.s(["DEBUG_BUILD",0,t],60788);var s=e.i(469449);function a(e){let t={};try{e.forEach((e,s)=>{"string"==typeof e&&(t[s]=e)})}catch{}return t}function n(e){let t=Object.create(null);try{Object.entries(e).forEach(([e,s])=>{"string"==typeof s&&(t[e]=s)})}catch{}return t}function r(e){let t=e.headers||{},s=("string"==typeof t["x-forwarded-host"]?t["x-forwarded-host"]:void 0)||("string"==typeof t.host?t.host:void 0),a=("string"==typeof t["x-forwarded-proto"]?t["x-forwarded-proto"]:void 0)||e.protocol||(e.socket?.encrypted?"https":"http"),r=e.url||"",o=function({url:e,protocol:t,host:s}){return e?.startsWith("http")?e:e&&s?`${t}://${s}${e}`:void 0}({url:r,host:s,protocol:a}),l=e.body||void 0,c=e.cookies;return{url:o,method:e.method,query_string:i(r),headers:n(t),cookies:c,data:l}}function i(e){if(e)try{let t=new URL(e,"http://s.io").search.slice(1);return t.length?t:void 0}catch{return}}e.s(["headersToDict",0,n,"httpRequestToRequestData",0,r,"winterCGHeadersToDict",0,a,"winterCGRequestToRequestData",0,function(e){let t=a(e.headers);return{method:e.method,url:e.url,query_string:i(e.url),headers:t}}],996941);var o=e.i(817729),l=e.i(40108);function c(e){let t=l.GLOBAL_OBJ[Symbol.for("@vercel/request-context")],s=t?.get?.();s?.waitUntil&&s.waitUntil(e)}e.s(["vercelWaitUntil",0,c],835453);var u=e.i(521852);async function d(){try{t&&u.debug.log("Flushing events..."),await (0,o.flush)(2e3),t&&u.debug.log("Done flushing events")}catch(e){t&&u.debug.log("Error while flushing events:\n",e)}}async function m(e){let{req:t,res:a,err:n}=e,i=a?.statusCode||e.statusCode;if(i&&i<500||!e.pathname)return Promise.resolve();(0,s.withScope)(e=>{if(t){let s=r(t);e.setSDKProcessingMetadata({normalizedRequest:s})}(0,o.captureException)(n||`_error.js called with falsy error (${n})`,{mechanism:{type:"auto.function.nextjs.underscore_error",handled:!1,data:{function:"_error.getInitialProps"}}})}),c(d())}e.s(["flushSafelyWithTimeout",0,d],387667),e.s(["captureUnderscoreErrorException",0,m],278408)},222053,e=>{"use strict";var t=e.i(478902),s=e.i(283607);e.i(128328);var a=e.i(158639),n=e.i(824183),r=e.i(867637),i=e.i(636900),o=e.i(370410),l=e.i(989567),c=e.i(389959),u=e.i(655744),d=e.i(355901),m=e.i(602089),p=e.i(837710),h=e.i(843778),f=e.i(866205),j=e.i(703526),g=e.i(917007),x=e.i(920432),v=e.i(549815),k=e.i(911509),b=e.i(20482),y=e.i(378277),w=e.i(9679),S=e.i(689805),_=e.i(793912),N=e.i(135144),P=e.i(613580),A=e.i(531837),C=e.i(974200),E=e.i(448710),R=e.i(839941),T=e.i(79771),z=e.i(215618),I=e.i(809822),D=e.i(613983),q=e.i(139415),M=e.i(162082),O=e.i(912793),B=e.i(265735),F=e.i(635494),L=e.i(10429),U=e.i(317040),H=e.i(441081);let $=["quick","clever","bright","swift","rapid","smart","smooth","dynamic","super","hyper"],K=["function","handler","processor","responder","worker","service","api","endpoint","action","task"],G=/^[A-Za-z0-9_-]+$/,W=A.object({functionName:A.string().min(1,"Function name is required").regex(G,"Only letters, numbers, hyphens, and underscores allowed")}),Y=[{id:1,name:"index.ts",content:C.EDGE_FUNCTION_TEMPLATES[0].content,state:"new"}],V=()=>{let e,A,E=(0,l.useRouter)(),{ref:R,template:V}=(0,a.useParams)(),{data:Z}=(0,F.useSelectedProjectQuery)(),{data:J}=(0,B.useSelectedOrganizationQuery)(),X=(0,U.useAiAssistantStateSnapshot)(),{mutate:Q}=(0,M.useSendEventMutation)(),ee=(0,O.useIsFeatureEnabled)("edge_functions:show_stripe_example"),{openSidebar:et}=(0,H.useSidebarManagerSnapshot)(),[es,ea]=(0,c.useState)(Y),[en,er]=(0,c.useState)(Y[0].id),[ei,eo]=(0,c.useState)(!1),el=(0,c.useId)(),[ec,eu]=(0,c.useState)(!1),[ed,em]=(0,c.useState)(""),ep=(0,c.useMemo)(()=>ee?C.EDGE_FUNCTION_TEMPLATES:C.EDGE_FUNCTION_TEMPLATES.filter(e=>"stripe-webhook"!==e.value),[ee]),eh=(0,u.useForm)({resolver:(0,s.zodResolver)(W),defaultValues:{functionName:(e=$[Math.floor(Math.random()*$.length)],A=K[Math.floor(Math.random()*K.length)],`${e}-${A}`)}}),{mutate:ef,isPending:ej,isSuccess:eg}=(0,q.useEdgeFunctionDeployMutation)({onSuccess:()=>{d.toast.success("Successfully deployed edge function");let e=eh.getValues("functionName");setTimeout(()=>{R&&e&&E.push(`/project/${R}/functions/${e}/details`)},150)}}),ex=e=>{!ej&&R&&(ef({projectRef:R,slug:e.functionName,metadata:{name:e.functionName,verify_jwt:!0},files:es.map(({name:e,content:t})=>({name:e,content:t}))}),Q({action:"edge_function_deploy_button_clicked",properties:{origin:"functions_editor"},groups:{project:R??"Unknown",organization:J?.slug??"Unknown"}}))},ev=e=>{let t=C.EDGE_FUNCTION_TEMPLATES.find(t=>t.value===e);t&&(ea(e=>e.map(e=>e.id===en?{...e,content:t.content}:e)),eo(!1),Q({action:"edge_function_template_clicked",properties:{templateName:t.name,origin:"editor_page"},groups:{project:R??"Unknown",organization:J?.slug??"Unknown"}})),eu(!1)},ek=()=>{ec&&(eu(!1),ea(e=>e.map(e=>e.id===en?{...e,content:ed}:e)))};(0,c.useEffect)(()=>{if(V){let e=C.EDGE_FUNCTION_TEMPLATES.find(e=>e.value===V);e&&(eh.reset({functionName:V}),er(1),ea([{id:1,name:"index.ts",content:e.content,state:"new"}]))}},[V]);let eb=(0,c.useMemo)(()=>!(0,n.default)(Y,es),[es]);return(0,t.jsxs)(T.PageLayout,{size:"full",isCompact:!0,title:"Create new edge function",breadcrumbs:[{label:"Edge Functions",href:`/project/${R}/functions`}],primaryActions:(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)(S.Popover_Shadcn_,{open:ei,onOpenChange:eo,children:[(0,t.jsx)(N.PopoverTrigger_Shadcn_,{asChild:!0,children:(0,t.jsx)(p.Button,{size:"tiny",type:"default",role:"combobox","aria-expanded":ei,"aria-controls":el,icon:(0,t.jsx)(i.Book,{size:14}),children:"Templates"})}),(0,t.jsx)(_.PopoverContent_Shadcn_,{id:el,className:"w-[300px] p-0",align:"end",children:(0,t.jsxs)(f.Command_Shadcn_,{children:[(0,t.jsx)(x.CommandInput_Shadcn_,{placeholder:"Search templates..."}),(0,t.jsxs)(k.CommandList_Shadcn_,{children:[(0,t.jsx)(j.CommandEmpty_Shadcn_,{children:"No templates found."}),(0,t.jsx)(g.CommandGroup_Shadcn_,{children:ep.map(e=>(0,t.jsx)(v.CommandItem_Shadcn_,{value:e.value,onSelect:ev,onMouseEnter:()=>{var t;return t=e.content,void(!ec&&em((es.find(e=>e.id===en)??es[0]).content),eu(!0),ea(e=>e.map(e=>e.id===en?{...e,content:t}:e)))},onMouseLeave:ek,className:"cursor-pointer",children:(0,t.jsxs)("div",{className:"flex flex-col gap-1",children:[(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(o.Check,{className:(0,h.cn)("mr-2 h-4 w-4",es.some(t=>t.content===e.content)?"opacity-100":"opacity-0")}),(0,t.jsx)("span",{className:"text-foreground",children:e.name})]}),(0,t.jsx)("span",{className:"text-xs text-foreground-light pl-6",children:e.description})]})},e.value))})]})]})})]}),(0,t.jsx)(p.Button,{size:"tiny",type:"default",onClick:()=>{let e=es.find(e=>e.id===en);et(z.SIDEBAR_KEYS.AI_ASSISTANT),X.newChat({name:"Explain edge function",sqlSnippets:[e?.content??""],initialInput:"Help me understand and improve this edge function...",suggestions:{title:"I can help you understand and improve your edge function. Here are a few example prompts to get you started:",prompts:[{label:"Explain Function",description:"Explain what this function does..."},{label:"Optimize Function",description:"Help me optimize this function..."},{label:"Add Features",description:"Show me how to add more features..."},{label:"Error Handling",description:"Help me handle errors better..."}]}}),Q({action:"edge_function_ai_assistant_button_clicked",properties:{origin:"functions_editor_chat"},groups:{project:R??"Unknown",organization:J?.slug??"Unknown"}})},icon:(0,t.jsx)(m.AiIconAnimation,{size:16}),children:"Chat"})]}),children:[(0,t.jsx)(D.FileExplorerAndEditor,{files:es,onFilesChange:ea,aiEndpoint:`${L.BASE_PATH}/api/ai/code/complete`,aiMetadata:{projectRef:Z?.ref,connectionString:Z?.connectionString,orgSlug:J?.slug},selectedFileId:en,setSelectedFileId:er}),(0,t.jsx)(b.Form,{...eh,children:(0,t.jsxs)("form",{onSubmit:eh.handleSubmit(ex),className:"flex items-center bg-background-muted justify-end p-4 border-t bg-surface-100 gap-3",children:[(0,t.jsxs)("div",{className:"flex items-center gap-3",children:[(0,t.jsx)(w.Label_Shadcn_,{htmlFor:"functionName",children:"Function name"}),(0,t.jsx)(b.FormField,{control:eh.control,name:"functionName",render:({field:e})=>(0,t.jsx)(b.FormItem,{className:"flex flex-col gap-0 m-0",children:(0,t.jsxs)("div",{className:"flex items-center",children:[(0,t.jsx)(b.FormControl,{children:(0,t.jsx)(y.Input_Shadcn_,{id:"functionName",type:"text",size:"large",placeholder:"Give your function a name...",className:"w-[250px]",...e})}),eh.formState.errors.functionName&&(0,t.jsxs)(P.Tooltip,{children:[(0,t.jsx)(P.TooltipTrigger,{children:(0,t.jsx)(r.AlertCircle,{className:"w-4 h-4 text-destructive ml-2"})}),(0,t.jsx)(P.TooltipContent,{children:eh.formState.errors.functionName.message})]})]})})})]}),(0,t.jsx)(p.Button,{loading:ej,size:"medium",disabled:0===es.length||ej,onClick:()=>{let e=eh.getValues("functionName");if(!G.test(e)&&e){let t=e.replace(/[^A-Za-z0-9_-]/g,"-");eh.setValue("functionName",t,{shouldValidate:!0})}eh.handleSubmit(ex)()},children:"Deploy function"})]})}),(0,t.jsx)(I.PreventNavigationOnUnsavedChanges,{hasChanges:eb&&!eg})]})};V.getLayout=e=>(0,t.jsx)(E.DefaultLayout,{children:(0,t.jsx)(R.default,{title:"New",children:e})}),e.s(["default",0,V])},699900,(e,t,s)=>{let a="/project/[ref]/functions/new";(window.__NEXT_P=window.__NEXT_P||[]).push([a,()=>e.r(222053)]),t.hot&&t.hot.dispose(function(){window.__NEXT_P.push([a])})},111410,e=>{e.v(t=>Promise.all(["static/chunks/0nvq7ixd7flhk.js","static/chunks/0-b9xai5dxku6.js"].map(t=>e.l(t))).then(()=>t(677146)))},883471,e=>{e.v(t=>Promise.all(["static/chunks/09hswzu0ku5zf.js"].map(t=>e.l(t))).then(()=>t(518769)))},795963,e=>{e.v(t=>Promise.all(["static/chunks/0ks-aybsu_wi9.js"].map(t=>e.l(t))).then(()=>t(155241)))},204230,e=>{e.v(t=>Promise.all(["static/chunks/0w0j_4v0xl40_.js"].map(t=>e.l(t))).then(()=>t(20876)))},329867,e=>{e.v(t=>Promise.all(["static/chunks/0xaxkuelz7rqa.js"].map(t=>e.l(t))).then(()=>t(562380)))},643342,e=>{e.v(t=>Promise.all(["static/chunks/0zgpl3~uwzus_.js","static/chunks/05pb1hprl3f1..js","static/chunks/0sx9k11kyjj8_.js","static/chunks/0rc3i288rfve2.js","static/chunks/0s0~99v-5ngm..js","static/chunks/0ld0tkw43_d_z.js","static/chunks/0vuxj3smvgrtn.js","static/chunks/0dvc_r~u04m8o.js"].map(t=>e.l(t))).then(()=>t(232258)))},804879,e=>{e.v(t=>Promise.all(["static/chunks/0sx9k11kyjj8_.js","static/chunks/0dvc_r~u04m8o.js","static/chunks/17ejsx1l~iu5n.js"].map(t=>e.l(t))).then(()=>t(199687)))},95833,e=>{e.v(t=>Promise.all(["static/chunks/0cww.8ehdois1.js","static/chunks/17xz7lsb6874k.js"].map(t=>e.l(t))).then(()=>t(142543)))},846537,e=>{e.v(t=>Promise.all(["static/chunks/09jggw8-w338p.js"].map(t=>e.l(t))).then(()=>t(245201)))},50229,e=>{e.v(t=>Promise.all(["static/chunks/02.jl2sglul.n.js"].map(t=>e.l(t))).then(()=>t(331248)))},263652,e=>{e.v(t=>Promise.all(["static/chunks/0jjrq4i9u5vmq.js"].map(t=>e.l(t))).then(()=>t(700224)))},822335,e=>{e.v(t=>Promise.all(["static/chunks/009osf94kmf31.js"].map(t=>e.l(t))).then(()=>t(48216)))},827389,e=>{e.v(t=>Promise.all(["static/chunks/0_dh9vk4ra.2p.js"].map(t=>e.l(t))).then(()=>t(780795)))},306465,e=>{e.v(t=>Promise.all(["static/chunks/0rbjapxz0pgnv.js"].map(t=>e.l(t))).then(()=>t(84223)))},320810,e=>{e.v(t=>Promise.all(["static/chunks/0.oi_v17jtqp5.js"].map(t=>e.l(t))).then(()=>t(190529)))},44756,e=>{e.v(t=>Promise.all(["static/chunks/0a6c2pn3_l8kq.js"].map(t=>e.l(t))).then(()=>t(411609)))},77572,e=>{e.v(t=>Promise.all(["static/chunks/166h92c461mkv.js"].map(t=>e.l(t))).then(()=>t(550910)))},299015,e=>{e.v(t=>Promise.all(["static/chunks/0-9423xke49f~.js"].map(t=>e.l(t))).then(()=>t(956403)))},853832,e=>{e.v(t=>Promise.all(["static/chunks/0p8139y942277.js"].map(t=>e.l(t))).then(()=>t(523047)))},444444,e=>{e.v(t=>Promise.all(["static/chunks/13kiz9d5rgmah.js"].map(t=>e.l(t))).then(()=>t(306141)))},89982,e=>{e.v(t=>Promise.all(["static/chunks/0941dz09ax~nn.js"].map(t=>e.l(t))).then(()=>t(84181)))},439,e=>{e.v(t=>Promise.all(["static/chunks/11i46y2wnisje.js"].map(t=>e.l(t))).then(()=>t(585967)))},674055,e=>{e.v(t=>Promise.all(["static/chunks/062ioqwn.wx0m.js"].map(t=>e.l(t))).then(()=>t(659864)))},801894,e=>{e.v(t=>Promise.all(["static/chunks/0gd6tzelef1m_.js"].map(t=>e.l(t))).then(()=>t(532683)))},578444,e=>{e.v(t=>Promise.all(["static/chunks/03w3voekb4wth.js"].map(t=>e.l(t))).then(()=>t(221183)))},185608,e=>{e.v(t=>Promise.all(["static/chunks/0raknzxt-wcz9.js"].map(t=>e.l(t))).then(()=>t(79472)))},612314,e=>{e.v(t=>Promise.all(["static/chunks/0ljeqsuozc1i3.js"].map(t=>e.l(t))).then(()=>t(980791)))},660943,e=>{e.v(t=>Promise.all(["static/chunks/0_aqj._09p._6.js"].map(t=>e.l(t))).then(()=>t(620893)))},214615,e=>{e.v(t=>Promise.all(["static/chunks/0dt74m4~_46rs.js"].map(t=>e.l(t))).then(()=>t(194742)))},877303,e=>{e.v(t=>Promise.all(["static/chunks/0.n085w7rb1ja.js"].map(t=>e.l(t))).then(()=>t(85809)))},565731,e=>{e.v(t=>Promise.all(["static/chunks/0hva42noy0sse.js"].map(t=>e.l(t))).then(()=>t(846526)))},439954,e=>{e.v(t=>Promise.all(["static/chunks/0lrarjmu2697g.js"].map(t=>e.l(t))).then(()=>t(399358)))},646193,e=>{e.v(t=>Promise.all(["static/chunks/0.vdvwqx94zhv.js"].map(t=>e.l(t))).then(()=>t(270671)))},470322,e=>{e.v(t=>Promise.all(["static/chunks/0rkeqsf_13qhc.js"].map(t=>e.l(t))).then(()=>t(433215)))},310666,e=>{e.v(t=>Promise.all(["static/chunks/0v7po0d32x-yh.js"].map(t=>e.l(t))).then(()=>t(191809)))},38970,e=>{e.v(t=>Promise.all(["static/chunks/0m.45uwthfqel.js","static/chunks/09iuv8wbqru87.js","static/chunks/0e7c-sb97o_jg.js"].map(t=>e.l(t))).then(()=>t(66554)))},68365,e=>{e.v(t=>Promise.all(["static/chunks/0sju4veuss6_3.js"].map(t=>e.l(t))).then(()=>t(531769)))},705292,e=>{e.v(t=>Promise.all(["static/chunks/0zcdb51w~tskd.js"].map(t=>e.l(t))).then(()=>t(147575)))},930188,e=>{e.v(t=>Promise.all(["static/chunks/0ycah97_keqty.js"].map(t=>e.l(t))).then(()=>t(604919)))},736620,e=>{e.v(t=>Promise.all(["static/chunks/07jrp78ub~ifl.js"].map(t=>e.l(t))).then(()=>t(85022)))},101928,e=>{e.v(t=>Promise.all(["static/chunks/0f8..jt0p6_il.js"].map(t=>e.l(t))).then(()=>t(846161)))},41375,e=>{e.v(t=>Promise.all(["static/chunks/04f0jksyv9tyz.js"].map(t=>e.l(t))).then(()=>t(834473)))},715733,e=>{e.v(t=>Promise.all(["static/chunks/0i55w2k46t17v.js"].map(t=>e.l(t))).then(()=>t(417897)))},268726,e=>{e.v(t=>Promise.all(["static/chunks/10-p-qi26q251.js"].map(t=>e.l(t))).then(()=>t(898187)))},740028,e=>{e.v(t=>Promise.all(["static/chunks/05s9tzr_di6g7.js"].map(t=>e.l(t))).then(()=>t(391060)))},134805,e=>{e.v(t=>Promise.all(["static/chunks/0paw56w7ssf5_.js"].map(t=>e.l(t))).then(()=>t(664336)))},597523,e=>{e.v(t=>Promise.all(["static/chunks/184kcgmai559k.js"].map(t=>e.l(t))).then(()=>t(245099)))},678679,e=>{e.v(t=>Promise.all(["static/chunks/0xj9ll34z6w-1.js"].map(t=>e.l(t))).then(()=>t(404154)))},73751,e=>{e.v(t=>Promise.all(["static/chunks/06tp6.6wb2vvb.js"].map(t=>e.l(t))).then(()=>t(31724)))},909495,e=>{e.v(t=>Promise.all(["static/chunks/0ogd2qkwrgl~n.js"].map(t=>e.l(t))).then(()=>t(698380)))},548863,e=>{e.v(t=>Promise.all(["static/chunks/019jx-cea7np0.js","static/chunks/0sx9k11kyjj8_.js"].map(t=>e.l(t))).then(()=>t(79703)))},283398,e=>{e.v(t=>Promise.all(["static/chunks/0yl7303lze3ej.js"].map(t=>e.l(t))).then(()=>t(541970)))},274794,e=>{e.v(t=>Promise.all(["static/chunks/0cs5pibm-4yty.js","static/chunks/0sx9k11kyjj8_.js","static/chunks/0dvc_r~u04m8o.js","static/chunks/0xnngwrln7i59.js","static/chunks/17ge7f4aenao8.js"].map(t=>e.l(t))).then(()=>t(571538)))},248383,e=>{e.v(t=>Promise.all(["static/chunks/0ly4pe8hba_tp.js"].map(t=>e.l(t))).then(()=>t(136003)))},579437,e=>{e.v(t=>Promise.all(["static/chunks/0sx9k11kyjj8_.js","static/chunks/02amt4gsnv.5m.js","static/chunks/0sy.j3nq0sv-q.js","static/chunks/0dvc_r~u04m8o.js"].map(t=>e.l(t))).then(()=>t(524943)))},609157,e=>{e.v(t=>Promise.all(["static/chunks/0sx9k11kyjj8_.js","static/chunks/0178i8e6d09h9.js","static/chunks/0dvc_r~u04m8o.js","static/chunks/0sy.j3nq0sv-q.js"].map(t=>e.l(t))).then(()=>t(323205)))},707643,e=>{e.v(t=>Promise.all(["static/chunks/0xv_g4vr9~rwi.js","static/chunks/0sx9k11kyjj8_.js"].map(t=>e.l(t))).then(()=>t(935100)))},467186,e=>{e.v(t=>Promise.all(["static/chunks/0.ty0g5jrtk~d.js"].map(t=>e.l(t))).then(()=>t(6777)))},639206,e=>{e.v(t=>Promise.all(["static/chunks/0sfslprbk-w4n.js","static/chunks/0m9-~wa0.xq1k.js"].map(t=>e.l(t))).then(()=>t(791713)))},250577,e=>{e.v(t=>Promise.all(["static/chunks/14fwpupbw0n.t.js"].map(t=>e.l(t))).then(()=>t(429091)))},610764,e=>{e.v(t=>Promise.all(["static/chunks/0~6zp_hbzp42n.js","static/chunks/0wcafqd5dwasj.js"].map(t=>e.l(t))).then(()=>t(247311)))},818633,e=>{e.v(t=>Promise.all(["static/chunks/114ofy7_3t0~q.js","static/chunks/0bwx~hwhbu0wr.js"].map(t=>e.l(t))).then(()=>t(338481)))},500556,e=>{e.v(t=>Promise.all(["static/chunks/143h9~8mh5aa9.css","static/chunks/10sm-t7f-l.qh.css","static/chunks/15icz334th420.js","static/chunks/0sx9k11kyjj8_.js","static/chunks/0ih.-9ku7m9-k.js","static/chunks/0cs5pibm-4yty.js","static/chunks/0r9xe1zwt73lm.js","static/chunks/11q_ru~yd2~i_.js","static/chunks/04do7zl5k3e-8.js","static/chunks/0gjdg5wz34rr2.js","static/chunks/0c9-lmtn8cbtk.js"].map(t=>e.l(t))).then(()=>t(321608)))},596207,e=>{e.v(t=>Promise.all(["static/chunks/0o67pr4ir74xk.js","static/chunks/0ch8j2mkao_bk.js"].map(t=>e.l(t))).then(()=>t(865243)))},354946,e=>{e.v(t=>Promise.all(["static/chunks/05sknbzzla2s1.js","static/chunks/0ch8j2mkao_bk.js"].map(t=>e.l(t))).then(()=>t(674412)))},943222,e=>{e.v(t=>Promise.all(["static/chunks/0jm5.60wu3y_3.js"].map(t=>e.l(t))).then(()=>t(140017)))},98740,e=>{e.v(t=>Promise.all(["static/chunks/0.dh8_aj4z3x4.js"].map(t=>e.l(t))).then(()=>t(795776)))},356631,e=>{e.v(t=>Promise.all(["static/chunks/03i19i9v1deag.js"].map(t=>e.l(t))).then(()=>t(157592)))},429186,e=>{e.v(t=>Promise.all(["static/chunks/0z36pitoh8cha.js","static/chunks/0wnxj-ak865qz.js","static/chunks/0feao903on2qo.js","static/chunks/0_0.60~-m5sph.js","static/chunks/0gd6fq9kbi.f..js","static/chunks/0-kj3euh28k3l.js"].map(t=>e.l(t))).then(()=>t(818996)))},488584,e=>{e.v(t=>Promise.all(["static/chunks/0gfrd_deo_cfa.js"].map(t=>e.l(t))).then(()=>t(851420)))},25642,e=>{e.v(t=>Promise.all(["static/chunks/08kga8z.88fvk.js","static/chunks/0sx9k11kyjj8_.js","static/chunks/0w_ng416pdocr.js","static/chunks/10logjxpnr6.7.js","static/chunks/0axa_b-mkhyyb.js","static/chunks/0dvc_r~u04m8o.js","static/chunks/0cs00ut5i9oo~.js","static/chunks/0atqtay9cio21.js"].map(t=>e.l(t))).then(()=>t(207831)))},561602,e=>{e.v(t=>Promise.all(["static/chunks/0ova90_rdfyr~.js","static/chunks/15ye4d9eqhv0p.js","static/chunks/0iu3r-~ayfbln.js"].map(t=>e.l(t))).then(()=>t(326204)))},877114,e=>{e.v(t=>Promise.all(["static/chunks/01nz16p98e8-d.js"].map(t=>e.l(t))).then(()=>t(812136)))},540007,e=>{e.v(t=>Promise.all(["static/chunks/04yrml096e-cj.js"].map(t=>e.l(t))).then(()=>t(785951)))},593029,e=>{e.v(t=>Promise.all(["static/chunks/0~_g3c06dmcnk.js"].map(t=>e.l(t))).then(()=>t(755497)))},849654,e=>{e.v(e=>Promise.resolve().then(()=>e(839941)))},639363,e=>{e.v(t=>Promise.all(["static/chunks/0hfv~86u63_o~.js"].map(t=>e.l(t))).then(()=>t(904340)))},425360,e=>{e.v(t=>Promise.all(["static/chunks/0uam6u836h_o2.js"].map(t=>e.l(t))).then(()=>t(409222)))},548315,e=>{e.v(t=>Promise.all(["static/chunks/0j7tuzlbseb2y.js"].map(t=>e.l(t))).then(()=>t(256337)))},661328,e=>{e.v(t=>Promise.all(["static/chunks/0bb1giefcfs_w.js"].map(t=>e.l(t))).then(()=>t(447400)))},265029,e=>{e.v(t=>Promise.all(["static/chunks/0pqx4_6sndz9g.js"].map(t=>e.l(t))).then(()=>t(289339)))},151872,e=>{e.v(t=>Promise.all(["static/chunks/170tgkixntvuv.js"].map(t=>e.l(t))).then(()=>t(865389)))},753940,e=>{e.v(t=>Promise.all(["static/chunks/0rwrv8gxe.4_k.js"].map(t=>e.l(t))).then(()=>t(478124)))},724565,e=>{e.v(t=>Promise.all(["static/chunks/0y6820x11cpv3.js"].map(t=>e.l(t))).then(()=>t(341546)))}]);