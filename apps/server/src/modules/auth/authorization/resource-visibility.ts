/**
 * 资源共享可见性规则（知识库 / 助手共用）。
 *
 * 三档语义：
 * - `me`     仅创建者可见
 * - `team`   同部门可见，依赖资源与用户都有 deptId
 * - `public` 全公司可见
 *
 * 写权限**不随共享放宽**：`canEditResource` 恒为「创建者 + admin」。
 * 因为 public 面向全员，若共享即可写，任何人都能删掉全公司知识库的文档。
 * 将来若要允许同部门协作编辑，只需改 canEditResource 一处。
 */

import { ForbiddenException } from '@nestjs/common';

/** 资源共享档位。 */
export type ResourcePermission = 'me' | 'public' | 'team';

/** 允许写入的档位，供 DTO 的 @IsIn 复用，避免两处枚举漂移。 */
export const RESOURCE_PERMISSIONS: readonly ResourcePermission[] = [
  'me',
  'team',
  'public',
];

/** 判定所需的用户属性子集。 */
export interface VisibilityUser {
  deptId: null | number;
  isAdmin: boolean;
}

/** 判定所需的资源属性子集（知识库与助手都满足）。 */
export interface ShareableResource {
  deptId: null | number;
  permission: null | string;
}

/** 一条共享可见分支。 */
export interface ShareBranch {
  deptId?: number;
  permission: ResourcePermission;
}

/**
 * 当前用户能通过「共享」看到哪些资源。
 *
 * 这是规则的唯一来源：`buildVisibilityWhere` 拿它拼 Prisma 的 OR，
 * `canViewResource` 拿它做单条判定，两者不会漂移。
 */
export function shareBranches(user: VisibilityUser): ShareBranch[] {
  return [
    { permission: 'public' },
    // 无部门的用户不给 team 分支：否则 deptId 同为 null 的资源会互相撞见。
    ...(user.deptId === null
      ? []
      : [{ deptId: user.deptId, permission: 'team' as const }]),
  ];
}

/** 单条资源是否命中某个共享分支。 */
export function matchesShareBranch(
  resource: ShareableResource,
  branch: ShareBranch,
): boolean {
  if (resource.permission !== branch.permission) return false;
  if (branch.deptId === undefined) return true;
  return resource.deptId !== null && resource.deptId === branch.deptId;
}

/**
 * 构造「当前用户可见资源」的 Prisma where 片段。
 *
 * 归属条件由调用方给出：知识库按 `createBy`(username)，助手按 `userId`(Int)。
 */
export function buildVisibilityWhere(
  user: VisibilityUser,
  ownerFilter: Record<string, unknown>,
): Record<string, unknown> {
  if (user.isAdmin) return {};
  return { OR: [ownerFilter, ...shareBranches(user)] };
}

/** 当前用户能否读取 / 使用该资源。 */
export function canViewResource(
  resource: ShareableResource,
  user: VisibilityUser,
  isOwner: boolean,
): boolean {
  if (user.isAdmin || isOwner) return true;
  return shareBranches(user).some((branch) =>
    matchesShareBranch(resource, branch),
  );
}

/**
 * 当前用户能否修改 / 删除该资源。
 * 共享只放宽读，不放宽写——理由见文件头。
 */
export function canEditResource(
  user: VisibilityUser,
  isOwner: boolean,
): boolean {
  return user.isAdmin || isOwner;
}

/** 设置共享档位所需的用户属性子集。 */
export interface ShareGrantUser extends VisibilityUser {
  isDeptAdmin: boolean;
}

/**
 * 校验用户有无资格把资源设成某个共享档位。
 *
 * - `team`   需部门主管或 admin，且**本人必须归属部门**——否则会写出
 *            `deptId=null` 的团队资源，那种记录除创建者外谁都看不到。
 * - `public` 面向全公司，仅 admin。
 */
export function assertCanShareAs(
  user: ShareGrantUser,
  permission: ResourcePermission | undefined,
  resourceLabel: string,
): void {
  if (permission === 'team') {
    if (!user.isAdmin && !user.isDeptAdmin) {
      throw new ForbiddenException(
        `仅部门主管可将${resourceLabel}设为部门公开`,
      );
    }
    if (user.deptId === null) {
      throw new ForbiddenException(
        `当前账号未归属部门，无法将${resourceLabel}设为部门公开；如需全员可见请选择「全公司共享」`,
      );
    }
  }
  if (permission === 'public' && !user.isAdmin) {
    throw new ForbiddenException(
      `仅超级管理员可将${resourceLabel}设为全公司共享`,
    );
  }
}
