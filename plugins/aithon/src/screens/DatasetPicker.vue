<template>
  <AtlasPageShell eyebrow="Aithon" title="Datasets" subtitle="Browse, search and edit FHIR data — pick a dataset to begin.">
    <template #actions>
      <AtlasButton variant="primary" data-new-dataset @click="openNew">＋ New dataset</AtlasButton>
    </template>

    <AtlasProgressCircular v-if="loading" indeterminate class="mt-4" />
    <AtlasAlert v-else-if="error" data-error severity="danger" :title="error" class="mt-4" />
    <div v-else-if="datasets.length === 0" class="empty">
      <v-icon icon="mdi-database-off-outline" size="40" class="mb-2" />
      <div class="text-body-2 text-medium-emphasis">No datasets yet. Create one to get started.</div>
    </div>

    <div v-else class="ds-grid">
      <RouterLink
        v-for="d in datasets"
        :key="d.id"
        :to="`/${d.id}`"
        data-dataset
        style="text-decoration:none"
      >
        <AtlasCard interactive padding="md" class="ds-card">
          <div class="ds-card__head">
            <span class="ds-ic"><v-icon icon="mdi-database" size="20" /></span>
            <div class="ds-meta">
              <div class="ds-name">{{ d.name || d.id }}</div>
              <div class="ds-id">{{ d.id }}</div>
            </div>
          </div>
          <div class="ds-stats">
            <span class="stat"><strong>{{ stat(d.id).records }}</strong> records</span>
            <span class="dot">·</span>
            <span class="stat"><strong>{{ stat(d.id).types }}</strong> types</span>
          </div>
        </AtlasCard>
      </RouterLink>
    </div>

    <AtlasDialog v-model="newOpen" title="New dataset" :persistent="false">
      <AtlasTextField v-model="newId" label="Dataset id" hint="lowercase, no spaces (e.g. clinic-data)" />
      <AtlasTextField v-model="newName" label="Display name (optional)" class="mt-2" />
      <AtlasAlert v-if="newError" severity="danger" :title="newError" class="mt-2" />
      <template #actions>
        <AtlasButton variant="ghost" @click="newOpen = false">Cancel</AtlasButton>
        <AtlasButton variant="primary" :loading="creating" :disabled="!newId" @click="createDs">Create</AtlasButton>
      </template>
    </AtlasDialog>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  AtlasPageShell, AtlasCard, AtlasButton, AtlasAlert, AtlasProgressCircular,
  AtlasDialog, AtlasTextField,
} from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";

const { client } = useFhir();
const router = useRouter();

const datasets = ref<any[]>([]);
const loading = ref(true);
const error = ref("");
const stats = reactive<Record<string, { records: number; types: number }>>({});
function stat(id: string) { return stats[id] ?? { records: "—" as any, types: "—" as any }; }

const newOpen = ref(false);
const newId = ref("");
const newName = ref("");
const newError = ref("");
const creating = ref(false);

async function load() {
  loading.value = true; error.value = "";
  try {
    const res: any = await client.listDatasets();
    datasets.value = Array.isArray(res) ? res : (res?.entry?.map((e: any) => e.resource) ?? []);
    // fetch per-dataset stats in parallel, tolerant of failures
    await Promise.all(datasets.value.map(async (d: any) => {
      try {
        const { counts } = await client.getCounts(d.id);
        const vals = Object.values(counts ?? {});
        stats[d.id] = { records: vals.reduce((a, b) => a + (b as number), 0), types: vals.length };
      } catch { /* leave as — */ }
    }));
  } catch (e) {
    error.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}

function openNew() { newId.value = ""; newName.value = ""; newError.value = ""; newOpen.value = true; }
async function createDs() {
  creating.value = true; newError.value = "";
  try {
    await client.createDataset({ id: newId.value.trim(), name: newName.value.trim() || undefined });
    newOpen.value = false;
    router.push(`/${newId.value.trim()}`);
  } catch (e) {
    newError.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    creating.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ds-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  margin-top: 14px;
}
.ds-card__head { display: flex; align-items: center; gap: 12px; }
.ds-ic {
  width: 40px; height: 40px; border-radius: 10px; flex: none;
  display: grid; place-items: center;
  background: rgba(var(--v-theme-primary), 0.10);
  color: rgb(var(--v-theme-primary));
}
.ds-name { font-weight: 600; color: rgb(var(--v-theme-primary)); font-size: 15px; }
.ds-id { font-family: ui-monospace, monospace; font-size: 11.5px; color: rgb(var(--v-theme-on-surface-variant)); }
.ds-stats {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid rgb(var(--v-theme-outline-variant));
  font-size: 12.5px; color: rgb(var(--v-theme-on-surface-variant));
  display: flex; align-items: center; gap: 8px;
}
.ds-stats strong { color: rgb(var(--v-theme-on-surface)); }
.ds-stats .dot { opacity: 0.5; }
.empty { text-align: center; padding: 48px 0; color: rgb(var(--v-theme-on-surface-variant)); }
</style>
