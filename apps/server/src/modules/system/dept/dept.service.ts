import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { transformationTree } from '@/common/utils';

import { CreateDeptDto, QueryDeptDto, UpdateDeptDto } from './dept.dto';
import { DeptEntity } from './dept.entity';

@Injectable()
export class DeptService {
  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createDeptDto: CreateDeptDto) {
    const { leaderId } = createDeptDto;
    const userInfo = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: leaderId },
    });
    const dept = await this.prisma.client.dept.create({
      data: { ...createDeptDto, leader: userInfo.username },
    });
    await this.prisma.client.user.update({
      where: { id: leaderId },
      data: { isDeptAdmin: true, deptId: dept.id },
    });
    this.eventEmitter.emit('operation.log', {
      title: `创建部门: ${createDeptDto.name}`,
      businessType: 1,
      module: '部门管理',
      username: '',
      ip: '',
    });
    return dept;
  }

  async delete(id: number) {
    const result = await this.prisma.client.dept.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除部门ID: ${id}`,
      businessType: 3,
      module: '部门管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async findAll(queryDeptDto: QueryDeptDto) {
    // https://github.com/prisma/prisma/issues/3725
    // https://github.com/prisma/prisma/issues/4562
    const { name } = queryDeptDto;
    const depts = await this.prisma.client.dept.findMany({
      where: { name: { contains: name, mode: 'insensitive' } },
      orderBy: { order: 'asc' },
    });
    return transformationTree<DeptEntity>(depts, null);
  }

  async findOne(id: number) {
    return await this.prisma.client.dept.findUniqueOrThrow({ where: { id } });
  }

  async update(id: number, updateDeptDto: UpdateDeptDto) {
    const result = await this.prisma.client.dept.update({
      where: { id },
      data: updateDeptDto,
    });
    this.eventEmitter.emit('operation.log', {
      title: `更新部门ID: ${id}`,
      businessType: 2,
      module: '部门管理',
      username: '',
      ip: '',
    });
    return result;
  }
}
