import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import IP2Region from 'ip2region';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { toPlainObject } from '@/common/utils';

import { CreateLoginLogDto, QueryLoginLogDto } from './login-log.dto';

@Injectable()
export class LoginLogService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
  ) {}

  async create(createLoginLogDto: CreateLoginLogDto) {
    const query = new IP2Region();
    const addressInfo = query.search(createLoginLogDto.ip);
    const address = addressInfo ? addressInfo.province + addressInfo.city : '';

    return this.prisma.client.loginLog.create({
      data: { ...toPlainObject(createLoginLogDto), address },
    });
  }

  async findOne(id: number) {
    return this.prisma.client.loginLog.findUniqueOrThrow({
      where: { id },
    });
  }

  async findWithPagination(queryLoginLogDto: QueryLoginLogDto) {
    const { current, pageSize, username, createdAt } = queryLoginLogDto;
    const [list, meta] = await this.prisma.client.loginLog
      .paginate({
        where: {
          username: { contains: username },
          createdAt: { gte: createdAt?.[0], lte: createdAt?.[1] },
        },
        orderBy: { createdAt: 'desc' },
      })
      .withPages({ limit: pageSize, page: current, includePageCount: true });

    return { list, ...meta };
  }

  @OnEvent('login.log')
  async handleLoginLogEvent(payload: CreateLoginLogDto) {
    await this.create(payload);
  }
}
