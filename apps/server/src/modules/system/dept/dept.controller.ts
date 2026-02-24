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

import { AutoPermission } from '@/modules/auth/authorization/decorators/auto-permission.decorator';

import { CreateDeptDto, QueryDeptDto, UpdateDeptDto } from './dept.dto';
import { DeptEntity } from './dept.entity';
import { DeptService } from './dept.service';

@ApiBearerAuth('bearer')
@ApiTags('部门管理')
@Controller('dept')
export class DeptController {
  constructor(private readonly deptService: DeptService) {}
  /**
   * 创建部门
   */
  @ApiCreatedResponse({ type: DeptEntity })
  @AutoPermission()
  @Post()
  create(@Body() createDeptDto: CreateDeptDto) {
    return this.deptService.create(createDeptDto);
  }

  /**
   * 删除部门
   */
  @AutoPermission()
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.deptService.delete(id);
  }

  /**
   * 获取部门列表
   */
  @ApiOkResponse({ type: DeptEntity, isArray: true })
  @Get()
  findAll(@Query() queryDeptDto: QueryDeptDto) {
    return this.deptService.findAll(queryDeptDto);
  }

  /**
   * 获取部门详情
   */
  @ApiOkResponse({ type: DeptEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.deptService.findOne(id);
  }

  /**
   * 更新部门
   */
  @ApiOkResponse({ type: DeptEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updateDeptDto: UpdateDeptDto) {
    return this.deptService.update(id, updateDeptDto);
  }
}
