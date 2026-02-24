import { Dict, DictData } from '@prisma/generated/client';

export class DictEntity implements Dict {
  createdAt: Date;
  id: number;
  name: string;
  remark: string;
  status: boolean;
  updatedAt: Date;
  value: string;
}

export class DictDataEntity implements DictData {
  createdAt: Date;
  dictId: number;
  id: number;
  name: string;
  order: number;
  remark: string;
  status: boolean;
  updateBy: null | string;
  updatedAt: Date;
  value: string;
}
