(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(500850),o=e.i(283606),l=e.i(314805),i=e.i(408279),n=e.i(331162);let r={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},c={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:d,onValueChange:m})=>{if(!e?.length)return null;let p=e[0]?.name??"",u=void 0!==d,[h,b]=(0,a.useState)(p),f=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{u||b(t=>e.some(e=>e.name===t)?t:p)},[p,e,u]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:u?d:h,onValueChange:e=>{u||b(e),m?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(l.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(i.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),f.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=r[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let a=t.split(".").pop();if(a&&a!==t)return c[a]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},245201,e=>{"use strict";var t=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:"MainActivity.kt",language:"kotlin",code:`
val supabase = createSupabaseClient(
    supabaseUrl = "${e.apiUrl??"your-project-url"}",
    supabaseKey = "${e.publishableKey??"<prefer publishable key instead of anon key for mobile apps>"}"
  ) {
    install(Postgrest)
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                // A surface container using the 'background' color from the theme
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    TodoList()
                }
            }
        }
    }
}

@Composable
fun TodoList() {
    var items by remember { mutableStateOf<List<TodoItem>>(listOf()) }
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            items = supabase.from("todos")
                              .select().decodeList<TodoItem>()
        }
    }
    LazyColumn {
        items(
            items,
            key = { item -> item.id },
        ) { item ->
            Text(
                item.name,
                modifier = Modifier.padding(8.dp),
            )
        }
    }
}
`},{name:"TodoItem.kt",language:"kotlin",code:`
@Serializable
data class TodoItem(val id: Int, val name: String)
        `}];return(0,t.jsx)(a.MultipleCodeBlock,{files:s})}])}]);