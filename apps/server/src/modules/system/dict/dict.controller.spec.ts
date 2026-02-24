import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { DictController } from './dict.controller';
import {
  CreateDictDataDto,
  CreateDictDto,
  QueryDictDataDto,
  QueryDictDto,
  UpdateDictDataDto,
  UpdateDictDto,
} from './dict.dto';
import { DictService } from './dict.service';

describe('dictController', () => {
  let controller: DictController;
  let service: DictService;

  const mockDict = {
    id: 1,
    name: '性别',
    value: 'gender',
    remark: '性别字典',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin',
    updatedBy: 'admin',
  };

  const mockDictData = {
    id: 1,
    dictId: 1,
    name: '男',
    value: '1',
    order: 1,
    remark: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin',
    updatedBy: 'admin',
  };

  const mockDictService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createData: vi.fn(),
    findAllData: vi.fn(),
    findOneData: vi.fn(),
    updateData: vi.fn(),
    deleteData: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DictController],
      providers: [
        {
          provide: DictService,
          useValue: mockDictService,
        },
      ],
    }).compile();

    controller = module.get<DictController>(DictController);
    service = module.get<DictService>(DictService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // === Dict Tests ===
  describe('create', () => {
    it('should create a new dictionary', async () => {
      const createDictDto: CreateDictDto = {
        name: '性别',
        value: 'gender',
        remark: '性别字典',
      };

      mockDictService.create.mockResolvedValue(mockDict);

      const result = await controller.create(createDictDto);

      expect(service.create).toHaveBeenCalledWith(createDictDto);
      expect(result).toEqual(mockDict);
    });
  });

  describe('findAll', () => {
    it('should return an array of dictionaries', async () => {
      const queryDictDto: QueryDictDto = {};
      const mockDicts = [mockDict];

      mockDictService.findAll.mockResolvedValue(mockDicts);

      const result = await controller.findAll(queryDictDto);

      expect(service.findAll).toHaveBeenCalledWith(queryDictDto);
      expect(result).toEqual(mockDicts);
    });
  });

  describe('findOne', () => {
    it('should return a single dictionary', async () => {
      mockDictService.findOne.mockResolvedValue(mockDict);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDict);
    });
  });

  describe('update', () => {
    it('should update a dictionary', async () => {
      const updateDictDto: UpdateDictDto = {
        id: 1,
        name: '更新后的字典',
      };
      const updatedDict = { ...mockDict, name: '更新后的字典' };

      mockDictService.update.mockResolvedValue(updatedDict);

      const result = await controller.update(1, updateDictDto);

      expect(service.update).toHaveBeenCalledWith(1, updateDictDto);
      expect(result).toEqual(updatedDict);
    });
  });

  describe('delete', () => {
    it('should delete a dictionary', async () => {
      mockDictService.delete.mockResolvedValue(mockDict);

      const result = await controller.delete(1);

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDict);
    });
  });

  // === Dict Data Tests ===
  describe('createData', () => {
    it('should create a new dictionary data', async () => {
      const createDictDataDto: CreateDictDataDto = {
        dictId: 1,
        name: '男',
        value: '1',
        order: 1,
      };

      mockDictService.createData.mockResolvedValue(mockDictData);

      const result = await controller.createData(createDictDataDto);

      expect(service.createData).toHaveBeenCalledWith(createDictDataDto);
      expect(result).toEqual(mockDictData);
    });
  });

  describe('findAllData', () => {
    it('should return an array of dictionary data', async () => {
      const queryDictDataDto: QueryDictDataDto = { dictId: 1 };
      const mockDictDatas = [mockDictData];

      mockDictService.findAllData.mockResolvedValue(mockDictDatas);

      const result = await controller.findAllData(queryDictDataDto);

      expect(service.findAllData).toHaveBeenCalledWith(queryDictDataDto);
      expect(result).toEqual(mockDictDatas);
    });
  });

  describe('findOneData', () => {
    it('should return a single dictionary data', async () => {
      mockDictService.findOneData.mockResolvedValue(mockDictData);

      const result = await controller.findOneData(1);

      expect(service.findOneData).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDictData);
    });
  });

  describe('updateData', () => {
    it('should update a dictionary data', async () => {
      const updateDictDataDto: UpdateDictDataDto = {
        id: 1,
        name: '更新后的名称',
      };
      const updatedDictData = { ...mockDictData, name: '更新后的名称' };

      mockDictService.updateData.mockResolvedValue(updatedDictData);

      const result = await controller.updateData(1, updateDictDataDto);

      expect(service.updateData).toHaveBeenCalledWith(1, updateDictDataDto);
      expect(result).toEqual(updatedDictData);
    });
  });

  describe('deleteData', () => {
    it('should delete a dictionary data', async () => {
      mockDictService.deleteData.mockResolvedValue(mockDictData);

      const result = await controller.deleteData(1);

      expect(service.deleteData).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockDictData);
    });
  });
});
