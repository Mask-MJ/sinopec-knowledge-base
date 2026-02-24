// 统一导出所有 mock 工厂函数
// 按模块拆分后通过此文件重新导出，保持向后兼容

// Business 模块
export {
  createMockCreateInfluencerDto,
  createMockCreateShowcaseDto,
  createMockCreateTaskDto,
  createMockInfluencer,
  createMockShowcase,
  createMockTask,
} from './business.mock';

// 通用 Mock
export {
  createMockActiveUser,
  createMockAdminUser,
  createMockBuyerService,
  createMockEventEmitter,
  createMockFile,
  createMockHashingService,
  createMockHttpService,
  createMockMinioService,
  createMockPaginate,
  createMockPrismaService,
} from './common.mock';

// ERP 模块
export {
  createMockBuyer,
  createMockCreateBuyerDto,
  createMockCreateOrderDto,
  createMockCreateShopDto,
  createMockOrder,
  createMockShop,
} from './erp.mock';

// Monitor 模块
export {
  createMockCreateLoginLogDto,
  createMockCreateOperationLogDto,
  createMockLoginLog,
  createMockOperationLog,
} from './monitor.mock';
