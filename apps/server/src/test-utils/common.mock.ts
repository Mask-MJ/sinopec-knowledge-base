import { vi } from 'vitest';

import { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

// ==================== 通用 Mock ====================

/**
 * 创建模拟的 ActiveUserData
 * @param overrides 可选的覆盖属性
 */
export const createMockActiveUser = (
  overrides?: Partial<ActiveUserData>,
): ActiveUserData => ({
  sub: 1,
  username: 'testuser',
  nickname: 'Test User',
  roles: [],
  ...overrides,
});

/**
 * 创建管理员用户
 */
export const createMockAdminUser = (
  overrides?: Partial<ActiveUserData>,
): ActiveUserData =>
  createMockActiveUser({
    username: 'admin',
    nickname: '管理员',
    roles: ['admin'],
    ...overrides,
  });

/**
 * 创建分页 mock 对象
 * @param data 返回的数据列表
 * @param total 总数
 */
export const createMockPaginate = (data: any[] = [], total: number = 0) => ({
  withPages: vi.fn().mockResolvedValue([data, { total }]),
});

/**
 * 创建 Express.Multer.File mock
 */
export const createMockFile = (
  overrides?: Partial<Express.Multer.File>,
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'test.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer: Buffer.from(''),
    size: 1024,
    ...overrides,
  }) as Express.Multer.File;

// ==================== PrismaService Mock ====================

/**
 * 创建基础 PrismaService mock
 * 包含所有模块的 CRUD 方法 mock
 */
export const createMockPrismaService = () => ({
  client: {
    // System 模块
    user: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    dept: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dict: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dictData: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    menu: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    role: {
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    // Business 模块
    influencer: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    taskVideo: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    // ERP 模块
    order: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    shop: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    showcase: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    buyer: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
      paginate: vi.fn(),
    },
    shopAnalytics: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    shopProduct: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
    },
    shopProductSku: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    brand: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    // Monitor 模块
    loginLog: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      paginate: vi.fn(),
    },
    operationLog: {
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      paginate: vi.fn(),
    },
    // Transaction support
    $transaction: vi.fn((cb) => cb({})),
  },
});

// ==================== 服务 Mock ====================

/**
 * 创建 MinioService mock
 */
export const createMockMinioService = () => ({
  uploadFile: vi.fn(),
  getUrl: vi.fn().mockResolvedValue('http://minio/test-file.jpg'),
  deleteFile: vi.fn(),
});

/**
 * 创建 HashingService mock
 */
export const createMockHashingService = () => ({
  hash: vi.fn().mockResolvedValue('hashedPassword'),
  compare: vi.fn().mockResolvedValue(true),
});

/**
 * 创建 EventEmitter2 mock
 */
export const createMockEventEmitter = () => ({
  emit: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
});

/**
 * 创建 HttpService mock
 */
export const createMockHttpService = () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  axiosRef: {
    get: vi.fn(),
    post: vi.fn(),
  },
});

/**
 * 创建 BuyerService mock
 */
export const createMockBuyerService = () => ({
  create: vi.fn(),
  findOne: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  upsertByUserId: vi.fn(),
});
