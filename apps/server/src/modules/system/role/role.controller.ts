import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '@/common/response/paginated.response';
import { AutoPermission } from 'src/modules/auth/authorization/decorators/auto-permission.decorator';

import { CreateRoleDto, QueryRoleDto, UpdateRoleDto } from './role.dto';
import { RoleEntity } from './role.entity';
import { RoleService } from './role.service';

@ApiBearerAuth('bearer')
@ApiTags('权限管理')
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * 创建权限
   */
  @ApiCreatedResponse({ type: RoleEntity })
  @AutoPermission()
  @Post()
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.create(createRoleDto);
  }

  /**
   * 删除权限
   */
  @AutoPermission()
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.roleService.delete(id);
  }

  /**
   * 获取权限详情
   */
  @ApiOkResponse({ type: RoleEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.roleService.findOne(id);
  }

  /**
   * 获取权限列表
   */
  @ApiPaginatedResponse(RoleEntity)
  @Get()
  findWithPagination(@Query() queryRoleDto: QueryRoleDto) {
    return this.roleService.findWithPagination(queryRoleDto);
  }

  /**
   * 更新权限
   */
  @ApiOkResponse({ type: RoleEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updateRoleDto: UpdateRoleDto) {
    return this.roleService.update(id, updateRoleDto);
  }
}
