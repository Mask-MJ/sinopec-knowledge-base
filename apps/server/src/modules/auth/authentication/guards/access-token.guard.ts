import type { ConfigType } from '@nestjs/config';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { REQUEST_USER_KEY } from '../../auth.constants';
import jwtConfig from '../../config/jwt.config';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    // 由于 verifyAsync 可能会抛出一些无法自动识别的自定义错误，例如 JWT 过期
    // 将其包装在try catch块中并重新抛出unauthorizedException
    try {
      // 验证 access token 并解析出 payload
      const payload = await this.jwtService.verifyAsync(
        token,
        this.jwtConfiguration,
      );
      request[REQUEST_USER_KEY] = payload;
    } catch (error) {
      throw new UnauthorizedException('请先登录', { cause: error });
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    // 获取请求头中的 Authorization 字段
    const [bearer, token] = request.headers.authorization?.split(' ') ?? [];
    // 如果 Authorization 字段不是以 Bearer 开头的，那么就不是 access token
    // 返回 access token
    return bearer === 'Bearer' ? token : undefined;
  }
}
