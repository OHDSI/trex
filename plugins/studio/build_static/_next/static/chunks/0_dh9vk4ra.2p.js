(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var a=e.i(478902),t=e.i(389959),s=e.i(500850),o=e.i(283606),l=e.i(314805),n=e.i(408279),r=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},p={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:c,onValueChange:d})=>{if(!e?.length)return null;let h=e[0]?.name??"",m=void 0!==c,[u,b]=(0,t.useState)(h),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,t.useEffect)(()=>{m||b(a=>e.some(e=>e.name===a)?a:h)},[h,e,m]),(0,a.jsxs)(s.Tabs_Shadcn_,{value:m?c:u,onValueChange:e=>{m||b(e),d?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,a.jsx)(l.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,a.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,a.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,a.jsx)(r.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,a)=>{if(e){let a=i[e.toLowerCase()];if(a)return a}return(e=>{let a=e.toLowerCase();if(a.startsWith(".env"))return"bash";let t=a.split(".").pop();if(t&&t!==a)return p[t]})(a)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},780795,e=>{"use strict";var a=e.i(478902),t=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:".env",language:"bash",code:`
SUPABASE_URL=${e.apiUrl??"your-project-url"}
SUPABASE_KEY=${e.publishableKey??e.anonKey??"your-anon-key"}
        `},{name:"app.py",language:"python",code:`
import os
from flask import Flask
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

supabase: Client = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_KEY")
)

@app.route('/')
def index():
    response = supabase.table('todos').select("*").execute()
    todos = response.data

    html = '<h1>Todos</h1><ul>'
    for todo in todos:
        html += f'<li>{todo["name"]}</li>'
    html += '</ul>'

    return html

if __name__ == '__main__':
    app.run(debug=True)
`}];return(0,a.jsx)(t.MultipleCodeBlock,{files:s})}])}]);