(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var s=e.i(478902),t=e.i(389959),o=e.i(500850),a=e.i(283606),r=e.i(314805),n=e.i(408279),l=e.i(331162);let c={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},p={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:i,onValueChange:d})=>{if(!e?.length)return null;let m=e[0]?.name??"",u=void 0!==i,[h,b]=(0,t.useState)(m),f=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,t.useEffect)(()=>{u||b(s=>e.some(e=>e.name===s)?s:m)},[m,e,u]),(0,s.jsxs)(o.Tabs_Shadcn_,{value:u?i:h,onValueChange:e=>{u||b(e),d?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,s.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,s.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),f.map(e=>(0,s.jsx)(a.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,s.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,s)=>{if(e){let s=c[e.toLowerCase()];if(s)return s}return(e=>{let s=e.toLowerCase();if(s.startsWith(".env"))return"bash";let t=s.split(".").pop();if(t&&t!==s)return p[t]})(s)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},411609,e=>{"use strict";var s=e.i(478902),t=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let o=[{name:".env",language:"bash",code:`
REACT_APP_SUPABASE_URL=${e.apiUrl??"your-project-url"}
REACT_APP_SUPABASE_KEY=${e.publishableKey??"<prefer publishable key instead of anon key for mobile or desktop apps>"}
        `},{name:"src/supabaseClient.tsx",language:"ts",code:`
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
`},{name:"src/App.tsx",language:"ts",code:`
import React, { useEffect, useState } from 'react';
import { setupIonicReact, IonApp } from '@ionic/react';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
} from '@ionic/react';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Theme variables */
import './theme/variables.css';

import { supabase } from './supabaseClient';

setupIonicReact();

export default function App() {
  const [todos, setTodos] = useState([]);
  useEffect(() => {
    getTodos();
  }, []);

  const getTodos = async () => {
    try {
      const { data, error } = await supabase.from('todos').select();

      if (error) {
        console.error('Error fetching todos:', error.message);
        return;
      }

      if (data) {
        setTodos(data);
      }
    } catch (error) {
      console.error('Error fetching todos:', error.message);
    }
  };

  return (
    <IonApp>
      <>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Todos</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList>
            {todos.map((todo) => (
              <IonItem key={todo.id}>{todo.name}</IonItem>
            ))}
          </IonList>
        </IonContent>
      </>
    </IonApp>
  );
}
`}];return(0,s.jsx)(t.MultipleCodeBlock,{files:o})}])}]);