import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { REQUEST_USER_KEY } from '../../auth.constants';
import jwtConfig from '../../config/jwt.config';
import { AccessTokenGuard } from './access-token.guard';

describe('accessTokenGuard', () => {
  let guard: AccessTokenGuard;
  let jwtService: JwtService;

  const mockJwtService = {
    verifyAsync: vi.fn(),
  };

  const mockJwtConfiguration = {
    secret: 'test-secret',
    accessTokenTtl: 3600,
    refreshTokenTtl: 86_400,
  };

  const createMockExecutionContext = (
    authorizationHeader?: string,
  ): ExecutionContext => {
    const mockRequest = {
      headers: {
        authorization: authorizationHeader,
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessTokenGuard,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: jwtConfig.KEY,
          useValue: mockJwtConfiguration,
        },
      ],
    }).compile();

    guard = module.get<AccessTokenGuard>(AccessTokenGuard);
    jwtService = module.get<JwtService>(JwtService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException when no authorization header', async () => {
      const context = createMockExecutionContext(undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when authorization header is not Bearer', async () => {
      const context = createMockExecutionContext('Basic some-token');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when token verification fails', async () => {
      const context = createMockExecutionContext('Bearer invalid-token');
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return true and set user payload on valid token', async () => {
      const mockPayload = { sub: 1, username: 'testuser' };
      const context = createMockExecutionContext('Bearer valid-token');
      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);

      const result = await guard.canActivate(context);
      const request = context.switchToHttp().getRequest();

      expect(result).toBe(true);
      expect(request[REQUEST_USER_KEY]).toEqual(mockPayload);
      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        'valid-token',
        mockJwtConfiguration,
      );
    });
  });
});
