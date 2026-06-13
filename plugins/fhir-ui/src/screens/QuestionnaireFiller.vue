<template>
  <AtlasPageShell :eyebrow="q?.title || 'Questionnaire'" :title="q?.title || 'Form'">
    <div style="max-width:560px;margin:0 auto">
      <AtlasProgressLinear class="mb-4" />
      <AtlasCard padding="md" v-if="q">
        <QuestionnaireRenderer :questionnaire="q" @update:response="response = $event" />
        <div class="d-flex ga-2 mt-2">
          <AtlasButton variant="ghost" @click="submit('in-progress')">Save draft</AtlasButton>
          <AtlasButton variant="primary" data-submit @click="submit('completed')">Submit response</AtlasButton>
        </div>
      </AtlasCard>
      <AtlasAlert v-if="error" severity="danger" :title="error" class="mt-3" />
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasCard, AtlasButton, AtlasProgressLinear, AtlasAlert } from "@atlas-ui";
import QuestionnaireRenderer from "@/engine/QuestionnaireRenderer.vue";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";
import type { FhirResource } from "@/types/fhir";

const props = defineProps<{ dataset: string; id: string }>();
const { client } = useFhir(props.dataset);
const q = ref<any>(null);
const response = ref<any>({});
const error = ref("");

onMounted(async () => { q.value = await client.read(props.dataset, "Questionnaire", props.id); });

async function submit(status: string) {
  error.value = "";
  try {
    await client.create(props.dataset, "QuestionnaireResponse",
      { ...response.value, status, questionnaire: `Questionnaire/${props.id}` } as FhirResource);
  } catch (e) { error.value = e instanceof FhirError ? e.message : String(e); }
}
</script>
