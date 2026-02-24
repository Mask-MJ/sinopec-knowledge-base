import type { Request } from 'express';

import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { AuthenticationController } from './authentication.controller';
import { RefreshTokenDto, SignInDto, SignUpDto } from './authentication.dto';
import { AuthenticationService } from './authentication.service';

describe('authenticationController', () => {
  let controller: AuthenticationController;
  let service: AuthenticationService;

  const mockUser = {
    id: 1,
    username: 'testuser',
    nickname: 'Test User',
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  };

  const mockAuthenticationService = {
    signUp: vi.fn(),
    signIn: vi.fn(),
    refreshTokens: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthenticationController],
      providers: [
        {
          provide: AuthenticationService,
          useValue: mockAuthenticationService,
        },
      ],
    }).compile();

    controller = module.get<AuthenticationController>(AuthenticationController);
    service = module.get<AuthenticationService>(AuthenticationService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signUp', () => {
    it('should register a new user', async () => {
      const signUpDto: SignUpDto = {
        username: 'testuser',
        nickname: 'Test User',
        password: 'password123',
      };

      mockAuthenticationService.signUp.mockResolvedValue(mockUser);

      const result = await controller.signUp(signUpDto);

      expect(service.signUp).toHaveBeenCalledWith(signUpDto);
      expect(result).toEqual(mockUser);
    });
  });

  describe('signIn', () => {
    const mockRequest = {
      ip: '127.0.0.1',
    } as Request;

    const mockHeaders = {
      'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
      'sec-ch-ua-platform': '"Windows"',
    };

    it('should sign in user and return tokens', async () => {
      const signInDto: SignInDto = {
        username: 'testuser',
        password: 'password123',
      };

      mockAuthenticationService.signIn.mockResolvedValue(mockTokens);

      const result = await controller.signIn(
        signInDto,
        mockRequest,
        mockHeaders,
        undefined,
      );

      expect(service.signIn).toHaveBeenCalledWith(
        signInDto,
        mockHeaders,
        mockRequest.ip,
      );
      expect(result).toEqual(mockTokens);
    });

    it('should use X-Real-IP header when provided', async () => {
      const signInDto: SignInDto = {
        username: 'testuser',
        password: 'password123',
      };
      const realIp = '192.168.1.100';

      mockAuthenticationService.signIn.mockResolvedValue(mockTokens);

      const result = await controller.signIn(
        signInDto,
        mockRequest,
        mockHeaders,
        realIp,
      );

      expect(service.signIn).toHaveBeenCalledWith(
        signInDto,
        mockHeaders,
        realIp,
      );
      expect(result).toEqual(mockTokens);
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens', async () => {
      const refreshTokenDto: RefreshTokenDto = {
        refreshToken: 'old-refresh-token',
      };

      mockAuthenticationService.refreshTokens.mockResolvedValue(mockTokens);

      const result = await controller.refreshTokens(refreshTokenDto);

      expect(service.refreshTokens).toHaveBeenCalledWith(refreshTokenDto);
      expect(result).toEqual(mockTokens);
    });
  });
});
