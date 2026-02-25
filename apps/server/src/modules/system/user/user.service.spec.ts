import { Buffer } from 'node:buffer';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { MinioService } from '@/common/minio/minio.service';
import { HashingService } from '@/modules/auth/hashing/hashing.service';
import { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { CreateUserDto, QueryUserDto, UpdateUserDto } from './user.dto';
import { UserService } from './user.service';

describe('userService', () => {
  let service: UserService;
  let prismaService: any;
  let hashingService: any;
  let eventEmitter: any;
  let minioService: any;

  const mockUser: ActiveUserData = {
    sub: 1,
    username: 'testuser',
    nickname: 'Test User',
    roles: [],
  };

  const mockPrismaService = {
    client: {
      user: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        paginate: vi.fn(),
      },
    },
  };

  const mockHashingService = {
    hash: vi.fn().mockResolvedValue('hashedPassword'),
    compare: vi.fn(),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  const mockMinioService = {
    uploadFile: vi.fn(),
    getUrl: vi.fn().mockResolvedValue('http://minio/avatar.jpg'),
  };

  const mockPaginate = {
    withPages: vi.fn().mockResolvedValue([[], { total: 0 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
        {
          provide: HashingService,
          useValue: mockHashingService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: MinioService,
          useValue: mockMinioService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get('PrismaService');
    hashingService = module.get(HashingService);
    eventEmitter = module.get(EventEmitter2);
    minioService = module.get(MinioService);

    mockPrismaService.client.user.paginate.mockReturnValue(mockPaginate);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const createUserDto: CreateUserDto = {
        username: 'newuser',
        password: 'password',
        nickname: 'New User',
        roleIds: [1],
      };

      mockPrismaService.client.user.findUnique.mockResolvedValue(null);
      mockPrismaService.client.user.create.mockResolvedValue(createUserDto);

      const result = await service.create(createUserDto);

      expect(hashingService.hash).toHaveBeenCalledWith('password');
      expect(prismaService.client.user.create).toHaveBeenCalled();
      expect(result).toEqual(createUserDto);
    });

    it('should throw ConflictException if user exists', async () => {
      const createUserDto: CreateUserDto = {
        username: 'existing',
        password: 'password',
        nickname: 'Existing',
      };
      mockPrismaService.client.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findSelf', () => {
    it('should return user info', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 1,
      });

      const result = await service.findSelf(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('findSelfCode', () => {
    it('should return user codes', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        roles: [
          { menus: [{ permission: 'user:read' }] },
          { menus: [{ permission: 'user:write' }] },
        ],
      });

      const result = await service.findSelfCode(1);

      expect(result).toEqual(['user:read', 'user:write']);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated users', async () => {
      const queryUserDto: QueryUserDto = { current: 1, pageSize: 10 };

      const result = await service.findWithPagination(queryUserDto);

      expect(prismaService.client.user.paginate).toHaveBeenCalled();
      expect(result).toHaveProperty('list');
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const queryUserDto: QueryUserDto = {};
      mockPrismaService.client.user.findMany.mockResolvedValue([]);

      const result = await service.findAll(queryUserDto);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a user', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 1,
      });

      const result = await service.findOne(1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('uploadAvatar', () => {
    it('should upload avatar and update user', async () => {
      const file = { originalname: 'test.jpg', buffer: Buffer.from('') } as any;
      await service.uploadAvatar(mockUser, file);

      expect(minioService.uploadFile).toHaveBeenCalled();
      expect(prismaService.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { avatar: `avatar/${mockUser.sub}-test.jpg` },
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('should change password with valid old password', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        password: 'hashed',
      });
      mockHashingService.compare.mockResolvedValue(true);

      await service.changePassword(1, 'newpass', 'oldpass');

      expect(hashingService.compare).toHaveBeenCalledWith('oldpass', 'hashed');
      expect(prismaService.client.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if old password invalid', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        password: 'hashed',
      });
      mockHashingService.compare.mockResolvedValue(false);

      await expect(
        service.changePassword(1, 'newpass', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resetPassword', () => {
    it('should reset password without verifying old password', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 2,
      });

      await service.resetPassword(2, 'newpass');

      expect(hashingService.compare).not.toHaveBeenCalled();
      expect(hashingService.hash).toHaveBeenCalledWith('newpass');
      expect(prismaService.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
        }),
      );
    });
  });

  describe('update', () => {
    it('should update user', async () => {
      const updateUserDto: UpdateUserDto = { nickname: 'updated' };

      await service.update(1, updateUserDto);

      expect(prismaService.client.user.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 2,
        isAdmin: false,
        username: 'deleted',
      });
      mockPrismaService.client.user.delete.mockResolvedValue({ id: 2 });

      await service.delete(mockUser, 2);

      expect(prismaService.client.user.delete).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'operation.log',
        expect.anything(),
      );
    });

    it('should throw ConflictException if deleting admin', async () => {
      mockPrismaService.client.user.findUniqueOrThrow.mockResolvedValue({
        id: 2,
        isAdmin: true,
      });

      await expect(service.delete(mockUser, 2)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
