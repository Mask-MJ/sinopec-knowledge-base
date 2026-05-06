import type { PrismaService } from '@/common/database/prisma.extension';
import type { OnApplicationBootstrap } from '@nestjs/common';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';
import { HashingService } from '@/common/hashing';

import {
  COMMON_ROLE_BUTTON_PERMISSIONS,
  COMMON_ROLE_MENU_PATHS,
  LEGACY_ADMIN_PASSWORD_HASH,
  SEED_DICTS,
  SEED_MENUS,
  SEED_ROLES,
  SEED_USERS_PLAINTEXT,
} from './seed.data';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN)
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.seedInitialIfEmpty();
      await this.upgradeLegacyAdminPassword();
      await this.syncCommonRolePermissions();
      await this.syncSeedDicts();
    } catch (error: unknown) {
      if (
        error instanceof Object &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          '⚠️  Seed conflict detected (concurrent start), skipping.',
        );
        return;
      }
      throw error;
    }
  }

  /** 仅在首次部署时灌入完整 seed 数据 */
  private async seedInitialIfEmpty() {
    const count = await this.prisma.client.role.count();
    if (count > 0) {
      this.logger.log('⏭️  Database already seeded, skipping initial seed.');
      return;
    }

    this.logger.log('🌱 First deployment detected, seeding database...');

    await this.prisma.client.role.createMany({ data: SEED_ROLES });

    // 用户密码运行时 hash 后再写入
    const usersWithHashedPassword = await Promise.all(
      SEED_USERS_PLAINTEXT.map(async (user) => ({
        username: user.username,
        nickname: user.nickname,
        isAdmin: user.isAdmin,
        password: await this.hashingService.hash(user.plainPassword),
        roleValue: user.roleValue,
      })),
    );

    await Promise.all(
      usersWithHashedPassword.map((user) =>
        this.prisma.client.user.create({
          data: {
            username: user.username,
            nickname: user.nickname,
            isAdmin: user.isAdmin,
            password: user.password,
            roles: { connect: { value: user.roleValue } },
          },
        }),
      ),
    );

    await Promise.all(
      SEED_MENUS.map((menu) => this.prisma.client.menu.create({ data: menu })),
    );

    await Promise.all(
      SEED_DICTS.map((dict) => this.prisma.client.dict.create({ data: dict })),
    );

    this.logger.log('✅ Seed data injected successfully.');
  }

  /**
   * 幂等同步: 把 COMMON_ROLE_MENU_PATHS / COMMON_ROLE_BUTTON_PERMISSIONS
   * 对应的菜单全部挂到 common 角色下
   */
  private async syncCommonRolePermissions() {
    const commonRole = await this.prisma.client.role.findUnique({
      where: { value: 'common' },
    });
    if (!commonRole) {
      this.logger.warn('⚠️  common 角色不存在，跳过权限同步');
      return;
    }

    const targetMenus = await this.prisma.client.menu.findMany({
      where: {
        OR: [
          { path: { in: [...COMMON_ROLE_MENU_PATHS] } },
          { permission: { in: [...COMMON_ROLE_BUTTON_PERMISSIONS] } },
        ],
      },
      select: { id: true },
    });

    if (targetMenus.length === 0) {
      this.logger.warn('⚠️  未找到 common 角色对应菜单，跳过同步');
      return;
    }

    await this.prisma.client.role.update({
      where: { id: commonRole.id },
      data: {
        menus: {
          connect: targetMenus.map((menu) => ({ id: menu.id })),
        },
      },
    });

    this.logger.log(
      `🔄 已同步 common 角色权限：${targetMenus.length} 个菜单/按钮`,
    );
  }

  /**
   * 幂等同步: 只补缺，不覆盖运维手动调整过的字典数据
   * - 字典本身不存在 → 完整新建（含 dictData）
   * - 字典已存在 → 仅按 value 补充缺失的 dictData 行
   */
  private async syncSeedDicts() {
    for (const seed of SEED_DICTS) {
      const existing = await this.prisma.client.dict.findUnique({
        where: { name: seed.name },
      });

      if (!existing) {
        await this.prisma.client.dict.create({ data: seed });
        this.logger.log(`🌱 已新建字典「${seed.name}」`);
        continue;
      }

      const seedData = (seed.dictData?.create ?? []) as {
        name: string;
        order?: number;
        value: string;
      }[];
      if (seedData.length === 0) continue;

      const existingData = await this.prisma.client.dictData.findMany({
        where: { dictId: existing.id },
        select: { value: true },
      });
      const existingValues = new Set(existingData.map((d) => d.value));

      const toCreate = seedData
        .filter((d) => !existingValues.has(d.value))
        .map((d) => ({ ...d, dictId: existing.id }));

      if (toCreate.length > 0) {
        await this.prisma.client.dictData.createMany({ data: toCreate });
        this.logger.log(
          `🔄 字典「${seed.name}」补齐 ${toCreate.length} 条数据`,
        );
      }
    }
  }

  /**
   * 幂等升级: 若 admin 用户仍使用旧的弱密码 hash，自动升级到强密码
   * 已被用户主动修改过密码的环境不会被覆盖
   */
  private async upgradeLegacyAdminPassword() {
    const adminSeed = SEED_USERS_PLAINTEXT.find((u) => u.username === 'admin');
    if (!adminSeed) return;

    const adminUser = await this.prisma.client.user.findUnique({
      where: { username: 'admin' },
    });
    if (!adminUser) return;

    if (adminUser.password !== LEGACY_ADMIN_PASSWORD_HASH) {
      return;
    }

    const newHash = await this.hashingService.hash(adminSeed.plainPassword);
    await this.prisma.client.user.update({
      where: { id: adminUser.id },
      data: { password: newHash },
    });
    this.logger.warn(
      `🔐 检测到 admin 仍使用默认弱密码，已自动升级为 "${adminSeed.plainPassword}"，请尽快修改`,
    );
  }
}
