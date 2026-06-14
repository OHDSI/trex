<template>
  <ElementField v-for="child in element.children" :key="child.path"
    :element="child" :base-path="basePath" :model="model" @change="$emit('change')" />
</template>
<script setup lang="ts">
import type { ElementInfo } from "@/types/fhir";
import ElementField from "./ElementField.vue";
defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
defineEmits<{ change: [] }>();
</script>
