<template>
  <AtlasPageShell eyebrow="FHIR" title="Datasets">
    <AtlasProgressCircular v-if="loading" indeterminate class="mt-4" />
    <AtlasAlert v-else-if="error" data-error severity="danger" :title="error" class="mt-4" />
    <div v-else-if="datasets.length === 0" class="text-body-2 text-medium-emphasis mt-4">No datasets</div>
    <AtlasList v-else>
      <RouterLink v-for="d in datasets" :key="d.id" :to="`/${d.id}`" style="text-decoration:none">
        <AtlasListItem data-dataset>{{ d.name || d.id }}</AtlasListItem>
      </RouterLink>
    </AtlasList>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasList, AtlasListItem, AtlasAlert, AtlasProgressCircular } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";

const { client } = useFhir();
const datasets = ref<any[]>([]);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    const res: any = await client.listDatasets();
    datasets.value = Array.isArray(res) ? res : (res?.entry?.map((e: any) => e.resource) ?? []);
  } catch (e) {
    error.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});
</script>
