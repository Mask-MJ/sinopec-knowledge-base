import { Dept } from '@prisma/generated/client';

export class DeptEntity implements Dept {
  children?: DeptEntity[] | null;
  createdAt: Date;
  email: string;
  id: number;
  leader: null | string;
  leaderId: null | number;
  name: string;
  order: number;
  parentId: null | number;
  phone: string;
  updatedAt: Date;
}
