<template>
  <div v-if="enabled" :data-q="item.type !== 'group' ? item.linkId : undefined" class="mb-4">
    <!-- Group: render heading then recurse into children -->
    <template v-if="item.type === 'group'">
      <div class="text-subtitle-1 font-weight-medium mb-2">{{ item.text }}</div>
      <div class="group-children">
        <QuestionnaireRenderItem
          v-for="child in (item.item ?? [])"
          :key="child.linkId"
          :item="child"
          :answers="answers"
          @set="(linkId, v) => emit('set', linkId, v)"
        />
      </div>
    </template>

    <!-- Answerable items -->
    <template v-else>
      <div class="text-body-2 font-weight-medium mb-1">
        {{ item.text }}<span v-if="item.required" class="req"> *</span>
      </div>

      <AtlasRadioGroup v-if="item.type === 'choice'" :model-value="answers[item.linkId]"
        @update:model-value="emit('set', item.linkId, $event)">
        <AtlasRadio v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" />
      </AtlasRadioGroup>

      <AtlasSwitch v-else-if="item.type === 'boolean'" :model-value="answers[item.linkId]"
        @update:model-value="emit('set', item.linkId, $event)" />

      <div v-else-if="item.type === 'display'" class="text-body-2">{{ item.text }}</div>

      <AtlasTextField v-else :type="inputType" :model-value="answers[item.linkId]"
        @update:model-value="emit('set', item.linkId, $event)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AtlasTextField, AtlasSwitch, AtlasRadioGroup, AtlasRadio } from "@atlas-ui";
import { isEnabled, type QItem } from "./enableWhen";
// Self-import for recursive nesting
import QuestionnaireRenderItem from "./QuestionnaireRenderItem.vue";

const props = defineProps<{
  item: QItem;
  answers: Record<string, any>;
}>();

const emit = defineEmits<{
  set: [linkId: string, value: any];
}>();

const enabled = computed(() => isEnabled(props.item, props.answers));

const options = computed(() =>
  (props.item.answerOption ?? []).map((o) => ({
    value: o.valueString ?? o.valueCoding?.code ?? "",
    label: o.valueString ?? o.valueCoding?.display ?? o.valueCoding?.code ?? "",
  }))
);

const inputType = computed(() => {
  const t = props.item.type;
  return t === "integer" || t === "decimal" ? "number" : t === "date" ? "date" : "text";
});
</script>

<style scoped>
.req { color: rgb(var(--v-theme-accent, #eb6622)); font-weight: 700; }
.group-children {
  margin-left: 16px;
  border-left: 2px solid rgba(var(--v-border-color, 0, 0, 0), 0.12);
  padding-left: 12px;
}
</style>
