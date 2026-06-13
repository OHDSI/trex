<template>
  <AtlasPageShell eyebrow="Dataset" :title="`Browse ${dataset}`">
    <AtlasProgressCircular v-if="loading" indeterminate class="mt-4" />
    <AtlasAlert v-else-if="error" data-error severity="danger" :title="error" class="mt-4" />
    <div v-else-if="types.length === 0" class="text-body-2 text-medium-emphasis mt-4">No resource types</div>
    <div v-else class="rt-grid">
      <RouterLink v-for="t in types" :key="t" :to="`/${dataset}/${t}`" data-rt-card style="text-decoration:none">
        <AtlasCard interactive padding="md">
          <div class="text-subtitle-2" style="color:rgb(var(--v-theme-primary))">{{ t }}</div>
        </AtlasCard>
      </RouterLink>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasCard, AtlasAlert, AtlasProgressCircular } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";

const props = defineProps<{ dataset: string }>();
const { profile } = useFhir(props.dataset);
const types = ref<string[]>([]);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    types.value = await profile.getResourceTypes();
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
</style>
