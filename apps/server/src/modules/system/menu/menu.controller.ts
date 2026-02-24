import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

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

import { ActiveUser } from '@/modules/auth/decorators/active-user.decorator';
import { AutoPermission } from 'src/modules/auth/authorization/decorators/auto-permission.decorator';

import { CreateMenuDto, QueryMenuDto, UpdateMenuDto } from './menu.dto';
import { MenuEntity } from './menu.entity';
import { MenuService } from './menu.service';

@ApiBearerAuth('bearer')
@ApiTags('菜单管理')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  /**
   * 创建菜单
   */
  @ApiCreatedResponse({ type: MenuEntity })
  @AutoPermission()
  @Post()
  create(@Body() createMenuDto: CreateMenuDto) {
    return this.menuService.create(createMenuDto);
  }

  /**
   * 删除菜单
   */
  @AutoPermission()
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.menuService.delete(id);
  }

  /**
   * 获取菜单列表
   */
  @ApiOkResponse({ type: MenuEntity, isArray: true })
  @Get()
  findAll(
    @ActiveUser() user: ActiveUserData,
    @Query() queryMenuDto: QueryMenuDto,
  ) {
    return this.menuService.findAll(user, queryMenuDto);
  }
  /**
   * 获取菜单详情
   */
  @ApiOkResponse({ type: MenuEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.menuService.findOne(id);
  }
  /**
   * 更新菜单
   */
  @ApiOkResponse({ type: MenuEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updateMenuDto: UpdateMenuDto) {
    return this.menuService.update(id, updateMenuDto);
  }
}
