import { createApp, h } from "vue";
import { createPinia } from "pinia";
import singleSpaVue from "single-spa-vue";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import { createAppRouter } from "./router";
const lifecycles = singleSpaVue({
    createApp,
    appOptions: { render: () => h(App) },
    handleInstance(app, props) {
        app.use(createPinia());
        app.use(vuetify);
        app.use(createAppRouter(props.basePath || "/plugins/trex/fhir-ui"));
    },
});
export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
