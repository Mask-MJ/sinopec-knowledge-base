import type { PrismaService } from '@/common/database/prisma.extension';
import type { OnApplicationBootstrap } from '@nestjs/common';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';

import { SEED_DICTS, SEED_MENUS, SEED_ROLES, SEED_USERS } from './seed.data';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @Inject(PRISMA_SERVICE_TOKEN)
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap() {
    try {
      const count = await this.prisma.client.role.count();
      if (count > 0) {
        this.logger.log('⏭️  Database already seeded, skipping.');
        return;
      }

      this.logger.log('🌱 First deployment detected, seeding database...');

      await this.prisma.client.role.createMany({ data: SEED_ROLES });
      await Promise.all(
        SEED_USERS.map((user) =>
          this.prisma.client.user.create({ data: user }),
        ),
      );
      await Promise.all(
        SEED_MENUS.map((menu) =>
          this.prisma.client.menu.create({ data: menu }),
        ),
      );
      await Promise.all(
        SEED_DICTS.map((dict) =>
          this.prisma.client.dict.create({ data: dict }),
        ),
      );

      this.logger.log('✅ Seed data injected successfully.');
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
}
