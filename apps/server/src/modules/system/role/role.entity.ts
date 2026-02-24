import { Role } from '@prisma/generated/client';

export class RoleEntity implements Role {
  createdAt: Date;
  id: number;
  name: string;
  order: number;
  remark: string;
  status: boolean;
  updatedAt: Date;
  value: string;
}
