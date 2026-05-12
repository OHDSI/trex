(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var s=e.i(478902),t=e.i(389959),a=e.i(500850),o=e.i(283606),r=e.i(314805),n=e.i(408279),l=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:u})=>{if(!e?.length)return null;let d=e[0]?.name??"",m=void 0!==p,[b,h]=(0,t.useState)(d),_=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,t.useEffect)(()=>{m||h(s=>e.some(e=>e.name===s)?s:d)},[d,e,m]),(0,s.jsxs)(a.Tabs_Shadcn_,{value:m?p:b,onValueChange:e=>{m||h(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,s.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,s.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),_.map(e=>(0,s.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,s.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,s)=>{if(e){let s=i[e.toLowerCase()];if(s)return s}return(e=>{let s=e.toLowerCase();if(s.startsWith(".env"))return"bash";let t=s.split(".").pop();if(t&&t!==s)return c[t]})(s)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},550910,e=>{"use strict";var s=e.i(478902),t=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let a=[{name:".env.local",language:"bash",code:[`NEXT_PUBLIC_SUPABASE_URL=${e.apiUrl??"your-project-url"}`,e?.publishableKey?`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${e.publishableKey}`:`NEXT_PUBLIC_SUPABASE_ANON_KEY=${e.anonKey??"your-anon-key"}`,""].join("\n")},{name:"page.tsx",language:"tsx",code:`
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  const { data: todos } = await supabase.from('todos').select()

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  )
}
`},{name:"utils/supabase/server.ts",language:"ts",code:`
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.${e?.publishableKey?"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":"NEXT_PUBLIC_SUPABASE_ANON_KEY"};

export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  return createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // The \`setAll\` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
`},{name:"utils/supabase/client.ts",language:"ts",code:`
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.${e?.publishableKey?"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":"NEXT_PUBLIC_SUPABASE_ANON_KEY"};

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );
`},{name:"utils/supabase/middleware.ts",language:"ts",code:`
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.${e?.publishableKey?"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY":"NEXT_PUBLIC_SUPABASE_ANON_KEY"};

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  return supabaseResponse
};
`}];return(0,s.jsx)(t.MultipleCodeBlock,{files:a})}])}]);