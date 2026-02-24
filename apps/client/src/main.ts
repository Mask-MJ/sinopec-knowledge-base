import { createPinia } from 'pinia';
import { loadingFadeOut } from 'virtual:app-loading';
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';

import './assets/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.mount('#app');

// 关闭首屏 loading 动画
loadingFadeOut();
