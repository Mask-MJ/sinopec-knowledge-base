import type { Request as ExpRequest } from 'express';

import { Buffer } from 'node:buffer';

import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { createMockAdminUser } from '@/test-utils/mock.factory';

import { UserController } from './user.controller';
import {
  ChangePasswordDto,
  CreateUserDto,
  QueryUserDto,
  UpdateUserDto,
} from './user.dto';
import { UserService } from './user.service';

describe('userController', () => {
  let controller: UserController;
  let service: UserService;

  const mockUser = createMockAdminUser();

  const mockUserEntity = {
    id: 1,
    username: 'admin',
    nickname: '管理员',
    email: 'admin@example.com',
    phone: '13000000000',
    avatar: null,
    status: 1,
    deptId: 1,
    roleId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPaginatedResponse = {
    list: [mockUserEntity],
    pagination: {
      total: 1,
      page: 1,
      size: 10,
      pages: 1,
    },
  };

  const mockUserService = {
    create: vi.fn(),
    findWithPagination: vi.fn(),
    findAll: vi.fn(),
    findSelf: vi.fn(),
    findSelfCode: vi.fn(),
    changePassword: vi.fn(),
    uploadAvatar: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        username: 'newuser',
        password: '123456',
        nickname: '新用户',
        deptId: 1,
        roleIds: [1],
      };

      mockUserService.create.mockResolvedValue(mockUserEntity);

      const result = await controller.create(createUserDto);

      expect(service.create).toHaveBeenCalledWith(createUserDto);
      expect(result).toEqual(mockUserEntity);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated users', async () => {
      const queryUserDto: QueryUserDto = { current: 1, pageSize: 10 };

      mockUserService.findWithPagination.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await controller.findWithPagination(queryUserDto);

      expect(service.findWithPagination).toHaveBeenCalledWith(queryUserDto);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const queryUserDto: QueryUserDto = {};
      const mockUsers = [mockUserEntity];

      mockUserService.findAll.mockResolvedValue(mockUsers);

      const result = await controller.findAll(queryUserDto);

      expect(service.findAll).toHaveBeenCalledWith(queryUserDto);
      expect(result).toEqual(mockUsers);
    });
  });

  describe('findSelf', () => {
    it('should return current logged-in user info', async () => {
      mockUserService.findSelf.mockResolvedValue(mockUserEntity);

      const result = await controller.findSelf(mockUser);

      expect(service.findSelf).toHaveBeenCalledWith(mockUser.sub);
      expect(result).toEqual(mockUserEntity);
    });
  });

  describe('findSelfCode', () => {
    it('should return current logged-in user permission codes', async () => {
      const mockCodes = ['system:user:create', 'system:user:update'];

      mockUserService.findSelfCode.mockResolvedValue(mockCodes);

      const result = await controller.findSelfCode(mockUser);

      expect(service.findSelfCode).toHaveBeenCalledWith(mockUser.sub);
      expect(result).toEqual(mockCodes);
    });
  });

  describe('changePassword', () => {
    it('should change user password', async () => {
      const changePasswordDto: ChangePasswordDto = {
        id: 1,
        oldPassword: 'oldpass',
        password: 'newpass',
      };

      mockUserService.changePassword.mockResolvedValue(mockUserEntity);

      const result = await controller.changePassword(changePasswordDto);

      expect(service.changePassword).toHaveBeenCalledWith(
        changePasswordDto.id,
        changePasswordDto.password,
        changePasswordDto.oldPassword,
      );
      expect(result).toEqual(mockUserEntity);
    });
  });

  describe('upload', () => {
    it('should upload user avatar', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'avatar.png',
        encoding: '7bit',
        mimetype: 'image/png',
        buffer: Buffer.from(''),
        size: 1024,
      } as Express.Multer.File;

      const mockAvatarUrl = 'https://example.com/avatar.png';

      mockUserService.uploadAvatar.mockResolvedValue(mockAvatarUrl);

      const result = await controller.upload(mockUser, mockFile);

      expect(service.uploadAvatar).toHaveBeenCalledWith(mockUser, mockFile);
      expect(result).toEqual(mockAvatarUrl);
    });
  });

  describe('findOne', () => {
    it('should return a single user', async () => {
      mockUserService.findOne.mockResolvedValue(mockUserEntity);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockUserEntity);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updateUserDto: UpdateUserDto = {
        id: 1,
        nickname: '更新后的昵称',
      };
      const updatedUser = { ...mockUserEntity, nickname: '更新后的昵称' };

      mockUserService.update.mockResolvedValue(updatedUser);

      const result = await controller.update(1, updateUserDto);

      expect(service.update).toHaveBeenCalledWith(1, updateUserDto);
      expect(result).toEqual(updatedUser);
    });
  });

  describe('delete', () => {
    it('should delete a user', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
      } as ExpRequest;

      mockUserService.delete.mockResolvedValue(mockUserEntity);

      const result = await controller.delete(
        mockUser,
        1,
        mockRequest,
        '192.168.1.1',
      );

      expect(service.delete).toHaveBeenCalledWith(mockUser, 1, '192.168.1.1');
      expect(result).toEqual(mockUserEntity);
    });

    it('should use request IP if X-Real-IP is not provided', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
      } as ExpRequest;

      mockUserService.delete.mockResolvedValue(mockUserEntity);

      const result = await controller.delete(
        mockUser,
        1,
        mockRequest,
        undefined,
      );

      expect(service.delete).toHaveBeenCalledWith(mockUser, 1, '127.0.0.1');
      expect(result).toEqual(mockUserEntity);
    });
  });
});
