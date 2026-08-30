<template>
  <AtlasSwitch :model-value="!!modelValue" :label="label" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasSwitch } from "@atlas-ui";
defineProps<{ modelValue?: boolean; label?: string }>();
defineEmits<{ "update:modelValue": [boolean] }>();
</script>
