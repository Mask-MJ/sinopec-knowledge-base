import { SetMetadata } from '@nestjs/common';

export const AUTO_PERMISSION_KEY = 'auto_permission';

/**
 * 自动权限装饰器
 * 根据路由路径、控制器名称、HTTP方法自动生成权限码
 * 格式: module:controller:action
 *
 * HTTP 方法映射:
 * - GET → read
 * - POST → create
 * - PATCH/PUT → update
 * - DELETE → delete
 *
 * @example
 * // 在 InfluencerController 的 POST 方法上使用
 * // 自动生成权限码: business:influencer:create
 * @AutoPermission()
 * @Post()
 * create() {}
 */
export const AutoPermission = () => SetMetadata(AUTO_PERMISSION_KEY, true);
