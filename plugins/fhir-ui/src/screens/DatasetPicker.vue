<template>
  <AtlasPageShell eyebrow="FHIR" title="Datasets">
    <AtlasList>
      <RouterLink v-for="d in datasets" :key="d.id" :to="`/${d.id}`" style="text-decoration:none">
        <AtlasListItem data-dataset>{{ d.name || d.id }}</AtlasListItem>
      </RouterLink>
    </AtlasList>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasList, AtlasListItem } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
const { client } = useFhir();
const datasets = ref<any[]>([]);
onMounted(async () => {
  const res: any = await client.listDatasets();
  datasets.value = Array.isArray(res) ? res : (res?.entry?.map((e: any) => e.resource) ?? []);
});
</script>
