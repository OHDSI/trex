<template>
  <!-- repeating element: list of instances + add button -->
  <div v-if="element.isArray" :data-repeat="element.path" class="field-block">
    <div class="section-label">{{ humanLabel }}<span v-if="required" data-req class="req"> *</span></div>

    <!-- complex array: render nested card with children via ElementBody -->
    <template v-if="hasChildren">
      <AtlasCard v-for="(_, i) in arr" :key="i" padding="sm" class="repeat-card">
        <div class="repeat-card__inner">
          <ElementBody :element="element" :base-path="[...basePath, element.name, i]" :model="model" @change="$emit('change')" />
        </div>
        <button class="card-remove" :data-remove="element.path" @click="removeAt(i)" aria-label="Remove">✕</button>
      </AtlasCard>
    </template>

    <!-- primitive array: standard Atlas field per item -->
    <template v-else>
      <div v-for="(_, i) in arr" :key="i" :data-field="element.path" class="primitive-repeat-item">
        <component
          :is="widget"
          :model-value="getAt(model, [...basePath, element.name, i])"
          :label="humanLabel"
          @update:model-value="setPrimAt(i, $event)"
        />
        <button class="card-remove card-remove--inline" :data-remove="element.path" @click="removeAt(i)" aria-label="Remove">✕</button>
      </div>
    </template>

    <button class="add-btn" :data-add="element.path" @click="add">＋ Add {{ humanLabel.toLowerCase() }}</button>
  </div>

  <!-- single complex/backbone element: nested card -->
  <div v-else-if="hasChildren" class="field-block">
    <div class="section-label">{{ humanLabel }}<span v-if="required" data-req class="req"> *</span></div>
    <AtlasCard padding="sm" class="group-card">
      <ElementBody :element="element" :base-path="[...basePath, element.name]" :model="model" @change="$emit('change')" />
    </AtlasCard>
  </div>

  <!-- choice [x] element: type picker + per-type rendering -->
  <div
    v-else-if="element.isChoice"
    :data-field="element.path"
    :data-choice-type="chosenType"
    :data-required="String(required)"
    class="field-block"
  >
    <div class="section-label">{{ humanLabel }}<span v-if="required" data-req class="req"> *</span></div>
    <AtlasSelect
      :model-value="chosenType"
      :items="element.typeCodes"
      :label="humanLabel + ' type'"
      @update:model-value="onChoiceTypeChange($event)"
    />
    <!-- primitive choice type -->
    <component
      v-if="!isComplexChoiceType"
      :is="choiceWidget"
      :model-value="getAt(model, fullChoicePath)"
      :label="humanLabel"
      @update:model-value="setChoiceValue($event)"
    />
    <!-- complex choice type with known children -->
    <AtlasCard v-else-if="choiceChildren.length" padding="sm" class="group-card choice-group">
      <ElementField
        v-for="child in choiceChildren"
        :key="child.path"
        :element="child"
        :base-path="fullChoicePath"
        :model="model"
        @change="$emit('change')"
      />
    </AtlasCard>
    <!-- complex choice type without children definition -->
    <p v-else class="choice-no-fields">No editable fields for {{ chosenType }}</p>
  </div>

  <!-- single leaf element: standard Atlas field with its floating label -->
  <div v-else :data-field="element.path" :data-required="String(required)" class="field-block">
    <component :is="widget" :model-value="leafValue" :label="leafLabel"
      @update:model-value="setLeaf($event)" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ElementInfo } from "@/types/fhir";
import { widgetFor } from "./widgetRegistry";
import { getAt, setAt } from "./fhirPath";
import { activeChoiceType, choiceProp } from "./choice";
import StringWidget from "./widgets/StringWidget.vue";
import ElementBody from "./ElementBody.vue";
import { AtlasCard, AtlasSelect } from "@atlas-ui";
import { humanize } from "@/utils/humanize";

const props = defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
const emit = defineEmits<{ change: [] }>();

const humanLabel = computed(() => humanize(props.element.name));
const required = computed(() => props.element.min >= 1);
const hasChildren = computed(() => props.element.children.length > 0);
const widget = computed(() => widgetFor(props.element.typeCodes[0]) ?? StringWidget);
const leafLabel = computed(() => humanLabel.value + (required.value ? " *" : ""));

