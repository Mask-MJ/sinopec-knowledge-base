import { LoginLog } from '@prisma/generated/client';

export class LoginLogEntity implements LoginLog {
  address: string;
  browser: string;
  createdAt: Date;
  id: number;
  ip: string;
  loginTime: Date;
  message: string;
  os: string;
  status: boolean;
  username: string;
}
