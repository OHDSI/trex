<template>
  <div>
    <template v-for="item in flatItems" :key="item.linkId">
      <div v-if="enabled(item)" :data-q="item.linkId" class="mb-4">
        <div class="text-body-2 font-weight-medium mb-1">{{ item.text }}<span v-if="item.required" class="req"> *</span></div>

        <AtlasRadioGroup v-if="item.type === 'choice'" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)">
          <AtlasRadio v-for="opt in options(item)" :key="opt.value" :label="opt.label" :value="opt.value" />
        </AtlasRadioGroup>

        <AtlasSwitch v-else-if="item.type === 'boolean'" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)" />

        <AtlasTextField v-else :type="inputType(item.type)" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { AtlasTextField, AtlasSwitch, AtlasRadioGroup, AtlasRadio } from "@atlas-ui";
import { isEnabled, type QItem } from "./enableWhen";

const props = defineProps<{ questionnaire: { item?: QItem[] } }>();
const emit = defineEmits<{ "update:response": [any] }>();

const answers = reactive<Record<string, any>>({});
const flatItems = computed(() => flatten(props.questionnaire.item ?? []));
function flatten(items: QItem[]): QItem[] { return items.flatMap((i) => [i, ...(i.item ? flatten(i.item) : [])]); }

function enabled(item: QItem) { return isEnabled(item, answers); }
function options(item: QItem) { return (item.answerOption ?? []).map((o) => ({ value: o.valueString ?? o.valueCoding?.code ?? "", label: o.valueString ?? o.valueCoding?.display ?? o.valueCoding?.code ?? "" })); }
function inputType(t: string) { return t === "integer" || t === "decimal" ? "number" : t === "date" ? "date" : "text"; }
function set(linkId: string, v: any) { answers[linkId] = v; }

watch(answers, () => {
  emit("update:response", {
    resourceType: "QuestionnaireResponse", status: "in-progress",
    item: flatItems.value.filter(enabled).filter((i) => answers[i.linkId] != null)
      .map((i) => ({ linkId: i.linkId, answer: [{ valueString: String(answers[i.linkId]) }] })),
  });
}, { deep: true });

defineExpose({ answers });
</script>

<style scoped>.req{color:rgb(var(--v-theme-accent,#eb6622));font-weight:700}</style>
