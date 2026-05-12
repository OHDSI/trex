(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(500850),o=e.i(283606),r=e.i(314805),n=e.i(408279),i=e.i(331162);let c={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},l={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:d,onValueChange:p})=>{if(!e?.length)return null;let h=e[0]?.name??"",u=void 0!==d,[m,g]=(0,a.useState)(h),b=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{u||g(t=>e.some(e=>e.name===t)?t:h)},[h,e,u]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:u?d:m,onValueChange:e=>{u||g(e),p?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),b.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(i.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=c[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let a=t.split(".").pop();if(a&&a!==t)return l[a]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},306141,e=>{"use strict";var t=e.i(478902),a=e.i(486240),s=e.i(10429);e.s(["default",0,({connectionStringPooler:e})=>{let o=[{name:".env.local",language:"bash",code:e.ipv4SupportedForDedicatedPooler&&e.transactionDedicated?`
# Connect to Supabase via connection pooling.
DATABASE_URL="${e.transactionDedicated}?pgbouncer=true"

# Direct connection to the database. Used for migrations.
DIRECT_URL="${e.sessionDedicated}"
        `:e.transactionDedicated&&!e.ipv4SupportedForDedicatedPooler?`
# Connect to Supabase via Shared Connection Pooler
DATABASE_URL="${e.transactionShared}?pgbouncer=true"

# Direct connection to the database through Shared Pooler (supports IPv4/IPv6). Used for migrations.
DIRECT_URL="${e.sessionShared}"

# If your network supports IPv6 or you purchased IPv4 addon, use dedicated pooler
# DATABASE_URL="${e.transactionDedicated}?pgbouncer=true"
# DIRECT_URL="${e.sessionDedicated}"
 `:`
# Connect to Supabase ${s.IS_PLATFORM?"via connection pooling":""}
DATABASE_URL="${s.IS_PLATFORM?`${e.transactionShared}?pgbouncer=true`:e.direct}"

# Direct connection to the database. Used for migrations
DIRECT_URL="${s.IS_PLATFORM?e.sessionShared:e.direct}"
`},{name:"prisma/schema.prisma",language:"bash",code:`
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
        `}];return(0,t.jsx)(a.MultipleCodeBlock,{files:o})}])}]);