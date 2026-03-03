<script setup lang="ts">
import type { SessionInfo } from '@/api/assistant';
import type {
  ConversationItem,
  ConversationMenuCommand,
} from 'vue-element-plus-x/types/Conversations';

import { find } from 'lodash-es';
import { createProDrawerForm, createProModalForm } from 'pro-naive-ui';
import { Conversations } from 'vue-element-plus-x';

import {
  createChatSession,
  deleteChatSession,
  getChatSessionList,
  updateChatSession,
} from '@/api/assistant';
import ChatPanel from '@/components/chat/ChatPanel.vue';

const router = useRouter();
const loading = ref(false);
const searchName = ref('');
const activeId = ref<string>();

const activeSession = computed(() =>
  find(sessionList.value, (item) => item.id === activeId.value),
);
const assistantId = computed(() => {
  const params = router.currentRoute.value.params as { id: string };
  return Number(params.id);
});

const sessionList = ref<SessionInfo[]>([]);

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

const drawerForm = createProDrawerForm({
  onSubmit: async (values) => {
    loading.value = true;
    console.warn('submit', values);
    drawerForm.close();
  },
});

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

const edit = () => {
  drawerForm.open();
};

watchEffect(() => {
  getData();
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
        <n-button block @click="edit">聊天设置</n-button>
      </div>
      <n-card
        :title="activeSession?.name || ''"
        :segmented="{ content: true, footer: 'soft' }"
      >
        <ChatPanel
          :assistant-id="assistantId"
          :session-id="activeId"
          :messages="activeSession?.messages || []"
        />
      </n-card>
    </div>
    <pro-drawer-form :form="drawerForm" :loading="loading">
      <pro-drawer-content
        :title="$t('page.assistant.editAssistant')"
        :native-scrollbar="false"
      >
        <pro-input :title="$t('page.assistant.name')" path="name" required />
        <pro-textarea
          :title="$t('page.assistant.description')"
          path="description"
        />
        <pro-textarea
          :title="$t('page.assistant.empty_response')"
          :tooltip="$t('page.assistant.empty_response_desc')"
          path="empty_response"
        />
        <pro-textarea
          :title="$t('page.assistant.opener')"
          :tooltip="$t('page.assistant.opener_desc')"
          path="opener"
        />
        <pro-radio-group
          :title="$t('page.assistant.show_quote')"
          path="show_quote"
          :tooltip="$t('page.assistant.show_quote_desc')"
          :field-props="{
            type: 'button',
            options: [
              { label: $t('common.enable'), value: true },
              { label: $t('common.disable'), value: false },
            ],
          }"
        />
        <pro-select
          :title="$t('page.assistant.knowledgeBase')"
          path="knowledgeBase"
          :field-props="{
            options: [
              { label: '知识库 1', value: '1' },
              { label: '知识库 2', value: '2' },
            ],
          }"
        />
        <pro-textarea
          :title="$t('page.assistant.prompt')"
          :tooltip="$t('page.assistant.prompt_desc')"
          path="prompt"
        />
        <pro-digit
          :title="$t('page.assistant.similarity_threshold')"
          :tooltip="$t('page.assistant.similarity_threshold_desc')"
          path="similarity_threshold"
        />
        <pro-digit
          :title="$t('page.assistant.vector_similarity_weight')"
          :tooltip="$t('page.assistant.vector_similarity_weight_desc')"
          path="vector_similarity_weight"
        />
        <pro-digit
          :title="$t('page.assistant.top_n')"
          :tooltip="$t('page.assistant.top_n_desc')"
          path="top_n"
        />
        <pro-digit
          :title="$t('page.assistant.top_p')"
          :tooltip="$t('page.assistant.top_p_desc')"
          path="top_p"
        />
        <pro-digit
          :title="$t('page.assistant.temperature')"
          :tooltip="$t('page.assistant.temperature_desc')"
          path="temperature"
        />
      </pro-drawer-content>
    </pro-drawer-form>
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
