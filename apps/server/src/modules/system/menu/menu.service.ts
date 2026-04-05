import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { toPlainObject } from '@/common/utils';
import { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './menu.dto';

@Injectable()
export class MenuService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}
  async create(createMenuDto: CreateMenuDto) {
    let result;
    if (createMenuDto.path && createMenuDto.type !== 'button') {
      const suffix = createMenuDto.path
        .replace(/:id$/, '')
        .replace(/^\//, '')
        .replaceAll('/', ':');
      result = await this.prisma.client.menu.create({
        data: {
          ...toPlainObject(createMenuDto),
          children: {
            createMany: {
              data: [
                {
                  name: '创建',
                  type: 'button',
                  permission: `${suffix}:create`,
                },
                { name: '读取', type: 'button', permission: `${suffix}:read` },
                {
                  name: '更新',
                  type: 'button',
                  permission: `${suffix}:update`,
                },
                {
                  name: '删除',
                  type: 'button',
                  permission: `${suffix}:delete`,
                },
              ],
            },
          },
        },
      });
    } else {
      result = await this.prisma.client.menu.create({
        data: { ...toPlainObject(createMenuDto) },
      });
    }
    this.eventEmitter.emit('operation.log', {
      title: `创建菜单: ${createMenuDto.name}`,
      businessType: 1,
      module: '菜单管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async delete(id: number) {
    const result = await this.prisma.client.menu.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除菜单ID: ${id}`,
      businessType: 3,
      module: '菜单管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async findAll(user: ActiveUserData, queryMenuDto: QueryMenuDto) {
    const { name } = queryMenuDto;
    const userData = await this.prisma.client.user.findUnique({
      where: { id: user.sub },
      include: { roles: true },
    });
    if (userData?.isAdmin) {
      return this.prisma.client.menu.findMany({
        where: { name: { contains: name, mode: 'insensitive' } },
        orderBy: { order: 'asc' },
      });
    } else {
      const roleIds = userData?.roles.map((role) => role.id);
      return this.prisma.client.menu.findMany({
        where: {
          name: { contains: name, mode: 'insensitive' },
          roles: { some: { id: { in: roleIds } } },
        },
        orderBy: { order: 'asc' },
      });
    }
  }

  async findOne(id: number) {
    return this.prisma.client.menu.findUnique({ where: { id } });
  }

  async update(id: number, updateMenuDto: UpdateMenuDto) {
    const result = await this.prisma.client.menu.update({
      where: { id },
      data: { ...toPlainObject(updateMenuDto) },
    });
    this.eventEmitter.emit('operation.log', {
      title: `更新菜单ID: ${id}`,
      businessType: 2,
      module: '菜单管理',
      username: '',
      ip: '',
    });
    return result;
  }
}
