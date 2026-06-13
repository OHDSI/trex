<template>
  <AtlasPageShell eyebrow="Dataset" :title="`Browse ${dataset}`">
    <div class="rt-grid">
      <RouterLink v-for="t in types" :key="t" :to="`/${dataset}/${t}`" data-rt-card style="text-decoration:none">
        <AtlasCard interactive padding="md">
          <div class="text-subtitle-2" style="color:rgb(var(--v-theme-primary))">{{ t }}</div>
          <div class="text-caption text-medium-emphasis">{{ counts[t] ?? "—" }} resources</div>
        </AtlasCard>
      </RouterLink>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasCard } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";

const props = defineProps<{ dataset: string }>();
const { profile } = useFhir(props.dataset);
const types = ref<string[]>([]);
const counts = ref<Record<string, number>>({});

onMounted(async () => { types.value = await profile.getResourceTypes(); });
</script>

<style scoped>.rt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:12px}</style>
