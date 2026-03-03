<script setup lang="ts">
import type { BubbleProps } from 'vue-element-plus-x/types/Bubble';
import type { BubbleListInstance } from 'vue-element-plus-x/types/BubbleList';
import type { ThinkingStatus } from 'vue-element-plus-x/types/Thinking';

import {
  BubbleList,
  Sender,
  Thinking,
  useXStream,
  XMarkdown,
} from 'vue-element-plus-x';

import { completions } from '@/api/assistant';
import logoUrl from '@/assets/logo.png';

type MessageItem = BubbleProps & {
  collapse?: boolean;
  content?: string;
  key?: number;
  reasoning_content?: string;
  role: 'assistant' | 'system' | 'user' | String;
  thinkingStatus?: ThinkingStatus;
};

const props = defineProps<{
  assistantId: number;
  messages: MessageItem[];
  sessionId: string | undefined;
}>();

const userStore = useUserStore();

const senderValue = ref('');
const senderRef = ref();
const bubbleListRef = ref<BubbleListInstance | null>(null);
const bubbleItems = ref<MessageItem[]>([]);

const avatar = computed(() => {
  const userInfo = userStore.userInfo;
  return userInfo?.avatar || logoUrl;
});

// 添加消息 - 维护聊天记录
function addMessage(message: string, role: string) {
  const i = bubbleItems.value.length;
  const obj: MessageItem = {
    key: i,
    avatarSize: '32px',
    role,
    placement: role === 'user' ? 'end' : 'start',
    isMarkdown: role === 'assistant',
    loading: role === 'assistant',
    content: message || '',
    thinkingStatus: 'start',
    collapse: false,
  };
  bubbleItems.value.push(obj);
}

// 提取 <think></think> 之间的内容返回, 其余的内容去掉
function replaceThink(text: string = '') {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  let result = '';
  match = thinkRegex.exec(text);
  while (match !== null) {
    result += match[1];
    match = thinkRegex.exec(text);
  }
  return result.trim();
}

// 提取 <think></think> 之外的内容返回, 中间的内容去掉
const replaceWithoutThink = (content: string) => {
  return content.replaceAll(/<think>[\s\S]*?<\/think>/g, '').trim();
};

const { startStream, data } = useXStream();

async function handleSend() {
  if (!props.sessionId) {
    window.$message.error('会话不存在，请重新选择会话');
    return;
  }
  // 清空输入框
  addMessage(senderValue.value, 'user');
  addMessage('', 'assistant');
  bubbleListRef.value?.scrollToBottom();
  const { response } = await completions(props.assistantId, {
    stream: true,
    sessionId: props.sessionId,
    question: senderValue.value,
  });
  senderValue.value = '';
  const readableStream = response.body!;
  await startStream({ readableStream });
}

watch(
  data,
  (newData) => {
    const bubbleItem = bubbleItems.value[bubbleItems.value.length - 1];
    if (bubbleItem) {
      if (newData.length === 0) {
        bubbleItem.content = '';
      } else {
        const parsedChunk = JSON.parse(newData[newData.length - 1]?.data);
        if (parsedChunk.data === true) {
          // 结束 思考链状态
          const text = JSON.parse(newData[newData.length - 2]?.data).data
            .answer;
          bubbleItem.thinkingStatus = 'end';
          bubbleItem.loading = false;
          bubbleItem.content = replaceWithoutThink(text || '');
          bubbleItem.collapse = false;
          bubbleListRef.value?.scrollToBottom();
          return;
        }
        const text = parsedChunk.data.answer;
        bubbleItem.reasoning_content = replaceThink(text);
        bubbleItem.content = replaceWithoutThink(text);
        bubbleItem.collapse = true;
        bubbleItem.loading = true;
        bubbleItem.thinkingStatus = 'thinking';
      }
    }
  },
  { deep: true },
);

watchEffect(() => {
  bubbleItems.value = props.messages.map((item, index) => ({
    role: item.role,
    key: index,
    content: replaceWithoutThink(item.content || ''),
    placement: item.role === 'assistant' ? 'start' : 'end',
    avatarSize: '32px',
    avatarGap: '12px',
    isMarkdown: item.role === 'assistant',
    thinkingStatus: 'end',
    reasoning_content: replaceThink(item.content || ''),
  }));
});
</script>

<template>
  <div class="relative h-full w-full flex flex-col items-center">
    <div class="w-full flex flex-col justify-between">
      <BubbleList
        ref="bubbleListRef"
        class="bubble-list"
        :list="bubbleItems"
        max-height="calc(100vh - 360px)"
      >
        <!-- 自定义头像 -->
        <template #avatar="{ item }">
          <n-avatar v-if="item.role === 'assistant'" round size="small">
            <n-icon>
              <i class="i-ant-design:robot-outlined"></i>
            </n-icon>
          </n-avatar>
          <n-avatar v-else round size="small" :src="avatar" />
        </template>
        <template #header="{ item }">
          <Thinking
            v-if="item.reasoning_content"
            v-model="item.collapse"
            :content="item.reasoning_content"
            :status="item.thinkingStatus"
            class="!mb-2"
            max-width="100%"
          />
        </template>

        <template #content="{ item }">
          <!-- chat 内容走 markdown -->
          <XMarkdown
            v-if="item.content && item.role === 'assistant'"
            :markdown="item.content"
            class="w-full"
          />
          <!-- user 内容 纯文本 -->
          <div v-if="item.content && item.role === 'user'" class="user-content">
            {{ item.content }}
          </div>
        </template>
      </BubbleList>
      <Sender
        ref="senderRef"
        v-model="senderValue"
        class="absolute bottom-0 w-full"
        :auto-size="{ maxRows: 6, minRows: 2 }"
        variant="updown"
        clearable
        allow-speech
        @submit="handleSend"
      >
        <template #prefix>
          <slot name="sender-prefix"></slot>
        </template>
      </Sender>
    </div>
  </div>
</template>

<style scoped lang="scss">
:deep() {
  .el-bubble-list {
    padding-top: 24px;
  }
  .el-bubble {
    padding: 0 12px;
    padding-bottom: 24px;
  }
  .el-typewriter {
    overflow: hidden;
    border-radius: 12px;
  }
  .user-content {
    white-space: pre-wrap;
  }
  .markdown-body {
    background-color: transparent;
  }
  .markdown-elxLanguage-header-div {
    top: -25px !important;
  }

  .elx-xmarkdown-container {
    padding: 8px 4px;
  }
  .el-bubble-content {
    max-width: 100% !important;
  }
}
</style>
