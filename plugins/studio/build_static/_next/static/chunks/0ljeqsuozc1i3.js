(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var n=e.i(478902),t=e.i(389959),o=e.i(500850),s=e.i(283606),a=e.i(314805),r=e.i(408279),i=e.i(331162);let l={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:d,onValueChange:p})=>{if(!e?.length)return null;let m=e[0]?.name??"",u=void 0!==d,[g,h]=(0,t.useState)(m),f=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,t.useEffect)(()=>{u||h(n=>e.some(e=>e.name===n)?n:m)},[m,e,u]),(0,n.jsxs)(o.Tabs_Shadcn_,{value:u?d:g,onValueChange:e=>{u||h(e),p?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,n.jsx)(a.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,n.jsx)(r.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),f.map(e=>(0,n.jsx)(s.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,n.jsx)(i.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,n)=>{if(e){let n=l[e.toLowerCase()];if(n)return n}return(e=>{let n=e.toLowerCase();if(n.startsWith(".env"))return"bash";let t=n.split(".").pop();if(t&&t!==n)return c[t]})(n)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},157179,604512,e=>{"use strict";var n=e.i(478902),t=e.i(370410),o=e.i(816467),s=e.i(389959),a=e.i(843778),r=e.i(375761);e.s(["ConnectionParameters",0,({parameters:e,onCopy:i})=>{let[l,c]=(0,s.useState)({});return(0,n.jsx)("div",{className:"bg-surface-75 rounded-lg border font-mono text-sm p-4",children:e.map(e=>(0,n.jsx)("div",{className:"py-0.5 group/param",children:(0,n.jsxs)("div",{className:"text-xs flex items-center",children:[(0,n.jsxs)("span",{className:"text-foreground-lighter",children:[e.key,":"]}),(0,n.jsx)("span",{className:"ml-1 text-foreground",children:e.value}),(0,n.jsx)("button",{onClick:()=>{(0,r.copyToClipboard)(e.value,()=>{c(n=>({...n,[e.key]:!0})),i?.(e.key),setTimeout(()=>{c(n=>({...n,[e.key]:!1}))},1e3)})},className:(0,a.cn)("text-foreground-lighter","ml-2 opacity-0 group-hover/param:opacity-100","hover:text-foreground rounded-xs p-1",l[e.key]&&"opacity-100","transition-all"),children:l[e.key]?(0,n.jsx)(t.Check,{size:12,strokeWidth:1.5}):(0,n.jsx)(o.Copy,{size:12,strokeWidth:1.5})})]})},e.key))})}],157179);let i="5432",l="[YOUR-PASSWORD]";e.s(["PASSWORD_PLACEHOLDER",0,l,"buildConnectionParameters",0,e=>[{key:"host",value:e.host},{key:"port",value:e.port},{key:"database",value:e.database},{key:"user",value:e.user}],"buildSafeConnectionString",0,(e,n)=>{if(!e)return"";let t=(()=>{try{return new URL(e).search}catch(e){return""}})();return`postgresql://${n.user}:${l}@${n.host}:${n.port}/${n.database}${t}`},"parseConnectionParams",0,e=>{if(!e)return{host:"hidden",port:i,user:"hidden",database:"hidden"};try{let n=new URL(e);return{host:n.hostname||"hidden",port:n.port||i,user:n.username||"hidden",database:n.pathname?.replace(/^\//,"")||"hidden"}}catch(e){return{host:"hidden",port:i,user:"hidden",database:"hidden"}}},"resolveConnectionString",0,({connectionMethod:e,useSharedPooler:n,connectionStringPooler:t})=>t?"direct"===e?t.direct??"":"session"===e?t.sessionShared??"":n||!t.transactionDedicated?t.transactionShared??"":t.transactionDedicated??"":""],604512)},980791,e=>{"use strict";var n=e.i(478902),t=e.i(389959),o=e.i(331162),s=e.i(486240),a=e.i(108151),r=e.i(157179),i=e.i(604512);e.s(["default",0,function({state:e,connectionStringPooler:l}){let c=e.connectionType??"uri",d=e.connectionMethod??"direct",p=!!e.useSharedPooler,m=(0,t.useMemo)(()=>(0,i.resolveConnectionString)({connectionMethod:d,useSharedPooler:p,connectionStringPooler:l}),[d,p,l]),u=(0,t.useMemo)(()=>(0,i.parseConnectionParams)(m),[m]),g=(0,t.useMemo)(()=>(0,i.buildSafeConnectionString)(m,u),[m,u]),h=(0,t.useMemo)(()=>{let e={name:".env",language:"bash",code:`DATABASE_URL=${g}`};switch(c){case"nodejs":return{files:[{name:"db.js",language:"js",code:`import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL
const sql = postgres(connectionString)

export default sql`},e],connectionStringFile:e.name};case"golang":return{files:[{name:"main.go",language:"go",code:`package main

import (
	"context"
	"log"
	"os"
	"github.com/jackc/pgx/v5"
)

func main() {
	conn, err := pgx.Connect(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Failed to connect to the database: %v", err)
	}
	defer conn.Close(context.Background())

	// Example query to test connection
	var version string
	if err := conn.QueryRow(context.Background(), "SELECT version()").Scan(&version); err != nil {
		log.Fatalf("Query failed: %v", err)
	}

	log.Println("Connected to:", version)
}`},e],connectionStringFile:e.name};case"dotnet":return{files:[{name:"appsettings.json",language:"json",code:`{
  "ConnectionStrings": {
    "DefaultConnection": "Host=${u.host};Database=${u.database};Username=${u.user};Password=${i.PASSWORD_PLACEHOLDER};SSL Mode=Require;Trust Server Certificate=true"
  }
}`}],connectionStringFile:"appsettings.json",postCommands:[{label:"Add the configuration package to read the settings.",command:"dotnet add package Microsoft.Extensions.Configuration.Json --version YOUR_DOTNET_VERSION"}]};case"python":return{files:[{name:"main.py",language:"python",code:`import psycopg2
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()

# Fetch variables
DATABASE_URL = os.getenv("DATABASE_URL")

# Connect to the database
connection = psycopg2.connect(DATABASE_URL)`},e],connectionStringFile:e.name};case"sqlalchemy":return{files:[{name:"main.py",language:"python",code:`from sqlalchemy import create_engine
# from sqlalchemy.pool import NullPool
from dotenv import load_dotenv
import os

# Load environment variables from .env
load_dotenv()

# Fetch variables
USER = os.getenv("user")
PASSWORD = os.getenv("password")
HOST = os.getenv("host")
PORT = os.getenv("port")
DBNAME = os.getenv("dbname")

# Construct the SQLAlchemy connection string
DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@{HOST}:{PORT}/{DBNAME}?sslmode=require"

# Create the SQLAlchemy engine
engine = create_engine(DATABASE_URL)
# If using Transaction Pooler or Session Pooler, we want to ensure we disable SQLAlchemy client side pooling -
# https://docs.sqlalchemy.org/en/20/core/pooling.html#switching-pool-implementations
# engine = create_engine(DATABASE_URL, poolclass=NullPool)

# Test the connection
try:
    with engine.connect() as connection:
        print("Connection successful!")
except Exception as e:
    print(f"Failed to connect: {e}")`},{name:".env",language:"bash",code:`user=${u.user}
password=${i.PASSWORD_PLACEHOLDER}
host=${u.host}
port=${u.port}
dbname=${u.database}`}],connectionStringFile:".env"};default:return null}},[c,g,u]),f=h?.files[0]?.name??"",[v,S]=(0,t.useState)(f);return((0,t.useEffect)(()=>{S(f)},[c,f]),m)?h?.files.length?(0,n.jsxs)("div",{className:"flex flex-col gap-3",children:[(0,n.jsx)(s.MultipleCodeBlock,{files:h.files,value:v,onValueChange:S}),(0,n.jsx)(r.ConnectionParameters,{parameters:(0,i.buildConnectionParameters)(u)}),(h.postCommands??[]).map(e=>(0,n.jsxs)("div",{className:"flex flex-col gap-2",children:[(0,n.jsx)("p",{className:"text-sm text-foreground-light",children:e.label}),(0,n.jsx)(o.CodeBlock,{className:"[&_code]:text-foreground",wrapperClassName:"lg:col-span-2",value:e.command,hideLineNumbers:!0,language:"bash",children:e.command})]},e.command))]}):null:(0,n.jsx)("div",{className:"p-4",children:(0,n.jsx)(a.GenericSkeletonLoader,{})})}])}]);