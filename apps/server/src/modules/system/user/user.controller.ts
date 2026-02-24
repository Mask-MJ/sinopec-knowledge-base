import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';
import type { Request as ExpRequest } from 'express';

import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  Headers,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsIP, IsIpVersion } from 'class-validator';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';
import { AutoPermission } from '@/modules/auth/authorization/decorators/auto-permission.decorator';
import { Permissions } from '@/modules/auth/authorization/decorators/permissions.decorator';
import { ActiveUser } from '@/modules/auth/decorators/active-user.decorator';

import {
  ChangePasswordDto,
  CreateUserDto,
  QueryUserDto,
  UpdateUserDto,
} from './user.dto';
import { UserEntity } from './user.entity';
import { UserService } from './user.service';

@ApiBearerAuth('bearer')
@ApiTags('用户管理')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 修改密码
   */
  @ApiOkResponse({ type: UserEntity })
  @Patch('changePassword')
  @Permissions('system:user:update')
  changePassword(@Body() { id, oldPassword, password }: ChangePasswordDto) {
    return this.userService.changePassword(id, password, oldPassword);
  }

  /**
   * 创建用户
   */
  @ApiCreatedResponse({ type: UserEntity })
  @AutoPermission()
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  /**
   * 删除用户
   */
  @ApiHeader({ name: 'X-Real-IP', required: false })
  @AutoPermission()
  @Delete(':id')
  delete(
    @ActiveUser() user: ActiveUserData,
    @Param('id') id: number,
    @Request() request: ExpRequest,
    @Headers('X-Real-IP') ip?: string,
  ) {
    const clientIp = ip && IsIP(ip as IsIpVersion) ? ip : request.ip;
    return this.userService.delete(user, id, clientIp);
  }

  /**
   * 获取所有用户列表
   */
  @ApiOkResponse({ type: UserEntity, isArray: true })
  @Get('all')
  findAll(@Query() queryUserDto: QueryUserDto) {
    return this.userService.findAll(queryUserDto);
  }

  /**
   * 获取单个用户信息
   */
  @ApiOkResponse({ type: UserEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.userService.findOne(id);
  }

  /**
   * 获取当前登录用户信息
   */
  @ApiOkResponse({ type: UserEntity })
  @Get('info')
  findSelf(@ActiveUser() user: ActiveUserData) {
    return this.userService.findSelf(user.sub);
  }

  /**
   * 获取当前登录用户权限码
   */
  @ApiOkResponse({ type: String, isArray: true })
  @Get('code')
  findSelfCode(@ActiveUser() user: ActiveUserData) {
    return this.userService.findSelfCode(user.sub);
  }

  /**
   * 获取用户列表
   */
  @ApiPaginatedResponse(UserEntity)
  @Get()
  findWithPagination(@Query() queryUserDto: QueryUserDto) {
    return this.userService.findWithPagination(queryUserDto);
  }

  /**
   * 更新用户
   */
  @ApiOkResponse({ type: UserEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @ApiOperation({ summary: '上传用户头像' })
  @Post('uploadAvatar')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @ActiveUser() user: ActiveUserData,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 2 }),
          new FileTypeValidator({ fileType: /image\/(png|jpg|jpeg)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.userService.uploadAvatar(user, file);
  }
}
