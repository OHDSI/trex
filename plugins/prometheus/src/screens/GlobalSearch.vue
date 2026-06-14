<template>
  <AtlasPageShell eyebrow="Global Search" :title="'Search results for \'' + q + '\''">
    <AtlasProgressCircular v-if="loading" indeterminate class="mt-4" />
    <AtlasAlert v-else-if="error" severity="danger" :title="error" class="mt-4" />
    <div v-else-if="!q" class="text-body-2 text-medium-emphasis mt-4">Enter a search term above to search all records.</div>
    <div v-else-if="groups.length === 0" class="text-body-2 text-medium-emphasis mt-4" data-empty>No results found for "{{ q || '' }}".</div>
    <div v-else>
      <div v-for="group in groups" :key="group.resourceType" class="mb-6">
        <div class="text-subtitle-2 font-weight-bold mb-2" style="color:rgb(var(--v-theme-primary))">
          {{ group.resourceType }} <span class="text-caption text-medium-emphasis">({{ group.entries.length }})</span>
        </div>
        <AtlasCard padding="none">
          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="result-row"
            @click="open(entry)"
          >
            <div class="text-body-2">{{ entry.label }}</div>
            <div class="text-caption text-medium-emphasis">{{ entry.id }}</div>
          </div>
        </AtlasCard>
      </div>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasCard, AtlasAlert, AtlasProgressCircular } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { formatFhirValue } from "@/utils/fhirDisplay";

const props = defineProps<{ dataset: string; q?: string }>();
const { client } = useFhir(props.dataset);
const router = useRouter();

const loading = ref(false);
const error = ref("");
const entries = ref<Array<{ resourceType: string; id: string; label: string; raw: any }>>([]);

const groups = computed(() => {
  const map = new Map<string, typeof entries.value>();
  for (const e of entries.value) {
    if (!map.has(e.resourceType)) map.set(e.resourceType, []);
    map.get(e.resourceType)!.push(e);
  }
  return [...map.entries()].map(([resourceType, group]) => ({ resourceType, entries: group }));
});

function labelFor(resource: any): string {
  const rt = resource.resourceType as string | undefined;
  // Try common human-readable fields
  if (resource.name) return formatFhirValue(resource.name);
  if (resource.title) return formatFhirValue(resource.title);
  if (resource.code) return formatFhirValue(resource.code);
  if (resource.text?.div) {
    // Strip HTML tags from narrative
    return String(resource.text.div).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  return resource.id ?? rt ?? "";
}

async function doSearch(q: string) {
  if (!q || !q.trim()) { entries.value = []; return; }
  loading.value = true;
  error.value = "";
  try {
    const bundle = await client.globalSearch(props.dataset, q);
    entries.value = (bundle.entry ?? []).map((e: any) => {
      const r = e.resource ?? {};
      return {
        resourceType: r.resourceType ?? "Unknown",
        id: r.id ?? "",
        label: labelFor(r),
        raw: r,
      };
    });
  } catch (e: any) {
    error.value = e?.message ?? "Search failed";
  } finally {
    loading.value = false;
  }
}

function open(entry: { resourceType: string; id: string }) {
  if (entry.resourceType === "Questionnaire") {
    router.push(`/${props.dataset}/Questionnaire/${entry.id}/build`);
  } else {
    router.push(`/${props.dataset}/${entry.resourceType}/${entry.id}/edit`);
  }
}

onMounted(() => { if (props.q) doSearch(props.q); });
watch(() => props.q, (q) => { if (q) doSearch(q); else entries.value = []; });
</script>

<style scoped>
.result-row {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgb(var(--v-theme-outline, 230, 230, 230));
}
.result-row:last-child { border-bottom: none; }
.result-row:hover { background: rgb(var(--v-theme-surface-variant, 245, 245, 245)); }
</style>
