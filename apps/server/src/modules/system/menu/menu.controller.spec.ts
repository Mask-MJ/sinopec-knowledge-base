import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { MenuController } from './menu.controller';
import { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './menu.dto';
import { MenuService } from './menu.service';

describe('menuController', () => {
  let controller: MenuController;
  let service: MenuService;

  const mockUser: ActiveUserData = {
    sub: 1,
    username: 'admin',
    nickname: '管理员',
    roles: ['admin'],
  };

  const mockMenu = {
    id: 1,
    name: '系统管理',
    path: '/system',
    icon: 'setting',
    type: 'menu',
    order: 1,
    parentId: null,
    permission: null,
    status: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMenuService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [
        {
          provide: MenuService,
          useValue: mockMenuService,
        },
      ],
    }).compile();

    controller = module.get<MenuController>(MenuController);
    service = module.get<MenuService>(MenuService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new menu', async () => {
      const createMenuDto: CreateMenuDto = {
        name: '系统管理',
        path: '/system',
        type: 'menu',
      };

      mockMenuService.create.mockResolvedValue(mockMenu);

      const result = await controller.create(createMenuDto);

      expect(service.create).toHaveBeenCalledWith(createMenuDto);
      expect(result).toEqual(mockMenu);
    });
  });

  describe('findAll', () => {
    it('should return an array of menus', async () => {
      const queryMenuDto: QueryMenuDto = {};
      const mockMenus = [mockMenu];

      mockMenuService.findAll.mockResolvedValue(mockMenus);

      const result = await controller.findAll(mockUser, queryMenuDto);

      expect(service.findAll).toHaveBeenCalledWith(mockUser, queryMenuDto);
      expect(result).toEqual(mockMenus);
    });
  });

  describe('findOne', () => {
    it('should return a single menu', async () => {
      mockMenuService.findOne.mockResolvedValue(mockMenu);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockMenu);
    });
  });

  describe('update', () => {
    it('should update a menu', async () => {
      const updateMenuDto: UpdateMenuDto = {
        id: 1,
        name: '更新后的菜单',
        path: '/system',
        type: 'menu',
      };
      const updatedMenu = { ...mockMenu, name: '更新后的菜单' };

      mockMenuService.update.mockResolvedValue(updatedMenu);

      const result = await controller.update(1, updateMenuDto);

      expect(service.update).toHaveBeenCalledWith(1, updateMenuDto);
      expect(result).toEqual(updatedMenu);
    });
  });

  describe('delete', () => {
    it('should delete a menu', async () => {
      mockMenuService.delete.mockResolvedValue(mockMenu);

      const result = await controller.delete(1);

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockMenu);
    });
  });
});
