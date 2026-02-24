import type { ActiveUserData } from '../interfaces/active-user-data.interface';
import type { PrismaService } from '@/common/database/prisma.extension';
import type { ConfigType } from '@nestjs/config';
import type { Cache } from 'cache-manager';

import { randomUUID } from 'node:crypto';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/generated/client';

import jwtConfig from '../config/jwt.config';
import { HashingService } from '../hashing/hashing.service';
import { RefreshTokenDto, SignInDto, SignUpDto } from './authentication.dto';

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject('PrismaService')
    private readonly prisma: PrismaService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async generateTokens(user: User) {
    // 生成随机 id
    const refreshTokenId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signToken<Partial<ActiveUserData>>(
        user.id,
        this.jwtConfiguration.accessTokenTtl,
        { username: user.username, nickname: user.nickname || '' },
      ),
      this.signToken(user.id, this.jwtConfiguration.refreshTokenTtl, {
        refreshTokenId,
      }),
    ]);
    await this.cacheManager.set(`user-${user.id}`, {
      tokenId: refreshTokenId,
      id: user.id,
      user: JSON.stringify(user),
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto) {
    try {
      // 验证传入的刷新令牌 获取用户id
      const { sub, refreshTokenId } = await this.jwtService.verifyAsync<
        Pick<ActiveUserData, 'sub'> & { refreshTokenId: string }
      >(refreshTokenDto.refreshToken, { secret: this.jwtConfiguration.secret });
      // 获取用户实例
      const user = await this.prisma.client.user.findUniqueOrThrow({
        where: { id: sub },
      });
      // 验证刷新令牌是否有效
      const data = await this.cacheManager.get<{
        id: number;
        tokenId: string;
        user: string;
      }>(`user-${user.id}`);
      if (!data) {
        throw new UnauthorizedException('Access token 已过期');
      }

      if (data.tokenId === refreshTokenId) {
        await this.cacheManager.del(`user-${user.id}`);
      } else {
        throw new Error('Refresh token 已过期');
      }
      return this.generateTokens(user);
    } catch (error) {
      this.logger.error('Refresh token 验证失败', error);
      throw new UnauthorizedException('Refresh token 验证失败');
    }
  }

  async signIn(
    { username, password }: SignInDto,
    header: Record<string, string>,
    ip: string = '',
  ) {
    const { os, browser } = this.extractClientInfo(header);
    const user = await this.prisma.client.user.findUnique({
      where: { username },
      include: { roles: { include: { menus: true } } },
    });
    if (!user) {
      this.emitLoginEvent('', ip, os, browser, '用户名不存在');
      throw new UnauthorizedException('用户名不存在');
    }
    const isEquals = await this.hashingService.compare(password, user.password);
    if (!isEquals) {
      this.emitLoginEvent(user.username, ip, os, browser, '密码错误');
      throw new UnauthorizedException('密码错误');
    }

    this.emitLoginEvent(user.username, ip, os, browser);

    return this.generateTokens(user);
  }

  async signUp({ username, nickname, password }: SignUpDto): Promise<User> {
    const user = await this.prisma.client.user.findUnique({
      where: { username },
    });
    if (user) {
      throw new ConflictException('用户名已存在');
    }
    return this.prisma.client.user.create({
      data: {
        username,
        nickname,
        password: await this.hashingService.hash(password),
      },
    });
  }

  private emitLoginEvent(
    username: string,
    ip: string,
    os: string,
    browser: string,
    message?: string,
  ) {
    this.eventEmitter.emit('login.log', {
      username,
      ip,
      os,
      browser,
      status: !message,
      ...(message && { message }),
    });
  }

  private extractClientInfo(header: Record<string, string>) {
    const os = (header['sec-ch-ua-platform'] || '').replaceAll('"', '');
    const userAgent = header['user-agent'] || '';
    const browserMap = ['Chrome', 'Firefox', 'Safari', 'Edge'] as const;
    const browser = browserMap.find((b) => userAgent.includes(b)) || 'Other';
    return { os, browser };
  }

  // 生成 access token 传入 用户 id, 过期时间, payload
  private signToken<T>(userId: number, expiresIn: number, payload?: T) {
    return this.jwtService.signAsync(
      { sub: userId, ...payload },
      { secret: this.jwtConfiguration.secret, expiresIn },
    );
  }
}
