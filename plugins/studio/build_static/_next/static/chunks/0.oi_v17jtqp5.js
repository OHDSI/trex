(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,486240,e=>{"use strict";var o=e.i(478902),t=e.i(389959),a=e.i(500850),s=e.i(283606),r=e.i(314805),n=e.i(408279),l=e.i(331162);let p={bash:"bash",csharp:"csharp",cs:"csharp",curl:"curl",dart:"dart",go:"go",http:"http",javascript:"js",js:"js",json:"json",jsx:"jsx",kotlin:"kotlin",pgsql:"pgsql",php:"php",py:"python",python:"python",sh:"bash",shell:"bash",sql:"sql",swift:"swift",ts:"ts",typescript:"ts",yaml:"yaml",yml:"yaml"},i={astro:"html",bash:"bash",cjs:"js",dart:"dart",go:"go",js:"js",json:"json",jsx:"jsx",kt:"kotlin",mjs:"js",php:"php",pgsql:"pgsql",py:"python",sh:"bash",sql:"sql",swift:"swift",svelte:"html",ts:"ts",vue:"html",yaml:"yaml",yml:"yaml"};e.s(["MultipleCodeBlock",0,({files:e,value:c,onValueChange:m})=>{if(!e?.length)return null;let u=e[0]?.name??"",d=void 0!==c,[b,h]=(0,t.useState)(u),g=e.map(e=>({...e,code:"string"==typeof e.code?e.code.trim():e.code}));return(0,t.useEffect)(()=>{d||h(o=>e.some(e=>e.name===o)?o:u)},[u,e,d]),(0,o.jsxs)(a.Tabs_Shadcn_,{value:d?c:b,onValueChange:e=>{d||h(e),m?.(e)},className:"border rounded-lg gap-0 space-y-0 overflow-hidden",children:[(0,o.jsx)(r.TabsList_Shadcn_,{className:"bg-surface-75 px-5 gap-5 overflow-x-auto border-0 border-b",children:e.map(e=>(0,o.jsx)(n.TabsTrigger_Shadcn_,{value:e.name,className:"flex items-center gap-1 text-xs px-0 data-[state=active]:bg-transparent py-2.5",children:e.name},e.name))}),g.map(e=>(0,o.jsx)(s.TabsContent_Shadcn_,{value:e.name,forceMount:!0,className:"p-0 max-h-72 overflow-scroll data-[state=inactive]:hidden","data-connect-tab-content":!0,"data-tab-label":e.name,children:(0,o.jsx)(l.CodeBlock,{value:"string"==typeof e.code?e.code.trim():e.code,language:((e,o)=>{if(e){let o=p[e.toLowerCase()];if(o)return o}return(e=>{let o=e.toLowerCase();if(o.startsWith(".env"))return"bash";let t=o.split(".").pop();if(t&&t!==o)return i[t]})(o)??"js"})(e.language,e.name),className:"min-h-72 !bg-surface-75 rounded-none border-0"})},e.name))]})}])},190529,e=>{"use strict";var o=e.i(478902),t=e.i(486240);e.s(["default",0,({projectKeys:e})=>{let a=[{name:"environments/environment.ts",language:"ts",code:`
export const environment = {
  supabaseUrl: '${e.apiUrl??"your-project-url"}',
  supabaseKey: '${e.publishableKey??"<prefer publishable key instead of anon key for mobile apps>"}',
};
`},{name:"src/app/supabase.service.ts",language:"ts",code:`
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  getTodos() {
    return this.supabase.from('todos').select('*');
  }
}
`},{name:"src/app/app.component.ts",language:"ts",code:`
import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {
  todos: any[] = [];

  constructor(private supabaseService: SupabaseService) {}

  async ngOnInit() {
    await this.loadTodos();
  }

  async loadTodos() {
    const { data, error } = await this.supabaseService.getTodos();
    if (error) {
      console.error('Error fetching todos:', error);
    } else {
      this.todos = data;
    }
  }
}
`},{name:"src/app/app.component.html",language:"html",code:`
<ion-header>
<ion-toolbar>
  <ion-title>Todo List</ion-title>
</ion-toolbar>
</ion-header>

<ion-content>
<ion-list>
  <ion-item *ngFor="let todo of todos">
    <ion-label>{{ todo.name }}</ion-label>
  </ion-item>
</ion-list>
</ion-content>
`},{name:"src/app/app.module.ts",language:"ts",code:`
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AppComponent } from './app.component';
import { SupabaseService } from './supabase.service';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    RouterModule.forRoot([]),
    IonicModule.forRoot({ mode: 'ios' }),
  ],
  declarations: [AppComponent],
  providers: [SupabaseService],
  bootstrap: [AppComponent],
})
export class AppModule {}
`}];return(0,o.jsx)(t.MultipleCodeBlock,{files:a})}])}]);