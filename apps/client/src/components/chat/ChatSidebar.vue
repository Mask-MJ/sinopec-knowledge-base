<script setup lang="ts">
import type { SessionInfo } from '@/api/assistant';

import { find } from 'lodash-es';
import { createProModalForm } from 'pro-naive-ui';

import {
  createChatSession,
  deleteChatSession,
  getChatSessionList,
  updateChatSession,
} from '@/api/assistant';
import { $t } from '@/locales';

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

// Right-click menu
const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextMenuItem = ref<null | SessionInfo>(null);

const contextMenuOptions = computed(() => [
  {
    label: $t('page.assistant.chat.rename', '重命名'),
    key: 'rename',
    icon: () => h('i', { class: 'i-ant-design:edit-outlined' }),
  },
  {
    label: $t('common.delete'),
    key: 'delete',
    icon: () => h('i', { class: 'i-ant-design:delete-outlined text-red-500' }),
  },
]);

function handleContextMenu(e: MouseEvent, item: SessionInfo) {
  e.preventDefault();
  contextMenuItem.value = item;
  contextMenuPos.value = { x: e.clientX, y: e.clientY };
  showContextMenu.value = true;
}

async function handleMenuSelect(key: string) {
  showContextMenu.value = false;
  const item = contextMenuItem.value;
  if (!item) return;

  if (key === 'delete') {
    await deleteChatSession(props.assistantId, item.id);
    window.$message.success('删除成功');
    if (activeId.value === item.id) {
      activeId.value = undefined;
    }
    await fetchSessions();
  }
  if (key === 'rename') {
    modalForm.values.value = { id: item.id, name: item.name };
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
    class="chat-sidebar flex shrink-0 flex-col overflow-hidden border-r border-[var(--n-border-color)] transition-all duration-200 ease-out"
    :class="collapsed ? 'w-0 border-r-0' : 'w-72 pr-4'"
  >
    <!-- Header -->
    <div class="mb-3 flex items-center justify-between py-2">
      <span class="text-base font-semibold">
        {{ $t('page.assistant.chat.conversations', '会话列表') }}
      </span>
      <div class="flex gap-1">
        <n-tooltip>
          <template #trigger>
            <n-button
              quaternary
              size="small"
              circle
              aria-label="新建会话"
              @click="addSession"
            >
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
              aria-label="收起侧边栏"
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

    <!-- Search -->
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

    <!-- Empty state -->
    <div
      v-if="sessionList.length === 0"
      class="flex-col-center gap-2 py-8 opacity-50"
    >
      <i class="i-ant-design:inbox-outlined text-3xl"></i>
      <span class="text-sm">
        {{ $t('page.assistant.chat.noSessions', '暂无会话') }}
      </span>
      <n-button size="small" type="primary" @click="addSession">
        {{ $t('page.assistant.chat.createFirst', '创建第一个会话') }}
      </n-button>
    </div>

    <!-- Session list -->
    <div v-else class="flex-1 overflow-y-auto">
      <div
        v-for="item in sessionList"
        :key="item.id"
        class="session-item mb-1 cursor-pointer rounded-lg px-3 py-2.5 transition-colors duration-150"
        :class="activeId === item.id ? 'session-active' : ''"
        @click="activeId = item.id"
        @contextmenu="handleContextMenu($event, item)"
      >
        <n-ellipsis :line-clamp="1" class="text-sm">
          {{ item.name }}
        </n-ellipsis>
      </div>
    </div>

    <slot name="footer"></slot>

    <!-- Rename modal -->
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

  <!-- Context menu -->
  <n-dropdown
    trigger="manual"
    :show="showContextMenu"
    :x="contextMenuPos.x"
    :y="contextMenuPos.y"
    :options="contextMenuOptions"
    placement="bottom-start"
    @clickoutside="showContextMenu = false"
    @select="handleMenuSelect"
  />

  <!-- Expand button when collapsed -->
  <n-tooltip v-if="collapsed" placement="right">
    <template #trigger>
      <n-button
        class="mr-2 self-start"
        quaternary
        size="small"
        circle
        aria-label="展开侧边栏"
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

.session-item:hover {
  background: rgba(var(--primary-color), 0.06);
}

.session-active {
  background: rgba(var(--primary-color), 0.1);
  font-weight: 500;
}

:root.dark .session-item:hover,
html.dark .session-item:hover {
  background: rgba(var(--primary-color), 0.1);
}

:root.dark .session-active,
html.dark .session-active {
  background: rgba(var(--primary-color), 0.18);
}
</style>
