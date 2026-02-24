import { IntersectionType, PickType } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

import { CreateUserDto } from '../../system/user/user.dto';

export class SignInDto {
  /**
   * 密码
   * @example '123456'
   */
  @MinLength(4)
  password: string;

  /**
   * 账号
   * @example 'admin'
   */
  @MinLength(4)
  username: string;
}

export class SignUpDto extends IntersectionType(
  PickType(CreateUserDto, ['username', 'nickname', 'password']),
) {}

export class RefreshTokenDto {
  @IsNotEmpty()
  refreshToken: string;
}
