/**
 * 权限码常量
 * 集中管理所有前端使用的权限标识，避免硬编码字符串散落各处
 *
 * 命名规范：module:resource:action（与 seed.data.ts 中的 menu permission 一致）
 * 注意：这些权限码需要在后端菜单管理中同步注册，否则 hasPermission() 无法匹配
 */
export const PERMISSION = {
  SYSTEM: {
    USER: {
      CREATE: 'system:user:create',
      UPDATE: 'system:user:update',
      DELETE: 'system:user:delete',
    },
    ROLE: {
      CREATE: 'system:role:create',
      UPDATE: 'system:role:update',
      DELETE: 'system:role:delete',
    },
    MENU: {
      CREATE: 'system:menu:create',
      UPDATE: 'system:menu:update',
      DELETE: 'system:menu:delete',
    },
    DEPT: {
      CREATE: 'system:dept:create',
      UPDATE: 'system:dept:update',
      DELETE: 'system:dept:delete',
    },
    POST: {
      CREATE: 'system:post:create',
      UPDATE: 'system:post:update',
      DELETE: 'system:post:delete',
    },
    DICT: {
      CREATE: 'system:dict:create',
      UPDATE: 'system:dict:update',
      DELETE: 'system:dict:delete',
    },
    DICT_DATA: {
      CREATE: 'system:dictData:create',
      UPDATE: 'system:dictData:update',
      DELETE: 'system:dictData:delete',
    },
  },
  KNOWLEDGE_BASE: {
    CREATE: 'knowledgeBase:create',
    UPDATE: 'knowledgeBase:update',
    DELETE: 'knowledgeBase:delete',
  },
  DOCUMENT: {
    UPLOAD: 'document:upload',
    PARSE: 'document:parse',
    STOP_PARSE: 'document:stop-parse',
    UPDATE: 'document:update',
    DELETE: 'document:delete',
    DOWNLOAD: 'document:download',
  },
  ASSISTANT: {
    CREATE: 'assistant:create',
    UPDATE: 'assistant:update',
    DELETE: 'assistant:delete',
  },
  MONITOR: {
    ONLINE: {
      FORCE_LOGOUT: 'monitor:online:forceLogout',
    },
  },
} as const;
