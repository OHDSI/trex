<template>
  <div>
    <AtlasCard
      v-for="(it, i) in props.modelValue"
      :key="it.linkId"
      data-q-row
      padding="sm"
      class="mb-2"
      :class="{ 'drag-over': dragOverIndex === i }"
      @dragover.prevent="onDragOver(i)"
      @dragleave="onDragLeave(i)"
      @drop.prevent="onDrop(i)"
    >
      <div class="d-flex ga-3 align-start">
        <span
          class="drag"
          draggable="true"
          @dragstart="onDragStart(i)"
          @dragend="onDragEnd"
        >⠿</span>
        <div class="flex-grow-1">
          <AtlasTextField
            :model-value="it.text"
            :label="it.type === 'group' ? 'Group label' : 'Question text'"
            @update:model-value="patch(i, { text: String($event ?? '') })"
          />
          <div class="d-flex ga-2 mt-1">
            <AtlasSelect
              :model-value="it.type"
              :items="TYPES"
              label="Type"
              style="max-width:160px"
              @update:model-value="patch(i, { type: String($event ?? 'string') })"
            />
            <AtlasCheckbox
              v-if="it.type !== 'group'"
              :model-value="!!it.required"
              label="Required"
              @update:model-value="patch(i, { required: Boolean($event) })"
            />
          </div>
          <!-- Answer options editor: shown only for choice / open-choice questions -->
          <div v-if="it.type === 'choice' || it.type === 'open-choice'" class="mt-2 pl-2 options-editor">
            <div class="text-caption mb-1">Options</div>
            <div
              v-for="(opt, oi) in (it.answerOption ?? [])"
              :key="oi"
              class="d-flex ga-2 align-center mb-1"
              :data-option-row="i"
            >
              <AtlasTextField
                :model-value="opt.valueString ?? ''"
                label="Option"
                @update:model-value="setOption(i, oi, String($event ?? ''))"
              />
              <AtlasIconButton
                icon="mdi-close"
                ariaLabel="Remove option"
                @click="removeOption(i, oi)"
              />
            </div>
            <AtlasButton variant="ghost" size="sm" data-add-option @click="addOption(i)">+ Add option</AtlasButton>
          </div>
          <!-- Nested children editor for group items -->
          <div v-if="it.type === 'group'" class="group-children mt-2">
            <div class="text-caption mb-1">Group items</div>
            <QuestionnaireItemEditor
              :model-value="it.item ?? []"
              @update:model-value="patch(i, { item: $event })"
            />
          </div>
        </div>
        <AtlasIconButton icon="mdi-close" ariaLabel="Remove" @click="remove(i)" />
      </div>
    </AtlasCard>
    <div class="d-flex ga-2 mt-2">
      <AtlasButton variant="primary" data-add-question @click="add('string')">+ Add question</AtlasButton>
      <AtlasButton variant="ghost" data-add-group @click="add('group')">+ Add group</AtlasButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasCard, AtlasTextField, AtlasSelect, AtlasCheckbox, AtlasButton, AtlasIconButton } from "@atlas-ui";
import type { QItem } from "./enableWhen";
// Self-import for recursive nesting — Vue supports this pattern
import QuestionnaireItemEditor from "./QuestionnaireItemEditor.vue";

const TYPES = ["group", "display", "string", "text", "integer", "decimal", "boolean", "date", "choice"];

const props = defineProps<{ modelValue: QItem[] }>();
const emit = defineEmits<{ "update:modelValue": [QItem[]] }>();

// Simple counter-based ID — avoids Date.now() flakiness in tests
let seq = 0;
onMounted(() => {
  for (const it of props.modelValue ?? []) {
    const m = /^q(\d+)$/.exec(it.linkId || "");
    if (m) seq = Math.max(seq, Number(m[1]));
  }
});
function nextId() { return `q${++seq}`; }

function commit(next: QItem[]) { emit("update:modelValue", next); }
function patch(i: number, p: Partial<QItem>) {
  const n = props.modelValue.slice();
  n[i] = { ...n[i], ...p };
  commit(n);
}
function remove(i: number) {
  const n = props.modelValue.slice();
  n.splice(i, 1);
  commit(n);
}
function add(type: string) {
  commit([...props.modelValue, { linkId: nextId(), text: "", type }]);
}

function setOption(i: number, oi: number, text: string) {
  const opts = (props.modelValue[i].answerOption ?? []).slice();
  opts[oi] = { ...opts[oi], valueString: text };
  patch(i, { answerOption: opts });
}
function addOption(i: number) {
  patch(i, { answerOption: [...(props.modelValue[i].answerOption ?? []), { valueString: "" }] });
}
function removeOption(i: number, oi: number) {
  const opts = (props.modelValue[i].answerOption ?? []).slice();
  opts.splice(oi, 1);
  patch(i, { answerOption: opts });
}

// Drag-and-drop reorder (HTML5 native, no extra deps)
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function onDragStart(i: number) {
  dragIndex.value = i;
}
function onDragEnd() {
  dragIndex.value = null;
  dragOverIndex.value = null;
}
function onDragOver(i: number) {
  if (dragIndex.value !== null && dragIndex.value !== i) {
    dragOverIndex.value = i;
  }
}
function onDragLeave(i: number) {
  if (dragOverIndex.value === i) dragOverIndex.value = null;
}
function onDrop(toIndex: number) {
  const fromIndex = dragIndex.value;
  dragIndex.value = null;
  dragOverIndex.value = null;
  if (fromIndex === null || fromIndex === toIndex) return;
  const next = props.modelValue.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  commit(next);
}
</script>

<style scoped>
.drag {
  color: rgb(var(--v-theme-on-surface-variant, 0, 0, 0));
  cursor: grab;
  user-select: none;
}
.drag:active { cursor: grabbing; }
.drag-over {
  border-top: 2px solid rgb(var(--v-theme-primary, 25, 118, 210)) !important;
}
.options-editor { border-left: 2px solid rgba(var(--v-border-color, 0, 0, 0), 0.12); }
.group-children {
  margin-left: 16px;
  border-left: 2px solid rgba(var(--v-border-color, 0, 0, 0), 0.2);
  padding-left: 12px;
}
</style>
