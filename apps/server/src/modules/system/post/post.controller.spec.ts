import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { PostController } from './post.controller';
import { CreatePostDto, QueryPostDto, UpdatePostDto } from './post.dto';
import { PostService } from './post.service';

describe('postController', () => {
  let controller: PostController;
  let service: PostService;

  const mockPost = {
    id: 1,
    name: '开发工程师',
    code: 'developer',
    order: 1,
    remark: '开发岗位',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPaginatedResponse = {
    list: [mockPost],
    pagination: {
      total: 1,
      current: 1,
      pageSize: 10,
      pages: 1,
    },
  };

  const mockPostService = {
    create: vi.fn(),
    findWithPagination: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostController],
      providers: [
        {
          provide: PostService,
          useValue: mockPostService,
        },
      ],
    }).compile();

    controller = module.get<PostController>(PostController);
    service = module.get<PostService>(PostService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new post', async () => {
      const createPostDto: CreatePostDto = {
        name: '开发工程师',
        code: 'developer',
        order: 1,
      };

      mockPostService.create.mockResolvedValue(mockPost);

      const result = await controller.create(createPostDto);

      expect(service.create).toHaveBeenCalledWith(createPostDto);
      expect(result).toEqual(mockPost);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated posts', async () => {
      const queryPostDto: QueryPostDto = { current: 1, pageSize: 10 };

      mockPostService.findWithPagination.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await controller.findWithPagination(queryPostDto);

      expect(service.findWithPagination).toHaveBeenCalledWith(queryPostDto);
      expect(result).toEqual(mockPaginatedResponse);
    });

    it('should return paginated posts with name filter', async () => {
      const queryPostDto: QueryPostDto = {
        current: 1,
        pageSize: 10,
        name: '开发',
      };

      mockPostService.findWithPagination.mockResolvedValue(
        mockPaginatedResponse,
      );

      const result = await controller.findWithPagination(queryPostDto);

      expect(service.findWithPagination).toHaveBeenCalledWith(queryPostDto);
      expect(result).toEqual(mockPaginatedResponse);
    });
  });

  describe('findOne', () => {
    it('should return a single post', async () => {
      mockPostService.findOne.mockResolvedValue(mockPost);

      const result = await controller.findOne(1);

      expect(service.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockPost);
    });
  });

  describe('update', () => {
    it('should update a post', async () => {
      const updatePostDto: UpdatePostDto = {
        id: 1,
        name: '高级开发工程师',
      };
      const updatedPost = { ...mockPost, name: '高级开发工程师' };

      mockPostService.update.mockResolvedValue(updatedPost);

      const result = await controller.update(1, updatePostDto);

      expect(service.update).toHaveBeenCalledWith(1, updatePostDto);
      expect(result).toEqual(updatedPost);
    });
  });

  describe('delete', () => {
    it('should delete a post', async () => {
      mockPostService.delete.mockResolvedValue(mockPost);

      const result = await controller.delete(1);

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockPost);
    });
  });
});
