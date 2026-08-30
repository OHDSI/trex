<template>
  <div>
    <QuestionnaireRenderItem
      v-for="item in (props.questionnaire.item ?? [])"
      :key="item.linkId"
      :item="item"
      :answers="answers"
      @set="set"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { isEnabled, type QItem } from "./enableWhen";
import QuestionnaireRenderItem from "./QuestionnaireRenderItem.vue";

const props = defineProps<{ questionnaire: { item?: QItem[] } }>();
const emit = defineEmits<{ "update:response": [any] }>();

const answers = reactive<Record<string, any>>({});

// Flatten tree to leaf (non-group answerable) items for the response
function flatLeaves(items: QItem[]): QItem[] {
  return items.flatMap((i) =>
    i.type === "group" ? flatLeaves(i.item ?? []) : [i]
  );
}

const leafItems = computed(() => flatLeaves(props.questionnaire.item ?? []));

function set(linkId: string, v: any) { answers[linkId] = v; }

function answerValue(item: QItem, v: any) {
  if (item.type === "boolean") return { valueBoolean: Boolean(v) };
  if (item.type === "integer") return { valueInteger: Number(v) };
  if (item.type === "decimal") return { valueDecimal: Number(v) };
  return { valueString: String(v) };
}

watch(answers, () => {
  emit("update:response", {
    resourceType: "QuestionnaireResponse", status: "in-progress",
    item: leafItems.value
      .filter((i) => isEnabled(i, answers))
      .filter((i) => answers[i.linkId] != null)
      .map((i) => ({ linkId: i.linkId, answer: [answerValue(i, answers[i.linkId])] })),
  });
}, { deep: true });
</script>
