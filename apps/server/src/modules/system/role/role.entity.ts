import { Role } from '@prisma/generated/client';

import { MenuEntity } from '../menu/menu.entity';

export class RoleEntity implements Role {
  createdAt: Date;
  id: number;
  /** 关联的菜单列表 */
  menus: MenuEntity[];
  name: string;
  order: number;
  remark: string;
  status: boolean;
  updatedAt: Date;
  value: string;
}
