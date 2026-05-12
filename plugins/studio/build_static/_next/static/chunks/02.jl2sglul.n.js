(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var a=e.i(478902),s=e.i(389959),t=e.i(500850),l=e.i(283606),o=e.i(314805),r=e.i(408279),n=e.i(331162);let p={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:i,onValueChange:u})=>{if(!e?.length)return null;let d=e[0]?.name??"",m=void 0!==i,[h,b]=(0,s.useState)(d),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,s.useEffect)(()=>{m||b(a=>e.some(e=>e.name===a)?a:d)},[d,e,m]),(0,a.jsxs)(t.Tabs_Shadcn_,{value:m?i:h,onValueChange:e=>{m||b(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,a.jsx)(o.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,a.jsx)(r.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,a.jsx)(l.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,a.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,a)=>{if(e){let a=p[e.toLowerCase()];if(a)return a}return(e=>{let a=e.toLowerCase();if(a.startsWith(".env"))return"bash";let s=a.split(".").pop();if(s&&s!==a)return c[s]})(a)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},331248,e=>{"use strict";var a=e.i(478902),s=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let t=[{name:".env.local",language:"bash",code:`
SUPABASE_URL=${e.apiUrl??"your-project-url"}
SUPABASE_KEY=${e.publishableKey??e.anonKey??"your-anon-key"}
        `},{name:"src/db/supabase.js",language:"js",code:`
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
        `},{name:"src/pages/index.astro",language:"html",code:`
---
import { supabase } from '../db/supabase';

const { data, error } = await supabase.from("todos").select('*');
---

{
  (
    <ul>
      {data.map((entry) => (
        <li>{entry.name}</li>
      ))}
    </ul>
  )
}
`}];return(0,a.jsx)(s.MultipleCodeBlock,{files:t})}])}]);