import { createRouter, createWebHistory } from "vue-router";
const routes = [
    { path: "/", redirect: "/datasets" },
    { path: "/datasets", name: "datasets", component: () => import("@/screens/DatasetPicker.vue") },
    { path: "/:dataset", name: "browse", component: () => import("@/screens/ResourceBrowser.vue"), props: true },
    { path: "/:dataset/:type", name: "search", component: () => import("@/screens/ResourceSearch.vue"), props: true },
    { path: "/:dataset/:type/:id/edit", name: "edit", component: () => import("@/screens/ResourceEditor.vue"), props: true },
    { path: "/:dataset/Questionnaire/:id/build", name: "build", component: () => import("@/screens/QuestionnaireBuilder.vue"), props: true },
    { path: "/:dataset/Questionnaire/:id/fill", name: "fill", component: () => import("@/screens/QuestionnaireFiller.vue"), props: true },
];
export function createAppRouter(base) {
    return createRouter({ history: createWebHistory(base), routes });
}
