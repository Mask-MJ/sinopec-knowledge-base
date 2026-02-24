import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { RoleController } from './role.controller';
import { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './role.dto';
import { RoleService } from './role.service';

describe('roleController', () => {
  let controller: RoleController;
  let service: RoleService;

  const mockRole = {
    id: 1,
    name: '管理员',
    value: 'admin',
    order: 1,
    remark: '系统管理员',
    createdAt: new Date(),
    updatedAt: new Date(),
    menuIds: [1, 2, 3],
  };

  const mockPaginatedResponse = {
    list: [mockRole],
    pagination: {
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
    },
  };

  const mockRoleService = {
    create: vi.fn(),
    findWithPagination: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleController],
      providers: [
        {
          provide: RoleService,
          useValue: mockRoleService,
        },
      ],
    }).compile();

    controller = module.get<RoleController>(RoleController);
    service = module.get<RoleService>(RoleService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new role', async () => {
      const createRoleDto: CreateRoleDto = {
        name: '管理员',
        value: 'admin',
        menuIds: [1, 2, 3],
      };

      mockRoleService.create.mockResolvedValue(mockRole);

      const result = await controller.create(createRoleDto);

      expect(service.create).toHaveBeenCalledWith(createRoleDto);
      expect(result).toEqual(mockRole);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated roles', async () => {
      const queryRoleDto: QueryRoleDto = { current: 1, pageSize: 10 };

      mockRoleService.findWithPagination.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await controller.findWithPagination(queryRoleDto);

      expect(service.findWithPagination).toHaveBeenCalledWith(queryRoleDto);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should return paginated roles with name filter', async () => {
      const queryRoleDto: QueryRoleDto = {
        current: 1,
        pageSize: 10,
        name: '管理',
      };

      mockRoleService.findWithPagination.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await controller.findWithPagination(queryRoleDto);

      expect(service.findWithPagination).toHaveBeenCalledWith(queryRoleDto);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('findOne', () => {
    it('should return a single role', async () => {
      mockRoleService.findOne.mockResolvedValue(mockRole);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRole);
    });
  });

  describe('update', () => {
    it('should update a role', async () => {
      const updateRoleDto: UpdateRoleDto = {
        id: 1,
        name: '超级管理员',
      };
      const updatedRole = { ...mockRole, name: '超级管理员' };

      mockRoleService.update.mockResolvedValue(updatedRole);

      const result = await controller.update(1, updateRoleDto);

      expect(service.update).toHaveBeenCalledWith(1, updateRoleDto);
      expect(result).toEqual(updatedRole);
    });
  });

  describe('delete', () => {
    it('should delete a role', async () => {
      mockRoleService.delete.mockResolvedValue(mockRole);

      const result = await controller.delete(1);

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRole);
    });
  });
});
