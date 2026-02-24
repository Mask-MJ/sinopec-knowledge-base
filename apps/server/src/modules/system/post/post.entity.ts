import { Post } from '@prisma/generated/client';

export class PostEntity implements Post {
  code: string;
  createdAt: Date;
  id: number;
  name: string;
  order: number;
  remark: string;
  updatedAt: Date;
}
