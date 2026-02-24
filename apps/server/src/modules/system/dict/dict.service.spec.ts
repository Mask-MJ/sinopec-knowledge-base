import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import {
  CreateDictDataDto,
  CreateDictDto,
  QueryDictDataDto,
  QueryDictDto,
  UpdateDictDataDto,
  UpdateDictDto,
} from './dict.dto';
import { DictService } from './dict.service';

describe('dictService', () => {
  let service: DictService;
  let prismaService: any;

  const mockPrismaService = {
    client: {
      dict: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      dictData: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DictService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DictService>(DictService);
    prismaService = module.get('PrismaService');

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a dict', async () => {
      const createDictDto: CreateDictDto = {
        name: 'Status',
        value: 'status',
      };

      mockPrismaService.client.dict.create.mockResolvedValue(createDictDto);

      const result = await service.create(createDictDto);

      expect(result).toEqual(createDictDto);
    });
  });

  describe('findAll', () => {
    it('should return all dicts', async () => {
      const queryDictDto: QueryDictDto = {};
      mockPrismaService.client.dict.findMany.mockResolvedValue([]);

      const result = await service.findAll(queryDictDto);

      expect(result).toEqual([]);
    });

    it('should filter dicts by name and value', async () => {
      const queryDictDto: QueryDictDto = { name: 'status', value: 'active' };
      mockPrismaService.client.dict.findMany.mockResolvedValue([]);

      await service.findAll(queryDictDto);

      expect(prismaService.client.dict.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'status', mode: 'insensitive' },
            value: { contains: 'active', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a dict', async () => {
      mockPrismaService.client.dict.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.findOne(1);

      expect(result).toEqual({ id: 1 });
    });

    it('should return null when dict not found', async () => {
      mockPrismaService.client.dict.findUnique.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a dict', async () => {
      const updateDictDto: UpdateDictDto = { id: 1, name: 'New Name' };
      mockPrismaService.client.dict.update.mockResolvedValue(updateDictDto);

      const result = await service.update(1, updateDictDto);

      expect(result).toEqual(updateDictDto);
    });
  });

  describe('delete', () => {
    it('should delete a dict', async () => {
      mockPrismaService.client.dict.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('createData', () => {
    it('should create dict data', async () => {
      const createDictDataDto: CreateDictDataDto = {
        name: 'Active',
        value: '1',
        dictId: 1,
        order: 1,
      };
      mockPrismaService.client.dictData.create.mockResolvedValue(
        createDictDataDto,
      );

      const result = await service.createData(createDictDataDto);

      expect(result).toEqual(createDictDataDto);
    });
  });

  describe('findAllData', () => {
    it('should find dict data by dictId', async () => {
      const queryDictDataDto: QueryDictDataDto = { dictId: 1 };
      mockPrismaService.client.dictData.findMany.mockResolvedValue([]);

      const result = await service.findAllData(queryDictDataDto);

      expect(result).toEqual([]);
      expect(prismaService.client.dictData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dictId: 1 }),
        }),
      );
    });

    it('should find dict data by dictValue', async () => {
      const queryDictDataDto: QueryDictDataDto = { dictValue: 'status' };
      mockPrismaService.client.dict.findFirst.mockResolvedValue({ id: 1 });
      mockPrismaService.client.dictData.findMany.mockResolvedValue([]);

      const result = await service.findAllData(queryDictDataDto);

      expect(result).toEqual([]);
      expect(prismaService.client.dict.findFirst).toHaveBeenCalledWith({
        where: { value: { contains: 'status' } },
      });
      expect(prismaService.client.dictData.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ dictId: 1 }),
        }),
      );
    });

    it('should return empty array if dictValue not found', async () => {
      const queryDictDataDto: QueryDictDataDto = { dictValue: 'unknown' };
      mockPrismaService.client.dict.findFirst.mockResolvedValue(null);

      const result = await service.findAllData(queryDictDataDto);

      expect(result).toEqual([]);
    });
  });

  describe('findOneData', () => {
    it('should return dict data', async () => {
      mockPrismaService.client.dictData.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.findOneData(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('updateData', () => {
    it('should update dict data', async () => {
      const updateDictDataDto: UpdateDictDataDto = { id: 1, name: 'Inactive' };
      mockPrismaService.client.dictData.update.mockResolvedValue(
        updateDictDataDto,
      );

      const result = await service.updateData(1, updateDictDataDto);

      expect(result).toEqual(updateDictDataDto);
    });
  });

  describe('deleteData', () => {
    it('should delete dict data', async () => {
      mockPrismaService.client.dictData.delete.mockResolvedValue({ id: 1 });

      const result = await service.deleteData(1);

      expect(result).toEqual({ id: 1 });
    });
  });
});
