<script setup lang="ts">
import type { Reference } from '@/composables';

import MarkdownRender from 'markstream-vue';

import logoUrl from '@/assets/logo.png';
import { useCitationRenderer } from '@/composables/useCitationRenderer';

import CitationPopover from './CitationPopover.vue';
import ReferenceSourceList from './ReferenceSourceList.vue';

import 'markstream-vue/index.css';

const props = defineProps<{
  avatar?: string;
  content: string;
  loading?: boolean;
  reasoning?: string;
  reference?: Reference;
  role: 'assistant' | 'user';
  thinkingStatus?: 'end' | 'start' | 'thinking';
}>();

const thinkingOpen = ref(false);
const bubbleRef = ref<HTMLElement | null>(null);

const {
  activeCitation,
  replaceCitationMarkers,
  handleClick: handleCitationClick,
  closeCitation,
} = useCitationRenderer();

// Force MarkdownRender to remount when restored from KeepAlive cache
const renderKey = ref(0);
onActivated(() => {
  renderKey.value++;
});

// MarkdownRender (markstream-vue) renders asynchronously; onUpdated may fire
// before the final markdown chunk hits the DOM, so [ID:N] markers can slip
// past replacement. A MutationObserver tied to bubbleRef catches every DOM
// mutation — including async markdown renders that follow Vue's update tick.
let citationObserver: MutationObserver | null = null;
onMounted(() => {
  if (props.role !== 'assistant' || !bubbleRef.value) return;
  citationObserver = new MutationObserver(() => {
    if (bubbleRef.value) replaceCitationMarkers(bubbleRef.value);
  });
  citationObserver.observe(bubbleRef.value, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // Initial pass in case content was already rendered before the observer
  // attached (e.g. when restoring history).
  replaceCitationMarkers(bubbleRef.value);
});
onUnmounted(() => citationObserver?.disconnect());
</script>

<template>
  <div
    class="chat-bubble flex gap-3"
    :class="role === 'user' ? 'flex-row-reverse' : 'flex-row'"
  >
    <!-- Avatar -->
    <n-avatar
      v-if="role === 'assistant'"
      round
      :size="36"
      class="ai-avatar shrink-0"
    >
      <n-icon size="20">
        <i class="i-ant-design:robot-outlined"></i>
      </n-icon>
    </n-avatar>
    <n-avatar
      v-else
      round
      :size="36"
      :src="avatar || logoUrl"
      class="shrink-0"
    />

    <!-- Bubble content -->
    <div
      ref="bubbleRef"
      class="bubble-content min-w-0"
      :class="role === 'assistant' ? 'bubble-ai' : 'bubble-user'"
      @click="handleCitationClick"
    >
      <!-- Thinking block -->
      <div v-if="reasoning && role === 'assistant'" class="thinking-block mb-2">
        <div
          class="flex cursor-pointer items-center gap-1.5 text-xs opacity-60"
          @click="thinkingOpen = !thinkingOpen"
        >
          <i
            class="transition-transform duration-200"
            :class="
              thinkingOpen
                ? 'i-ant-design:down-outlined'
                : 'i-ant-design:right-outlined'
            "
          ></i>
          <span
            v-if="thinkingStatus === 'thinking'"
            class="flex items-center gap-1"
          >
            {{ $t('page.assistant.chat.thinking', '思考中') }}
            <span class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </span>
          <span v-else>{{
            $t('page.assistant.chat.thinkingDone', '思考过程')
          }}</span>
        </div>
        <div
          v-show="thinkingOpen"
          class="thinking-content mt-1.5 text-sm leading-relaxed opacity-70"
        >
          {{ reasoning }}
        </div>
      </div>

      <!-- AI Markdown content -->
      <MarkdownRender
        v-if="content && role === 'assistant'"
        :key="renderKey"
        custom-id="chat"
        :content="content"
        :final="!loading"
        :max-live-nodes="0"
      />

      <!-- User text content -->
      <div
        v-if="content && role === 'user'"
        class="whitespace-pre-wrap leading-relaxed"
      >
        {{ content }}
      </div>

      <!-- Loading indicator -->
      <div v-if="loading && !content" class="loading-dots py-1">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <!-- Reference source list -->
      <ReferenceSourceList
        v-if="reference && !loading && role === 'assistant'"
        :reference="reference"
      />
    </div>

    <!-- Citation popover (positioned by x/y) -->
    <CitationPopover
      v-if="activeCitation"
      :index="activeCitation.index"
      :reference="reference"
      :x="activeCitation.x"
      :y="activeCitation.y"
      @close="closeCitation"
    />
  </div>
</template>

<style scoped lang="scss">
.ai-avatar {
  background: linear-gradient(
    135deg,
    rgb(var(--primary-color)) 0%,
    rgb(var(--primary-400-color)) 100%
  );
  color: #fff;
}

.bubble-content {
  max-width: 75%;
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.6;
  transition: background-color 0.2s ease;
}

.bubble-ai {
  background: rgb(var(--primary-50-color));
  border-top-left-radius: 2px;
  min-width: 120px;
}

.bubble-user {
  background: rgb(var(--primary-100-color));
  border-top-right-radius: 2px;
}

:root.dark .bubble-ai,
html.dark .bubble-ai {
  background: rgba(var(--primary-color), 0.08);
}

:root.dark .bubble-user,
html.dark .bubble-user {
  background: rgba(var(--primary-color), 0.15);
}

.thinking-block {
  border-left: 3px solid rgb(var(--primary-color));
  padding-left: 10px;
}

:deep(.citation-mark) {
  display: inline;
  font-size: 0.7em;
  color: rgb(var(--primary-color));
  cursor: pointer;
  padding: 0 1px;
  vertical-align: super;
  line-height: 1;
  font-weight: 600;

  &:hover {
    text-decoration: underline;
    opacity: 0.8;
  }
}

.loading-dots {
  display: flex;
  gap: 4px;
  align-items: center;

  span {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgb(var(--primary-color));
    opacity: 0.5;
    animation: dot-bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) {
      animation-delay: 0s;
    }
    &:nth-child(2) {
      animation-delay: 0.16s;
    }
    &:nth-child(3) {
      animation-delay: 0.32s;
    }
  }
}

@keyframes dot-bounce {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.3;
  }
  40% {
    transform: scale(1);
    opacity: 0.8;
  }
}
</style>
