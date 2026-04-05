import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';

import { CreatePostDto, QueryPostDto, UpdatePostDto } from './post.dto';

@Injectable()
export class PostService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createPostDto: CreatePostDto) {
    const result = await this.prisma.client.post.create({
      data: createPostDto,
    });
    this.eventEmitter.emit('operation.log', {
      title: `创建岗位: ${createPostDto.name}`,
      businessType: 1,
      module: '岗位管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async delete(id: number) {
    const result = await this.prisma.client.post.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除岗位ID: ${id}`,
      businessType: 3,
      module: '岗位管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async findOne(id: number) {
    return this.prisma.client.post.findUnique({ where: { id } });
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
    const result = await this.prisma.client.post.update({
      where: { id },
      data: updatePostDto,
    });
    this.eventEmitter.emit('operation.log', {
      title: `更新岗位ID: ${id}`,
      businessType: 2,
      module: '岗位管理',
      username: '',
      ip: '',
    });
    return result;
  }
}
