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
import ChatPanel from '@/components/chat/ChatPanel.vue';

const loading = ref(false);
const searchName = ref('');
const activeId = ref<string>();
const bubbleItems = ref<any[]>([]);
const assistantId = ref(1);
const sessionList = ref<SessionInfo[]>([]);

const activeSession = computed(() =>
  find(sessionList.value, (item) => item.id === activeId.value),
);

// 内置菜单点击方法
async function handleMenuCommand(
  command: ConversationMenuCommand,
  item: ConversationItem,
) {
  if (command === 'delete') {
    await deleteChatSession(assistantId.value, item.id);
    window.$message.success('删除成功');
  }
  if (command === 'rename') {
    modalForm.values.value = { id: item.id, name: item.label };
    modalForm.show.value = true;
  }
}

const modalForm = createProModalForm({
  onSubmit: async (values) => {
    if (!activeSession.value) return;
    loading.value = true;
    await updateChatSession(assistantId.value, values.id, values);
    modalForm.close();
    loading.value = false;
    getData();
  },
});

const addSession = async () => {
  const { data } = await createChatSession(assistantId.value, {
    name: '新会话',
  });
  if (data) {
    sessionList.value.unshift(data);
    activeId.value = data.id;
  }
};

const getData = async () => {
  const { data = [] } = await getChatSessionList(assistantId.value, {
    name: searchName.value,
  });
  sessionList.value = data.filter((item) =>
    item.name?.toLowerCase().includes(searchName.value.toLowerCase()),
  );

  if (sessionList.value.length > 0 && !activeId.value) {
    activeId.value = sessionList.value[0]?.id;
  }
};

watch(
  activeId,
  () => {
    getData();
  },
  { immediate: true },
);
watch(assistantId, () => {
  getData();
  bubbleItems.value = [];
});
</script>

<template>
  <n-card content-style="height: calc(100vh - 85px)">
    <div class="h-full flex gap-4">
      <div class="w-70 flex flex-col">
        <div class="mb-4 flex-between py-2">
          <div class="text-xl font-bold">Conversations</div>
          <n-button size="small" @click="addSession">
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
          </n-button>
        </div>
        <n-input v-model:value="searchName" class="mb-4" clearable>
          <template #prefix>
            <i class="i-ant-design:search-outlined"></i>
          </template>
        </n-input>

        <Conversations
          v-model:active="activeId"
          class="mb-4"
          :items="sessionList"
          :label-max-width="200"
          :show-tooltip="true"
          label-key="name"
          tooltip-placement="right"
          :tooltip-offset="35"
          show-to-top-btn
          show-built-in-menu
          @menu-command="handleMenuCommand"
        />
      </div>
      <n-card
        :title="activeSession?.name || ''"
        :segmented="{ content: true, footer: 'soft' }"
      >
        <ChatPanel
          :assistant-id="assistantId"
          :session-id="activeId"
          :messages="activeSession?.messages || []"
        >
          <template #sender-prefix>
            <div class="flex items-center gap-2">
              <n-button v-if="assistantId === 1" round>
                <template #icon>
                  <i class="i-ant-design:global-outlined"></i>
                </template>
                <span>联网查询</span>
              </n-button>

              <n-button v-if="assistantId === 1" round>
                <template #icon>
                  <i class="i-ant-design:node-index-outlined"></i>
                </template>
                <span>深度思考</span>
              </n-button>

              <n-select
                v-model:value="assistantId"
                class="w-30"
                :options="[
                  { label: 'DeepSeek', value: 1 },
                  { label: '长城大模型', value: 2 },
                ]"
              />
            </div>
          </template>
        </ChatPanel>
      </n-card>
    </div>
    <pro-modal-form
      :title="$t('page.assistant.chat.rename')"
      :form="modalForm"
      :loading="loading"
      label-width="100"
      preset="card"
      label-placement="left"
    >
      <pro-input v-show="false" path="id" required />
      <pro-input
        :title="$t('page.assistant.chat.newName')"
        path="name"
        required
      />
    </pro-modal-form>
  </n-card>
</template>
