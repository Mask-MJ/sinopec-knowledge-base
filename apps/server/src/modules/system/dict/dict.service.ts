import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';

import {
  CreateDictDataDto,
  CreateDictDto,
  QueryDictDataDto,
  QueryDictDto,
  UpdateDictDataDto,
  UpdateDictDto,
} from './dict.dto';

@Injectable()
export class DictService {
  constructor(
    @Inject(PRISMA_SERVICE_TOKEN) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createDictDto: CreateDictDto) {
    const result = await this.prisma.client.dict.create({
      data: createDictDto,
    });
    this.eventEmitter.emit('operation.log', {
      title: `创建字典: ${createDictDto.name}`,
      businessType: 1,
      module: '字典管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async createData(createDictDataDto: CreateDictDataDto) {
    return this.prisma.client.dictData.create({
      data: createDictDataDto,
    });
  }

  async delete(id: number) {
    const result = await this.prisma.client.dict.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除字典ID: ${id}`,
      businessType: 3,
      module: '字典管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async deleteData(id: number) {
    return this.prisma.client.dictData.delete({ where: { id } });
  }

  async findAll(queryDictDto: QueryDictDto) {
    const { name, value } = queryDictDto;
    return this.prisma.client.dict.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        value: { contains: value, mode: 'insensitive' },
      },
      orderBy: { id: 'asc' },
    });
  }

  async findAllData(queryDictDataDto: QueryDictDataDto) {
    const { name, dictValue } = queryDictDataDto;
    let { dictId } = queryDictDataDto;
    if (dictValue) {
      const dict = await this.prisma.client.dict.findFirst({
        where: { value: { contains: dictValue } },
      });
      if (!dict) {
        return [];
      }
      dictId = dict.id;
    }
    return this.prisma.client.dictData.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        dictId,
      },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.client.dict.findUnique({ where: { id } });
  }

  async findOneData(id: number) {
    return this.prisma.client.dictData.findUnique({ where: { id } });
  }

  async update(id: number, updateDictDto: UpdateDictDto) {
    const result = await this.prisma.client.dict.update({
      where: { id },
      data: updateDictDto,
    });
    this.eventEmitter.emit('operation.log', {
      title: `更新字典ID: ${id}`,
      businessType: 2,
      module: '字典管理',
      username: '',
      ip: '',
    });
    return result;
  }

  async updateData(id: number, updateDictDataDto: UpdateDictDataDto) {
    return this.prisma.client.dictData.update({
      where: { id },
      data: updateDictDataDto,
    });
  }
}
