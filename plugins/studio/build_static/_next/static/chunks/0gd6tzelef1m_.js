(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var s=e.i(478902),a=e.i(389959),t=e.i(500850),o=e.i(283606),r=e.i(314805),n=e.i(408279),l=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},p={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:c,onValueChange:u})=>{if(!e?.length)return null;let d=e[0]?.name??"",h=void 0!==c,[m,b]=(0,a.useState)(d),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{h||b(s=>e.some(e=>e.name===s)?s:d)},[d,e,h]),(0,s.jsxs)(t.Tabs_Shadcn_,{value:h?c:m,onValueChange:e=>{h||b(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,s.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,s.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,s.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,s.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,s)=>{if(e){let s=i[e.toLowerCase()];if(s)return s}return(e=>{let s=e.toLowerCase();if(s.startsWith(".env"))return"bash";let a=s.split(".").pop();if(a&&a!==s)return p[a]})(s)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},532683,e=>{"use strict";var s=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let t=[{name:".env",language:"bash",code:[`VITE_SUPABASE_URL=${e.apiUrl??"your-project-url"}`,e?.publishableKey?`VITE_SUPABASE_PUBLISHABLE_KEY=${e.publishableKey}`:`VITE_SUPABASE_ANON_KEY=${e.anonKey??"your-anon-key"}`,""].join("\n")},{name:"app/utils/supabase.server.ts",language:"ts",code:`
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";

export function createClient(request: Request) {
  const headers = new Headers();

  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_${e.publishableKey?"SUPABASE_PUBLISHABLE_KEY":"SUPABASE_ANON_KEY"},
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "") as {
            name: string;
            value: string;
          }[];
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            )
          );
        },
      },
    }
  );

  return { supabase, headers };
}
`},{name:"app/routes/_index.tsx",language:"tsx",code:`
import type { Route } from "./+types/home";
import { createClient } from "~/utils/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createClient(request);
  const { data: todos } = await supabase.from("todos").select();

  return { todos };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <ul>
        {loaderData.todos?.map((todo) => (
          <li key={todo.id}>{todo.name}</li>
        ))}
      </ul>
    </>
  );
}

`}];return(0,s.jsx)(a.MultipleCodeBlock,{files:t})}])}]);