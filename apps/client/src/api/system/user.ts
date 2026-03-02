import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type UserInfo = components['schemas']['UserEntity'];
export type SearchParams =
  operations['UserController_findAll']['parameters']['query'];
export type SignInParams = components['schemas']['SignInDto'];
export type SignInEntity = components['schemas']['SignInEntity'];
export type RefreshTokenParams = components['schemas']['RefreshTokenDto'];

// 注册
export function register(body: components['schemas']['SignUpDto']) {
  return client.POST('/api/auth/authentication/sign-up', { body });
}
// 登录
export function login(body: SignInParams) {
  return client.POST('/api/auth/authentication/sign-in', {
    params: { header: { 'X-Real-IP': '' } },
    body,
  });
}
// 刷新令牌
export function refreshToken(body: RefreshTokenParams) {
  return client.POST('/api/auth/authentication/refresh-token', { body });
}
// 获取自身用户信息
export const getUserInfo = () => client.GET('/api/system/user/info');

// 获取用户权限码
export const getAccessCodes = () => client.GET('/api/system/user/code');

// 获取用户列表
export function getUserList(query?: SearchParams) {
  return client.GET('/api/system/user', { params: { query } });
}
export function getAllUserList(query?: SearchParams) {
  return client.GET('/api/system/user/all', { params: { query } });
}
// 创建用户
export function createUser(body: components['schemas']['CreateUserDto']) {
  return client.POST('/api/system/user', { body });
}
// 获取用户详情
export function getUserDetail(id: number) {
  return client.GET('/api/system/user/{id}', { params: { path: { id } } });
}
// 修改密码
export function changePassword(
  body: components['schemas']['ChangePasswordDto'],
) {
  return client.PATCH('/api/system/user/changePassword', { body });
}
// 修改用户信息
export function updateUser(body: components['schemas']['UpdateUserDto']) {
  return client.PATCH('/api/system/user/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}
// 删除用户
export function deleteUser(id: number) {
  return client.DELETE('/api/system/user/{id}', {
    params: { header: { 'X-Real-IP': '' }, path: { id } },
  });
}
