<template>
  <div>
    <template v-for="el in common" :key="el.path">
      <ElementField :element="el" :base-path="[]" :model="model" @change="onChange" />
    </template>
    <div v-if="advanced.length">
      <AtlasButton variant="link" data-advanced-toggle @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? "Hide" : "Show" }} advanced &amp; rarely-used fields ({{ advanced.length }})
      </AtlasButton>
      <div v-show="showAdvanced">
        <ElementField v-for="el in advanced" :key="el.path" :element="el" :base-path="[]" :model="model" @change="onChange" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import type { ParsedStructureDefinition } from "@/types/fhir";
import ElementField from "./ElementField.vue";
import { AtlasButton } from "@atlas-ui";
import { getAt } from "./fhirPath";

const props = defineProps<{ definition: ParsedStructureDefinition; modelValue: any }>();
const emit = defineEmits<{ "update:modelValue": [any] }>();

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
const model = reactive(deepClone(props.modelValue ?? { resourceType: props.definition.resourceType }));
function onChange() { emit("update:modelValue", deepClone(model)); }
watch(() => props.modelValue, (v) => { Object.assign(model, deepClone(v)); });

const showAdvanced = ref(false);
const common = computed(() => props.definition.elements.filter((e) => e.min >= 1 || getAt(model, [e.name]) != null));
const advanced = computed(() => props.definition.elements.filter((e) => !(e.min >= 1 || getAt(model, [e.name]) != null)));
</script>
