(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,321635,e=>{"use strict";var s=e.i(478902);e.i(128328);var t=e.i(158639),a=e.i(389959),n=e.i(108151),i=e.i(26898),r=e.i(890054),l=e.i(546024),o=e.i(837710),c=e.i(874311),d=e.i(666555),u=e.i(108892),p=e.i(2579);let h={name:"hide",key:"SUPABASE_KEY"},m=({selectedLang:e,selectedApiKey:n,setSelectedLang:m,setSelectedApiKey:g})=>{let{ref:j}=(0,t.useParams)(),{can:x}=(0,p.useAsyncCheckPermissions)(i.PermissionAction.SECRETS_READ,"*"),{data:b=[],isPending:y}=(0,u.useAPIKeysQuery)({projectRef:j,reveal:!1},{enabled:x}),f=(0,a.useMemo)(()=>b.filter(({type:e})=>"legacy"===e),[b]),w=(0,a.useMemo)(()=>b.filter(({type:e})=>"publishable"===e),[b]),v=(0,a.useMemo)(()=>b.filter(({type:e})=>"secret"===e),[b]);return(0,s.jsxs)("div",{className:"flex items-center gap-x-1",children:[(0,s.jsxs)(d.ToggleGroup,{type:"single",value:e,variant:"outline",onValueChange:e=>{e&&m(e)},size:"sm",className:"flex-1 flex",children:[(0,s.jsx)(d.ToggleGroupItem,{value:"js",className:"flex-1 px-2 py-1 h-7 text-xs",children:"JavaScript"}),(0,s.jsx)(d.ToggleGroupItem,{value:"bash",className:"flex-1 px-2 py-1 h-7 text-xs",children:"Bash"})]}),"bash"==e?x&&!y&&b&&b.length>0&&(0,s.jsxs)(c.DropdownMenu,{children:[(0,s.jsx)(c.DropdownMenuTrigger,{asChild:!0,children:(0,s.jsx)(o.Button,{type:"default",size:"tiny",className:"p-0 h-7 w-7",children:n.key===h.key?(0,s.jsx)(r.EyeOff,{size:12,strokeWidth:1.5}):(0,s.jsx)(l.Key,{size:12,strokeWidth:1.5})})}),(0,s.jsx)(c.DropdownMenuContent,{align:"end",side:"bottom",className:"w-48",children:(0,s.jsxs)(c.DropdownMenuRadioGroup,{value:n.key,children:[(0,s.jsx)(c.DropdownMenuRadioItem,{value:h.key,onClick:()=>g(h),children:"Hide keys"},"hide"),w.length>0&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsx)(c.DropdownMenuLabel,{children:"Publishable keys"}),w.map(e=>{let t=e.api_key;return(0,s.jsx)(c.DropdownMenuRadioItem,{value:t,onClick:()=>g({name:`Publishable key: ${e.name}`,key:t}),children:e.name},e.id)})]}),v.length>0&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsx)(c.DropdownMenuLabel,{children:"Secret keys"}),v.map(e=>{let t=e.prefix+"...";return(0,s.jsx)(c.DropdownMenuRadioItem,{value:t,onClick:()=>g({name:`Secret key: ${e.name}`,key:t}),children:e.name},e.id)})]}),f.length>0&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(c.DropdownMenuSeparator,{}),(0,s.jsxs)(c.DropdownMenuGroup,{children:[(0,s.jsx)(c.DropdownMenuLabel,{children:"JWT-based legacy keys"}),f.map(e=>{let t=e.api_key;return(0,s.jsx)(c.DropdownMenuRadioItem,{value:t,onClick:()=>g({name:`Legacy key: ${e.name}`,key:t}),children:e.name},e.id)})]})]})]})})]}):(0,s.jsx)("div",{className:"w-7 h-7"})]})};var g=e.i(111887),j=e.i(345594),x=e.i(843778);let b=({menu:e,activePage:t})=>(0,s.jsx)("nav",{className:"space-y-6 text-xs",children:e.map((e,a)=>(0,s.jsxs)("div",{children:[e.title&&(0,s.jsx)("div",{className:"heading-meta mb-2 text-foreground-lighter",children:e.title}),(0,s.jsx)("div",{className:"space-y-2",children:e.items.map(e=>{let a=e.pages?e.pages.includes(t??""):t===e.key,n=!!e.disabled,i=(0,s.jsxs)("span",{className:(0,x.cn)("flex items-center",a?"text-foreground":"text-foreground-light hover:text-foreground"),children:[(0,s.jsx)("span",{className:"truncate",children:e.name}),e.rightIcon&&(0,s.jsx)("span",{className:"ml-auto text-foreground-lighter",children:e.rightIcon})]});return n?(0,s.jsx)("span",{className:"block pointer-events-none opacity-50","aria-disabled":"true",tabIndex:-1,children:i},e.key):e.isExternal?(0,s.jsx)("a",{href:e.url,target:"_blank",rel:"noopener noreferrer",className:"block",children:i},e.key):(0,s.jsx)(j.default,{href:e.url,className:"block","aria-current":a?"page":void 0,children:i},e.key)})})]},e.key||e.title||a))});var y=e.i(799034),f=e.i(725137);let w=({activePage:e,menu:t,selectedLang:n,selectedApiKey:i,setSelectedLang:r,setSelectedApiKey:l})=>{let[c,d]=(0,a.useState)(!1);return(0,a.useEffect)(()=>{d(!1)},[e]),(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("div",{className:"sticky top-0 z-10 flex lg:hidden items-center border-b bg-surface-100 px-4 py-3",children:(0,s.jsx)(o.Button,{type:"default",icon:(0,s.jsx)(y.Menu,{size:16}),onClick:()=>d(!0),children:"Menu"})}),(0,s.jsx)(f.Sheet,{open:c,onOpenChange:d,children:(0,s.jsxs)(f.SheetContent,{side:"left",size:"content",className:"w-72 overflow-y-auto",children:[(0,s.jsx)(f.SheetHeader,{className:"border-b-0",children:(0,s.jsx)(f.SheetTitle,{children:"Data API Docs"})}),(0,s.jsxs)("div",{className:"flex flex-col gap-y-6 px-5 pb-6",children:[(0,s.jsx)(m,{selectedLang:n,selectedApiKey:i,setSelectedLang:r,setSelectedApiKey:l}),(0,s.jsx)(b,{activePage:e,menu:t})]})]})})]})},v=({title:e,id:t,content:a,snippets:n,className:i})=>(0,s.jsxs)("div",{className:(0,x.cn)("grid grid-cols-1 lg:grid-cols-2 border-b",i),id:t,children:[(0,s.jsxs)("article",{className:"text-foreground-light prose prose-sm p-6 lg:py-10 lg:pr-10 lg:pl-0 flex-1",children:[e&&(0,s.jsx)("h2",{className:"heading-subTitle mb-4",children:e}),a]}),(0,s.jsx)("article",{className:(0,x.cn)("bg flex-1 lg:border-l space-y-6 px-6 pb-6 lg:py-10"),children:n})]});var S=e.i(211290),k=e.i(162082),$=e.i(265735);let A=({selectedLang:e,snippet:a})=>{let{ref:n}=(0,t.useParams)(),{data:i}=(0,$.useSelectedOrganizationQuery)(),{mutate:r}=(0,k.useSendEventMutation)();return a[e]?(0,s.jsxs)("div",{children:[(0,s.jsx)("h4",{className:"heading-default mb-2",children:a.title}),(0,s.jsx)("div",{className:"[&_.codeBlock]:p-0 [&_.token-line]:text-sm",children:(0,s.jsx)(S.SimpleCodeBlock,{className:a[e]?.language,onCopy:()=>{r({action:"api_docs_code_copy_button_clicked",properties:{title:a.title,selectedLanguage:e},groups:{project:n??"Unknown",organization:i?.slug??"Unknown"}})},children:a[e]?.code})})]}):null},L=(e,s,t)=>({title:`${e}`,bash:{language:"bash",code:`${t}`},js:{language:"js",code:`const ${s} = '${t}'`}}),P=(e,s,{keyName:t,showBearer:a=!0})=>({title:"Example usage",bash:{language:"bash",code:`
curl '${s}/rest/v1/' \\
-H "apikey: ${e}" ${a?`\\
-H "Authorization: Bearer ${e}"`:""}
`},js:{language:"js",code:`
const SUPABASE_URL = "${s}"
const supabase = createClient(SUPABASE_URL, process.env.${t||"SUPABASE_KEY"});
`}}),E=({title:e="Read specific columns",resourceId:s,endpoint:t,apiKey:a,columnName:n="some_column,other_column"})=>({title:e,bash:{language:"bash",code:`
curl '${t}/rest/v1/${s}?select=${n}' \\
-H "apikey: ${a}" \\
-H "Authorization: Bearer ${a}"
`},js:{language:"js",code:`
let { data: ${s}, error } = await supabase
  .from('${s}')
  .select('${n}')
`}});var _=e.i(937942),T=e.i(377451);let C=({selectedLang:e,showApiKey:a})=>{let{ref:n}=(0,t.useParams)(),{can:r}=(0,p.useAsyncCheckPermissions)(i.PermissionAction.SECRETS_READ,"*"),{data:l}=(0,u.useAPIKeysQuery)({projectRef:n},{enabled:r}),{data:o}=(0,T.useProjectSettingsV2Query)({projectRef:n}),{anonKey:c,serviceKey:d}=(0,u.getKeys)(l),h=o?.app_config?.protocol??"https",m=o?.app_config?.endpoint,g=`${h}://${m??""}`,j="SUPABASE_KEY"!==a?c?.api_key??"SUPABASE_CLIENT_API_KEY":"SUPABASE_CLIENT_API_KEY",x="SUPABASE_KEY"!==a?d?.api_key??"SUPABASE_SERVICE_KEY":"SUPABASE_SERVICE_KEY";return(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:"Authentication",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Supabase works through a mixture of JWT and Key auth."}),(0,s.jsxs)("p",{children:["If no ",(0,s.jsx)("code",{children:"Authorization"})," header is included, the API will assume that you are making a request with an anonymous user."]}),(0,s.jsxs)("p",{children:["If an ",(0,s.jsx)("code",{children:"Authorization"}),' header is included, the API will "switch" to the role of the user making the request. See the User Management section for more details.']}),(0,s.jsx)("p",{children:"We recommend setting your keys as Environment Variables."})]})}),(0,s.jsx)(v,{title:"Client API Keys",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:'Client keys allow "anonymous access" to your database, until the user has logged in. After logging in the keys will switch to the user\'s own login token.'}),(0,s.jsxs)("p",{children:["In this documentation, we will refer to the key using the name"," ",(0,s.jsx)("code",{children:"SUPABASE_KEY"}),"."]}),(0,s.jsxs)("p",{children:["We have provided you a Client Key to get started. You will soon be able to add as many keys as you like. You can find the ",(0,s.jsx)("code",{children:"anon"})," key in the"," ",(0,s.jsx)(_.InlineLink,{href:`/project/${n}/settings/api-keys`,children:"API Keys Settings"})," ","page."]})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:e,snippet:L("CLIENT API KEY","SUPABASE_KEY",j)}),(0,s.jsx)(A,{selectedLang:e,snippet:P(j,g,{showBearer:!1})})]})}),(0,s.jsx)(v,{title:"Service Keys",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Service keys have FULL access to your data, bypassing any security policies. Be VERY careful where you expose these keys. They should only be used on a server and never on a client or browser."}),(0,s.jsxs)("p",{children:["In this documentation, we will refer to the key using the name"," ",(0,s.jsx)("code",{children:"SERVICE_KEY"}),"."]}),(0,s.jsxs)("p",{children:["We have provided you with a Service Key to get started. Soon you will be able to add as many keys as you like. You can find the ",(0,s.jsx)("code",{children:"service_role"})," in the"," ",(0,s.jsx)(_.InlineLink,{href:`/project/${n}/settings/api-keys`,children:"API Keys Settings"})," ","page."]})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:e,snippet:L("SERVICE KEY","SERVICE_KEY",x)}),(0,s.jsx)(A,{selectedLang:e,snippet:P(x,g,{keyName:"SERVICE_KEY"})})]})})]})};var N=e.i(710483);let I=()=>{let{ref:e}=(0,t.useParams)();return(0,s.jsxs)(N.Admonition,{type:"default",children:[(0,s.jsx)("p",{className:"mt-0! mb-1.5!",children:"The public schema for this project is not exposed"}),(0,s.jsx)("p",{className:"mt-0! mb-1.5! text-foreground-light",children:"You will not be able to query tables and views in the public schema via supabase-js or HTTP clients. Configure this behavior in your project's Data API settings."}),(0,s.jsx)(o.Button,{asChild:!0,type:"default",className:"mt-1",children:(0,s.jsx)(j.default,{href:`/project/${e}/settings/api#postgrest-config`,className:"no-underline!",children:"View API settings"})})]})};var U=e.i(462142);function H({selectedLang:e}){let a,{ref:n}=(0,t.useParams)(),{data:i}=(0,T.useProjectSettingsV2Query)({projectRef:n}),{data:r,isSuccess:l}=(0,U.useProjectPostgrestConfigQuery)({projectRef:n}),o=i?.app_config?.protocol??"https",c=i?.app_config?.endpoint,d=`${o}://${c??""}`,u=r?.db_schema.split(",").map(e=>e.trim()).includes("public");return(0,s.jsx)(v,{title:"Connect to your project",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:["All projects have a RESTful endpoint that you can use with your project's API key to query and manage your database. These can be obtained from the"," ",(0,s.jsx)(_.InlineLink,{href:`/project/${n}/integrations/data_api/overview`,children:"API settings"}),"."]}),(0,s.jsxs)("p",{children:["You can initialize a new Supabase client using the ",(0,s.jsx)("code",{children:"createClient()"})," method. The Supabase client is your entrypoint to the rest of the Supabase functionality and is the easiest way to interact with everything we offer within the Supabase ecosystem."]})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:e,snippet:(a=d,{title:"Initializing",bash:{language:"bash",code:"# No client library required for Bash."},js:{language:"js",code:`
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = '${a}'
const supabaseKey = process.env.SUPABASE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)`},python:{language:"python",code:`
import os
from supabase import create_client, Client
url: str = '${a}'
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)
`},dart:{language:"dart",code:`
const supabaseUrl = '${a}';
const supabaseKey = String.fromEnvironment('SUPABASE_KEY');
Future<void> main() async {
  await Supabase.initialize(url: supabaseUrl, anonKey: supabaseKey);
  runApp(MyApp());
}`}})}),l&&!u&&(0,s.jsx)(I,{})]})})}let R=()=>(0,s.jsx)(v,{title:"Introduction",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"All of your database functions are available on your API. This means you can build your logic directly into the database (if you're brave enough)!"}),(0,s.jsx)("p",{children:"The API endpoint supports POST (and in some cases GET) to execute the function."})]})});var O=e.i(786741),K=e.i(355901),B=e.i(513826),D=e.i(74227),F=e.i(10429);function q({selectedLang:e}){let{ref:n}=(0,t.useParams)(),[i,r]=(0,a.useState)(!1),{data:l}=(0,U.useProjectPostgrestConfigQuery)({projectRef:n}),c=async()=>{try{r(!0);let e=await (0,D.generateTypes)({ref:n,included_schemas:l?.db_schema}),s=document.createElement("a");s.setAttribute("href","data:text/plain;charset=utf-8,"+encodeURIComponent(e.types)),s.setAttribute("download","supabase.ts"),s.style.display="none",document.body.appendChild(s),s.click(),document.body.removeChild(s),K.toast.success("Successfully generated types! File is being downloaded")}catch(e){K.toast.error(`Failed to generate types: ${e.message}`)}finally{r(!1)}};return(0,s.jsx)(v,{title:(0,s.jsxs)("span",{className:"flex items-center justify-between",children:[(0,s.jsx)("span",{children:"Generating types"}),(0,s.jsx)(B.DocsButton,{href:`${F.DOCS_URL}/guides/database/api/generating-types`})]}),content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Supabase APIs are generated from your database, which means that we can use database introspection to generate type-safe API definitions."}),(0,s.jsxs)("p",{children:["You can generate types from your database either through the"," ",(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/guides/database/api/generating-types`,children:"Supabase CLI"}),", or by downloading the types file via the button on the right and importing it in your application within ",(0,s.jsx)("code",{children:"src/index.ts"}),"."]})]}),snippets:(0,s.jsxs)("div",{className:"js"===e?"flex flex-col items-center justify-center h-full":"",children:[(0,s.jsxs)("div",{className:"flex flex-col items-center justify-center p-10",children:["js"===e&&(0,s.jsx)(o.Button,{type:"default",disabled:i,loading:i,icon:(0,s.jsx)(O.Download,{strokeWidth:1.5}),onClick:c,children:"Generate and download types"}),(0,s.jsx)("p",{className:"text-xs text-center text-foreground-light mt-4",children:"Remember to re-generate and download this file as you make changes to your tables."})]}),(0,s.jsx)(A,{selectedLang:e,snippet:V.cliLogin()}),(0,s.jsx)(A,{selectedLang:e,snippet:V.generateTypes(n??"")})]})})}let V={cliLogin:()=>({title:"Login via the CLI with your Personal Access Token",bash:{code:`
npx supabase login
`}}),generateTypes:e=>({title:"Generate types",bash:{code:`
npx supabase gen types typescript --project-id "${e}" --schema public > types/supabase.ts
`}})},z=()=>({title:"With Apollo GraphQL",bash:{language:"js",code:`
const { loading, error, data } = useQuery(gql\`
  query GetDogs {
    dogs {
      id
      breed
      owner {
        id
        name
      }
    }
  }
\`)`},js:{language:"js",code:`
const { loading, error, data } = useQuery(gql\`
  query GetDogs {
    dogs {
      id
      breed
      owner {
        id
        name
      }
    }
  }
\`)`}}),Y=()=>({title:"With Supabase",bash:{language:"js",code:`
const { data, error } = await supabase
  .from('dogs')
  .select(\`
      id, breed,
      owner (id, name)
  \`)
`},js:{language:"js",code:`
const { data, error } = await supabase
  .from('dogs')
  .select(\`
      id, breed,
      owner (id, name)
  \`)
`}}),M=({selectedLang:e})=>{let{ref:a}=(0,t.useParams)(),{data:n,isSuccess:i}=(0,U.useProjectPostgrestConfigQuery)({projectRef:a}),r=n?.db_schema.split(",").map(e=>e.trim()).includes("public");return(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:"Introduction",content:(0,s.jsxs)("p",{children:["All views and tables in the ",(0,s.jsx)("code",{children:"public"})," schema and accessible by the active database role for a request are available for querying."]}),snippets:i&&!r&&(0,s.jsx)(I,{})}),(0,s.jsx)(v,{title:"Non-exposed tables",content:(0,s.jsxs)("p",{children:["If you don't want to expose tables in your API, simply add them to a different schema (not the ",(0,s.jsx)("code",{children:"public"})," schema)."]})}),(0,s.jsx)(q,{selectedLang:e}),(0,s.jsx)(v,{title:(0,s.jsxs)(s.Fragment,{children:["GraphQL ",(0,s.jsx)("span",{className:"lowercase font-normal",children:"vs"})," Supabase"]}),content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"If you have a GraphQL background, you might be wondering if you can fetch your data in a single round-trip. The answer is yes!"}),(0,s.jsx)("p",{children:"The syntax is very similar. This example shows how you might achieve the same thing with Apollo GraphQL and Supabase."}),(0,s.jsx)("h4",{className:"text-foreground-light mt-8 font-medium",children:"Still want GraphQL?"}),(0,s.jsxs)("p",{children:["If you still want to use GraphQL, you can. Supabase provides you with a full Postgres database, so as long as your middleware can connect to the database then you can still use the tools you love. You can find the database connection details"," ",(0,s.jsx)(_.InlineLink,{href:`/project/${a}/database/settings`,children:"in the settings."})]})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:e,snippet:z()}),(0,s.jsx)(A,{selectedLang:e,snippet:Y()})]})})]})};var G=e.i(912793),Q=e.i(48189);let W=(0,Q.makeRandomString)(20),X=({selectedLang:e,showApiKey:a})=>{let n,i,r,l,o,c,d,u,p,h,m,g,j,x,b,y,f,w,S,k,$,L,P,E,C,N,{ref:I}=(0,t.useParams)(),U=a||"SUPABASE_KEY",{authenticationSignInProviders:H}=(0,G.useIsFeatureEnabled)(["authentication:sign_in_providers"]),{data:R}=(0,T.useProjectSettingsV2Query)({projectRef:I}),O=R?.app_config?.protocol??"https",K=R?.app_config?.endpoint??"",B=`${O}://${K??""}`;return(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:"User Management",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Supabase makes it easy to manage your users."}),(0,s.jsxs)("p",{children:["Supabase assigns each user a unique ID. You can reference this ID anywhere in your database. For example, you might create a ",(0,s.jsx)("code",{children:"profiles"})," table that references the user using a ",(0,s.jsx)("code",{children:"user_id"})," field."]}),(0,s.jsx)("p",{children:"Supabase already has built in the routes to sign up, login, and log out for managing users in your apps and websites."})]})}),(0,s.jsx)(v,{title:"Sign up",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Allow your users to sign up and create a new account."}),(0,s.jsx)("p",{children:'After they have signed up, all interactions using the Supabase JS client will be performed as "that user".'})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(n=B,i=U,r=W,{title:"User signup",bash:{language:"bash",code:`
curl -X POST '${n}/auth/v1/signup' \\
-H "apikey: ${i}" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com",
  "password": "${r}"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signUp({
  email: 'someone@email.com',
  password: '${r}'
})
`}})})}),(0,s.jsx)(v,{title:"Log in with Email/Password",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"If an account is created, users can login to your app."}),(0,s.jsx)("p",{children:'After they have logged in, all interactions using the Supabase JS client will be performed as "that user".'})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(l=B,o=U,c=W,{title:"User login",bash:{language:"bash",code:`
curl -X POST '${l}/auth/v1/token?grant_type=password' \\
-H "apikey: ${o}" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com",
  "password": "${c}"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signInWithPassword({
  email: 'someone@email.com',
  password: '${c}'
})
`}})})}),(0,s.jsx)(v,{title:"Log in with Magic Link via Email",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Send a user a passwordless link which they can use to redeem an access_token."}),(0,s.jsx)("p",{children:'After they have clicked the link, all interactions using the Supabase JS client will be performed as "that user".'})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(d=B,u=U,{title:"User login",bash:{language:"bash",code:`
curl -X POST '${d}/auth/v1/magiclink' \\
-H "apikey: ${u}" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signInWithOtp({
  email: 'someone@email.com'
})
`}})})}),(0,s.jsx)(v,{title:"Sign Up with Phone/Password",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"A phone number can be used instead of an email as a primary account confirmation mechanism."}),(0,s.jsx)("p",{children:"The user will receive a mobile OTP via sms with which they can verify that they control the phone number."}),(0,s.jsx)("p",{children:"You must enter your own twilio credentials on the auth settings page to enable sms confirmations."})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(p=B,h=U,{title:"Phone Signup",bash:{language:"bash",code:`
curl -X POST '${p}/auth/v1/signup' \\
-H "apikey: ${h}" \\
-H "Content-Type: application/json" \\
-d '{
  "phone": "+13334445555",
  "password": "some-password"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signUp({
  phone: '+13334445555',
  password: 'some-password'
})
`}})})}),(0,s.jsx)(v,{title:"Login via SMS OTP",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"SMS OTPs work like magic links, except you have to provide an interface for the user to verify the 6 digit number they receive."}),(0,s.jsx)("p",{children:"You must enter your own twilio credentials on the auth settings page to enable SMS-based Logins."})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(m=B,g=U,{title:"Phone Login",bash:{language:"bash",code:`
curl -X POST '${m}/auth/v1/otp' \\
-H "apikey: ${g}" \\
-H "Content-Type: application/json" \\
-d '{
  "phone": "+13334445555"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signInWithOtp({
  phone: '+13334445555'
})
`}})})}),(0,s.jsx)(v,{title:"Verify an SMS OTP",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Once the user has received the OTP, have them enter it in a form and send it for verification"}),(0,s.jsx)("p",{children:"You must enter your own twilio credentials on the auth settings page to enable SMS-based OTP verification."})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(j=B,x=U,{title:"Verify Pin",bash:{language:"bash",code:`
curl -X POST '${j}/auth/v1/verify' \\
-H "apikey: ${x}" \\
-H "Content-Type: application/json" \\
-d '{
  "type": "sms",
  "phone": "+13334445555",
  "token": "123456"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.verifyOtp({
  phone: '+13334445555',
  token: '123456',
  type: 'sms'
})
`}})})}),H&&(0,s.jsx)(v,{title:"Log in with Third Party OAuth",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:["Users can log in with Third Party OAuth like Google, Facebook, GitHub, and more. You must first enable each of these in the Auth Providers settings"," ",(0,s.jsx)("span",{className:"text-green-500",children:(0,s.jsx)(_.InlineLink,{href:`/project/${I}/auth/providers`,children:"here"},"AUTH")})," ","."]}),(0,s.jsxs)("p",{children:["View all the available"," ",(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/guides/auth#providers`,children:"Third Party OAuth providers"})]}),(0,s.jsx)("p",{children:'After they have logged in, all interactions using the Supabase JS client will be performed as "that user".'}),(0,s.jsxs)("p",{children:["Generate your Client ID and secret from:"," ",(0,s.jsx)(_.InlineLink,{href:"https://console.developers.google.com/apis/credentials",children:"Google"}),","," ",(0,s.jsx)(_.InlineLink,{href:"https://github.com/settings/applications/new",children:"GitHub"}),","," ",(0,s.jsx)(_.InlineLink,{href:"https://gitlab.com/oauth/applications",children:"GitLab"}),","," ",(0,s.jsx)(_.InlineLink,{href:"https://developers.facebook.com/apps/",children:"Facebook"}),","," ",(0,s.jsx)(_.InlineLink,{href:"https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/",children:"Bitbucket"}),"."]})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(b=B,y=U,{title:"Third Party Login",bash:{language:"bash",code:`
curl -X GET '${b}/auth/v1/authorize?provider=github' \\
-H "apikey: ${y}" \\
-H "Authorization: Bearer USER_TOKEN" \\
-H "Content-Type: application/json"
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github'
})
`}})})}),(0,s.jsx)(v,{title:"User",content:(0,s.jsx)("p",{children:"Get the JSON object for the logged in user."}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(f=B,w=U,{title:"Get User",bash:{language:"bash",code:`
curl -X GET '${f}/auth/v1/user' \\
-H "apikey: ${w}" \\
-H "Authorization: Bearer USER_TOKEN"
`},js:{language:"js",code:`
const { data: { user } } = await supabase.auth.getUser()
`}})})}),(0,s.jsx)(v,{title:"Forgotten Password Email",content:(0,s.jsx)("p",{children:'Sends the user a log in link via email. Once logged in you should direct the user to a new password form. And use "Update User" below to save the new password.'}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(S=B,k=U,{title:"Password Recovery",bash:{language:"bash",code:`
      curl -X POST '${S}/auth/v1/recover' \\
-H "apikey: ${k}" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.resetPasswordForEmail(email)
`}})})}),(0,s.jsx)(v,{title:"Update User",content:(0,s.jsx)("p",{children:"Update the user with a new email or password. Each key (email, password, and data) is optional"}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:($=B,L=U,{title:"Update User",bash:{language:"bash",code:`
      curl -X PUT '${$}/auth/v1/user' \\
-H "apikey: ${L}" \\
-H "Authorization: Bearer USER_TOKEN" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com",
  "password": "new-password",
  "data": {
    "key": "value"
  }
}'
`},js:{language:"js",code:`
const { data, error } = await supabase.auth.updateUser({
  email: "new@email.com",
  password: "new-password",
  data: { hello: 'world' }
})
`}})})}),(0,s.jsx)(v,{title:"Log out",content:(0,s.jsx)("p",{children:'After calling log out, all interactions using the Supabase JS client will be "anonymous".'}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(P=B,E=U,{title:"User logout",bash:{language:"bash",code:`
curl -X POST '${P}/auth/v1/logout' \\
-H "apikey: ${E}" \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer USER_TOKEN"
`},js:{language:"js",code:`
let { error } = await supabase.auth.signOut()
`}})})}),(0,s.jsx)(v,{title:"Send a User an Invite over Email",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Send a user a passwordless link which they can use to sign up and log in."}),(0,s.jsx)("p",{children:'After they have clicked the link, all interactions using the Supabase JS client will be performed as "that user".'}),(0,s.jsxs)("p",{children:["This endpoint requires you use the ",(0,s.jsx)("code",{children:"service_role_key"})," when initializing the client, and should only be invoked from the server, never from the client."]})]}),snippets:(0,s.jsx)(A,{selectedLang:e,snippet:(C=B,N=U,{title:"Invite User",bash:{language:"bash",code:`
curl -X POST '${C}/auth/v1/invite' \\
-H "apikey: ${N}" \\
-H "Authorization: Bearer SERVICE_ROLE_KEY" \\
-H "Content-Type: application/json" \\
-d '{
  "email": "someone@email.com"
}'
`},js:{language:"js",code:`
let { data, error } = await supabase.auth.admin.inviteUserByEmail('someone@email.com')
`}})})})]})},J=({selectedLang:e,page:t,showApiKey:a})=>{let n=t?.toLowerCase();return"intro"==n||null==n?(0,s.jsx)(H,{selectedLang:e}):"auth"==n?(0,s.jsx)(C,{selectedLang:e,showApiKey:a}):"users-management"==n?(0,s.jsx)(X,{selectedLang:e,showApiKey:a}):"tables-intro"==n?(0,s.jsx)(M,{selectedLang:e}):"rpc-intro"==n?(0,s.jsx)(R,{}):(0,s.jsx)(v,{title:"Not found",content:(0,s.jsx)("p",{children:"Looks like you went somewhere that nobody knows."})})};var Z=e.i(219195),ee=e.i(479084),es=e.i(802715),et=e.i(585915),ea=e.i(208089),en=e.i(714403),ei=e.i(635494);let er=({content:e,metadata:t,onChange:n=es.default})=>{var r;let l,c,d,u,h,m=(l=`Note:
This is a Primary Key.<pk/>`,c=`Note:
This is a Foreign Key to`,d=(r=e||"").lastIndexOf(l),u=r.lastIndexOf(c),h=r,d>=0&&(h=h.substring(0,d)),u>=0&&(h=h.substring(0,u)),h).trim(),[g,j]=(0,a.useState)(m),[x,b]=(0,a.useState)(!1),{data:y}=(0,ei.useSelectedProjectQuery)(),{table:f,column:w,rpc:v}=t,S=g!=m,{can:k}=(0,p.useAsyncCheckPermissions)(i.PermissionAction.TENANT_SQL_QUERY,"*"),$=async()=>{let e;if(x||!k)return!1;if(b(!0),f&&w&&(e=ee.safeSql`comment on column ${(0,ee.ident)("public")}.${(0,ee.ident)(f)}.${(0,ee.ident)(w)} is ${(0,ee.literal)(g)};`),f&&!w&&(e=ee.safeSql`comment on table ${(0,ee.ident)("public")}.${(0,ee.ident)(f)} is ${(0,ee.literal)(g)};`),v&&(e=ee.safeSql`comment on function ${(0,ee.ident)(v)} is ${(0,ee.literal)(g)};`),e)try{await (0,en.executeSql)({projectRef:y?.ref,connectionString:y?.connectionString,sql:e}),await (0,Q.timeout)(500),K.toast.success("Successfully updated description")}catch(e){K.toast.error(`Failed to update description: ${e.message}`)}n(g),b(!1)};return k?(0,s.jsxs)("div",{className:"space-y-2 px-0.5",children:[(0,s.jsx)(ea.ExpandingTextArea,{className:"w-full min-h-auto",placeholder:"Click to edit.",value:g,onChange:e=>j(e.target.value)}),(0,s.jsxs)("div",{className:`flex items-center gap-2 ${S?"opacity-100":"h-0 cursor-default opacity-0"} transition duration-150`,children:[(0,s.jsx)(o.Button,{type:"default",disabled:!S,onClick:()=>{j(m),b(!1)},children:"Cancel"}),(0,s.jsx)(o.Button,{disabled:!S,onClick:$,children:x?(0,s.jsx)(et.Loader,{className:"mx-auto animate-spin",size:14,strokeWidth:2}):(0,s.jsx)("span",{children:"Save"})})]})]}):(0,s.jsx)("span",{className:`block text-sm ${g?"text-foreground":""}`,children:g||"No description"})};var el=es,eo=e.i(587433);let ec=({name:e,type:t,format:a,required:n,description:i,metadata:r={},onDesciptionUpdated:l=el.default})=>(0,s.jsxs)("div",{className:"not-prose",children:[(0,s.jsxs)("div",{className:"mb-4 flex items-center gap-4",children:[(0,s.jsx)("h3",{className:"heading-default text-foreground mb-0 mt-0",children:e}),(0,s.jsx)(eo.Badge,{variant:n?"warning":"default",children:n?"Required":"Optional"})]}),a&&(0,s.jsxs)("div",{className:"grid grid-cols-[auto_1fr] gap-y-2 gap-x-10 text-sm",children:[(0,s.jsx)("label",{className:"text-foreground-lighter",children:"Type"}),(0,s.jsx)("div",{className:"text-foreground",children:function(e,s){if(void 0===e&&("jsonb"===s||"json"===s))return"json";switch(e){case"string":return"string";case"integer":case"number":return"number";case"json":return"json";case"boolean":return"boolean";default:return""}}(t,a)}),(0,s.jsx)("label",{className:"text-foreground-lighter",children:"Format"}),(0,s.jsx)("div",{className:"text-foreground",children:a}),!1!==i&&(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("label",{className:"text-foreground-lighter",children:"Description"}),(0,s.jsx)("div",{className:"text-foreground pt-1",children:(0,s.jsx)(er,{content:i?.toString(),metadata:r,onChange:l})})]})]})]});var ed=e.i(480683),eu=e.i(984278);let ep=({resourceId:e,resources:a,selectedLang:n,showApiKey:i,refreshDocs:r})=>{let l,o,c,d,u,p,h,m,g,j,x,b,y,f,w,S,k,$,L,P,T,C,N,I,U,H,R,O,K,B,D,q,V,z,Y,M,Q,{ref:W}=(0,t.useParams)(),{realtimeAll:X}=(0,G.useIsFeatureEnabled)(["realtime:all"]),{data:J}=(0,eu.useProjectJsonSchemaQuery)({projectRef:W}),{paths:ee,definitions:es}=J||{},{data:et=""}=(0,ed.useProjectApiUrl)({projectRef:W}),ea=i||"SUPABASE_KEY",en=ee?.[`/${e}`],ei=es?.[e],el=a[e],eo=ei?.description||"",ep=Object.keys(en??{}).map(e=>e.toUpperCase()),eh=Object.entries(ei?.properties??[]).map(([e,s])=>({...s,id:e,required:ei?.required?.includes(e)}));return ee&&es?(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:(0,s.jsxs)("span",{className:"flex items-center gap-2 text-subTitle",children:[(0,s.jsx)(Z.Table2,{size:16,strokeWidth:1.5}),e]}),content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("label",{className:"font-mono text-xs uppercase text-foreground-lighter inline-block mb-2",children:"Description"}),(0,s.jsx)(er,{content:eo,metadata:{table:e},onChange:r})]})}),eh.length>0&&(0,s.jsx)("div",{className:"flex flex-col flex-1",children:eh.map(t=>(0,s.jsx)(v,{title:null,content:(0,s.jsx)(ec,{name:t.id,type:t.type,format:t.format,required:t.required,description:t.description,metadata:{table:e,column:t.id},onDesciptionUpdated:r},t.id),snippets:(0,s.jsx)(A,{selectedLang:n,snippet:E({title:`Select ${t.id}`,resourceId:e,endpoint:et,apiKey:ea,columnName:t.id})})},t.id))}),ep.includes("GET")&&(0,s.jsx)(v,{title:"Read rows",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:["To read rows in ",(0,s.jsx)("code",{children:e}),", use the ",(0,s.jsx)("code",{children:"select"})," method."]}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/select`,children:"Learn more"})}),(0,s.jsx)("h4",{className:"text-default",children:"Filtering"}),(0,s.jsx)("p",{children:"Supabase provides a wide range of filters."}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/using-filters`,children:"Learn more"})})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:n,snippet:(l=e,o=et,c=ea,{title:"Read all rows",bash:{language:"bash",code:`
curl '${o}/rest/v1/${l}?select=*' \\
-H "apikey: ${c}" \\
-H "Authorization: Bearer ${c}"
`},js:{language:"js",code:`
let { data: ${l}, error } = await supabase
  .from('${l}')
  .select('*')
`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:E({resourceId:e,endpoint:et,apiKey:ea})}),(0,s.jsx)(A,{selectedLang:n,snippet:(d=e,u=et,p=ea,{title:"Read referenced tables",bash:{language:"bash",code:`
curl '${u}/rest/v1/${d}?select=some_column,other_table(foreign_key)' \\
-H "apikey: ${p}" \\
-H "Authorization: Bearer ${p}"
`},js:{language:"js",code:`
let { data: ${d}, error } = await supabase
  .from('${d}')
  .select(\`
    some_column,
    other_table (
      foreign_key
    )
  \`)
`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(h=e,m=et,g=ea,{title:"With pagination",bash:{language:"bash",code:`
curl '${m}/rest/v1/${h}?select=*' \\
-H "apikey: ${g}" \\
-H "Authorization: Bearer ${g}" \\
-H "Range: 0-9"
`},js:{language:"js",code:`
let { data: ${h}, error } = await supabase
  .from('${h}')
  .select('*')
  .range(0, 9)
`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(j=e,x=et,b=ea,{title:"With filtering",bash:{language:"bash",code:`
curl --get '${x}/rest/v1/${j}' \\
-H "apikey: ${b}" \\
-H "Authorization: Bearer ${b}" \\
-H "Range: 0-9" \\
-d "select=*" \\
\\
\`# Filters\` \\
-d "column=eq.Equal+to" \\
-d "column=gt.Greater+than" \\
-d "column=lt.Less+than" \\
-d "column=gte.Greater+than+or+equal+to" \\
-d "column=lte.Less+than+or+equal+to" \\
-d "column=like.*CaseSensitive*" \\
-d "column=ilike.*CaseInsensitive*" \\
-d "column=is.null" \\
-d "column=in.(Array,Values)" \\
-d "column=neq.Not+equal+to" \\
\\
\`# Arrays\` \\
-d "array_column=cs.{array,contains}" \\
-d "array_column=cd.{contained,by}" \\
\\
\`# Logical operators\` \\
-d "column=not.like.Negate+filter" \\
-d "or=(some_column.eq.Some+value,other_column.eq.Other+value)"
`},js:{language:"js",code:`
let { data: ${j}, error } = await supabase
  .from('${j}')
  .select("*")

  // Filters
  .eq('column', 'Equal to')
  .gt('column', 'Greater than')
  .lt('column', 'Less than')
  .gte('column', 'Greater than or equal to')
  .lte('column', 'Less than or equal to')
  .like('column', '%CaseSensitive%')
  .ilike('column', '%CaseInsensitive%')
  .is('column', null)
  .in('column', ['Array', 'Values'])
  .neq('column', 'Not equal to')

  // Arrays
  .contains('array_column', ['array', 'contains'])
  .containedBy('array_column', ['contained', 'by'])

  // Logical operators
  .not('column', 'like', 'Negate filter')
  .or('some_column.eq.Some value, other_column.eq.Other value')
`}})})]})}),ep.includes("POST")&&(0,s.jsx)(v,{title:"Insert rows",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:[(0,s.jsx)("code",{children:"insert"})," lets you insert into your tables. You can also insert in bulk and do UPSERT."]}),(0,s.jsxs)("p",{children:[(0,s.jsx)("code",{children:"insert"})," will also return the replaced values for UPSERT."]}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/insert`,children:"Learn more"})})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:n,snippet:(y=e,f=et,w=ea,{title:"Insert a row",bash:{language:"bash",code:`
curl -X POST '${f}/rest/v1/${y}' \\
-H "apikey: ${w}" \\
-H "Authorization: Bearer ${w}" \\
-H "Content-Type: application/json" \\
-H "Prefer: return=minimal" \\
-d '{ "some_column": "someValue", "other_column": "otherValue" }'
`},js:{language:"js",code:`
const { data, error } = await supabase
  .from('${y}')
  .insert([
    { some_column: 'someValue', other_column: 'otherValue' },
  ])
  .select()
`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(S=e,k=et,$=ea,{title:"Insert many rows",bash:{language:"bash",code:`
curl -X POST '${k}/rest/v1/${S}' \\
-H "apikey: ${$}" \\
-H "Authorization: Bearer ${$}" \\
-H "Content-Type: application/json" \\
-d '[{ "some_column": "someValue" }, { "other_column": "otherValue" }]'
`},js:{language:"js",code:`
const { data, error } = await supabase
  .from('${S}')
  .insert([
    { some_column: 'someValue' },
    { some_column: 'otherValue' },
  ])
  .select()
`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(L=e,P=et,T=ea,{title:"Upsert matching rows",bash:{language:"bash",code:`
curl -X POST '${P}/rest/v1/${L}' \\
-H "apikey: ${T}" \\
-H "Authorization: Bearer ${T}" \\
-H "Content-Type: application/json" \\
-H "Prefer: resolution=merge-duplicates" \\
-d '{ "some_column": "someValue", "other_column": "otherValue" }'
`},js:{language:"js",code:`
const { data, error } = await supabase
  .from('${L}')
  .upsert({ some_column: 'someValue' })
  .select()
`}})})]})}),ep.includes("PATCH")&&(0,s.jsx)(v,{title:"Update rows",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:[(0,s.jsx)("code",{children:"update"})," lets you update rows. ",(0,s.jsx)("code",{children:"update"})," will match all rows by default. You can update specific rows using horizontal filters, e.g. ",(0,s.jsx)("code",{children:"eq"}),", ",(0,s.jsx)("code",{children:"lt"}),", and ",(0,s.jsx)("code",{children:"is"}),"."]}),(0,s.jsxs)("p",{children:[(0,s.jsx)("code",{children:"update"})," will also return the replaced values for UPDATE."]}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/update`,children:"Learn more"})})]}),snippets:(0,s.jsx)(A,{selectedLang:n,snippet:(C=e,N=et,I=ea,{title:"Update matching rows",bash:{language:"bash",code:`
curl -X PATCH '${N}/rest/v1/${C}?some_column=eq.someValue' \\
-H "apikey: ${I}" \\
-H "Authorization: Bearer ${I}" \\
-H "Content-Type: application/json" \\
-H "Prefer: return=minimal" \\
-d '{ "other_column": "otherValue" }'
`},js:{language:"js",code:`
const { data, error } = await supabase
  .from('${C}')
  .update({ other_column: 'otherValue' })
  .eq('some_column', 'someValue')
  .select()
`}})})}),ep.includes("DELETE")&&(0,s.jsx)(v,{title:"Delete rows",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsxs)("p",{children:[(0,s.jsx)("code",{children:"delete"})," lets you delete rows. ",(0,s.jsx)("code",{children:"delete"})," will match all rows by default, so remember to specify your filters!"]}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/delete`,children:"Learn more"})})]}),snippets:(0,s.jsx)(A,{selectedLang:n,snippet:(U=e,H=et,R=ea,{title:"Delete matching rows",bash:{language:"bash",code:`
curl -X DELETE '${H}/rest/v1/${U}?some_column=eq.someValue' \\
-H "apikey: ${R}" \\
-H "Authorization: Bearer ${R}"
`},js:{language:"js",code:`
const { error } = await supabase
  .from('${U}')
  .delete()
  .eq('some_column', 'someValue')
`}})})}),X&&(ep.includes("DELETE")||ep.includes("POST")||ep.includes("PATCH"))&&(0,s.jsx)(v,{title:"Subscribe to changes",content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("p",{children:"Supabase provides realtime functionality and broadcasts database changes to authorized users depending on Row Level Security (RLS) policies."}),(0,s.jsx)("p",{children:(0,s.jsx)(_.InlineLink,{href:`${F.DOCS_URL}/reference/javascript/subscribe`,children:"Learn more"})})]}),snippets:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)(A,{selectedLang:n,snippet:(O=el.camelCase,K=e,{title:"Subscribe to all events",bash:{language:"bash",code:"# Realtime streams are only supported by our client libraries"},js:{language:"js",code:`
const ${O} = supabase.channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: '${K}' },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(B=el.camelCase,D=e,{title:"Subscribe to inserts",bash:{language:"bash",code:"# Realtime streams are only supported by our client libraries"},js:{language:"js",code:`
const ${B} = supabase.channel('custom-insert-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: '${D}' },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(q=el.camelCase,V=e,{title:"Subscribe to updates",bash:{language:"bash",code:"# Realtime streams are only supported by our client libraries"},js:{language:"js",code:`
const ${q} = supabase.channel('custom-update-channel')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: '${V}' },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(z=el.camelCase,Y=e,{title:"Subscribe to deletes",bash:{language:"bash",code:"# Realtime streams are only supported by our client libraries"},js:{language:"js",code:`
const ${z} = supabase.channel('custom-delete-channel')
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: '${Y}' },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()`}})}),(0,s.jsx)(A,{selectedLang:n,snippet:(M=el.camelCase,Q=e,{title:"Subscribe to specific rows",bash:{language:"bash",code:"# Realtime streams are only supported by our client libraries"},js:{language:"js",code:`
const ${M} = supabase.channel('custom-filter-channel')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: '${Q}', filter: 'column_name=eq.someValue' },
    (payload) => {
      console.log('Change received!', payload)
    }
  )
  .subscribe()`}})})]})})]}):null},eh=({rpcId:e,rpcs:a,paths:n,selectedLang:i,showApiKey:r,refreshDocs:l})=>{let{ref:o}=(0,t.useParams)(),{data:c}=(0,T.useProjectSettingsV2Query)({projectRef:o}),d=c?.app_config?.protocol??"https",u=c?.app_config?.endpoint??"",p=`${d}://${u??""}`,h=a[e],m=`/rpc/${e}`,g=n&&m in n?n[m]:void 0,{parameters:j,summary:x}=g?.post||{},b=Object.entries(j&&j[0]&&j[0].schema&&j[0].schema.properties?j[0].schema.properties:{}).map(([e,s])=>({name:e,...s})).filter(e=>!!e.name);return g?(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:h.id,content:(0,s.jsxs)(s.Fragment,{children:[(0,s.jsx)("label",{className:"font-mono text-xs uppercase text-foreground-lighter inline-block mb-2",children:"Description"}),(0,s.jsx)(er,{content:x??"",metadata:{rpc:e},onChange:l})]}),snippets:(0,s.jsx)(A,{selectedLang:i,snippet:(({rpcName:e,rpcParams:s,endpoint:t,apiKey:a,showBearer:n=!0})=>{let i=s.map(e=>`"${e.name}": "value"`).join(", "),r=!s.length,l=r?"":`
-d '{ ${i} }' \\`,o=r?"":`, {${s.length?s.map(e=>`
    ${e.name}`).join(", ").concat("\n  "):""}}`;return{title:"Invoke function ",bash:{language:"bash",code:`
curl -X POST '${t}/rest/v1/rpc/${e}' \\${l}
-H "Content-Type: application/json" \\
-H "apikey: ${a}" ${n?`\\
-H "Authorization: Bearer ${a}"`:""}
`},js:{language:"js",code:`
let { data, error } = await supabase
  .rpc('${e}'${o})
if (error) console.error(error)
else console.log(data)
`}}})({rpcName:e,rpcCamelCase:h.camelCase,rpcParams:b,apiKey:r||"SUPABASE_KEY",endpoint:p})})}),b.length>0&&(0,s.jsxs)("div",{className:"flex flex-col flex-1",children:[(0,s.jsx)(v,{title:"Function Arguments",content:null}),b.map((e,t)=>(0,s.jsx)(v,{title:null,content:(0,s.jsx)(ec,{name:e.name,type:e.type,format:e.format,required:!0,description:!1},e.name)},t))]})]}):null};var em=e.i(479709);let eg=({error:e})=>(0,s.jsx)("div",{className:"p-6 mx-auto text-center sm:w-full md:w-3/4",children:(0,s.jsxs)("div",{className:"text-foreground-light",children:[(0,s.jsx)("p",{children:"Error connecting to API"}),(0,s.jsx)("p",{children:e?.message??"An unexpected error occurred"})]})}),ej=()=>(0,s.jsxs)("div",{className:"w-full h-full overflow-y-auto flex flex-col py-10 space-y-2",children:[(0,s.jsx)(n.ShimmeringLoader,{className:"h-2 w-24 max-w-full"}),(0,s.jsx)(n.ShimmeringLoader,{className:"h-2 w-96 max-w-full"}),(0,s.jsx)(n.ShimmeringLoader,{className:"h-2 w-96 max-w-full"}),(0,s.jsx)(n.ShimmeringLoader,{className:"h-2 w-96 max-w-full"})]}),ex=({selectedLang:e,selectedApiKey:a})=>{let{ref:n,page:i,resource:r,rpc:l}=(0,t.useParams)(),{data:o,error:c}=(0,T.useProjectSettingsV2Query)({projectRef:n}),{data:d,error:u,isPending:p,refetch:h}=(0,eu.useProjectJsonSchemaQuery)({projectRef:n}),{paths:m}=d||{},g=r||l||i||"index",{resources:j,rpcs:x}=(0,em.buildEntityMaps)(m);return c||u?(0,s.jsx)(eg,{error:c||u}):!p&&o&&d?(0,s.jsx)("div",{className:"w-full h-full overflow-y-auto flex flex-col",children:(0,s.jsx)("div",{className:"flex-1 flex flex-col",children:r?(0,s.jsx)(ep,{selectedLang:e,resourceId:r,resources:j,showApiKey:a.key,refreshDocs:h}):l?(0,s.jsx)(eh,{selectedLang:e,rpcId:l,paths:m,rpcs:x,showApiKey:a.key,refreshDocs:h}):(0,s.jsx)(J,{selectedLang:e,showApiKey:a.key,page:i})})},g):(0,s.jsx)(ej,{})};var eb=e.i(852315),ey=e.i(636900),ef=e.i(182074),ew=e.i(310474),ev=e.i(10758),eS=e.i(247413),ek=e.i(837508);e.s(["DataApiDocsTab",0,()=>{let{ref:e,page:i,resource:r,rpc:l}=(0,t.useParams)(),{data:o}=(0,ei.useSelectedProjectQuery)(),{projectAuthAll:c}=(0,G.useIsFeatureEnabled)(["project_auth:all"]),d=o?.status===ek.PROJECT_STATUS.INACTIVE,[u,p]=(0,a.useState)("js"),[h,j]=(0,a.useState)({name:"hide",key:"SUPABASE_KEY"}),{isEnabled:x,isPending:y}=(0,eS.useIsDataApiEnabled)({projectRef:e}),{data:f}=(0,ev.useOpenAPISpecQuery)({projectRef:e},{enabled:!!e&&!d&&x}),v=(0,a.useMemo)(()=>(f?.tables??[]).map(e=>e.name),[f]),S=(0,a.useMemo)(()=>(f?.functions??[]).map(e=>e.name),[f]),k=(0,a.useMemo)(()=>(e=>{let{page:s,resource:t,rpc:a}=e;return s||t||a?s||a||t:"introduction"})({page:i,resource:r,rpc:l}),[i,r,l]),$=e?`/project/${e}/integrations/data_api/docs`:void 0,A=(0,a.useMemo)(()=>{var t;let a;return e?(t={authEnabled:c},[{title:"Getting Started",items:[{name:"Introduction",key:"introduction",url:a=$??`/project/${e}/integrations/data_api/docs`,items:[]},{name:"Authentication",key:"auth",url:`${a}?page=auth`,items:[]},...t?.authEnabled?[{name:"User Management",key:"users-management",url:`${a}?page=users-management`,items:[]}]:[]]},{title:"Tables and Views",items:[{name:"Introduction",key:"tables-intro",url:`${a}?page=tables-intro`,items:[]},...v.sort().map(e=>({name:e,key:e,url:`${a}?resource=${e}`,items:[]}))]},{title:"Functions",items:[{name:"Introduction",key:"rpc-intro",url:`${a}?page=rpc-intro`,items:[]},...S.map(e=>({name:e,key:e,url:`${a}?rpc=${e}`,items:[]}))]},{title:"GraphQL",items:[{name:"GraphiQL",key:"graphiql",url:`/project/${e}/integrations/graphiql`,icon:(0,s.jsx)(ew.default,{src:`${F.BASE_PATH}/img/graphql.svg`,style:{width:"16px",height:"16px"},className:"text-foreground",preProcessor:e=>e.replace(/svg/,'svg class="m-auto text-color-inherit"')}),items:[],rightIcon:(0,s.jsx)(eb.ArrowUpRight,{strokeWidth:1,className:"h-4 w-4"})}]},{title:"More Resources",items:[{name:"Guides",key:"guides",url:F.DOCS_URL,icon:(0,s.jsx)(ey.Book,{size:14,strokeWidth:2}),items:[],isExternal:!0},{name:"API Reference",key:"api-reference",url:`${F.DOCS_URL}/guides/api`,icon:(0,s.jsx)(ef.BookOpen,{size:14,strokeWidth:2}),items:[],isExternal:!0}]}]):[]},[e,v,S,c,$]);return y?(0,s.jsx)("div",{className:"flex w-full bg-surface-100 flex-1 items-stretch p-10",children:(0,s.jsx)(n.ShimmeringLoader,{className:"w-full h-full"})}):x?(0,s.jsxs)("div",{className:"flex w-full bg-surface-100 flex-1 items-stretch",children:[(0,s.jsxs)("aside",{className:"hidden lg:flex flex-col gap-y-6 w-60 shrink-0 p-10",children:[(0,s.jsx)(m,{selectedLang:u,selectedApiKey:h,setSelectedLang:e=>p(e),setSelectedApiKey:j}),(0,s.jsx)(b,{activePage:k,menu:A})]}),(0,s.jsxs)("div",{className:"flex-1 min-w-0 relative",children:[(0,s.jsx)(w,{activePage:k,menu:A,selectedLang:u,selectedApiKey:h,setSelectedLang:p,setSelectedApiKey:j}),(0,s.jsx)(ex,{selectedLang:u,selectedApiKey:h})]})]}):(0,s.jsx)(g.DataApiDisabledState,{description:"view the documentation"})}],321635)},338481,e=>{e.n(e.i(321635))}]);