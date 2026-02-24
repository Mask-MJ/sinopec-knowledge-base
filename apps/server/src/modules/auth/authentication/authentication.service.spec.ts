import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import jwtConfig from '../config/jwt.config';
import { HashingService } from '../hashing/hashing.service';
import { RefreshTokenDto, SignInDto, SignUpDto } from './authentication.dto';
import { AuthenticationService } from './authentication.service';

// Mock the tiktop module
vi.mock('tiktop', () => ({
  AccessTokenTool: {
    getAccessToken: vi.fn(),
  },
  ClientConfiguration: {
    globalConfig: {
      app_key: '',
      app_secret: '',
    },
  },
  TikTokShopNodeApiClient: vi.fn().mockImplementation(() => ({
    api: {
      AuthorizationV202309Api: {
        ShopsGet: vi.fn(),
      },
    },
  })),
}));

describe('authenticationService', () => {
  let service: AuthenticationService;
  let hashingService: HashingService;
  let jwtService: JwtService;
  let cacheManager: any;
  let prismaService: any;

  const mockUser = {
    id: 1,
    username: 'testuser',
    nickname: 'Test User',
    password: 'hashedPassword',
    isAdmin: false,
    roles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    client: {
      user: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
      },
      shop: {
        upsert: vi.fn(),
      },
    },
  };

  const mockHashingService = {
    hash: vi.fn(),
    compare: vi.fn(),
  };

  const mockJwtService = {
    signAsync: vi.fn(),
    verifyAsync: vi.fn(),
  };

  const mockCacheManager = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('mock-value'),
  };

  const mockJwtConfiguration = {
    secret: 'test-secret',
    accessTokenTtl: 3600,
    refreshTokenTtl: 86_400,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthenticationService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
        {
          provide: HashingService,
          useValue: mockHashingService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: Logger,
          useValue: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
        },
        {
          provide: jwtConfig.KEY,
          useValue: mockJwtConfiguration,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthenticationService>(AuthenticationService);
    hashingService = module.get<HashingService>(HashingService);
    jwtService = module.get<JwtService>(JwtService);
    cacheManager = module.get(CACHE_MANAGER);
    prismaService = module.get('PrismaService');

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('signUp', () => {
    it('should create a new user successfully', async () => {
      const signUpDto: SignUpDto = {
        username: 'newuser',
        nickname: 'New User',
        password: 'password123',
      };

      mockPrismaService.client.user.findUnique.mockResolvedValue(null);
      mockHashingService.hash.mockResolvedValue('hashedPassword');
      mockPrismaService.client.user.create.mockResolvedValue({
        ...mockUser,
        username: signUpDto.username,
        nickname: signUpDto.nickname,
      });

      const result = await service.signUp(signUpDto);

      expect(prismaService.client.user.findUnique).toHaveBeenCalledWith({
        where: { username: signUpDto.username },
      });
      expect(hashingService.hash).toHaveBeenCalledWith(signUpDto.password);
      expect(prismaService.client.user.create).toHaveBeenCalledWith({
        data: {
          username: signUpDto.username,
          nickname: signUpDto.nickname,
          password: 'hashedPassword',
        },
      });
      expect(result.username).toBe(signUpDto.username);
    });

    it('should throw ConflictException if username already exists', async () => {
      const signUpDto: SignUpDto = {
        username: 'existinguser',
        nickname: 'Existing User',
        password: 'password123',
      };

      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.signUp(signUpDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.signUp(signUpDto)).rejects.toThrow('用户名已存在');
    });
  });

  describe('signIn', () => {
    const signInDto: SignInDto = {
      username: 'testuser',
      password: 'password123',
    };
    const mockHeaders = {
      'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0',
      'sec-ch-ua-platform': '"Windows"',
    };

    it('should sign in user and return tokens', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);
      mockHashingService.compare.mockResolvedValue(true);
      mockJwtService.signAsync.mockResolvedValue('mock-token');
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await service.signIn(signInDto, mockHeaders, '127.0.0.1');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'login.log',
        expect.objectContaining({
          username: mockUser.username,
          status: true,
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValue(null);

      await expect(
        service.signIn(signInDto, mockHeaders, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'login.log',
        expect.objectContaining({
          message: '用户名不存在',
          status: false,
        }),
      );
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockPrismaService.client.user.findUnique.mockResolvedValue(mockUser);
      mockHashingService.compare.mockResolvedValue(false);

      await expect(
        service.signIn(signInDto, mockHeaders, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'login.log',
        expect.objectContaining({
          message: '密码错误',
          status: false,
        }),
      );
    });
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await service.generateTokens(mockUser as any);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const refreshTokenDto: RefreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 1,
        refreshTokenId: 'token-id',
      });
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue(
        mockUser,
      );
      mockCacheManager.get.mockResolvedValue({
        tokenId: 'token-id',
        id: 1,
        user: JSON.stringify(mockUser),
      });
      mockCacheManager.del.mockResolvedValue(undefined);
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await service.refreshTokens(refreshTokenDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      const refreshTokenDto: RefreshTokenDto = {
        refreshToken: 'invalid-refresh-token',
      };

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshTokens(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if cached token not found', async () => {
      const refreshTokenDto: RefreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 1,
        refreshTokenId: 'token-id',
      });
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue(
        mockUser,
      );
      mockCacheManager.get.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if token ids do not match', async () => {
      const refreshTokenDto: RefreshTokenDto = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 1,
        refreshTokenId: 'token-id-1',
      });
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue(
        mockUser,
      );
      mockCacheManager.get.mockResolvedValue({
        tokenId: 'token-id-2',
        id: 1,
        user: JSON.stringify(mockUser),
      });

      await expect(service.refreshTokens(refreshTokenDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
