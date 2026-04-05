import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { toPlainObject, transformationTree } from '@/common/utils';

import { CreateDeptDto, QueryDeptDto, UpdateDeptDto } from './dept.dto';
import { DeptEntity } from './dept.entity';

@Injectable()
export class DeptService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createDeptDto: CreateDeptDto) {
    const { leaderId } = createDeptDto;
    const userInfo = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: leaderId },
    });
    const dept = await this.prisma.client.dept.create({
      data: { ...toPlainObject(createDeptDto), leader: userInfo.username },
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
    const result = await this.prisma.client.$transaction(async (tx) => {
      const dept = await tx.dept.findUniqueOrThrow({ where: { id } });

      // 清理部门下所有用户的 deptId
      await tx.user.updateMany({
        where: { deptId: id },
        data: { deptId: null },
      });

      // 重置负责人的 isDeptAdmin（如果不再管理其他部门）
      if (dept.leaderId !== null) {
        const otherDepts = await tx.dept.count({
          where: { leaderId: dept.leaderId, id: { not: id } },
        });
        if (otherDepts === 0) {
          await tx.user.update({
            where: { id: dept.leaderId },
            data: { isDeptAdmin: false },
          });
        }
      }

      return tx.dept.delete({ where: { id } });
    });

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
    return this.prisma.client.dept.findUniqueOrThrow({ where: { id } });
  }

  async update(id: number, updateDeptDto: UpdateDeptDto) {
    const { leaderId, ...rest } = updateDeptDto;

    const result =
      leaderId === undefined
        ? await this.prisma.client.dept.update({
            where: { id },
            data: rest,
          })
        : await this.prisma.client.$transaction(async (tx) => {
            const dept = await tx.dept.findUniqueOrThrow({ where: { id } });

            // 撤销旧负责人权限
            if (dept.leaderId !== null && dept.leaderId !== leaderId) {
              const otherDepts = await tx.dept.count({
                where: { leaderId: dept.leaderId, id: { not: id } },
              });
              if (otherDepts === 0) {
                await tx.user.update({
                  where: { id: dept.leaderId },
                  data: { isDeptAdmin: false },
                });
              }
            }

            // 设置新负责人
            const newLeader = await tx.user.findUniqueOrThrow({
              where: { id: leaderId },
            });
            await tx.user.update({
              where: { id: leaderId },
              data: { isDeptAdmin: true, deptId: id },
            });

            return tx.dept.update({
              where: { id },
              data: { ...rest, leaderId, leader: newLeader.username },
            });
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
