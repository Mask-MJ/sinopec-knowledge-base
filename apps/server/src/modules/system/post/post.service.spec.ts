import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';

import { CreatePostDto, QueryPostDto, UpdatePostDto } from './post.dto';
import { PostService } from './post.service';

describe('postService', () => {
  let service: PostService;
  let prismaService: any;

  const mockPrismaService = {
    client: {
      post: {
        create: vi.fn(),
        paginate: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  const mockPaginate = {
    withPages: vi.fn().mockResolvedValue([[], { total: 0 }]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostService,
        {
          provide: 'PrismaService',
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PostService>(PostService);
    prismaService = module.get('PrismaService');

    // Setup paginate mock
    mockPrismaService.client.post.paginate.mockReturnValue(mockPaginate);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a post', async () => {
      const createPostDto: CreatePostDto = {
        name: 'Dev',
        code: 'dev',
        order: 1,
      };
      mockPrismaService.client.post.create.mockResolvedValue(createPostDto);

      const result = await service.create(createPostDto);

      expect(prismaService.client.post.create).toHaveBeenCalledWith({
        data: createPostDto,
      });
      expect(result).toEqual(createPostDto);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated posts', async () => {
      const queryPostDto: QueryPostDto = { current: 1, pageSize: 10 };

      const result = await service.findWithPagination(queryPostDto);

      expect(prismaService.client.post.paginate).toHaveBeenCalled();
      expect(mockPaginate.withPages).toHaveBeenCalled();
      expect(result).toHaveProperty('list');
    });
  });

  describe('findOne', () => {
    it('should return a post', async () => {
      mockPrismaService.client.post.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.findOne(1);

      expect(result).toEqual({ id: 1 });
    });

    it('should return null when post not found', async () => {
      mockPrismaService.client.post.findUnique.mockResolvedValue(null);

      const result = await service.findOne(999);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a post', async () => {
      const updatePostDto: UpdatePostDto = { id: 1, name: 'New Dev' };
      mockPrismaService.client.post.update.mockResolvedValue(updatePostDto);

      const result = await service.update(1, updatePostDto);

      expect(result).toEqual(updatePostDto);
    });
  });

  describe('delete', () => {
    it('should delete a post', async () => {
      mockPrismaService.client.post.delete.mockResolvedValue({ id: 1 });

      const result = await service.delete(1);

      expect(result).toEqual({ id: 1 });
    });
  });
});
