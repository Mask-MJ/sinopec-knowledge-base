<script setup lang="ts">
import { DEFAULT_HOME_PATH } from '@/config/constants';
import { $t } from '@/locales';

defineOptions({
  name: 'Fallback',
});

const props = withDefaults(
  defineProps<{
    /**
     * 描述
     */
    description?: string;
    /**
     *  @zh_CN 首页路由地址
     *  @default /
     */
    homePath?: string;
    /**
     * @zh_CN 默认显示的图片
     * @default pageNotFoundSvg
     */
    image?: string;
    /**
     *  @zh_CN 内置类型
     */
    status?: '403' | '404' | '500' | 'coming-soon' | 'offline';
    /**
     *  @zh_CN 页面提示语
     */
    title?: string;
  }>(),
  {
    description: '',
    homePath: '/',
    image: '',
    status: 'coming-soon',
    title: '',
  },
);

const Icon403 = defineAsyncComponent(() => import('../icons/icon-403.vue'));
const Icon404 = defineAsyncComponent(() => import('../icons/icon-404.vue'));
const Icon500 = defineAsyncComponent(() => import('../icons/icon-500.vue'));
const IconHello = defineAsyncComponent(
  () => import('../icons/icon-coming-soon.vue'),
);
const IconOffline = defineAsyncComponent(
  () => import('../icons/icon-offline.vue'),
);

const titleText = computed(() => {
  if (props.title) {
    return props.title;
  }

  switch (props.status) {
    case '403': {
      return $t('ui.fallback.forbidden');
    }
    case '404': {
      return $t('ui.fallback.pageNotFound');
    }
    case '500': {
      return $t('ui.fallback.internalError');
    }
    case 'coming-soon': {
      return $t('ui.fallback.comingSoon');
    }
    case 'offline': {
      return $t('ui.fallback.offlineError');
    }
    default: {
      return '';
    }
  }
});

const descText = computed(() => {
  if (props.description) {
    return props.description;
  }
  switch (props.status) {
    case '403': {
      return $t('ui.fallback.forbiddenDesc');
    }
    case '404': {
      return $t('ui.fallback.pageNotFoundDesc');
    }
    case '500': {
      return $t('ui.fallback.internalErrorDesc');
    }
    case 'offline': {
      return $t('ui.fallback.offlineErrorDesc');
    }
    default: {
      return '';
    }
  }
});

const fallbackIcon = computed(() => {
  switch (props.status) {
    case '403': {
      return Icon403;
    }
    case '404': {
      return Icon404;
    }
    case '500': {
      return Icon500;
    }
    case 'coming-soon': {
      return IconHello;
    }
    case 'offline': {
      return IconOffline;
    }
    default: {
      return null;
    }
  }
});

const showBack = computed(() => {
  return props.status === '403' || props.status === '404';
});

const showRefresh = computed(() => {
  return props.status === '500' || props.status === 'offline';
});

const { push } = useRouter();

// 返回首页
function back() {
  push(DEFAULT_HOME_PATH);
}

function refresh() {
  location.reload();
}
</script>

<template>
  <div class="size-full flex flex-col items-center justify-center duration-300">
    <img v-if="image" :src="image" class="md:1/3 w-1/2 lg:w-1/4" />
    <component
      :is="fallbackIcon"
      v-else-if="fallbackIcon"
      class="md:1/3 h-1/3 w-1/2 lg:w-1/4"
    />
    <div class="flex-col-center">
      <slot v-if="$slots.title" name="title"></slot>
      <p
        v-else-if="titleText"
        class="text-foreground mt-8 text-2xl lg:text-4xl md:text-3xl"
      >
        {{ titleText }}
      </p>
      <slot v-if="$slots.describe" name="describe"></slot>
      <p
        v-else-if="descText"
        class="text-muted-foreground md:text-md my-4 lg:text-lg"
      >
        {{ descText }}
      </p>
      <slot v-if="$slots.action" name="action"></slot>
      <NButton v-else-if="showBack" size="large" @click="back">
        <i class="i-lucide:ArrowLeft mr-2 size-4"></i>
        {{ $t('common.backToHome') }}
      </NButton>
      <NButton v-else-if="showRefresh" size="large" @click="refresh">
        <i class="i-lucide:RotateCw mr-2 size-4"></i>
        {{ $t('common.refresh') }}
      </NButton>
    </div>
  </div>
</template>
