import type { AppRoute } from '@/app-routes';
import type { INestApplication, Type } from '@nestjs/common';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { APP_ROUTES } from '@/app-routes';

import { stabilizeDocument } from '../utils/stabilize-openapi';

/**
 * Reflect 元数据 key —— 用字符串字面量而不是从 `@nestjs/common/constants` 或
 * `@nestjs/swagger/dist/constants` import，避免依赖包的内部路径。这两个 key
 * 是 NestJS 的 stable ABI（多年未变，也不会变），硬编码 + 注释标注来源是实
 * 用主义的最安全选择。
 */
const NESTJS_MODULE_CONTROLLERS_METADATA = 'controllers'; // @nestjs/common MODULE_METADATA.CONTROLLERS
const SWAGGER_API_TAGS_METADATA = 'swagger/apiUseTags'; // @nestjs/swagger DECORATORS.API_TAGS

interface SpecGroup {
  /** Swagger UI 文档描述（自动从 module 下 controllers 的 @ApiTags 收集） */
  description: string;
  /** NestJS SwaggerModule.include 白名单（含父 + 子 module） */
  includes: Type[];
  /** URL 段：/doc/{key} + /doc-json/{key} */
  key: string;
  /** Swagger UI 下拉菜单 / 文档标题 */
  title: string;
}

/** 收集 module 下所有 controller 的 @ApiTags，去重保留首次出现顺序 */
function collectApiTags(module: Type): string[] {
  const controllers: Type[] =
    Reflect.getMetadata(NESTJS_MODULE_CONTROLLERS_METADATA, module) ?? [];
  const tags: string[] = [];
  for (const ctrl of controllers) {
    const ctrlTags: string[] =
      Reflect.getMetadata(SWAGGER_API_TAGS_METADATA, ctrl) ?? [];
    for (const t of ctrlTags) {
      if (!tags.includes(t)) tags.push(t);
    }
  }
  return tags;
}

/** `AuthModule` → `Auth` / `KnowledgeBaseModule` → `KnowledgeBase`（class name 去 `Module` 后缀） */
function moduleClassToTitle(module: Type): string {
  return module.name.replace(/Module$/, '');
}

/** 父 module + 所有 children module 的 class 列表（传给 SwaggerModule.include） */
function collectIncludes(route: AppRoute): Type[] {
  return [route.module, ...(route.children?.map((c) => c.module) ?? [])];
}

/** 父 module 的 description 合并所有 children module 的 @ApiTags */
function buildDescription(route: AppRoute): string {
  const tags = collectApiTags(route.module);
  for (const child of route.children ?? []) {
    for (const t of collectApiTags(child.module)) {
      if (!tags.includes(t)) tags.push(t);
    }
  }
  return tags.join('、');
}

function buildSpecGroup(route: AppRoute): SpecGroup {
  return {
    key: route.path,
    title: moduleClassToTitle(route.module),
    description: buildDescription(route),
    includes: collectIncludes(route),
  };
}

/**
 * SPEC_GROUPS 完全派生自 APP_ROUTES + 各 module 的元数据，零手写配置。
 *
 * 新增 module 时：
 *   1. 写 module（controllers 装 `@ApiTags('中文名')`）
 *   2. 在 `@/app-routes.ts` 的 `APP_ROUTES` 加一行 `{ path, module }`
 *   3. `SPEC_GROUPS` / `/doc/{key}` / `/doc-json/{key}` 自动出现，**不用改本文件**
 */
const SPEC_GROUPS: readonly SpecGroup[] = APP_ROUTES.map((route) =>
  buildSpecGroup(route),
);

function buildOptions(appName: string, suffix: string, description: string) {
  return new DocumentBuilder()
    .setTitle(`${appName} · ${suffix}`)
    .setDescription(description)
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'bearer',
      description: '基于 JWT token',
    })
    .build();
}

/**
 * 配置 Swagger 文档：每个 feature module 独立一份 spec + 1 份全量聚合 spec
 *
 * 路由对照：
 * - `/doc/{key}` + `/doc-json/{key}` · 每个 SPEC_GROUP 一份（前端按模块生成 d.ts）
 * - `/doc` + `/doc-json` · 全量 + **右上角下拉菜单**切换所有子 spec
 *   （token 共享，登录一次测所有接口）
 */
export function setupSwagger(app: INestApplication, appName: string): void {
  // 分模块 spec
  for (const group of SPEC_GROUPS) {
    const options = buildOptions(appName, group.title, group.description);
    const document = stabilizeDocument(
      SwaggerModule.createDocument(app, options, { include: group.includes }),
    );
    // jsonDocumentUrl 显式指定，否则 NestJS 默认挂到 `{path}-json`
    // 即 /doc/{key}-json，不是我们约定的 /doc-json/{key}
    SwaggerModule.setup(`doc/${group.key}`, app, document, {
      jsonDocumentUrl: `doc-json/${group.key}`,
      swaggerOptions: { persistAuthorization: true },
      customSiteTitle: `${appName} API · ${group.title}`,
    });
  }

  // 统一调试入口：/doc 右上角下拉切换所有 spec（全量 + 分模块）
  // 同 URL 下 localStorage 共享，persistAuthorization 的 JWT token 跨 spec 保留。
  //
  // 坑 1：NestJS SwaggerModule.setup 会把 document inline 到 swagger-ui-init.js
  //   的 `spec` 字段，SwaggerUIBundle 看到 spec 优先 urls 会被忽略。
  //   解法：`swaggerOptions.spec: null` 让 init.js 的 for-in 合并覆盖 spec 为 null，
  //   Swagger UI 回退到 urls 模式。
  // 坑 2：NestJS `explorer: false`（默认）会注入 CSS 隐藏 `.download-url-wrapper`，
  //   即使 urls 传了下拉也看不见。解法：`explorer: true`。
  const fullOptions = buildOptions(
    appName,
    '全量',
    '全量 spec（默认）· 右上角下拉菜单可切换到分模块子 spec，token 在本页共享',
  );
  const fullDocument = stabilizeDocument(
    SwaggerModule.createDocument(app, fullOptions),
  );
  const primaryName = `${appName} · Full · 全量`;
  SwaggerModule.setup('doc', app, fullDocument, {
    explorer: true,
    swaggerOptions: {
      spec: null,
      persistAuthorization: true,
      urls: [
        { url: '/doc-json', name: primaryName },
        ...SPEC_GROUPS.map((group) => ({
          url: `/doc-json/${group.key}`,
          name: `${appName} · ${group.title}`,
        })),
      ],
      'urls.primaryName': primaryName,
    },
    customSiteTitle: `${appName} API Docs`,
  });
}
