import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/prisma/generated/client';
import dictJson from './data/dict.json';
import menuJson from './data/menu.json';
import userJson from './data/user.json';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('环境变量 DATABASE_URL 未设置');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
async function main() {
  console.log('注入数据中...');

  await prisma.role.createMany({
    data: [
      { name: '超级管理员', value: 'admin', order: 1 },
      { name: '普通角色', value: 'common', order: 2 },
      { name: '短视频部门角色', value: 'business', order: 3 },
    ],
  });
  await Promise.all(userJson.map((user) => prisma.user.create({ data: user })));
  await Promise.all(menuJson.map((menu) => prisma.menu.create({ data: menu })));
  await Promise.all(dictJson.map((dict) => prisma.dict.create({ data: dict })));

  console.log('注入数据成功');
}
main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
});
