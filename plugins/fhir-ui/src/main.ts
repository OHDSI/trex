import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import "./styles/app.css";
import { createAppRouter } from "./router";

createApp(App).use(createPinia()).use(vuetify).use(createAppRouter(import.meta.env.BASE_URL)).mount("#app");
