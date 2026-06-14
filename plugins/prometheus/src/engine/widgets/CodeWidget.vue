<template>
  <AtlasSelect v-if="options?.length" :model-value="modelValue" :items="options" :label="label"
    @update:model-value="$emit('update:modelValue', $event)" />
  <AtlasTextField v-else :model-value="modelValue" :label="label"
    @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasSelect, AtlasTextField } from "@atlas-ui";
defineProps<{ modelValue?: string; label?: string; options?: string[] }>();
defineEmits<{ "update:modelValue": [string | number | unknown] }>();
</script>
