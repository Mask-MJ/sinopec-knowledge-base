import type { Type } from '@nestjs/common';

import { AssistantModule } from '@/modules/assistant/assistant.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { KnowledgeBaseModule } from '@/modules/knowledge-base/knowledge-base.module';
import { MonitorModule } from '@/modules/monitor/monitor.module';
import { SystemModule } from '@/modules/system/system.module';

export interface AppRouteChild {
  module: Type;
  path: string;
}

export interface AppRoute {
  children?: AppRouteChild[];
  module: Type;
  /** URL 段，同时也是 Swagger spec 的 key：`/api/{path}` + `/doc-json/{path}` */
  path: string;
}

/**
 * Single source of truth —— 一份数组，两处消费：
 *   1. `app.module.ts` 的 `RouterModule.register(APP_ROUTES)` 挂载 HTTP 路由前缀
 *   2. `common/bootstrap/swagger.setup.ts` 派生每个 feature module 一份独立的
 *      OpenAPI spec + Swagger UI（前端按模块生成 d.ts，tree-shake 友好）
 *
 * 新增 module 的流程（2 步）：
 *   1. 在 module 的 controllers 加 `@ApiTags('中文名')`
 *   2. 本数组加一行 `{ path: 'xxx', module: XxxModule }`
 *
 * 子 module 通过 `children` 挂载，会**共享父 module 的路由前缀**并**合入父组
 * 的 Swagger spec**。
 */
export const APP_ROUTES: AppRoute[] = [
  { path: 'auth', module: AuthModule },
  { path: 'system', module: SystemModule },
  { path: 'monitor', module: MonitorModule },
  { path: 'knowledge-base', module: KnowledgeBaseModule },
  { path: 'assistant', module: AssistantModule },
];
