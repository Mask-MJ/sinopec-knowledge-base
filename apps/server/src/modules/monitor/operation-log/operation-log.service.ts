import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import IP2Region from 'ip2region';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { toPlainObject } from '@/common/utils';

import {
  CreateOperationLogDto,
  QueryOperationLogDto,
} from './operation-log.dto';

@Injectable()
export class OperationLogService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
  ) {}

  async create(createOperationLogDto: CreateOperationLogDto) {
    const query = new IP2Region();
    const addressInfo = query.search(createOperationLogDto.ip);
    const address = addressInfo ? addressInfo.province + addressInfo.city : '';

    return this.prisma.client.operationLog.create({
      data: { ...toPlainObject(createOperationLogDto), address },
    });
  }

  async findOne(id: number) {
    return this.prisma.client.operationLog.findUniqueOrThrow({
      where: { id },
    });
  }

  async findWithPagination(queryOperationLogDto: QueryOperationLogDto) {
    const { current, pageSize, username, businessType, createdAt } =
      queryOperationLogDto;
    const [list, meta] = await this.prisma.client.operationLog
      .paginate({
        where: {
          username: { contains: username },
          businessType,
          createdAt: { gte: createdAt?.[0], lte: createdAt?.[1] },
        },
        orderBy: { createdAt: 'desc' },
      })
      .withPages({ limit: pageSize, page: current, includePageCount: true });

    return { list, ...meta };
  }

  @OnEvent('operation.log')
  async handleOperationEvent(payload: CreateOperationLogDto) {
    await this.create(payload);
  }
}
