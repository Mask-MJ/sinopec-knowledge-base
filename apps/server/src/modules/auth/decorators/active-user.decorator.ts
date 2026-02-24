import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { REQUEST_USER_KEY } from '../auth.constants';
import { ActiveUserData } from '../interfaces/active-user-data.interface';

export const ActiveUserFactory = (
  field: keyof ActiveUserData | undefined,
  ctx: ExecutionContext,
) => {
  // 从执行上下文中获取请求对象
  // 切换到 http 并且调用 getRequest 方法
  const request = ctx
    .switchToHttp()
    .getRequest<{ [REQUEST_USER_KEY]?: ActiveUserData }>();
  // 从请求对象中获取用户对象
  const user: ActiveUserData | undefined = request[REQUEST_USER_KEY];
  // 如果没有传入字段，则返回整个用户对象
  return field ? user?.[field] : user;
};

export const ActiveUser = createParamDecorator(ActiveUserFactory);
