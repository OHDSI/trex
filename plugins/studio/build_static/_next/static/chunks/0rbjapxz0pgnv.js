(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var t=e.i(478902),a=e.i(389959),s=e.i(500850),o=e.i(283606),r=e.i(314805),l=e.i(408279),n=e.i(331162);let i={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},d={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:p,onValueChange:u})=>{if(!e?.length)return null;let c=e[0]?.name??"",m=void 0!==p,[h,g]=(0,a.useState)(c),b=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,a.useEffect)(()=>{m||g(t=>e.some(e=>e.name===t)?t:c)},[c,e,m]),(0,t.jsxs)(s.Tabs_Shadcn_,{value:m?p:h,onValueChange:e=>{m||g(e),u?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,t.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,t.jsx)(l.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),b.map(e=>(0,t.jsx)(o.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,t.jsx)(n.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,t)=>{if(e){let t=i[e.toLowerCase()];if(t)return t}return(e=>{let t=e.toLowerCase();if(t.startsWith(".env"))return"bash";let a=t.split(".").pop();if(a&&a!==t)return d[a]})(t)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},84223,e=>{"use strict";var t=e.i(478902),a=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let s=[{name:"lib/main.dart",language:"dart",code:`
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> main() async {
  await Supabase.initialize(
    url: '${e.apiUrl??"your-project-url"}',
    anonKey: '${e.publishableKey??"<prefer publishable key instead of anon key for mobile and desktop apps>"}',
  );
  runApp(MyApp());
}
        `},{name:"lib/main.dart (app)",language:"dart",code:`
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'Todos',
      home: HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _future = Supabase.instance.client
      .from('todos')
      .select();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder(
        future: _future,
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final todos = snapshot.data!;
          return ListView.builder(
            itemCount: todos.length,
            itemBuilder: ((context, index) {
              final todo = todos[index];
              return ListTile(
                title: Text(todo['name']),
              );
            }),
          );
        },
      ),
    );
  }
}
`}];return(0,t.jsx)(a.MultipleCodeBlock,{files:s})}])}]);