const fullPath = computed(() => [...props.basePath, props.element.name]);
const leafValue = computed(() => getAt(props.model, fullPath.value));
function setLeaf(v: any) { setAt(props.model, fullPath.value, v); emit("change"); }

const arr = computed<any[]>(() => getAt(props.model, fullPath.value) ?? []);
function add() { const a = arr.value.slice(); a.push(hasChildren.value ? {} : ""); setAt(props.model, fullPath.value, a); emit("change"); }
function removeAt(i: number) { const a = arr.value.slice(); a.splice(i, 1); setAt(props.model, fullPath.value, a); emit("change"); }
function setPrimAt(i: number, v: any) { const a = arr.value.slice(); a[i] = v; setAt(props.model, fullPath.value, a); emit("change"); }

// --- choice [x] support ---

const chosenType = ref(
  props.element.isChoice
    ? activeChoiceType(props.model, props.basePath, props.element.name, props.element.typeCodes)
    : (props.element.typeCodes[0] ?? ""),
);

// Keep chosenType in sync if model changes externally (e.g. parent resets)
watch(
  () => props.element.isChoice
    ? activeChoiceType(props.model, props.basePath, props.element.name, props.element.typeCodes)
    : null,
  (newType) => { if (newType != null && newType !== chosenType.value) chosenType.value = newType; },
);

function onChoiceTypeChange(raw: unknown) {
  const newType = String(raw);
  // Clear all sibling value<Type> props so only one is set
  for (const tc of props.element.typeCodes) {
    const prop = choiceProp(props.element.name, tc);
    setAt(props.model, [...props.basePath, prop], undefined);
  }
  chosenType.value = newType;
  emit("change");
}

const fullChoicePath = computed(() =>
  [...props.basePath, choiceProp(props.element.name, chosenType.value)],
);

const isComplexChoiceType = computed(() => widgetFor(chosenType.value) == null);

const choiceWidget = computed(() => widgetFor(chosenType.value) ?? StringWidget);

const choiceChildren = computed(() =>
  props.element.childrenByType?.[chosenType.value] ?? [],
);

function setChoiceValue(v: any) {
  setAt(props.model, fullChoicePath.value, v);
  emit("change");
}
</script>

<style scoped>
.field-block { margin-bottom: 12px; }

.req { color: rgb(var(--v-theme-accent, #eb6622)); font-weight: 700; }

/* Section header above a group / repeating element (chrome only — not the control) */
.section-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-on-surface-variant, #49454f));
  margin-bottom: 6px;
  opacity: 0.85;
}

/* Nested group container (real AtlasCard provides the elevated surface) */
.group-card :deep(.atlas-card),
.group-card.atlas-card { padding-bottom: 2px; }

/* Repeating complex item card */
.repeat-card { position: relative; margin-bottom: 10px; }
.repeat-card :deep(.atlas-card),
.repeat-card.atlas-card { padding-bottom: 2px; }
.repeat-card__inner { padding-right: 24px; }

.card-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--v-theme-on-surface-variant, #49454f));
  font-size: 12px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.6;
}
.card-remove:hover { color: rgb(var(--v-theme-error, #b3261e)); background: rgba(var(--v-theme-error), 0.08); opacity: 1; }
.card-remove--inline { position: static; }

/* Primitive repeat items */
.primitive-repeat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.primitive-repeat-item > :first-child { flex: 1; }

/* Add button — subtle accent pill (chrome) */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px dashed rgba(var(--v-theme-primary), 0.4);
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;
  margin-top: 2px;
}
.add-btn:hover { background: rgba(var(--v-theme-primary), 0.06); border-color: rgb(var(--v-theme-primary)); }

/* Choice group sub-card spacing */
.choice-group { margin-top: 8px; }

/* Muted note for complex types without childrenByType */
.choice-no-fields {
  font-size: 12px;
  color: rgb(var(--v-theme-on-surface-variant, #49454f));
  opacity: 0.7;
  margin: 8px 0 0;
}
</style>
