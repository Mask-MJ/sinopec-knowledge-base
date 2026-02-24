import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/generated/client';
import { CustomPrismaService } from 'nestjs-prisma';
import { pagination } from 'prisma-extension-pagination';
// https://github.com/notiz-dev/nestjs-prisma/issues/77

export const extendedPrismaClient = (url: string) =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 50,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2000,
    }),
  }).$extends(pagination({ pages: { limit: 10, includePageCount: true } }));

export type ExtendedPrismaClient = ReturnType<typeof extendedPrismaClient>;

export type PrismaService = CustomPrismaService<ExtendedPrismaClient>;
