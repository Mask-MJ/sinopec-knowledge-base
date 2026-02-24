import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { AuthType } from '../enums/auth-type.enum';
import { AccessTokenGuard } from './access-token.guard';
import { AuthenticationGuard } from './authentication.guard';

describe('authenticationGuard', () => {
  let guard: AuthenticationGuard;
  let accessTokenGuard: AccessTokenGuard;

  const mockAccessTokenGuard = {
    canActivate: vi.fn(),
  };

  const mockReflector = {
    getAllAndOverride: vi.fn(),
  };

  const createMockExecutionContext = (): ExecutionContext => {
    return {
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationGuard,
        {
          provide: Reflector,
          useValue: mockReflector,
        },
        {
          provide: AccessTokenGuard,
          useValue: mockAccessTokenGuard,
        },
      ],
    }).compile();

    guard = module.get<AuthenticationGuard>(AuthenticationGuard);
    accessTokenGuard = module.get<AccessTokenGuard>(AccessTokenGuard);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should use Bearer auth type by default when no auth type is specified', async () => {
      const context = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue(undefined);
      mockAccessTokenGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(accessTokenGuard.canActivate).toHaveBeenCalledWith(context);
    });

    it('should return true when AuthType.None is specified', async () => {
      const context = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue([AuthType.None]);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(accessTokenGuard.canActivate).not.toHaveBeenCalled();
    });

    it('should use AccessTokenGuard when AuthType.Bearer is specified', async () => {
      const context = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue([AuthType.Bearer]);
      mockAccessTokenGuard.canActivate.mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(accessTokenGuard.canActivate).toHaveBeenCalledWith(context);
    });

    it('should throw UnauthorizedException when AccessTokenGuard fails', async () => {
      const context = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue([AuthType.Bearer]);
      mockAccessTokenGuard.canActivate.mockRejectedValue(
        new UnauthorizedException('请先登录'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should try all guards and throw if none pass', async () => {
      const context = createMockExecutionContext();
      mockReflector.getAllAndOverride.mockReturnValue([AuthType.Bearer]);
      mockAccessTokenGuard.canActivate.mockResolvedValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
