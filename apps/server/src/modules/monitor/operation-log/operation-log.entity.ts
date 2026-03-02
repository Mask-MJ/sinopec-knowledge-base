import { OperationLog } from '@prisma/generated/client';

export class OperationLogEntity implements OperationLog {
  address: string;
  businessType: number;
  createdAt: Date;
  id: number;
  ip: string;
  module: string;
  title: string;
  username: string;
}
