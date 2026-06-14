<template>
  <AtlasPageShell :eyebrow="type" :title="`Search ${type}`">
    <template #actions>
      <AtlasButton variant="primary" data-new @click="createNew">+ New {{ humanize(type) }}</AtlasButton>
    </template>
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
          <AtlasDataTable
            :headers="headers"
            :items="items"
            :loading="loading"
            :no-data-text="`No ${type} found`"
            :hide-default-footer="items.length <= 10"
            @click:row="onRowClick"
          />
        </AtlasCard>
      </div>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasCard, AtlasTextField, AtlasButton, AtlasAlert, AtlasDataTable } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { humanize } from "@/utils/humanize";
import { formatFhirValue } from "@/utils/fhirDisplay";
import type { SearchParam } from "@/stores/profile";

const props = defineProps<{ dataset: string; type: string }>();
const { client, profile } = useFhir(props.dataset);
const router = useRouter();

const params = ref<SearchParam[]>([]);
const filters = reactive<Record<string, string>>({});
const rows = ref<any[]>([]);
const columnKeys = ref<string[]>(["id"]);
const searchError = ref<string | null>(null);
const loading = ref(false);

const headers = computed(() =>
  columnKeys.value.map((k) => ({ key: k, title: humanize(k) }))
);

const items = computed(() =>
  rows.value.map((r) => {
    const display: Record<string, unknown> = { _raw: r };
    for (const k of columnKeys.value) {
      display[k] = formatFhirValue(r[k]);
    }
    return display;
  })
);

function activeFilters() { return Object.fromEntries(Object.entries(filters).filter(([, v]) => v)); }

async function runSearch() {
  searchError.value = null;
  loading.value = true;
  try {
    const bundle = await client.search(props.dataset, props.type, activeFilters());
    rows.value = (bundle.entry ?? []).map((e: any) => e.resource);
  } catch (e: any) {
    searchError.value = e?.message ?? "Search failed";
  } finally {
    loading.value = false;
  }
}

function onRowClick(_event: unknown, ctx: { item: any }) {
  const raw = ctx?.item?._raw ?? ctx?.item;
  open(raw);
}

function open(r: any) {
  if (props.type === "Questionnaire") router.push(`/${props.dataset}/Questionnaire/${r.id}/build`);
  else router.push(`/${props.dataset}/${props.type}/${r.id}/edit`);
}

function createNew() {
  if (props.type === "Questionnaire") router.push(`/${props.dataset}/Questionnaire/new/build`);
  else router.push(`/${props.dataset}/${props.type}/new/edit`);
}

onMounted(async () => {
  params.value = await profile.getSearchParams(props.type);
  try {
    const def = await profile.getDefinition(props.type);
    const sdCols = def.elements.slice(0, 5).map((e: any) => e.name);
    columnKeys.value = ["id", ...sdCols];
  } catch {
    // Fallback: derive columns from search params if SD unavailable
    columnKeys.value = ["id", ...params.value.slice(0, 4).map((p) => p.name)];
  }
  await runSearch();
});
</script>

<style scoped>
.search-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 18px;
}
@media (max-width: 700px) {
  .search-layout {
    grid-template-columns: 1fr;
  }
}
</style>
