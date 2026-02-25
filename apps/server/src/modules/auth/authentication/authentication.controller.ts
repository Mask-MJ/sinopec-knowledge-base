import type { Request as ExpRequest } from 'express';

import { isIP } from 'node:net';

import { Body, Controller, Headers, Post, Request } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { RefreshTokenDto, SignInDto, SignUpDto } from './authentication.dto';
import { SignInEntity } from './authentication.entity';
import { AuthenticationService } from './authentication.service';
import { Auth } from './decorators/auth.decorator';
import { AuthType } from './enums/auth-type.enum';

@ApiTags('登录认证')
@Auth(AuthType.None)
@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  /**
   * 刷新令牌
   */
  @ApiOkResponse({ type: SignInEntity })
  @Post('refresh-token')
  refreshTokens(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authenticationService.refreshTokens(refreshTokenDto);
  }

  /**
   * 登录
   */
  @ApiHeader({ name: 'X-Real-IP', required: false })
  @ApiHeader({ name: 'User-Agent', required: false })
  @ApiOkResponse({ type: SignInEntity })
  @Post('sign-in')
  signIn(
    @Body() signInDto: SignInDto,
    @Request() request: ExpRequest,
    @Headers() header: any,
    @Headers('X-Real-IP') ip?: string,
  ) {
    const clientIp = ip && isIP(ip) ? ip : request.ip;
    return this.authenticationService.signIn(signInDto, header, clientIp);
  }

  /**
   * 注册
   */
  @ApiCreatedResponse({ description: '用户注册成功' })
  @Post('sign-up')
  signUp(@Body() signUpDto: SignUpDto) {
    return this.authenticationService.signUp(signUpDto);
  }
}
