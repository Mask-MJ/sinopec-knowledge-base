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
export const createMockPaginate = (
  data: any[] = [],
  total: number = 0,
): Record<string, any> => ({
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
    // eslint-disable-next-line n/prefer-global/buffer
    buffer: new Uint8Array() as Buffer,
    size: 1024,
    ...overrides,
  }) as Express.Multer.File;

// ==================== PrismaService Mock ====================

/**
 * 创建基础 PrismaService mock
 * 包含知识库项目所有模块的 CRUD 方法 mock
 */
export const createMockPrismaService = (): Record<string, any> => ({
  client: {
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
    // Transaction support
    $transaction: vi.fn((cb) => cb({})),
  },
});

// ==================== 服务 Mock ====================

/**
 * 创建 MinioService mock
 */
export const createMockMinioService = (): Record<string, any> => ({
  uploadFile: vi.fn(),
  getUrl: vi.fn().mockResolvedValue('http://minio/test-file.jpg'),
  deleteFile: vi.fn(),
});

/**
 * 创建 HashingService mock
 */
export const createMockHashingService = (): Record<string, any> => ({
  hash: vi.fn().mockResolvedValue('hashedPassword'),
  compare: vi.fn().mockResolvedValue(true),
});

/**
 * 创建 EventEmitter2 mock
 */
export const createMockEventEmitter = (): Record<string, any> => ({
  emit: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
});

/**
 * 创建 HttpService mock
 */
export const createMockHttpService = (): Record<string, any> => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  axiosRef: {
    get: vi.fn(),
    post: vi.fn(),
  },
});
