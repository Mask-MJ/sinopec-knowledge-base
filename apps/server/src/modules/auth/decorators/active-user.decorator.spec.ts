import { ExecutionContext } from '@nestjs/common';

import { REQUEST_USER_KEY } from '../auth.constants';
import { ActiveUserFactory } from './active-user.decorator';

describe('activeUser Decorator', () => {
  it('should be defined', () => {
    expect(ActiveUserFactory).toBeDefined();
  });

  it('should return the user from the request', () => {
    const user = { sub: 1, username: 'test' };
    const request = { [REQUEST_USER_KEY]: user };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    expect(ActiveUserFactory(undefined, ctx)).toEqual(user);
  });

  it('should return a specific field from the user', () => {
    const user = { sub: 1, username: 'test' };
    const request = { [REQUEST_USER_KEY]: user };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    expect(ActiveUserFactory('username', ctx)).toEqual('test');
  });

  it('should return undefined if user is not present', () => {
    const request = {};
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    expect(ActiveUserFactory(undefined, ctx)).toBeUndefined();
  });
});
