import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import { createAppRouter } from "./router";
createApp(App).use(createPinia()).use(vuetify).use(createAppRouter("/")).mount("#app");
