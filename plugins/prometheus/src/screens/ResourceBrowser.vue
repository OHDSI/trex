<template>
  <AtlasPageShell eyebrow="Dataset" :title="`Browse ${dataset}`">
    <template #actions>
      <AtlasButton variant="primary" data-new-resource @click="newPickerOpen = true">+ New resource</AtlasButton>
    </template>
    <AtlasProgressCircular v-if="loading" indeterminate class="mt-4" />
    <AtlasAlert v-else-if="error" data-error severity="danger" :title="error" class="mt-4" />
    <div v-else-if="visibleTypes.length === 0" class="text-body-2 text-medium-emphasis mt-4">No resource types with data</div>
    <div v-else class="rt-grid">
      <RouterLink v-for="t in visibleTypes" :key="t.name" :to="`/${dataset}/${t.name}`" data-rt-card style="text-decoration:none; position:relative">
        <AtlasCard interactive padding="md">
          <div class="text-subtitle-2" style="color:rgb(var(--v-theme-primary))">{{ t.name }}</div>
          <div class="text-caption text-medium-emphasis mt-1">{{ t.count }} {{ t.count === 1 ? "record" : "records" }}</div>
          <AtlasIconButton icon="mdi-plus" ariaLabel="New" class="rt-new" @click.prevent.stop="newOf(t.name)" />
        </AtlasCard>
      </RouterLink>
    </div>

    <AtlasDialog v-model="newPickerOpen" title="New resource" :maxWidth="480" showClose>
      <AtlasAutocomplete
        :modelValue="newPickerType"
        :items="allTypes"
        label="Resource type"
        placeholder="Search resource types…"
        clearable
        @update:modelValue="onPickerSelect"
      />
    </AtlasDialog>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasCard, AtlasAlert, AtlasProgressCircular, AtlasIconButton, AtlasButton, AtlasDialog, AtlasAutocomplete } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";

const props = defineProps<{ dataset: string }>();
const { client, profile } = useFhir(props.dataset);
const router = useRouter();

const allTypes = ref<string[]>([]);
const counts = ref<Record<string, number>>({});
const loading = ref(true);
const error = ref("");
const newPickerOpen = ref(false);
const newPickerType = ref<string | null>(null);

const visibleTypes = computed(() => {
  return Object.entries(counts.value)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
});

function newOf(t: string) {
  if (t === "Questionnaire") router.push(`/${props.dataset}/Questionnaire/new/build`);
  else router.push(`/${props.dataset}/${t}/new/edit`);
}

function onPickerSelect(val: unknown) {
  const t = val as string | null;
  newPickerType.value = t;
  if (t) {
    newPickerOpen.value = false;
    newPickerType.value = null;
    newOf(t);
  }
}

onMounted(async () => {
  try {
    const [types, countsResult] = await Promise.all([
      profile.getResourceTypes(),
      client.getCounts(props.dataset).catch(() => ({ counts: {} as Record<string, number> })),
    ]);
    allTypes.value = types;
    counts.value = countsResult.counts;
  } catch (e) {
    error.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.rt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.rt-new {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
