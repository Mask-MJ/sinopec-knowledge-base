import { ApiHideProperty } from '@nestjs/swagger';
import { User } from '@prisma/generated/client';
import { Exclude } from 'class-transformer';

import { RoleEntity } from '../role/role.entity';

export class UserEntity implements User {
  avatar: string;
  createdAt: Date;
  deptId: null | number;
  email: string;
  id: number;
  isAdmin: boolean;
  isDeptAdmin: boolean;
  nickname: string;
  @ApiHideProperty()
  @Exclude()
  password: string;
  phoneNumber: string;
  remark: string;
  roleIds: number[];
  roles: RoleEntity[];
  sex: string;
  status: boolean;
  updatedAt: Date;
  username: string;
}
