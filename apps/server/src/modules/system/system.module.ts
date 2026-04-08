import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HashingModule } from '@/common/hashing';
import { MinioModule } from '@/common/minio/minio.module';
import { AssistantModule } from '@/modules/assistant/assistant.module';

import { DeptController } from './dept/dept.controller';
import { DeptService } from './dept/dept.service';
import { DictController } from './dict/dict.controller';
import { DictService } from './dict/dict.service';
import { MenuController } from './menu/menu.controller';
import { MenuService } from './menu/menu.service';
import { PostController } from './post/post.controller';
import { PostService } from './post/post.service';
import { RoleController } from './role/role.controller';
import { RoleService } from './role/role.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';

@Module({
  imports: [
    HttpModule.register({}),
    HashingModule,
    MinioModule,
    AssistantModule,
  ],
  controllers: [
    UserController,
    DeptController,
    DictController,
    MenuController,
    RoleController,
    PostController,
  ],
  providers: [
    UserService,
    DeptService,
    DictService,
    MenuService,
    RoleService,
    PostService,
  ],
})
export class SystemModule {}
