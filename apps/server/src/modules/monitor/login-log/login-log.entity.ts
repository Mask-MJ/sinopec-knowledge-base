import { LoginLog } from '@prisma/generated/client';

export class LoginLogEntity implements LoginLog {
  id: number;
  username: string;
  status: boolean;
  ip: string;
  address: string;
  browser: string;
  os: string;
  message: string;
  loginTime: Date;
  createdAt: Date;
}
