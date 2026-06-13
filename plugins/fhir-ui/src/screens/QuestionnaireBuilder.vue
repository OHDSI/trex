<template>
  <AtlasPageShell eyebrow="Questionnaire" :title="draft.title || 'Questionnaire'">
    <template #actions>
      <AtlasChip v-if="draft.status" tone="warning">{{ draft.status }}</AtlasChip>
      <AtlasButton variant="primary" data-publish :loading="saving" @click="save">Publish</AtlasButton>
    </template>
    <div class="qb">
      <div class="qb-col" data-builder-edit>
        <div class="text-overline mb-2">Structure</div>
        <QuestionnaireItemEditor v-model="draft.item" />
      </div>
      <div class="qb-col preview" data-builder-preview>
        <div class="text-overline mb-2">Live preview</div>
        <AtlasCard padding="md"><QuestionnaireRenderer :questionnaire="draft" /></AtlasCard>
      </div>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasButton, AtlasChip, AtlasCard } from "@atlas-ui";
import QuestionnaireItemEditor from "@/engine/QuestionnaireItemEditor.vue";
import QuestionnaireRenderer from "@/engine/QuestionnaireRenderer.vue";
import { useFhir } from "@/composables/useFhir";

const props = defineProps<{ dataset: string; id: string }>();
const { client } = useFhir(props.dataset);

const draft = ref<any>({ resourceType: "Questionnaire", item: [] });
const saving = ref(false);

onMounted(async () => {
  const q = await client.read(props.dataset, "Questionnaire", props.id);
  if (!q.item) q.item = [];
  draft.value = q;
});

async function save() {
  saving.value = true;
  try {
    await client.update(props.dataset, "Questionnaire", props.id, draft.value);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.qb {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid rgb(var(--v-theme-outline-variant, 0, 0, 0));
  border-radius: 8px;
  overflow: hidden;
}
.qb-col { padding: 16px; }
.qb-col.preview {
  background: rgba(0, 0, 0, 0.02);
  border-left: 1px solid rgb(var(--v-theme-outline-variant, 0, 0, 0));
}
</style>
