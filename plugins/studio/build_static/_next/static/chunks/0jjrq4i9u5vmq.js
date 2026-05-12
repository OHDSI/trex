(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(500850),r=e.i(283606),o=e.i(314805),n=e.i(408279),l=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:d})=>{if(!e?.length)return null;let h=e[0]?.name??"",m=void 0!==p,[u,g]=(0,s.useState)(h),f=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,s.useEffect)(()=>{m||g(t=>e.some(e=>e.name===t)?t:h)},[h,e,m]),(0,t.jsxs)(a.Tabs_Shadcn_,{value:m?p:u,onValueChange:e=>{m||g(e),d?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(o.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),f.map(e=>(0,t.jsx)(r.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=i[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let s=t.split(".").pop();if(s&&s!==t)return c[s]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},700224,e=>{"use strict";var t=e.i(478902),s=e.i(486240);e.s(["default",0,({connectionStringPooler:e})=>{let a=[{name:".env",language:"bash",code:e.ipv4SupportedForDedicatedPooler&&e.transactionDedicated?`
DATABASE_URL="${e.transactionDedicated}"
        `:e.transactionDedicated&&!e.ipv4SupportedForDedicatedPooler?`
# Use Shared connection pooler (supports both IPv4/IPv6)
DATABASE_URL="${e.transactionShared}"

# If your network supports IPv6 or you purchased IPv4 addon, use dedicated pooler
# DATABASE_URL="${e.transactionDedicated}"
        `:`
DATABASE_URL="${e.transactionShared}"
`},{name:"drizzle/schema.ts",language:"tsx",code:`
import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});
        `},{name:"index.tsx",language:"tsx",code:`
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { users } from './drizzle/schema'

const connectionString = process.env.DATABASE_URL

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false })
const db = drizzle(client);

const allUsers = await db.select().from(users);
        `}];return(0,t.jsx)(s.MultipleCodeBlock,{files:a})}])}]);