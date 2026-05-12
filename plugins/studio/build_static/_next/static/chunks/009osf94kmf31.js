(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),s=e.i(389959),a=e.i(500850),o=e.i(283606),r=e.i(314805),n=e.i(408279),l=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:d})=>{if(!e?.length)return null;let u=e[0]?.name??"",m=void 0!==p,[h,g]=(0,s.useState)(u),f=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,s.useEffect)(()=>{m||g(t=>e.some(e=>e.name===t)?t:u)},[u,e,m]),(0,t.jsxs)(a.Tabs_Shadcn_,{value:m?p:h,onValueChange:e=>{m||g(e),d?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),f.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=i[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let s=t.split(".").pop();if(s&&s!==t)return c[s]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},48216,e=>{"use strict";var t=e.i(478902),s=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let a=[{name:".env.local",language:"bash",code:`
EXPO_PUBLIC_SUPABASE_URL=${e.apiUrl??"your-project-url"}
EXPO_PUBLIC_SUPABASE_KEY=${e.publishableKey??"<prefer publishable key instead of anon key for mobile and desktop apps>"}
        `},{name:"utils/supabase.ts",language:"ts",code:`
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
        `},{name:"App.tsx",language:"tsx",code:`
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { supabase } from '../utils/supabase';

export default function App() {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    const getTodos = async () => {
      try {
        const { data: todos, error } = await supabase.from('todos').select();

        if (error) {
          console.error('Error fetching todos:', error.message);
          return;
        }

        if (todos && todos.length > 0) {
          setTodos(todos);
        }
      } catch (error) {
        console.error('Error fetching todos:', error.message);
      }
    };

    getTodos();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Todo List</Text>
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <Text key={item.id}>{item.name}</Text>}
      />
    </View>
  );
};

`}];return(0,t.jsx)(s.MultipleCodeBlock,{files:a})}])}]);