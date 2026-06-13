<template>
  <AtlasPageShell :eyebrow="eyebrow" :title="title">
    <template #actions>
      <AtlasButton variant="ghost" @click="router.back()">Cancel</AtlasButton>
      <AtlasButton v-if="!loading && !loadError" variant="primary" data-save :loading="saving" @click="save">Save</AtlasButton>
    </template>

    <template v-if="loading">
      <AtlasProgressCircular />
    </template>

    <template v-else-if="loadError">
      <AtlasAlert severity="danger" :title="loadError" data-load-error class="mb-3" />
    </template>

    <template v-else>
      <AtlasAlert v-if="error" severity="danger" :title="error" data-error class="mb-3" />
      <SDFormRenderer v-if="definition" v-model="draft" :definition="definition" />
    </template>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasButton, AtlasAlert, AtlasProgressCircular } from "@atlas-ui";
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
const loading = ref(true);
const loadError = ref<string | null>(null);

const isNew = computed(() => props.id === "new");
const eyebrow = computed(() => isNew.value ? props.type : `${props.type} · ${props.id}`);
const title = computed(() => isNew.value ? `New ${props.type}` : `Edit ${props.type}`);

onMounted(async () => {
  definition.value = await profile.getDefinition(props.type);
  if (!isNew.value) {
    try {
      draft.value = await client.read(props.dataset, props.type, props.id);
    } catch (e) {
      loadError.value = e instanceof FhirError ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  } else {
    loading.value = false;
  }
});

async function save() {
  saving.value = true; error.value = "";
  try {
    if (isNew.value) {
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
