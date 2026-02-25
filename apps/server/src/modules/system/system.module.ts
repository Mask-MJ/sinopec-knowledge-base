import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
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
  imports: [HttpModule.register({}), AuthModule],
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
