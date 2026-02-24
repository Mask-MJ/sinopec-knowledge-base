import type { PrismaService } from '@/common/database/prisma.extension';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUEST_USER_KEY } from '../../auth.constants';
import { ActiveUserData } from '../../interfaces/active-user-data.interface';
import { AUTO_PERMISSION_KEY } from '../decorators/auto-permission.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * HTTP 方法到操作类型的映射
 */
const METHOD_ACTION_MAP: Record<string, string> = {
  GET: 'read',
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject('PrismaService')
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    // 获取显式定义的权限
    const explicitPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 获取自动权限标记
    const autoPermission = this.reflector.getAllAndOverride<boolean>(
      AUTO_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 计算最终需要检查的权限
    let contextPermissions: string[] | undefined = explicitPermissions;

    if (autoPermission) {
      const generatedPermission = this.generatePermissionCode(context);
      if (generatedPermission) {
        contextPermissions = contextPermissions
          ? [...contextPermissions, generatedPermission]
          : [generatedPermission];
      }
    }

    if (!contextPermissions || contextPermissions.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ [REQUEST_USER_KEY]: ActiveUserData }>();
    const user: ActiveUserData = request[REQUEST_USER_KEY];
    const userInfo = await this.prisma.client.user.findUnique({
      where: { id: user.sub },
      include: { roles: { include: { menus: { where: { type: 'button' } } } } },
    });

    if (!userInfo) return false;
    if (userInfo.isAdmin) return true;
    const permissionsName = new Set(
      userInfo.roles
        .flatMap((role) => role.menus)
        .flatMap((menu) => menu.permission),
    );

    return contextPermissions.every((permission) =>
      permissionsName.has(permission),
    );
  }

  /**
   * 根据路由路径和HTTP方法自动生成权限码
   * 格式: module:controller:action
   */
  private generatePermissionCode(context: ExecutionContext): null | string {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.route?.path || request.url;

    // 获取操作类型
    const action = METHOD_ACTION_MAP[method];
    if (!action) return null;

    // 解析路由路径: /api/system/dept/:id -> ['api', 'system', 'dept']
    let pathSegments = url
      .split('/')
      .filter((segment: string) => segment && !segment.startsWith(':'));

    // 跳过 'api' 前缀
    if (pathSegments[0] === 'api') {
      pathSegments = pathSegments.slice(1);
    }

    if (pathSegments.length < 2) return null;

    // 取前两段作为 module:controller
    const [moduleName, controllerName] = pathSegments;

    return `${moduleName}:${controllerName}:${action}`;
  }
}
