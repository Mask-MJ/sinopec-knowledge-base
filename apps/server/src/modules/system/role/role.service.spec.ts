import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './role.dto';
import { RoleService } from './role.service';

describe('roleService', () => {
  let service: RoleService;
  let prismaService: any;

  const mockPrismaService = {
    client: {
      role: {
        create: vi.fn(),
        paginate: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  const mockPaginate = {
    withPages: vi.fn().mockResolvedValue([[], { total: 0 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<RoleService>(RoleService);
    prismaService = module.get('PrismaService');

    mockPrismaService.client.role.paginate.mockReturnValue(mockPaginate);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a role', async () => {
      const createRoleDto: CreateRoleDto = {
        name: 'Admin',
        value: 'admin',
        order: 1,
        menuIds: [1, 2],
        remark: 'remark',
      };
      mockPrismaService.client.role.create.mockResolvedValue(createRoleDto);

      const result = await service.create(createRoleDto);

      expect(prismaService.client.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            menus: { connect: [{ id: 1 }, { id: 2 }] },
          }),
        }),
      );
      expect(result).toEqual(createRoleDto);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated roles', async () => {
      const queryRoleDto: QueryRoleDto = { current: 1, pageSize: 10 };

      const result = await service.findWithPagination(queryRoleDto);

      expect(prismaService.client.role.paginate).toHaveBeenCalled();
      expect(result).toHaveProperty('list');
    });
  });

  describe('findOne', () => {
    it('should return a role with menuIds', async () => {
      mockPrismaService.client.role.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        name: 'Admin',
        menus: [{ id: 1 }, { id: 2 }],
      });

      const result = await service.findOne(1);

      expect(result).toHaveProperty('menuIds');
      expect(result.menuIds).toEqual([1, 2]);
    });

    it('should throw error when role not found', async () => {
      mockPrismaService.client.role.findUniqueOrThrow.mockRejectedValue(
        new Error('Record not found'),
      );

      await expect(service.findOne(999)).rejects.toThrow();
    });

    it('should return empty menuIds when role has no menus', async () => {
      mockPrismaService.client.role.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        name: 'Empty Role',
        menus: [],
      });

      const result = await service.findOne(1);

      expect(result.menuIds).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update a role', async () => {
      const updateRoleDto: UpdateRoleDto = {
        id: 1,
        name: 'Super Admin',
        menuIds: [3],
      };
      mockPrismaService.client.role.update.mockResolvedValue(updateRoleDto);

      const result = await service.update(1, updateRoleDto);

      expect(prismaService.client.role.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            menus: { set: [{ id: 3 }] },
          }),
        }),
      );
      expect(result).toEqual(updateRoleDto);
    });
  });

  describe('delete', () => {
    it('should delete a role', async () => {
      mockPrismaService.client.role.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);

      expect(result).toEqual({ id: 1 });
    });
  });
});
