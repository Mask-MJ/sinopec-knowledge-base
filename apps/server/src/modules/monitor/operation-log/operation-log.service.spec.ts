import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';

import {
  createMockCreateOperationLogDto,
  createMockOperationLog,
  createMockPaginate,
  createMockPrismaService,
} from '@/test-utils/mock.factory';

import { QueryOperationLogDto } from './operation-log.dto';
import { OperationLogService } from './operation-log.service';

// Mock IP2Region
vi.mock('ip2region', () => ({
  default: class {
    search() {
      return { province: 'Guangdong', city: 'Shenzhen' };
    }
  },
}));

describe('operationLogService', () => {
  let service: OperationLogService;
  let prismaService: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    const mockPrismaService = createMockPrismaService();
    const mockPaginate = createMockPaginate();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationLogService,
        {
          provide: PRISMA_SERVICE_TOKEN,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OperationLogService>(OperationLogService);
    prismaService = module.get(PRISMA_SERVICE_TOKEN);

    vi.clearAllMocks();

    prismaService.client.operationLog.paginate.mockReturnValue(mockPaginate);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create operation log with address', async () => {
      const createDto = createMockCreateOperationLogDto();
      const expectedResult = createMockOperationLog({
        address: 'GuangdongShenzhen',
      });

      prismaService.client.operationLog.create.mockResolvedValue(
        expectedResult,
      );

      const result = await service.create(createDto);

      expect(prismaService.client.operationLog.create).toHaveBeenCalledWith({
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
      const queryDto: QueryOperationLogDto = { current: 1, pageSize: 10 };
      prismaService.client.operationLog.paginate.mockReturnValue(
        createMockPaginate(),
      );

      const result = await service.findWithPagination(queryDto);

      expect(prismaService.client.operationLog.paginate).toHaveBeenCalled();
      expect(result).toHaveProperty('list');
    });
  });

  describe('findOne', () => {
    it('should return log detail', async () => {
      const mockLog = createMockOperationLog();
      prismaService.client.operationLog.findUniqueOrThrow.mockResolvedValue(
        mockLog,
      );

      const result = await service.findOne(1);

      expect(result).toEqual(mockLog);
    });

    it('should throw error when log not found', async () => {
      prismaService.client.operationLog.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(service.findOne(999)).rejects.toThrow();
    });
  });

  describe('handleOperationEvent', () => {
    it('should handle operation log event', async () => {
      const createDto = createMockCreateOperationLogDto();
      const mockLog = createMockOperationLog();
      const createSpy = vi.spyOn(service, 'create').mockResolvedValue(mockLog);

      await service.handleOperationEvent(createDto);

      expect(createSpy).toHaveBeenCalledWith(createDto);
    });
  });
});
