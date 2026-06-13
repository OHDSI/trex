<template>
  <AtlasPageShell :eyebrow="type" :title="`Search ${type}`">
    <div class="search-layout">
      <AtlasCard padding="sm">
        <div class="text-caption font-weight-medium mb-2">Filters</div>
        <div v-for="sp in params" :key="sp.name" class="mb-2">
          <AtlasTextField :data-filter="sp.name" :label="sp.name" v-model="filters[sp.name]" />
        </div>
        <AtlasButton variant="primary" @click="runSearch">Apply filters</AtlasButton>
      </AtlasCard>

      <div>
        <AtlasAlert v-if="searchError" severity="danger" :title="searchError" class="mb-3" />
        <AtlasCard padding="none">
        <table class="results">
          <thead><tr><th v-for="c in columns" :key="c">{{ c }}</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" data-result-row @click="open(r)">
              <td v-for="c in columns" :key="c">{{ display(r, c) }}</td>
            </tr>
          </tbody>
        </table>
        </AtlasCard>
      </div>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasCard, AtlasTextField, AtlasButton, AtlasAlert } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import type { SearchParam } from "@/stores/profile";

const props = defineProps<{ dataset: string; type: string }>();
const { client, profile } = useFhir(props.dataset);
const router = useRouter();

const params = ref<SearchParam[]>([]);
const filters = reactive<Record<string, string>>({});
const rows = ref<any[]>([]);
const columns = ref<string[]>(["id"]);
const searchError = ref<string | null>(null);

function activeFilters() { return Object.fromEntries(Object.entries(filters).filter(([, v]) => v)); }
async function runSearch() {
  searchError.value = null;
  try {
    const bundle = await client.search(props.dataset, props.type, activeFilters());
    rows.value = (bundle.entry ?? []).map((e: any) => e.resource);
    columns.value = ["id", ...params.value.slice(0, 4).map((p) => p.name)];
  } catch (e: any) {
    searchError.value = e?.message ?? "Search failed";
  }
}
function display(r: any, c: string) { const v = r[c]; return typeof v === "object" ? JSON.stringify(v) : v ?? ""; }
function open(r: any) { router.push(`/${props.dataset}/${props.type}/${r.id}/edit`); }

onMounted(async () => { params.value = await profile.getSearchParams(props.type); await runSearch(); });
</script>

<style scoped>
.search-layout{display:grid;grid-template-columns:240px 1fr;gap:18px}
.results{width:100%;border-collapse:collapse;font-size:13px}
.results th{text-align:left;padding:9px 12px;border-bottom:1px solid rgb(var(--v-theme-outline-variant));color:rgb(var(--v-theme-on-surface-variant))}
.results td{padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer}
</style>
