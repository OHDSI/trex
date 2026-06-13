<template>
  <!-- repeating element: list of instances + add button -->
  <div v-if="element.isArray" :data-repeat="element.path" class="mb-3">
    <div class="text-caption font-weight-medium mb-1">{{ label }}<span v-if="required" data-req class="req"> *</span></div>
    <AtlasCard v-for="(_, i) in arr" :key="i" padding="sm" class="mb-2">
      <ElementBody :element="element" :base-path="[...basePath, element.name, i]" :model="model" @change="$emit('change')" />
      <template #append><AtlasIconButton icon="mdi-close" ariaLabel="Remove" @click="removeAt(i)" :data-remove="element.path" /></template>
    </AtlasCard>
    <AtlasButton variant="link" :data-add="element.path" @click="add">+ Add {{ element.name }}</AtlasButton>
  </div>

  <!-- single complex/backbone element: nested card -->
  <AtlasCard v-else-if="hasChildren" padding="sm" class="mb-3">
    <div class="text-caption font-weight-medium mb-2">{{ label }}<span v-if="required" data-req class="req"> *</span></div>
    <ElementBody :element="element" :base-path="[...basePath, element.name]" :model="model" @change="$emit('change')" />
  </AtlasCard>

  <!-- single leaf element: widget -->
  <div v-else :data-field="element.path" :data-required="String(required)" class="mb-3">
    <component :is="widget" :model-value="leafValue" :label="label"
      @update:model-value="setLeaf($event)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AtlasCard, AtlasButton, AtlasIconButton } from "@atlas-ui";
import type { ElementInfo } from "@/types/fhir";
import { widgetFor } from "./widgetRegistry";
import { getAt, setAt } from "./fhirPath";
import StringWidget from "./widgets/StringWidget.vue";
import ElementBody from "./ElementBody.vue";

const props = defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
const emit = defineEmits<{ change: [] }>();

const label = computed(() => props.element.name);
const required = computed(() => props.element.min >= 1);
const hasChildren = computed(() => props.element.children.length > 0);
const widget = computed(() => widgetFor(props.element.typeCodes[0]) ?? StringWidget);

const fullPath = computed(() => [...props.basePath, props.element.name]);
const leafValue = computed(() => getAt(props.model, fullPath.value));
function setLeaf(v: any) { setAt(props.model, fullPath.value, v); emit("change"); }

const arr = computed<any[]>(() => getAt(props.model, fullPath.value) ?? []);
function add() { const a = arr.value.slice(); a.push(hasChildren.value ? {} : ""); setAt(props.model, fullPath.value, a); emit("change"); }
function removeAt(i: number) { const a = arr.value.slice(); a.splice(i, 1); setAt(props.model, fullPath.value, a); emit("change"); }
</script>

<style scoped>.req{color:rgb(var(--v-theme-accent,#eb6622));font-weight:700}</style>
