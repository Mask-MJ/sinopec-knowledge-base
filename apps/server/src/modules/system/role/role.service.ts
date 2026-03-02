import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './role.dto';

@Injectable()
export class RoleService {
  constructor(
    @Inject('PrismaService')
    private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}
  async create(createRoleDto: CreateRoleDto) {
    const { menuIds, ...rest } = createRoleDto;
    const result = await this.prisma.client.role.create({
      data: { ...rest, menus: { connect: menuIds.map((id) => ({ id })) } },
    });
    this.eventEmitter.emit('operation.log', {
      title: `创建角色: ${createRoleDto.name}`,
      businessType: 1,
      module: '角色管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async delete(id: number) {
    const result = await this.prisma.client.role.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除角色ID: ${id}`,
      businessType: 3,
      module: '角色管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async findOne(id: number) {
    const role = await this.prisma.client.role.findUniqueOrThrow({
      where: { id },
      include: { menus: true },
    });
    const { menus, ...rest } = role;

    return { ...rest, menuIds: menus.map((menu) => menu.id) };
  }

  async findWithPagination(queryRoleDto: QueryRoleDto) {
    const { name, value, current, pageSize } = queryRoleDto;
    const [list, meta] = await this.prisma.client.role
      .paginate({
        where: {
          name: { contains: name, mode: 'insensitive' },
          value: { contains: value, mode: 'insensitive' },
        },
        orderBy: { order: 'asc' },
      })
      .withPages({ page: current, limit: pageSize, includePageCount: true });
    return { list, ...meta };
  }

  async update(id: number, updateRoleDto: UpdateRoleDto) {
    const { menuIds, ...rest } = updateRoleDto;
    const result = await this.prisma.client.role.update({
      where: { id },
      data: {
        ...rest,
        ...(menuIds !== undefined && {
          menus: { set: menuIds.map((id) => ({ id })) },
        }),
      },
    });
    this.eventEmitter.emit('operation.log', {
      title: `更新角色ID: ${id}`,
      businessType: 2,
      module: '角色管理',
      username: '',
      ip: '',
    });
    return result;
  }
}
