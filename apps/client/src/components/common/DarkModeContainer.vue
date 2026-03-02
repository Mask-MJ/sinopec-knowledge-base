<script setup lang="ts">
defineProps({ inverted: { type: Boolean, default: false } });
</script>

<template>
  <div
    class="transition-all duration-300 ease-in-out dark:bg-[#18181c] dark:text-white dark:text-opacity-82"
    :class="inverted ? 'bg-[#001428] text-white' : 'bg-white text-[#333639]'"
  >
    <slot></slot>
  </div>
</template>
