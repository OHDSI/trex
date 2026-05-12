(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var s=e.i(478902),a=e.i(389959),t=e.i(500850),o=e.i(283606),n=e.i(314805),l=e.i(408279),r=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:u})=>{if(!e?.length)return null;let d=e[0]?.name??"",m=void 0!==p,[h,g]=(0,a.useState)(d),b=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{m||g(s=>e.some(e=>e.name===s)?s:d)},[d,e,m]),(0,s.jsxs)(t.Tabs_Shadcn_,{value:m?p:h,onValueChange:e=>{m||g(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,s.jsx)(n.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,s.jsx)(l.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),b.map(e=>(0,s.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,s.jsx)(r.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,s)=>{if(e){let s=i[e.toLowerCase()];if(s)return s}return(e=>{let s=e.toLowerCase();if(s.startsWith(".env"))return"bash";let a=s.split(".").pop();if(a&&a!==s)return c[a]})(s)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},523047,e=>{"use strict";var s=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let t=[{name:".env.local",language:"bash",code:`SUPABASE_URL=${e.apiUrl??"your-project-url"}
SUPABASE_KEY=${e.publishableKey??e.anonKey??"your-anon-key"}
`},{name:"nuxt.config.ts",language:"ts",code:`
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_KEY,
    },
  },
})
`},{name:"app.vue",language:"html",code:`
<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'

const config = useRuntimeConfig()
const supabase = createClient(config.public.supabaseUrl, config.public.supabaseKey)

const todos = ref([])

async function getTodos() {
  const { data } = await supabase.from('todos').select()
  todos.value = data
}

onMounted(() => {
  getTodos()
})
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.name }}</li>
  </ul>
</template>
`}];return(0,s.jsx)(a.MultipleCodeBlock,{files:t})}])}]);