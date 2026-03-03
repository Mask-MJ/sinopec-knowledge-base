import type { Prisma } from '@prisma/generated/client';

/** 角色种子数据 */
export const SEED_ROLES: Prisma.RoleCreateManyInput[] = [
  { name: '超级管理员', value: 'admin', order: 1 },
  { name: '普通角色', value: 'common', order: 2 },
  { name: '业务角色', value: 'business', order: 3 },
];

/** 用户种子数据 */
export const SEED_USERS: Prisma.UserCreateInput[] = [
  {
    username: 'admin',
    nickname: '管理员',
    isAdmin: true,
    roles: { connect: { value: 'admin' } },
    password: '$2b$10$ikUfs9L3uJA5SdTge37tIO5BJMemtjkDM5y2klMGSdOv9qBX.bgue',
  },
  {
    username: 'user',
    nickname: '普通用户',
    isAdmin: false,
    roles: { connect: { value: 'common' } },
    password: '$2b$10$kxYSbbQSzJ64r4EIcORm8umQB7GQRLNxWAKHmJalYMzkgRZbAaIDq',
  },
  {
    username: 'chenzhixiang',
    nickname: '陈志翔',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$oWWmrsSdprSqtL5gC5nE7.TSn50VXXQeJakRjaj.BGyNYDTmNIPaC',
  },
  {
    username: 'lidanchun',
    nickname: '李丹纯',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$4jlOlUkB3UTH3xRarBwBAO2oNmpIGoFNIUqUWmgvbyhZ2BSkJ7guO',
  },
  {
    username: 'yangcanshu',
    nickname: '杨灿书',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$3kKduqr9wlS5uEVzFvzDzOziTf.3XKl0exrzuKq5axrhmylE1SMF.',
  },
  {
    username: 'guoweilin',
    nickname: '郭玮麟',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$ra9ku82k56AxlKxafmChZe.2ttMcCOdtWnnweKdsOFcUUgdJwzuKa',
  },
  {
    username: 'ryan',
    nickname: 'Ryan',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$fEuS/o0nxSGUtiNTAWWrNuxkEfiHlfhZ2zmqortMq8ytZo98rxSQe',
  },
  {
    username: 'zhangzanheng',
    nickname: '张赞桓',
    isAdmin: false,
    roles: { connect: { value: 'business' } },
    password: '$2b$10$hOBNYI6qOxc3FshMmE66J.5KvXolK0JWpHLz.zE0maK0c2RUNp4Va',
  },
];

