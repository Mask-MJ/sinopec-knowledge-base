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
import { Permissions } from '@/modules/auth/authorization/decorators/permissions.decorator';

import {
  CreateDictDataDto,
  CreateDictDto,
  QueryDictDataDto,
  QueryDictDto,
  UpdateDictDataDto,
  UpdateDictDto,
} from './dict.dto';
import { DictDataEntity, DictEntity } from './dict.entity';
import { DictService } from './dict.service';

@ApiBearerAuth('bearer')
@ApiTags('字典管理')
@Controller('dict')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  /**
   * 创建字典
   */
  @ApiCreatedResponse({ type: DictEntity })
  @AutoPermission()
  @Post()
  create(@Body() createDictDto: CreateDictDto) {
    return this.dictService.create(createDictDto);
  }

  /**
   * 创建字典数据
   */
  @ApiCreatedResponse({ type: DictDataEntity })
  @Permissions('system:dictData:create')
  @Post('data')
  createData(@Body() createDictDataDto: CreateDictDataDto) {
    return this.dictService.createData(createDictDataDto);
  }

  /**
   * 删除字典
   */
  @AutoPermission()
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.dictService.delete(id);
  }
  /**
   * 删除字典数据
   */
  @Delete('data/:id')
  @Permissions('system:dictData:delete')
  deleteData(@Param('id') id: number) {
    return this.dictService.deleteData(id);
  }

  /**
   * 获取字典列表
   */
  @ApiOkResponse({ type: DictEntity, isArray: true })
  @Get()
  findAll(@Query() queryDictDto: QueryDictDto) {
    return this.dictService.findAll(queryDictDto);
  }

  /**
   * 获取字典数据列表
   */
  @ApiOkResponse({ type: DictDataEntity, isArray: true })
  @Get('data')
  findAllData(@Query() queryDictDataDto: QueryDictDataDto) {
    return this.dictService.findAllData(queryDictDataDto);
  }

  /**
   * 获取字典详情
   */
  @ApiOkResponse({ type: DictEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.dictService.findOne(id);
  }

  /**
   * 获取字典数据详情
   */
  @ApiOkResponse({ type: DictDataEntity })
  @Get('data/:id')
  findOneData(@Param('id') id: number) {
    return this.dictService.findOneData(id);
  }

  /**
   * 更新字典
   */
  @ApiOkResponse({ type: DictEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updateDictDto: UpdateDictDto) {
    return this.dictService.update(id, updateDictDto);
  }

  /**
   * 更新字典数据
   */
  @ApiOkResponse({ type: DictDataEntity })
  @Patch('data/:id')
  @Permissions('system:dictData:update')
  updateData(
    @Param('id') id: number,
    @Body() updateDictDataDto: UpdateDictDataDto,
  ) {
    return this.dictService.updateData(id, updateDictDataDto);
  }
}
