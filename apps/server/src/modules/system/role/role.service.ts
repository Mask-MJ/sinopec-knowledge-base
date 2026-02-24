import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';

import { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './role.dto';

@Injectable()
export class RoleService {
  constructor(
    @Inject('PrismaService')
    private readonly prisma: PrismaService,
  ) {}
  async create(createRoleDto: CreateRoleDto) {
    const { menuIds, ...rest } = createRoleDto;
    return await this.prisma.client.role.create({
      data: { ...rest, menus: { connect: menuIds.map((id) => ({ id })) } },
    });
  }

  async delete(id: number) {
    return await this.prisma.client.role.delete({ where: { id } });
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
    return await this.prisma.client.role.update({
      where: { id },
      data: {
        ...rest,
        ...(menuIds !== undefined && {
          menus: { set: menuIds.map((id) => ({ id })) },
        }),
      },
    });
  }
}
