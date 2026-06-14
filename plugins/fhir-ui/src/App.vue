<template>
  <v-app>
    <v-app-bar flat color="surface" height="60" border="b">
      <div class="d-flex align-center px-4" style="gap:10px;font-weight:700;color:rgb(var(--v-theme-primary))">
        <v-avatar size="26" color="primary"><v-icon icon="mdi-fire" color="white" size="18" /></v-avatar> Prometheus
      </div>
      <div class="d-flex align-center ml-6" style="height:100%">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-link" active-class="nav-link--active">{{ n.label }}</RouterLink>
      </div>
      <v-spacer />
      <input
        v-if="dataset"
        v-model="searchQuery"
        class="header-search"
        placeholder="Search all records…"
        @keydown.enter="doSearch"
      />
      <v-chip v-if="dataset" variant="tonal" class="mr-3 ml-2">{{ dataset }}</v-chip>
    </v-app-bar>
    <v-main><RouterView /></v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
const route = useRoute();
const router = useRouter();
const dataset = computed(() => route.params.dataset as string | undefined);
const nav = computed(() => {
  const ds = dataset.value;
  return ds
    ? [{ to: `/${ds}`, label: "Browse" }, { to: "/datasets", label: "Datasets" }]
    : [{ to: "/datasets", label: "Datasets" }];
});
const searchQuery = ref("");
function doSearch() {
  const ds = dataset.value;
  const q = searchQuery.value.trim();
  if (ds && q) {
    router.push(`/${ds}/_search?q=${encodeURIComponent(q)}`);
    searchQuery.value = "";
  }
}
</script>

<style scoped>
.nav-link { display:inline-flex; align-items:center; height:100%; padding:0 13px; color:rgb(var(--v-theme-on-surface-variant)); text-decoration:none; font-size:14px; }
.nav-link:hover { color:rgb(var(--v-theme-primary)); }
.nav-link--active { color:rgb(var(--v-theme-primary)); font-weight:500; box-shadow: inset 0 -2px 0 rgb(var(--v-theme-primary)); }
.header-search { height:32px; padding:0 10px; border:1px solid rgb(var(--v-theme-outline,180,180,180)); border-radius:6px; font-size:13px; outline:none; width:200px; background:rgb(var(--v-theme-surface-variant,245,245,245)); color:inherit; }
.header-search:focus { border-color:rgb(var(--v-theme-primary)); }
</style>
