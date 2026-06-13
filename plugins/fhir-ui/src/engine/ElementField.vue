<template>
  <!-- repeating element: list of instances + add button -->
  <div v-if="element.isArray" :data-repeat="element.path" class="mb-3">
    <div class="text-caption font-weight-medium mb-1">{{ label }}<span v-if="required" data-req class="req"> *</span></div>

    <!-- complex array: render nested card with children via ElementBody -->
    <template v-if="hasChildren">
      <div v-for="(_, i) in arr" :key="i" class="repeat-card mb-2">
        <div class="repeat-card__inner">
          <ElementBody :element="element" :base-path="[...basePath, element.name, i]" :model="model" @change="$emit('change')" />
        </div>
        <button class="repeat-card__remove" :data-remove="element.path" @click="removeAt(i)" aria-label="Remove">✕</button>
      </div>
    </template>

    <!-- primitive array: render one leaf widget per item -->
    <template v-else>
      <div v-for="(_, i) in arr" :key="i" :data-field="element.path" class="primitive-repeat-item mb-2">
        <component
          :is="widget"
          :model-value="getAt(model, [...basePath, element.name, i])"
          :label="label + (required ? ' *' : '')"
          @update:model-value="setPrimAt(i, $event)"
        />
        <button class="repeat-card__remove" :data-remove="element.path" @click="removeAt(i)" aria-label="Remove">✕</button>
      </div>
    </template>

    <button class="link-btn" :data-add="element.path" @click="add">+ Add {{ humanLabel }}</button>
  </div>

  <!-- single complex/backbone element: nested card (lighter) -->
  <div v-else-if="hasChildren" class="group-card mb-3">
    <div class="group-card__label text-caption font-weight-medium mb-1">{{ label }}<span v-if="required" data-req class="req"> *</span></div>
    <ElementBody :element="element" :base-path="[...basePath, element.name]" :model="model" @change="$emit('change')" />
  </div>

  <!-- single leaf element: widget -->
  <div v-else :data-field="element.path" :data-required="String(required)" class="mb-3">
    <component :is="widget" :model-value="leafValue" :label="label"
      @update:model-value="setLeaf($event)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ElementInfo } from "@/types/fhir";
import { widgetFor } from "./widgetRegistry";
import { getAt, setAt } from "./fhirPath";
import StringWidget from "./widgets/StringWidget.vue";
import ElementBody from "./ElementBody.vue";
import { humanize } from "@/utils/humanize";

const props = defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
const emit = defineEmits<{ change: [] }>();

const humanLabel = computed(() => humanize(props.element.name));
const required = computed(() => props.element.min >= 1);
const hasChildren = computed(() => props.element.children.length > 0);
const widget = computed(() => widgetFor(props.element.typeCodes[0]) ?? StringWidget);

// For required-aware leaf label: show asterisk inline in the label string
const label = computed(() => {
  const base = humanLabel.value;
  // For leaf fields we embed * in the label string (floating label support).
  // For array/nested the template renders a separate <span> so just return base here.
  return props.element.isArray || hasChildren.value
    ? base
    : base + (required.value ? " *" : "");
});

const fullPath = computed(() => [...props.basePath, props.element.name]);
const leafValue = computed(() => getAt(props.model, fullPath.value));
function setLeaf(v: any) { setAt(props.model, fullPath.value, v); emit("change"); }

const arr = computed<any[]>(() => getAt(props.model, fullPath.value) ?? []);
function add() { const a = arr.value.slice(); a.push(hasChildren.value ? {} : ""); setAt(props.model, fullPath.value, a); emit("change"); }
function removeAt(i: number) { const a = arr.value.slice(); a.splice(i, 1); setAt(props.model, fullPath.value, a); emit("change"); }
function setPrimAt(i: number, v: any) { const a = arr.value.slice(); a[i] = v; setAt(props.model, fullPath.value, a); emit("change"); }
</script>

<style scoped>
.req { color: rgb(var(--v-theme-accent, #eb6622)); font-weight: 700; }

/* Lighter group cards replacing AtlasCard */
.group-card {
  border: 1px solid rgb(var(--v-theme-outline-variant, #cac4d0));
  border-radius: 8px;
  padding: 10px 12px;
}
.group-card__label {
  color: rgb(var(--v-theme-on-surface-variant, #49454f));
}

/* Repeating complex item card */
.repeat-card {
  border: 1px solid rgb(var(--v-theme-outline-variant, #cac4d0));
  border-radius: 8px;
  padding: 10px 12px;
  position: relative;
}
.repeat-card__inner {
  padding-right: 28px;
}
.repeat-card__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--v-theme-on-surface-variant, #49454f));
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
}
.repeat-card__remove:hover { color: rgb(var(--v-theme-error, #b3261e)); }

/* Primitive repeat items */
.primitive-repeat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.primitive-repeat-item > :first-child { flex: 1; }

/* Link-style add button */
.link-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--v-theme-primary, #6750a4));
  font-size: 0.875rem;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
</style>
