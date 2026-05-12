(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(500850),o=e.i(283606),n=e.i(314805),r=e.i(408279),i=e.i(331162);let l={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},p={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:d,onValueChange:c})=>{if(!e?.length)return null;let u=e[0]?.name??"",m=void 0!==d,[h,b]=(0,a.useState)(u),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{m||b(t=>e.some(e=>e.name===t)?t:u)},[u,e,m]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:m?d:h,onValueChange:e=>{m||b(e),c?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(n.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(r.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(i.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=l[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let a=t.split(".").pop();if(a&&a!==t)return p[a]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},417897,e=>{"use strict";var t=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:"Supabase.swift",language:"swift",code:`
import Foundation
import Supabase

let supabase = SupabaseClient(
  supabaseURL: URL(string: "${e.apiUrl??"your-project-url"}")!,
  supabaseKey: "${e.publishableKey??"<prefer publishable key for native apps instead of anon key>"}"
)
        `},{name:"Todo.swift",language:"swift",code:`
import Foundation

struct Todo: Identifiable, Decodable {
  var id: Int
  var name: String
}
`},{name:"ContentView.swift",language:"swift",code:`
import Supabase
import SwiftUI

struct ContentView: View {
  @State var todos: [Todo] = []

  var body: some View {
    NavigationStack {
      List(todos) { todo in
        Text(todo.name)
      }
      .navigationTitle("Todos")
      .task {
        do {
          todos = try await supabase.from("todos").select().execute().value
        } catch {
          debugPrint(error)
        }
      }
    }
  }
}

#Preview {
  ContentView()
}

`}];return(0,t.jsx)(a.MultipleCodeBlock,{files:s})}])}]);