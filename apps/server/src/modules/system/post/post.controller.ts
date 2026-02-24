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
import { AutoPermission } from '@/modules/auth/authorization/decorators/auto-permission.decorator';

import { CreatePostDto, QueryPostDto, UpdatePostDto } from './post.dto';
import { PostEntity } from './post.entity';
import { PostService } from './post.service';

@ApiBearerAuth('bearer')
@ApiTags('岗位管理')
@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  /**
   * 创建岗位
   */
  @ApiCreatedResponse({ type: PostEntity })
  @AutoPermission()
  @Post()
  create(@Body() createPostDto: CreatePostDto) {
    return this.postService.create(createPostDto);
  }

  /**
   * 删除岗位
   */
  @AutoPermission()
  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.postService.delete(id);
  }

  /**
   * 获取岗位详情
   */
  @ApiOkResponse({ type: PostEntity })
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.postService.findOne(id);
  }

  /**
   * 获取岗位列表
   */
  @ApiPaginatedResponse(PostEntity)
  @Get()
  findWithPagination(@Query() queryPostDto: QueryPostDto) {
    return this.postService.findWithPagination(queryPostDto);
  }

  /**
   * 更新岗位
   */
  @ApiOkResponse({ type: PostEntity })
  @AutoPermission()
  @Patch(':id')
  update(@Param('id') id: number, @Body() updatePostDto: UpdatePostDto) {
    return this.postService.update(id, updatePostDto);
  }
}
