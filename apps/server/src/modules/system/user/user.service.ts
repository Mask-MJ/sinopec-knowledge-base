import type { PrismaService } from '@/common/database/prisma.extension';

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { MinioService } from '@/common/minio/minio.service';
import { HashingService } from '@/modules/auth/hashing/hashing.service';
import { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { CreateUserDto, QueryUserDto, UpdateUserDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    private readonly minioClient: MinioService,
  ) {}

  async changePassword(id: number, password: string, oldPassword: string) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id },
    });
    // 判断是否是管理员权限 如果是管理员权限则不需要验证原密码
    if (user.isAdmin) {
      return this.prisma.client.user.update({
        where: { id },
        data: { password: await this.hashingService.hash(password) },
      });
    }
    const isPasswordValid = await this.hashingService.compare(
      oldPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('原密码错误');
    }
    const newPassword = await this.hashingService.hash(password);
    return this.prisma.client.user.update({
      where: { id },
      data: { password: newPassword },
    });
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.client.user.findUnique({
      where: { username: createUserDto.username },
    });
    if (existingUser) {
      throw new ConflictException('账号已存在');
    }
    const { roleIds, password, ...rest } = createUserDto;

    return this.prisma.client.user.create({
      data: {
        ...rest,
        password: await this.hashingService.hash(password),
        roles: { connect: roleIds?.map((id) => ({ id })) },
      },
    });
  }

  async delete(user: ActiveUserData, id: number, ip: string = '') {
    // 判断是否是管理员账号, 如果是管理员账号则不允许删除
    const userInfo = await this.prisma.client.user.findUniqueOrThrow({
      where: { id },
    });
    if (userInfo.isAdmin) {
      throw new ConflictException('管理员账号不允许删除');
    }
    const result = await this.prisma.client.user.delete({ where: { id } });
    this.eventEmitter.emit('operation.log', {
      title: `删除ID为${id}, 账号为${userInfo.username}的用户`,
      businessType: 2,
      module: '用户管理',
      username: user.username,
      ip,
    });
    return result;
  }

  async findAll(queryUserDto: QueryUserDto) {
    const { username, nickname, email, phoneNumber, createdAt } = queryUserDto;
    return await this.prisma.client.user.findMany({
      where: {
        username: { contains: username, mode: 'insensitive' },
        nickname: { contains: nickname, mode: 'insensitive' },
        email: { contains: email, mode: 'insensitive' },
        phoneNumber: { contains: phoneNumber, mode: 'insensitive' },
        createdAt: { gte: createdAt?.[0], lte: createdAt?.[1] },
      },
      include: {
        roles: { select: { id: true, name: true } },
        dept: { select: { id: true, name: true } },
      },
      omit: { password: true },
    });
  }

  async findOne(id: number) {
    return await this.prisma.client.user.findUniqueOrThrow({
      where: { id },
      include: { roles: true, dept: true },
      omit: { password: true },
    });
  }

  async findSelf(id: number) {
    return await this.prisma.client.user.findUniqueOrThrow({
      where: { id },
      omit: { password: true },
      include: {
        roles: { include: { menus: true } },
        dept: { select: { id: true, name: true } },
      },
    });
  }

  async findSelfCode(id: number) {
    const userInfo = await this.prisma.client.user.findUniqueOrThrow({
      where: { id },
      include: { roles: { include: { menus: true } } },
    });
    const codes = userInfo.roles.flatMap((role) =>
      role.menus.map((menu) => menu.permission),
    );
    return [...new Set(codes)];
  }

  async findWithPagination(queryUserDto: QueryUserDto) {
    const {
      username,
      nickname,
      email,
      phoneNumber,
      current,
      pageSize,
      createdAt,
    } = queryUserDto;
    const [list, meta] = await this.prisma.client.user
      .paginate({
        where: {
          username: { contains: username, mode: 'insensitive' },
          nickname: { contains: nickname, mode: 'insensitive' },
          email: { contains: email, mode: 'insensitive' },
          phoneNumber: { contains: phoneNumber, mode: 'insensitive' },
          createdAt: { gte: createdAt?.[0], lte: createdAt?.[1] },
        },
        include: {
          roles: { select: { id: true, name: true } },
          dept: { select: { id: true, name: true } },
        },
        omit: { password: true },
      })
      .withPages({ limit: pageSize, page: current, includePageCount: true });

    return { list, ...meta };
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const { roleIds, ...rest } = updateUserDto;
    return await this.prisma.client.user.update({
      where: { id },
      data: {
        ...rest,
        ...(roleIds !== undefined && {
          roles: { set: roleIds.map((id) => ({ id })) },
        }),
      },
    });
  }

  async uploadAvatar(user: ActiveUserData, file: Express.Multer.File) {
    await this.minioClient.uploadFile('avatar', file.originalname, file.buffer);
    const url = await this.minioClient.getUrl('avatar', file.originalname);
    return this.prisma.client.user.update({
      where: { id: user.sub },
      data: { avatar: url },
    });
  }
}
