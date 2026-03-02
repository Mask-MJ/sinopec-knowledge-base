<script setup lang="ts">
import { NAvatar } from 'naive-ui';
import { computed } from 'vue';

interface Props {
  size?: 'large' | 'medium' | 'small' | number;
  src?: null | string;
  username?: null | string;
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  username: '',
  size: 48,
});

// 计算头像显示的首字符（大写）
const itemsText = computed(() => {
  return props.username && props.username.length > 0
    ? props.username[0]?.toUpperCase()
    : 'U';
});
</script>

<template>
  <NAvatar
    round
    :size="props.size"
    :src="props.src || undefined"
    :fallback-src="undefined"
  >
    <!-- 当图片加载失败或没有src时，NAvatar会显示插槽内容 -->
    {{ itemsText }}
  </NAvatar>
</template>
