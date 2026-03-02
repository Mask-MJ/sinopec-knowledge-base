// 统一导出所有 mock 工厂函数

export {
  createMockActiveUser,
  createMockAdminUser,
  createMockEventEmitter,
  createMockFile,
  createMockHashingService,
  createMockHttpService,
  createMockMinioService,
  createMockPaginate,
  createMockPrismaService,
} from './common.mock';

// Monitor 模块
export {
  createMockCreateLoginLogDto,
  createMockCreateOperationLogDto,
  createMockLoginLog,
  createMockOperationLog,
} from './monitor.mock';