/** 菜单种子数据 */
export const SEED_MENUS: Prisma.MenuCreateInput[] = [
  {
    name: '概览',
    title: 'dashboard.title',
    icon: 'i-ant-design:appstore-outlined',
    order: 1,
    type: 'catalog',
    path: '/dashboard',
    children: {
      create: [
        {
          name: '分析页',
          title: 'dashboard.analytics',
          type: 'menu',
          icon: 'i-ant-design:area-chart-outlined',
          order: 1,
          path: '/dashboard/analytics',
        },
        {
          name: '工作台',
          title: 'dashboard.workspace',
          type: 'menu',
          icon: 'i-ant-design:laptop-outlined',
          order: 2,
          path: '/dashboard/workspace',
        },
        {
          name: '地图',
          title: 'dashboard.map',
          type: 'menu',
          icon: 'i-ant-design:environment-outlined',
          order: 3,
          path: '/dashboard/map',
        },
      ],
    },
  },
  {
    name: '知识库',
    title: 'knowledgeBase.title',
    icon: 'i-ant-design:database-outlined',
    order: 2,
    type: 'menu',
    status: false,
    path: '/knowledgeBase',
    hideChildrenInMenu: true,
    children: {
      create: [
        {
          name: '知识库详情',
          title: 'knowledgeBase.detail.title',
          hideInMenu: true,
          icon: 'i-ant-design:folder-outlined',
          order: 1,
          type: 'menu',
          path: '/knowledgeBase/detail/:id',
        },
        {
          name: '创建知识库',
          type: 'button',
          permission: 'knowledgeBase:create',
        },
        {
          name: '修改知识库',
          type: 'button',
          permission: 'knowledgeBase:update',
        },
        {
          name: '删除知识库',
          type: 'button',
          permission: 'knowledgeBase:delete',
        },
        { name: '上传文件', type: 'button', permission: 'document:upload' },
        { name: '解析文件', type: 'button', permission: 'document:parse' },
        {
          name: '停止解析文件',
          type: 'button',
          permission: 'document:stop-parse',
        },
        { name: '修改文件', type: 'button', permission: 'document:update' },
        { name: '删除文件', type: 'button', permission: 'document:delete' },
        { name: '下载文件', type: 'button', permission: 'document:download' },
      ],
    },
  },
  {
    name: '聊天助手',
    title: 'assistant.title',
    icon: 'i-ant-design:robot-outlined',
    order: 2,
    type: 'menu',
    path: '/assistant',
    status: false,
    hideChildrenInMenu: true,
    children: {
      create: [
        {
          name: '聊天',
          title: 'assistant.chat.title',
          hideInMenu: true,
          icon: 'i-ant-design:message-outlined',
          order: 1,
          type: 'menu',
          path: '/assistant/chat/:id',
        },
        { name: '创建聊天', type: 'button', permission: 'assistant:create' },
        { name: '修改聊天', type: 'button', permission: 'assistant:update' },
        { name: '删除聊天', type: 'button', permission: 'assistant:delete' },
      ],
    },
  },
  {
    name: '系统管理',
    title: 'system.title',
    icon: 'i-ant-design:setting-outlined',
    order: 5,
    type: 'catalog',
    path: '/system',
    children: {
      create: [
        {
          name: '用户管理',
          title: 'system.user.title',
          icon: 'i-ant-design:user-outlined',
          order: 1,
          type: 'menu',
          path: '/system/user',
          children: {
            create: [
              {
                name: '创建用户',
                type: 'button',
                permission: 'system:user:create',
              },
              {
                name: '修改用户',
                type: 'button',
                permission: 'system:user:update',
              },
              {
                name: '删除用户',
                type: 'button',
                permission: 'system:user:delete',
              },
            ],
          },
        },
        {
          name: '角色管理',
          title: 'system.role.title',
          icon: 'i-ant-design:usergroup-add-outlined',
          order: 2,
          type: 'menu',
          path: '/system/role',
          children: {
            create: [
              {
                name: '创建角色',
                type: 'button',
                permission: 'system:role:create',
              },
              {
                name: '修改角色',
                type: 'button',
                permission: 'system:role:update',
              },
              {
                name: '删除角色',
                type: 'button',
                permission: 'system:role:delete',
              },
            ],
          },
        },
        {
          name: '菜单管理',
          title: 'system.menu.title',
          icon: 'i-ant-design:menu-outlined',
          order: 3,
          type: 'menu',
          path: '/system/menu',
          children: {
            create: [
              {
                name: '创建菜单',
                type: 'button',
                permission: 'system:menu:create',
              },
              {
                name: '修改菜单',
                type: 'button',
                permission: 'system:menu:update',
              },
              {
                name: '删除菜单',
                type: 'button',
                permission: 'system:menu:delete',
              },
            ],
          },
        },
        {
          name: '字典管理',
          title: 'system.dict.title',
          icon: 'i-ant-design:medicine-box-outlined',
          order: 4,
          type: 'menu',
          path: '/system/dict',
          children: {
            create: [
              {
                name: '创建字典',
                type: 'button',
                permission: 'system:dict:create',
              },
              {
                name: '修改字典',
                type: 'button',
                permission: 'system:dict:update',
              },
              {
                name: '删除字典',
                type: 'button',
                permission: 'system:dict:delete',
              },
              {
                name: '创建字典数据',
                type: 'button',
                permission: 'system:dictData:create',
              },
              {
                name: '修改字典数据',
                type: 'button',
                permission: 'system:dictData:update',
              },
              {
                name: '删除字典数据',
                type: 'button',
                permission: 'system:dictData:delete',
              },
            ],
          },
        },
        {
          name: '部门管理',
          title: 'system.dept.title',
          icon: 'i-ant-design:gold-twotone',
          order: 6,
          type: 'menu',
          path: '/system/dept',
          children: {
            create: [
              {
                name: '创建部门',
                type: 'button',
                permission: 'system:dept:create',
              },
              {
                name: '修改部门',
                type: 'button',
                permission: 'system:dept:update',
              },
              {
                name: '删除部门',
                type: 'button',
                permission: 'system:dept:delete',
              },
            ],
          },
        },
        {
          name: '岗位管理',
          title: 'system.post.title',
          icon: 'i-ant-design:deployment-unit-outlined',
          order: 7,
          type: 'menu',
          path: '/system/post',
          children: {
            create: [
              {
                name: '创建岗位',
                type: 'button',
                permission: 'system:post:create',
              },
              {
                name: '修改岗位',
                type: 'button',
                permission: 'system:post:update',
              },
              {
                name: '删除岗位',
                type: 'button',
                permission: 'system:post:delete',
              },
            ],
          },
        },
      ],
    },
  },
  {
    name: '系统监控',
    title: 'monitor.title',
    icon: 'i-ant-design:android-filled',
    order: 6,
    type: 'catalog',
    path: '/monitor',
    children: {
      create: [
        {
          name: '在线用户',
          title: 'monitor.online.title',
          icon: 'i-ant-design:aim-outlined',
          order: 1,
          type: 'menu',
          path: '/monitor/online',
          children: {
            create: [
              {
                name: '强退',
                type: 'button',
                permission: 'monitor:online:forceLogout',
              },
            ],
          },
        },
        {
          name: '登录日志',
          title: 'monitor.loginLog.title',
          order: 2,
          icon: 'i-ant-design:contacts-outlined',
          type: 'menu',
          path: '/monitor/loginLog',
        },
        {
          name: '操作日志',
          title: 'monitor.operationLog.title',
          order: 3,
          icon: 'i-ant-design:cloud-server-outlined',
          type: 'menu',
          path: '/monitor/operationLog',
        },
        {
          name: '服务器监控',
          title: 'monitor.info.title',
          icon: 'i-ant-design:fund-projection-screen-outlined',
          order: 4,
          path: '/monitor/info',
          type: 'menu',
        },
      ],
    },
  },
];

/** 字典种子数据 */
export const SEED_DICTS: Prisma.DictCreateInput[] = [
  {
    name: '用户性别',
    value: 'sex',
    dictData: {
      create: [
        { name: '男', value: '1', order: 1 },
        { name: '女', value: '2', order: 2 },
        { name: '未知', value: '3', order: 3 },
      ],
    },
  },
  {
    name: '状态',
    value: 'status',
    dictData: {
      create: [
        { name: '启用', value: '1', order: 1 },
        { name: '禁用', value: '2', order: 2 },
      ],
    },
  },
];
