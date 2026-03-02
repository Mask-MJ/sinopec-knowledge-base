import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import {
  createMockCreateLoginLogDto,
  createMockLoginLog,
  createMockPaginate,
  createMockPrismaService,
} from '@/test-utils/mock.factory';

import { QueryLoginLogDto } from './login-log.dto';
import { LoginLogService } from './login-log.service';

// Mock IP2Region
vi.mock('ip2region', () => ({
  default: class {
    search() {
      return { province: 'Guangdong', city: 'Shenzhen' };
    }
  },
}));

describe('loginLogService', () => {
  let service: LoginLogService;
  let prismaService: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    const mockPrismaService = createMockPrismaService();
    const mockPaginate = createMockPaginate();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginLogService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<LoginLogService>(LoginLogService);
    prismaService = module.get('PrismaService');

    prismaService.client.loginLog.paginate.mockReturnValue(mockPaginate);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create login log with address', async () => {
      const createDto = createMockCreateLoginLogDto();
      const expectedResult = createMockLoginLog({
        address: 'GuangdongShenzhen',
      });

      prismaService.client.loginLog.create.mockResolvedValue(expectedResult);

      const result = await service.create(createDto);

      expect(prismaService.client.loginLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...createDto,
          address: 'GuangdongShenzhen',
        }),
      });
      expect(result.address).toBe('GuangdongShenzhen');
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated logs', async () => {
      const queryDto: QueryLoginLogDto = { current: 1, pageSize: 10 };
      prismaService.client.loginLog.paginate.mockReturnValue(
        createMockPaginate(),
      );

      const result = await service.findWithPagination(queryDto);

      expect(prismaService.client.loginLog.paginate).toHaveBeenCalled();
      expect(result).toHaveProperty('list');
    });
  });

  describe('findOne', () => {
    it('should return log detail', async () => {
      const mockLog = createMockLoginLog();
      prismaService.client.loginLog.findUniqueOrThrow.mockResolvedValue(
        mockLog,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(mockLog);
    });

    it('should throw error when log not found', async () => {
      prismaService.client.loginLog.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(service.findOne(999)).rejects.toThrow();
    });
  });

  describe('handleLoginLogEvent', () => {
    it('should handle login log event', async () => {
      const createDto = createMockCreateLoginLogDto();
      const mockLog = createMockLoginLog();
      const createSpy = vi.spyOn(service, 'create').mockResolvedValue(mockLog);

      await service.handleLoginLogEvent(createDto);

      expect(createSpy).toHaveBeenCalledWith(createDto);
    });
  });
});
