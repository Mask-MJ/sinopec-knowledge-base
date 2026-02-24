import type { PrismaService } from '@/common/database/prisma.extension';

import { Inject, Injectable } from '@nestjs/common';

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
    @Inject('PrismaService') private readonly prisma: PrismaService,
  ) {}

  async create(createDictDto: CreateDictDto) {
    return await this.prisma.client.dict.create({
      data: createDictDto,
    });
  }

  async createData(createDictDataDto: CreateDictDataDto) {
    return await this.prisma.client.dictData.create({
      data: createDictDataDto,
    });
  }

  async delete(id: number) {
    return await this.prisma.client.dict.delete({ where: { id } });
  }

  async deleteData(id: number) {
    return await this.prisma.client.dictData.delete({ where: { id } });
  }

  async findAll(queryDictDto: QueryDictDto) {
    const { name, value } = queryDictDto;
    return await this.prisma.client.dict.findMany({
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
    return await this.prisma.client.dictData.findMany({
      where: {
        name: { contains: name, mode: 'insensitive' },
        dictId,
      },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: number) {
    return await this.prisma.client.dict.findUnique({ where: { id } });
  }

  async findOneData(id: number) {
    return await this.prisma.client.dictData.findUnique({ where: { id } });
  }

  async update(id: number, updateDictDto: UpdateDictDto) {
    return await this.prisma.client.dict.update({
      where: { id },
      data: updateDictDto,
    });
  }

  async updateData(id: number, updateDictDataDto: UpdateDictDataDto) {
    return await this.prisma.client.dictData.update({
      where: { id },
      data: updateDictDataDto,
    });
  }
}
