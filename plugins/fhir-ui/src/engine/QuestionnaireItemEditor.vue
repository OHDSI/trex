<template>
  <div>
    <!-- Drag-reorder is deferred to a follow-up (vuedraggable); only add/remove/edit implemented now -->
    <AtlasCard v-for="(it, i) in props.modelValue" :key="it.linkId" data-q-row padding="sm" class="mb-2">
      <div class="d-flex ga-3 align-start">
        <span class="drag">⠿</span>
        <div class="flex-grow-1">
          <AtlasTextField
            :model-value="it.text"
            label="Question text"
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
              :model-value="!!it.required"
              label="Required"
              @update:model-value="patch(i, { required: Boolean($event) })"
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
import { onMounted } from "vue";
import { AtlasCard, AtlasTextField, AtlasSelect, AtlasCheckbox, AtlasButton, AtlasIconButton } from "@atlas-ui";
import type { QItem } from "./enableWhen";

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
</script>

<style scoped>
.drag { color: rgb(var(--v-theme-on-surface-variant, 0, 0, 0)); }
</style>
