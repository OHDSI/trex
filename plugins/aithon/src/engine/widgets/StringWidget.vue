<template>
  <AtlasTextField :model-value="modelValue" :label="label" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasTextField } from "@atlas-ui";
defineProps<{ modelValue?: string; label?: string }>();
defineEmits<{ "update:modelValue": [string | number] }>();
</script>
