import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { CreateDeptDto, QueryDeptDto, UpdateDeptDto } from './dept.dto';
import { DeptService } from './dept.service';

describe('deptService', () => {
  let service: DeptService;
  let prismaService: any;

  const mockPrismaService = {
    client: {
      user: {
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
      },
      dept: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeptService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<DeptService>(DeptService);
    prismaService = module.get('PrismaService');

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a department', async () => {
      const createDeptDto: CreateDeptDto = {
        name: 'Tech',
        leaderId: 2,
        order: 1,
      };

      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        username: 'leader',
      });
      mockPrismaService.client.dept.create.mockResolvedValue({
        id: 1,
        ...createDeptDto,
        leader: 'leader',
      });
      mockPrismaService.client.user.update.mockResolvedValue({});

      const result = await service.create(createDeptDto);

      expect(prismaService.client.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: createDeptDto.leaderId },
      });
      expect(prismaService.client.dept.create).toHaveBeenCalled();
      expect(prismaService.client.user.update).toHaveBeenCalledWith({
        where: { id: createDeptDto.leaderId },
        data: { isDeptAdmin: true, deptId: 1 },
      });
      expect(result).toHaveProperty('id');
    });

    it('should throw error when leader user not found', async () => {
      const createDeptDto: CreateDeptDto = {
        name: 'Tech',
        leaderId: 999,
        order: 1,
      };

      mockPrismaService.client.user.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(service.create(createDeptDto)).rejects.toThrow();
      expect(prismaService.client.dept.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return a tree of departments', async () => {
      const queryDeptDto: QueryDeptDto = {};
      const mockDepts = [
        { id: 1, name: 'Root', parentId: null },
        { id: 2, name: 'Child', parentId: 1 },
      ];

      mockPrismaService.client.dept.findMany.mockResolvedValue(mockDepts);

      const result = await service.findAll(queryDeptDto);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });
  });

  describe('findWithPagination', () => {
    it('should return a single department', async () => {
      mockPrismaService.client.dept.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        name: 'Tech',
      });

      const result = await service.findWithPagination(1);

      expect(result.id).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return a single department', async () => {
      mockPrismaService.client.dept.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        name: 'Tech',
      });

      const result = await service.findOne(1);

      expect(result.id).toBe(1);
    });

    it('should throw error when department not found', async () => {
      mockPrismaService.client.dept.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(service.findOne(999)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update a department', async () => {
      const updateDeptDto: UpdateDeptDto = { id: 1, name: 'New Tech' };

      mockPrismaService.client.dept.update.mockResolvedValue({
        id: 1,
        name: 'New Tech',
      });

      const result = await service.update(1, updateDeptDto);

      expect(result.name).toBe('New Tech');
    });
  });

  describe('delete', () => {
    it('should delete a department', async () => {
      mockPrismaService.client.dept.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);

      expect(result.id).toBe(1);
    });
  });
});
