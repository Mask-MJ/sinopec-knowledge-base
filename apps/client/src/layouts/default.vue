<script setup lang="ts">
import LayoutContent from './components/LayoutContent.vue';
import LayoutHeader from './components/LayoutHeader.vue';
import LayoutSider from './components/LayoutSidebar.vue';

const preferencesStore = usePreferencesStore();
const sidebar = computed(() => preferencesStore.state.sidebar);
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
