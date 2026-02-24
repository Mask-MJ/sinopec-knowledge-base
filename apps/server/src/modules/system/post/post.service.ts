import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';

import { CreatePostDto, QueryPostDto, UpdatePostDto } from './post.dto';

@Injectable()
export class PostService {
  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
  ) {}

  async create(createPostDto: CreatePostDto) {
    return await this.prisma.client.post.create({ data: createPostDto });
  }

  async delete(id: number) {
    return await this.prisma.client.post.delete({ where: { id } });
  }

  async findOne(id: number) {
    return await this.prisma.client.post.findUnique({ where: { id } });
  }

  async findWithPagination(queryPostDto: QueryPostDto) {
    const { name, code, current, pageSize } = queryPostDto;
    const [list, meta] = await this.prisma.client.post
      .paginate({
        where: {
          name: { contains: name, mode: 'insensitive' },
          code: { contains: code, mode: 'insensitive' },
        },
        orderBy: { order: 'asc' },
      })
      .withPages({ page: current, limit: pageSize, includePageCount: true });
    return { list, ...meta };
  }

  async update(id: number, updatePostDto: UpdatePostDto) {
    return await this.prisma.client.post.update({
      where: { id },
      data: updatePostDto,
    });
  }
}
