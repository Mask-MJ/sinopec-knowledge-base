import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AUTH_TYPE_KEY } from '../decorators/auth.decorator';
import { AuthType } from '../enums/auth-type.enum';
import { AccessTokenGuard } from './access-token.guard';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private static readonly defaultAuthType = AuthType.Bearer;

  private readonly authTypeGuardMap: Record<
    AuthType,
    CanActivate | CanActivate[]
  >;
  constructor(
    // 注入底层元数据
    private readonly reflector: Reflector,
    // 注入 access token
    private readonly accessTokenGuard: AccessTokenGuard,
  ) {
    this.authTypeGuardMap = {
      [AuthType.Bearer]: this.accessTokenGuard,
      [AuthType.None]: { canActivate: () => true },
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 获取元数据
    // 第二个参数传入由两个目标组成的数组，第一个是处理程序，第二个是类
    const authTypes = this.reflector.getAllAndOverride<AuthType[]>(
      AUTH_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [AuthenticationGuard.defaultAuthType];

    // 使用身份验证类保护路由 将身份验证类型值映射到相应的保护实例
    const guards = authTypes.flatMap((type) => this.authTypeGuardMap[type]);
    // 声明错误变量, 在身份验证防护中所有防护都返回false时抛出异常
    let error = new UnauthorizedException();

    // 遍历守卫数组并调用它们各自的canActivate方法
    // 如果任何允许的身份验证类型通过，则返回true
    // 否则守卫将抛出由触发的守卫或未经授权的异常
    for (const instance of guards) {
      const canActivate = await Promise.resolve(
        instance.canActivate(context),
      ).catch((error_) => {
        error = error_;
      });
      if (canActivate) {
        return true;
      }
    }

    // 如果没有防护返回true，则抛出异常
    throw error;
  }
}
