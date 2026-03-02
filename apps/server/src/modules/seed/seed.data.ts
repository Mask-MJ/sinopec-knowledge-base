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
    name: '短视频业务工具',
    title: 'business.title',
    icon: 'i-ant-design:tool-outlined',
    order: 2,
    type: 'catalog',
    path: '/business',
    children: {
      create: [
        {
          name: '任务列表',
          title: 'business.task.title',
          icon: 'i-ant-design:control-outlined',
          order: 1,
          type: 'menu',
          path: '/business/task',
          children: {
            create: [
              {
                name: '任务产出视频列表',
                title: 'business.task.video.title',
                hideInMenu: true,
                icon: 'i-ant-design:folder-outlined',
                order: 1,
                type: 'menu',
                path: '/business/task/:id',
              },
              {
                name: '创建任务',
                type: 'button',
                permission: 'business:task:create',
              },
              {
                name: '执行任务',
                type: 'button',
                permission: 'business:task:execute',
              },
              {
                name: '重试任务',
                type: 'button',
                permission: 'business:task:retry',
              },
              {
                name: '视频审核',
                type: 'button',
                permission: 'business:task:review',
              },
              {
                name: '上传视频',
                type: 'button',
                permission: 'business:task:upload',
              },
              {
                name: '更新任务',
                type: 'button',
                permission: 'business:task:update',
              },
              {
                name: '删除任务',
                type: 'button',
                permission: 'business:task:delete',
              },
            ],
          },
        },
        {
          name: '橱窗商品',
          title: 'business.showcase.title',
          icon: 'i-ant-design:apartment-outlined',
          order: 2,
          type: 'menu',
          path: '/business/showcase',
          children: {
            create: [
              {
                name: '创建橱窗商品',
                type: 'button',
                permission: 'business:showcase:create',
              },
              {
                name: '修改橱窗商品',
                type: 'button',
                permission: 'business:showcase:update',
              },
              {
                name: '删除橱窗商品',
                type: 'button',
                permission: 'business:showcase:delete',
              },
            ],
          },
        },
        {
          name: '网红账号管理',
          title: 'business.influencer.title',
          icon: 'i-ant-design:idcard-outlined',
          order: 3,
          type: 'menu',
          path: '/business/influencer',
          children: {
            create: [
              {
                name: '创建网红账号',
                type: 'button',
                permission: 'business:influencer:create',
              },
              {
                name: '修改网红账号',
                type: 'button',
                permission: 'business:influencer:update',
              },
              {
                name: '删除网红账号',
                type: 'button',
                permission: 'business:influencer:delete',
              },
            ],
          },
        },
      ],
    },
  },
  {
    name: 'ERP',
    title: 'erp.title',
    icon: 'i-ant-design:shop-outlined',
    order: 3,
    type: 'catalog',
    path: '/erp',
    children: {
      create: [
        {
          name: '买家管理',
          title: 'erp.buyer.title',
          icon: 'i-ant-design:team-outlined',
          order: 1,
          type: 'menu',
          path: '/erp/buyer',
          children: {
            create: [
              {
                name: '创建买家',
                type: 'button',
                permission: 'erp:buyer:create',
              },
              {
                name: '修改买家',
                type: 'button',
                permission: 'erp:buyer:update',
              },
              {
                name: '删除买家',
                type: 'button',
                permission: 'erp:buyer:delete',
              },
            ],
          },
        },
        {
          name: '订单管理',
          title: 'erp.order.title',
          icon: 'i-ant-design:shopping-cart-outlined',
          order: 2,
          type: 'menu',
          path: '/erp/order',
          children: {
            create: [
              {
                name: '创建订单',
                type: 'button',
                permission: 'erp:order:create',
              },
              {
                name: '修改订单',
                type: 'button',
                permission: 'erp:order:update',
              },
              {
                name: '删除订单',
                type: 'button',
                permission: 'erp:order:delete',
              },
            ],
          },
        },
        {
          name: '商店管理',
          title: 'erp.shop.title',
          icon: 'i-ant-design:shop-outlined',
          order: 2,
          type: 'menu',
          path: '/erp/shop',
          children: {
            create: [
              {
                name: '数据报表',
                title: 'erp.shop.analytics.title',
                hideInMenu: true,
                icon: 'i-ant-design:bar-chart-outlined',
                order: 1,
                type: 'menu',
                path: '/erp/shop/:id',
              },
              {
                name: '创建商店',
                type: 'button',
                permission: 'erp:shop:create',
              },
              {
                name: '修改商店',
                type: 'button',
                permission: 'erp:shop:update',
              },
              {
                name: '数据分析报表',
                type: 'button',
                permission: 'erp:shop:analytics',
              },
              {
                name: '删除商店',
                type: 'button',
                permission: 'erp:shop:delete',
              },
            ],
          },
        },
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
  {
    name: '任务类别',
    value: 'taskType',
    dictData: {
      create: [
        { name: '海螺', value: '1', order: 1 },
        { name: '数字人', value: '2', order: 2 },
        { name: '人物模仿', value: '3', order: 3 },
        { name: '手动上传', value: '4', order: 4 },
      ],
    },
  },
  {
    name: '归属地',
    value: 'region',
    dictData: {
      create: [
        { name: '英国', value: '1', order: 1 },
        { name: '美国', value: '2', order: 2 },
        { name: '法国', value: '3', order: 3 },
        { name: '德国', value: '4', order: 4 },
        { name: '西班牙', value: '5', order: 5 },
        { name: '意大利', value: '6', order: 6 },
      ],
    },
  },
  {
    name: '视频任务状态',
    value: 'videoTaskStatus',
    dictData: {
      create: [
        { name: '未开始', value: '0', order: 1 },
        { name: '待审核', value: '1', order: 1 },
        { name: '失败', value: '2', order: 2 },
        { name: '进行中', value: '3', order: 3 },
        { name: '已审核', value: '4', order: 4 },
        { name: '已完成', value: '5', order: 5 },
      ],
    },
  },
  {
    name: '视频审核状态',
    value: 'videoReviewStatus',
    dictData: {
      create: [
        { name: '未审核', value: '0', order: 1 },
        { name: '审核通过', value: '1', order: 1 },
        { name: '审核不通过', value: '2', order: 2 },
        { name: '关联商品码错误', value: '3', order: 3 },
        { name: '发布中', value: '4', order: 4 },
        { name: '发布成功', value: '5', order: 5 },
        { name: '发布失败', value: '6', order: 6 },
        { name: '已发布', value: '7', order: 7 },
        { name: '用户不存在', value: '8', order: 8 },
        { name: '视频有误', value: '9', order: 9 },
      ],
    },
  },
  {
    name: '订单状态',
    value: 'orderStatus',
    dictData: {
      create: [
        { name: '未付款', value: 'UNPAID', order: 1 },
        { name: '待处理', value: 'ON_HOLD', order: 2 },
        { name: '待发货', value: 'AWAITING_SHIPMENT', order: 3 },
        { name: '部分发货', value: 'PARTIALLY_SHIPPING', order: 4 },
        { name: '待揽收', value: 'AWAITING_COLLECTION', order: 5 },
        { name: '运输中', value: 'IN_TRANSIT', order: 6 },
        { name: '已签收', value: 'DELIVERED', order: 7 },
        { name: '已完成', value: 'COMPLETED', order: 8 },
        { name: '已取消', value: 'CANCELLED', order: 9 },
      ],
    },
  },
];
