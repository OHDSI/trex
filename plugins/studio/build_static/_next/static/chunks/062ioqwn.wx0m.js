(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),r=e.i(389959),s=e.i(500850),o=e.i(283606),a=e.i(314805),i=e.i(408279),n=e.i(331162);let l={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},u={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:c,onValueChange:d})=>{if(!e?.length)return null;let p=e[0]?.name??"",m=void 0!==c,[h,f]=(0,r.useState)(p),v=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,r.useEffect)(()=>{m||f(t=>e.some(e=>e.name===t)?t:p)},[p,e,m]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:m?c:h,onValueChange:e=>{m||f(e),d?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(a.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(i.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),v.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=l[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let r=t.split(".").pop();if(r&&r!==t)return u[r]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},659864,e=>{"use strict";var t=e.i(478902),r=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:".env.local",language:"bash",code:`SUPABASE_URL=${e.apiUrl??"your-project-url"}
SUPABASE_KEY=${e?.publishableKey??e?.anonKey??"your-anon-key"}
`},{name:"src/utility/supabaseClient.ts",language:"ts",code:`
import { createClient } from "@refinedev/supabase";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: {
    schema: "public",
  },
  auth: {
    persistSession: true,
  },
});
        `},{name:"src/App.tsx",language:"tsx",code:`
import { Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";
import routerProvider, {
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import "./App.css";
import authProvider from "./authProvider";
import { supabaseClient } from "./utility";
import { CountriesCreate, CountriesEdit, CountriesList, CountriesShow } from "./pages/countries";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          authProvider={authProvider}
          routerProvider={routerProvider}
          options={{
            syncWithLocation: true,
            warnWhenUnsavedChanges: true,
          }}
          resources={[{
            name: "countries",
            list: "/countries",
            create: "/countries/create",
            edit: "/countries/edit/:id",
            show: "/countries/show/:id"
          }]}>
          <Routes>
            <Route index
              element={<NavigateToResource resource="countries" />}
            />
            <Route path="/countries">
              <Route index element={<CountriesList />} />
              <Route path="create" element={<CountriesCreate />} />
              <Route path="edit/:id" element={<CountriesEdit />} />
              <Route path="show/:id" element={<CountriesShow />} />
            </Route>
          </Routes>
          <RefineKbar />
          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
`}];return(0,t.jsx)(r.MultipleCodeBlock,{files:s})}])}]);