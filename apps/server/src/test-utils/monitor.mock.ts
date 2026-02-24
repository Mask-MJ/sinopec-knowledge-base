import { CreateLoginLogDto } from '@/modules/monitor/login-log/login-log.dto';
import { CreateOperationLogDto } from '@/modules/monitor/operation-log/operation-log.dto';

// ==================== Monitor 模块 DTO 工厂 ====================

/**
 * 创建 CreateLoginLogDto mock
 */
export const createMockCreateLoginLogDto = (
  overrides?: Partial<CreateLoginLogDto>,
): CreateLoginLogDto => ({
  username: 'testuser',
  ip: '127.0.0.1',
  browser: 'Chrome',
  os: 'Windows',
  status: true,
  ...overrides,
});

/**
 * 创建 LoginLog 实体 mock
 */
export const createMockLoginLog = (overrides?: Record<string, any>) => ({
  id: 1,
  username: 'testuser',
  ip: '127.0.0.1',
  browser: 'Chrome',
  os: 'Windows',
  status: true,
  address: 'Local',
  message: 'Success',
  loginTime: new Date(),
  createdAt: new Date(),
  ...overrides,
});

/**
 * 创建 CreateOperationLogDto mock
 */
export const createMockCreateOperationLogDto = (
  overrides?: Partial<CreateOperationLogDto>,
): CreateOperationLogDto => ({
  title: '删除用户',
  username: 'admin',
  businessType: 1,
  module: 'system',
  ip: '127.0.0.1',
  ...overrides,
});

/**
 * 创建 OperationLog 实体 mock
 */
export const createMockOperationLog = (overrides?: Record<string, any>) => ({
  id: 1,
  title: '删除用户',
  username: 'admin',
  businessType: 1,
  module: 'system',
  ip: '127.0.0.1',
  address: 'Local',
  createdAt: new Date(),
  ...overrides,
});
