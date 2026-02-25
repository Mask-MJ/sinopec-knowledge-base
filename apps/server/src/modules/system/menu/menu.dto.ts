import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateMenuDto {
  /**
   * 激活菜单图标
   * @example 'i-line-md:external-link'
   */
  @IsOptional()
  @IsString()
  activeIcon?: string;

  /**
   * 作为路由时，需要激活的菜单的Path
   * @example '/system'
   */
  @IsOptional()
  @IsString()
  activePath?: string;

  /**
   * 固定在标签栏
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  affixTab?: boolean = true;

  /**
   * 在标签栏固定的顺序
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  affixTabOrder?: number = 1;

  /**
   * 徽标内容 (当徽标类型为normal时有效)
   * @example 'new'
   */
  @IsOptional()
  @IsString()
  badge?: string;

  /**
   * 徽标类型
   * @example 'dot'
   */
  @IsOptional()
  @IsString()
  badgeType?: string;

  /**
   * 徽标颜色
   * @example 'default'
   */
  @IsOptional()
  @IsString()
  badgeVariants?: string;

  /**
   * 在菜单中隐藏下级
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hideChildrenInMenu?: boolean = false;

  /**
   * 在面包屑中隐藏
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hideInBreadcrumb?: boolean = false;

  /**
   * 在菜单中隐藏
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hideInMenu?: boolean = false;

  /**
   * 在标签栏中隐藏
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  hideInTab?: boolean = false;

  /**
   * 菜单图标
   * @example 'i-line-md:external-link'
   */
  @IsOptional()
  @IsString()
  icon?: string;

  /**
   * 内嵌Iframe的URL
   * @example 'www.example.com'
   */
  @IsOptional()
  @IsString()
  iframeSrc?: string;

  /**
   * 是否缓存页面
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  keepAlive?: boolean = false;

  /**
   * 外链页面的URL
   * @example 'www.example.com'
   */
  @IsOptional()
  @IsString()
  link?: string;

  /**
   * 同一个路由最大打开的标签数
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxNumOfOpenTabs?: number = 1;

  /**
   * 菜单名称
   * @example '系统管理'
   */
  @IsString()
  name: string;

  /**
   * 无需基础布局
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  noBasicLayout?: boolean = false;

  /**
   * 是否在新窗口打开
   * @example false
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  openInNewWindow?: boolean = false;

  /**
   * 排序
   * @example 1
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  order?: number = 1;

  /**
   * 父级菜单id
   * @example 0
   */
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  parentId?: number;

  /**
   * 菜单路径
   * @example '/system'
   */
  @IsOptional()
  @IsString()
  path?: string;

  /**
   * 权限标识
   * @example 'system:menu:list'
   */
  @IsOptional()
  @IsString()
  permission?: string;

  /**
   * 额外的路由参数
   * @example '/:id'
   */
  @IsOptional()
  @IsString()
  query?: string;

  /**
   * 重定向
   * @example '/system'
   */
  @IsOptional()
  @IsString()
  redirect?: string;

  /**
   * 状态 false: 禁用 true: 启用
   * @example true
   */
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  status?: boolean = true;

  /**
   * 菜单标题 (配置页面的标题,配合国际化使用)
   * @example 'system.title
   */
  @IsOptional()
  @IsString()
  title?: string;

  /**
   * 菜单类别
   * @example 'menu'
   */
  @IsString()
  type: string;
}

export class QueryMenuDto extends PartialType(
  IntersectionType(PickType(CreateMenuDto, ['name', 'path'])),
) {}

export class UpdateMenuDto extends IntersectionType(
  PartialType(CreateMenuDto),
  PickType(CreateMenuDto, ['name', 'path', 'type']),
) {}
