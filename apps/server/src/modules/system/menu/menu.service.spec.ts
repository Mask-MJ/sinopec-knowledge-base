import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './menu.dto';
import { MenuService } from './menu.service';

describe('menuService', () => {
  let service: MenuService;
  let prismaService: typeof mockPrismaService;

  const mockUser: ActiveUserData = {
    sub: 1,
    username: 'testuser',
    nickname: 'Test User',
    roles: [],
  };

  const mockPrismaService = {
    client: {
      menu: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        {
          provide: PRISMA_SERVICE_TOKEN,
          useValue: mockPrismaService,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
    prismaService = module.get(PRISMA_SERVICE_TOKEN);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a menu', async () => {
      const createMenuDto: CreateMenuDto = {
        name: 'Dashboard',
        path: '/dashboard',
        type: 'menu',
        order: 1,
        status: true,
      };

      mockPrismaService.client.menu.create.mockResolvedValue(createMenuDto);

      const result = await service.create(createMenuDto);

      expect(prismaService.client.menu.create).toHaveBeenCalledWith({
        data: Object.assign({}, createMenuDto, {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          children: expect.any(Object),
        }),
      });
      expect(result).toEqual(createMenuDto);
    });

    it('should create a basic menu if no path provided', async () => {
      const createMenuDto: CreateMenuDto = {
        name: 'Button',
        type: 'button',
        order: 1,
        status: true,
      };

      mockPrismaService.client.menu.create.mockResolvedValue(createMenuDto);

      await service.create(createMenuDto);

      expect(prismaService.client.menu.create).toHaveBeenCalledWith({
        data: Object.assign({}, createMenuDto),
      });
    });
  });

  describe('findAll', () => {
    it('should return all menus for admin', async () => {
      const queryMenuDto: QueryMenuDto = {};
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: true,
      });
      mockPrismaService.client.menu.findMany.mockResolvedValue([]);

      const result = await service.findAll(mockUser, queryMenuDto);

      expect(prismaService.client.menu.findMany).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should return filtered menus for non-admin', async () => {
      const queryMenuDto: QueryMenuDto = {};
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [{ id: 1 }],
      });
      mockPrismaService.client.menu.findMany.mockResolvedValue([]);

      const result = await service.findAll(mockUser, queryMenuDto);

      expect(prismaService.client.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            roles: { some: { id: { in: [1] } } },
          }),
        }),
      );
      expect(result).toEqual([]);
    });

    it('should return empty menus for non-admin with no roles', async () => {
      const queryMenuDto: QueryMenuDto = {};
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [],
      });
      mockPrismaService.client.menu.findMany.mockResolvedValue([]);

      const result = await service.findAll(mockUser, queryMenuDto);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a menu', async () => {
      mockPrismaService.client.menu.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.findOne(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('update', () => {
    it('should update a menu', async () => {
      const updateMenuDto: UpdateMenuDto = {
        name: 'New Name',
        type: 'menu',
        path: '/new-path',
      };
      mockPrismaService.client.menu.update.mockResolvedValue(updateMenuDto);

      const result = await service.update(1, updateMenuDto);

      expect(result).toEqual(updateMenuDto);
    });
  });

  describe('delete', () => {
    it('should delete a menu', async () => {
      mockPrismaService.client.menu.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);

      expect(result).toEqual({ id: 1 });
    });
  });
});
