<template>
  <AtlasPageShell :eyebrow="`${type} · ${id}`" :title="`Edit ${type}`">
    <template #actions>
      <AtlasButton variant="ghost" @click="router.back()">Cancel</AtlasButton>
      <AtlasButton variant="primary" data-save :loading="saving" @click="save">Save</AtlasButton>
    </template>

    <AtlasAlert v-if="error" severity="danger" :title="error" class="mb-3" />

    <SDFormRenderer v-if="definition" v-model="draft" :definition="definition" />
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasButton, AtlasAlert } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";
import SDFormRenderer from "@/engine/SDFormRenderer.vue";
import type { ParsedStructureDefinition, FhirResource } from "@/types/fhir";

const props = defineProps<{ dataset: string; type: string; id: string }>();
const { client, profile } = useFhir(props.dataset);
const router = useRouter();

const definition = ref<ParsedStructureDefinition | null>(null);
const draft = ref<FhirResource>({ resourceType: props.type } as FhirResource);
const saving = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  definition.value = await profile.getDefinition(props.type);
  if (props.id !== "new") {
    draft.value = await client.read(props.dataset, props.type, props.id);
  }
});

async function save() {
  saving.value = true; error.value = "";
  try {
    if (props.id === "new") {
      const created = await client.create(props.dataset, props.type, draft.value);
      router.push(`/${props.dataset}/${props.type}/${created.id}/edit`);
    } else {
      await client.update(props.dataset, props.type, props.id, draft.value);
      router.push(`/${props.dataset}/${props.type}`);
    }
  } catch (e) {
    error.value = e instanceof FhirError ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}
</script>
