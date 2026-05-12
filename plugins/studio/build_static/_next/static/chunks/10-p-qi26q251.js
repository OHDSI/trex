(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(500850),o=e.i(283606),r=e.i(314805),l=e.i(408279),n=e.i(331162);let c={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},i={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:u})=>{if(!e?.length)return null;let d=e[0]?.name??"",m=void 0!==p,[h,b]=(0,a.useState)(d),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{m||b(t=>e.some(e=>e.name===t)?t:d)},[d,e,m]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:m?p:h,onValueChange:e=>{m||b(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(l.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=c[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let a=t.split(".").pop();if(a&&a!==t)return i[a]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},898187,e=>{"use strict";var t=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:".env",language:"bash",code:`
VITE_SUPABASE_URL=${e.apiUrl??"your-project-url"}
VITE_SUPABASE_KEY=${e.publishableKey??e.anonKey??"your-anon-key"}
        `},{name:"src/utils/supabase.ts",language:"ts",code:`
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);
        `},{name:"src/routes/index.tsx",language:"tsx",code:`
import { createFileRoute } from '@tanstack/react-router'
import { supabase } from '../utils/supabase'

export const Route = createFileRoute('/')({
  loader: async () => {
    const { data: todos } = await supabase.from('todos').select()
    return { todos }
  },
  component: Home,
})

function Home() {
  const { todos } = Route.useLoaderData()

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
`}];return(0,t.jsx)(a.MultipleCodeBlock,{files:s})}])}]);