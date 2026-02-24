import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { REQUEST_USER_KEY } from '../../auth.constants';
import { PermissionsGuard } from './permissions.guard';

describe('permissionsGuard', () => {
  let guard: PermissionsGuard;
  let prismaService: any;

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  };

  const mockPrismaService = {
    client: {
      user: {
        findUnique: vi.fn(),
      },
    },
  };

  const createMockExecutionContext = (
    user: any,
    options?: { method?: string; path?: string },
  ): ExecutionContext => {
    const mockRequest = {
      [REQUEST_USER_KEY]: user,
      method: options?.method || 'GET',
      route: { path: options?.path || '/test' },
      url: options?.path || '/test',
    };

    return {
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    guard = module.get<PermissionsGuard>(PermissionsGuard);
    prismaService = module.get('PrismaService');

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should return true when no permissions are required', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue(undefined);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(prismaService.client.user.findUnique).not.toHaveBeenCalled();
    });

    it('should return false when user is not found', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue(['user:read']);
      mockPrismaService.client.user.findUnique.mockResolvedValue(null);

      const result = await guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('should return true when user is admin', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue(['user:read']);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: true,
        roles: [],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return true when user has all required permissions', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue([
        'user:read',
        'user:write',
      ]);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [
          {
            menus: [
              { permission: 'user:read' },
              { permission: 'user:write' },
              { permission: 'user:delete' },
            ],
          },
        ],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return false when user is missing some required permissions', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue([
        'user:read',
        'user:delete',
      ]);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [
          {
            menus: [{ permission: 'user:read' }, { permission: 'user:write' }],
          },
        ],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('should aggregate permissions from multiple roles', async () => {
      const context = createMockExecutionContext({ sub: 1 });
      mockReflector.getAllAndOverride.mockReturnValue([
        'user:read',
        'post:read',
      ]);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [
          {
            menus: [{ permission: 'user:read' }],
          },
          {
            menus: [{ permission: 'post:read' }],
          },
        ],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('autoPermission', () => {
    it('should auto-generate permission code for POST method', async () => {
      const context = createMockExecutionContext(
        { sub: 1 },
        { method: 'POST', path: '/business/influencer' },
      );
      // First call for PERMISSIONS_KEY returns undefined
      // Second call for AUTO_PERMISSION_KEY returns true
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined) // explicit permissions
        .mockReturnValueOnce(true); // auto permission enabled
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [{ menus: [{ permission: 'business:influencer:create' }] }],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should auto-generate permission code for DELETE method', async () => {
      const context = createMockExecutionContext(
        { sub: 1 },
        { method: 'DELETE', path: '/erp/order/:id' },
      );
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(true);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [{ menus: [{ permission: 'erp:order:delete' }] }],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return false when user lacks auto-generated permission', async () => {
      const context = createMockExecutionContext(
        { sub: 1 },
        { method: 'POST', path: '/business/influencer' },
      );
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(true);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [{ menus: [{ permission: 'business:influencer:read' }] }], // wrong permission
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(false);
    });

    it('should skip api prefix when generating permission code', async () => {
      const context = createMockExecutionContext(
        { sub: 1 },
        { method: 'POST', path: '/api/system/dept' }, // 带 api 前缀
      );
      mockReflector.getAllAndOverride
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(true);
      mockPrismaService.client.user.findUnique.mockResolvedValue({
        id: 1,
        isAdmin: false,
        roles: [{ menus: [{ permission: 'system:dept:create' }] }],
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
