import proNaive from 'pro-naive-ui';
import { createApp } from 'vue';

import { DEFAULT_PREFERENCES } from '@/config/preferences';
import { setupDirectives } from '@/directives';
import { $t, setupI18n } from '@/locales';
import { initRouter, router } from '@/router';
import { initStores } from '@/stores';

import App from './App.vue';

import 'echarts';
import './style';

async function bootstrap() {
  const app = createApp(App);
  app.use(proNaive);
  // 注册自定义指令
  setupDirectives(app);
  // 国际化 i18n 配置
  await setupI18n(app);
  // 初始化全局状态管理
  initStores(app);
  // 初始化路由
  initRouter(app);
  // 动态更新标题
  watchEffect(() => {
    if (DEFAULT_PREFERENCES.app.dynamicTitle) {
      const routeTitle = router.currentRoute.value.meta.title
        ? `${$t(`page.${router.currentRoute.value.meta.title}`)}-`
        : '';
      const pageTitle = routeTitle + DEFAULT_PREFERENCES.app.name;
      useTitle(pageTitle);
    }
  });
  app.mount('#app');
}

void bootstrap();
