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
  data: unknown[] = [],
  total: number = 0,
) => ({
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

type MockFn = ReturnType<typeof vi.fn>;

/** Prisma model 上常用方法 — 单一数据源，类型和运行时共用 */
const PRISMA_MODEL_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'paginate',
] as const;

// ---- 从 const 推导类型，零重复 ----
type PrismaMethod = (typeof PRISMA_MODEL_METHODS)[number];
/** model mock：方法名从 PRISMA_MODEL_METHODS 推导，附加 index signature 兜底自定义方法 */
type MockModelMethods = Record<PrismaMethod, MockFn> & Record<string, MockFn>;
/** 已知 model — 新增 model 只改这里，Proxy 保证运行时任意属性都可用 */
type MockPrismaClient = Record<
  | 'assistant'
  | 'dept'
  | 'dict'
  | 'dictData'
  | 'loginLog'
  | 'menu'
  | 'operationLog'
  | 'post'
  | 'role'
  | 'user',
  MockModelMethods
> & {
  $executeRawUnsafe: MockFn;
  $queryRaw: MockFn;
  $transaction: MockFn;
};

/**
 * 创建单个 Prisma model 的 mock
 * 所有方法均为 vi.fn()，paginate 自带 withPages 链式调用
 */
const createModelMock = (): MockModelMethods => {
  const model = {} as MockModelMethods;
  for (const method of PRISMA_MODEL_METHODS) {
    model[method] = vi.fn();
  }
  model.paginate.mockReturnValue({
    withPages: vi.fn().mockResolvedValue([[], { total: 0 }]),
  });
  return model;
};

/**
 * 创建 PrismaService mock（Proxy 自动生成模型）
 *
 * 使用 Proxy 拦截任意 model 访问（如 client.user、client.loginLog），
 * 首次访问时自动创建包含全部 Prisma 方法的 mock，无需手动维护模型列表。
 *
 * @example
 * ```ts
 * const prisma = createMockPrismaService();
 * prisma.client.user.findUnique.mockResolvedValue({ id: 1 });
 * prisma.client.anyNewModel.create.mockResolvedValue({ id: 1 }); // 自动可用
 * ```
 */
export const createMockPrismaService = () => {
  const models = new Map<string, MockModelMethods>();

  const getModel = (name: string): MockModelMethods => {
    const existing = models.get(name);
    if (existing) return existing;
    const model = createModelMock();
    models.set(name, model);
    return model;
  };

  const specialMethods: Record<string, MockFn> = {};

  const client = new Proxy({} as MockPrismaClient, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;
      if (prop in specialMethods) return specialMethods[prop];
      return getModel(prop);
    },
  });

  // $transaction: 回调模式接收 client 自身作为参数（与真实行为一致）
  specialMethods.$transaction = vi.fn(
    (cb: unknown) =>
      typeof cb === 'function'
        ? (cb as (c: typeof client) => unknown)(client)
        : Promise.all(cb as Promise<unknown>[]), // 数组模式
  );
  specialMethods.$queryRaw = vi.fn().mockResolvedValue([]);
  specialMethods.$executeRawUnsafe = vi.fn().mockResolvedValue(0);

  return { client };
};

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
