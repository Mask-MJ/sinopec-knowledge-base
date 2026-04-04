<script setup lang="ts">
import type { SessionInfo } from '@/api/assistant';
import type {
  ConversationItem,
  ConversationMenuCommand,
} from 'vue-element-plus-x/types/Conversations';

import { find } from 'lodash-es';
import { createProModalForm } from 'pro-naive-ui';
import { Conversations } from 'vue-element-plus-x';

import {
  createChatSession,
  deleteChatSession,
  getChatSessionList,
  updateChatSession,
} from '@/api/assistant';

const props = defineProps<{
  assistantId: number;
}>();

const activeId = defineModel<string | undefined>('activeId');

const loading = ref(false);
const searchName = ref('');
const sessionList = ref<SessionInfo[]>([]);
const collapsed = ref(false);

const activeSession = computed(() =>
  find(sessionList.value, (item) => item.id === activeId.value),
);

defineExpose({ activeSession });

const modalForm = createProModalForm({
  onSubmit: async (values) => {
    if (!activeSession.value) return;
    loading.value = true;
    try {
      await updateChatSession(props.assistantId, values.id, values);
      await fetchSessions();
    } finally {
      modalForm.close();
      loading.value = false;
    }
  },
});

async function handleMenuCommand(
  command: ConversationMenuCommand,
  item: ConversationItem,
) {
  if (command === 'delete') {
    window.$dialog.warning({
      title: '确认删除',
      content: '删除后会话及对话历史将无法恢复，确认删除？',
      positiveText: '确认',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await deleteChatSession(props.assistantId, item.id);
          window.$message.success('删除成功');
          if (activeId.value === item.id) {
            activeId.value = undefined;
          }
          await fetchSessions();
        } catch {
          window.$message.error('删除失败，请重试');
        }
      },
    });
    return;
  }
  if (command === 'rename') {
    modalForm.values.value = { id: item.id, name: item.label };
    modalForm.show.value = true;
  }
}

async function addSession() {
  const { data } = await createChatSession(props.assistantId, {
    name: '新会话',
  });
  if (data) {
    sessionList.value = [data, ...sessionList.value];
    activeId.value = data.id;
  }
}

async function fetchSessions() {
  const { data = [] } = await getChatSessionList(props.assistantId, {
    name: searchName.value || undefined,
  });
  sessionList.value = data;
  if (sessionList.value.length > 0 && !activeId.value) {
    activeId.value = sessionList.value[0]?.id;
  }
}

const debouncedFetch = useDebounceFn(fetchSessions, 300);

watch(searchName, () => debouncedFetch());
watch(
  () => props.assistantId,
  () => {
    activeId.value = undefined;
    fetchSessions();
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="chat-sidebar flex flex-col overflow-hidden border-r border-gray-200/60 transition-all duration-250 ease-out dark:border-gray-700/40"
    :class="collapsed ? 'w-0 p-0' : 'w-72 pr-4'"
  >
    <div class="mb-3 flex items-center justify-between py-2">
      <span class="text-base font-semibold">
        {{ $t('page.assistant.chat.conversations', '会话列表') }}
      </span>
      <div class="flex gap-1">
        <n-tooltip>
          <template #trigger>
            <n-button quaternary size="small" circle @click="addSession">
              <template #icon>
                <i class="i-ant-design:plus-outlined"></i>
              </template>
            </n-button>
          </template>
          {{ $t('page.assistant.chat.newSession', '新建会话') }}
        </n-tooltip>
        <n-tooltip>
          <template #trigger>
            <n-button
              quaternary
              size="small"
              circle
              @click="collapsed = !collapsed"
            >
              <template #icon>
                <i class="i-ant-design:menu-fold-outlined"></i>
              </template>
            </n-button>
          </template>
          {{ $t('page.assistant.chat.collapseSidebar', '收起侧边栏') }}
        </n-tooltip>
      </div>
    </div>

    <n-input
      v-model:value="searchName"
      class="mb-3"
      clearable
      :placeholder="$t('page.assistant.chat.searchPlaceholder', '搜索会话...')"
      size="small"
    >
      <template #prefix>
        <i class="i-ant-design:search-outlined opacity-40"></i>
      </template>
    </n-input>

    <div
      v-if="sessionList.length === 0"
      class="flex-col-center gap-2 py-8 opacity-50"
    >
      <i class="i-ant-design:inbox-outlined text-3xl"></i>
      <span class="text-sm">
        {{ $t('page.assistant.chat.noSessions', '暂无会话') }}
      </span>
      <n-button size="small" type="primary" ghost @click="addSession">
        {{ $t('page.assistant.chat.createFirst', '创建第一个会话') }}
      </n-button>
    </div>

    <Conversations
      v-else
      v-model:active="activeId"
      class="flex-1 overflow-y-auto"
      :items="sessionList"
      :label-max-width="180"
      :show-tooltip="true"
      label-key="name"
      tooltip-placement="right"
      :tooltip-offset="35"
      show-to-top-btn
      show-built-in-menu
      @menu-command="handleMenuCommand"
    />

    <slot name="footer"></slot>

    <pro-modal-form
      :title="$t('page.assistant.chat.rename', '重命名')"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input v-show="false" path="id" required />
      <pro-input
        :title="$t('page.assistant.chat.newName', '新名称')"
        path="name"
        required
      />
    </pro-modal-form>
  </div>

  <!-- Expand button when collapsed -->
  <n-tooltip v-if="collapsed" placement="right">
    <template #trigger>
      <n-button
        class="mr-2 self-start"
        quaternary
        size="small"
        circle
        @click="collapsed = false"
      >
        <template #icon>
          <i class="i-ant-design:menu-unfold-outlined"></i>
        </template>
      </n-button>
    </template>
    {{ $t('page.assistant.chat.expandSidebar', '展开侧边栏') }}
  </n-tooltip>
</template>

<style scoped>
.chat-sidebar {
  min-width: 0;
}
</style>
