<template>
  <div class="sd-form-root">
    <div class="sd-form-grid">
      <div
        v-for="el in common"
        :key="el.path"
        :class="['sd-form-cell', { 'span-2': el.isArray || el.children.length > 0 || el.isChoice }]"
      >
        <ElementField :element="el" :base-path="[]" :model="model" @change="onChange" />
      </div>
    </div>

    <div v-if="advanced.length" class="mt-2">
      <button class="advanced-toggle" data-advanced-toggle @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? "Hide" : "Show" }} advanced &amp; rarely-used fields ({{ advanced.length }})
      </button>
      <div v-show="showAdvanced" class="sd-form-grid mt-2">
        <div
          v-for="el in advanced"
          :key="el.path"
          :class="['sd-form-cell', { 'span-2': el.isArray || el.children.length > 0 || el.isChoice }]"
        >
          <ElementField :element="el" :base-path="[]" :model="model" @change="onChange" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, ref, computed } from "vue";
import type { ParsedStructureDefinition, ElementInfo } from "@/types/fhir";
import ElementField from "./ElementField.vue";
import { getAt } from "./fhirPath";
import { choiceProp } from "./choice";

const props = defineProps<{ definition: ParsedStructureDefinition; modelValue: any }>();
const emit = defineEmits<{ "update:modelValue": [any] }>();

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
const model = reactive(deepClone(props.modelValue ?? { resourceType: props.definition.resourceType }));
function onChange() { emit("update:modelValue", deepClone(model)); }
watch(() => props.modelValue, (v) => {
  if (JSON.stringify(v) === JSON.stringify(model)) return;
  Object.assign(model, deepClone(v));
});

const showAdvanced = ref(false);

function hasValue(e: ElementInfo): boolean {
  if (e.isChoice) {
    return e.typeCodes.some((tc) => getAt(model, [choiceProp(e.name, tc)]) != null);
  }
  return getAt(model, [e.name]) != null;
}

// B2: progressive-disclosure: common = required OR has value.
// Fallback: if nothing qualifies, show first 6 so a new/empty resource isn't blank.
const common = computed(() => {
  const els = props.definition.elements;
  const qualified = els.filter((e) => e.min >= 1 || hasValue(e));
  if (qualified.length > 0) return qualified;
  return els.slice(0, 6);
});

const advanced = computed(() => {
  const commonSet = new Set(common.value.map((e) => e.path));
  return props.definition.elements.filter((e) => !commonSet.has(e.path));
});
</script>

<style scoped>
.sd-form-root {
  max-width: 820px;
}

.sd-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
}

.sd-form-cell.span-2 {
  grid-column: 1 / -1;
}

@media (max-width: 700px) {
  .sd-form-grid {
    grid-template-columns: 1fr;
  }
  .sd-form-cell.span-2 {
    grid-column: 1;
  }
}

.advanced-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--v-theme-primary, #6750a4));
  font-size: 0.875rem;
  padding: 0;
  text-decoration: none;
}
.advanced-toggle:hover { text-decoration: underline; }
</style>
