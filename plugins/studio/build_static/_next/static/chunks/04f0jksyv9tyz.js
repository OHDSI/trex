(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var a=e.i(478902),s=e.i(389959),t=e.i(500850),l=e.i(283606),r=e.i(314805),o=e.i(408279),n=e.i(331162);let c={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},i={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:u})=>{if(!e?.length)return null;let h=e[0]?.name??"",d=void 0!==p,[m,b]=(0,s.useState)(h),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,s.useEffect)(()=>{d||b(a=>e.some(e=>e.name===a)?a:h)},[h,e,d]),(0,a.jsxs)(t.Tabs_Shadcn_,{value:d?p:m,onValueChange:e=>{d||b(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,a.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,a.jsx)(o.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,a.jsx)(l.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,a.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,a)=>{if(e){let a=c[e.toLowerCase()];if(a)return a}return(e=>{let a=e.toLowerCase();if(a.startsWith(".env"))return"bash";let s=a.split(".").pop();if(s&&s!==a)return i[s]})(a)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},834473,e=>{"use strict";var a=e.i(478902),s=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let t=[{name:".env.local",language:"bash",code:[`PUBLIC_SUPABASE_URL=${e.apiUrl??"your-project-url"}`,e?.publishableKey?`PUBLIC_SUPABASE_PUBLISHABLE_KEY=${e.publishableKey}`:`PUBLIC_SUPABASE_ANON_KEY=${e.anonKey??"your-anon-key"}`,""].join("\n")},{name:"src/lib/supabaseClient.js",language:"js",code:`
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, ${e.publishableKey?"PUBLIC_SUPABASE_PUBLISHABLE_KEY":"PUBLIC_SUPABASE_ANON_KEY"} } from "$env/static/public"

const supabaseUrl = PUBLIC_SUPABASE_URL;
const supabaseKey = ${e.publishableKey?"PUBLIC_SUPABASE_PUBLISHABLE_KEY":"PUBLIC_SUPABASE_ANON_KEY"};

export const supabase = createClient(supabaseUrl, supabaseKey);
        `},{name:"src/routes/+page.server.js",language:"js",code:`
import { supabase } from "$lib/supabaseClient";

export async function load() {
  const { data } = await supabase.from("countries").select();
  return {
    countries: data ?? [],
  };
}
`},{name:"src/routes/+page.svelte",language:"html",code:`
<script>
  export let data;
</script>

<ul>
  {#each data.countries as country}
    <li>{country.name}</li>
  {/each}
</ul>
`}];return(0,a.jsx)(s.MultipleCodeBlock,{files:t})}])}]);