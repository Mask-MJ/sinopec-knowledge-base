import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { DeptController } from './dept.controller';
import { CreateDeptDto, QueryDeptDto, UpdateDeptDto } from './dept.dto';
import { DeptService } from './dept.service';

describe('deptController', () => {
  let controller: DeptController;
  let service: DeptService;

  const mockDept = {
    id: 1,
    name: '技术部',
    order: 1,
    leaderId: 1,
    leader: 'admin',
    phone: '13000000000',
    email: 'test@example.com',
    parentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDeptService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeptController],
      providers: [
        {
          provide: DeptService,
          useValue: mockDeptService,
        },
      ],
    }).compile();

    controller = module.get<DeptController>(DeptController);
    service = module.get<DeptService>(DeptService);

    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new department', async () => {
      const createDeptDto: CreateDeptDto = {
        name: '技术部',
        leaderId: 1,
        order: 1,
        phone: '13000000000',
        email: 'test@example.com',
      };

      mockDeptService.create.mockResolvedValue(mockDept);

      const result = await controller.create(createDeptDto);

      expect(service.create).toHaveBeenCalledWith(createDeptDto);
      expect(result).toEqual(mockDept);
    });
  });

  describe('findAll', () => {
    it('should return an array of departments', async () => {
      const queryDeptDto: QueryDeptDto = { name: '技术' };
      const mockDepts = [mockDept];

      mockDeptService.findAll.mockResolvedValue(mockDepts);

      const result = await controller.findAll(queryDeptDto);

      expect(service.findAll).toHaveBeenCalledWith(queryDeptDto);
      expect(result).toEqual(mockDepts);
    });

    it('should return all departments when query is empty', async () => {
      const queryDeptDto: QueryDeptDto = {};
      const mockDepts = [mockDept];

      mockDeptService.findAll.mockResolvedValue(mockDepts);

      const result = await controller.findAll(queryDeptDto);

      expect(service.findAll).toHaveBeenCalledWith(queryDeptDto);
      expect(result).toEqual(mockDepts);
    });
  });

  describe('findOne', () => {
    it('should return a single department', async () => {
      mockDeptService.findOne.mockResolvedValue(mockDept);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDept);
    });
  });

  describe('update', () => {
    it('should update a department', async () => {
      const updateDeptDto: UpdateDeptDto = {
        id: 1,
        name: '更新后的技术部',
      };
      const updatedDept = { ...mockDept, name: '更新后的技术部' };

      mockDeptService.update.mockResolvedValue(updatedDept);

      const result = await controller.update(1, updateDeptDto);

      expect(service.update).toHaveBeenCalledWith(1, updateDeptDto);
      expect(result).toEqual(updatedDept);
    });
  });

  describe('delete', () => {
    it('should delete a department', async () => {
      mockDeptService.delete.mockResolvedValue(mockDept);

      const result = await controller.delete(1);

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDept);
    });
  });
});
