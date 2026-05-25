<script setup lang="ts">
import LayoutContent from './components/LayoutContent.vue';
import LayoutHeader from './components/LayoutHeader.vue';
import LayoutSider from './components/LayoutSidebar.vue';
import LayoutTabs from './components/LayoutTabs.vue';

const preferencesStore = usePreferencesStore();
const sidebar = computed(() => preferencesStore.state.sidebar);
const tabbar = computed(() => preferencesStore.state.tabbar);
</script>

<template>
  <NLayout has-sider class="h-full w-full">
    <NLayoutSider
      v-if="sidebar.enable"
      bordered
      collapse-mode="width"
      :width="sidebar.width"
      :native-scrollbar="false"
      :collapsed="sidebar.collapsed"
      :inverted="sidebar.inverted"
      content-style="height: 100%"
    >
      <LayoutSider />
    </NLayoutSider>
    <NLayout content-style="display:flex; flex-flow: column; height: 100%">
      <NLayoutHeader>
        <LayoutHeader />
      </NLayoutHeader>
      <!-- 多页签条：受 preferences.tabbar.enable 开关控制。LayoutTabs
           自身也校验该 flag，这里再 wrap 一层避免渲染空容器占位。 -->
      <LayoutTabs v-if="tabbar.enable" />
      <NLayoutContent
        class="bg-[#f6f9f8] p-4 transition duration-300 ease-in-out dark:bg-[#101014]"
        content-style="height: 100%"
        :native-scrollbar="false"
      >
        <LayoutContent class="h-full flex flex-col" />
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>
