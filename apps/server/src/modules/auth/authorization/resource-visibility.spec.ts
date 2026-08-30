import type {
  ShareableResource,
  ShareGrantUser,
  VisibilityUser,
} from './resource-visibility';

import { describe, expect, it } from 'vitest';

import {
  assertCanShareAs,
  buildVisibilityWhere,
  canEditResource,
  canViewResource,
  matchesShareBranch,
  shareBranches,
} from './resource-visibility';

const admin: VisibilityUser = { deptId: null, isAdmin: true };
const alice: VisibilityUser = { deptId: 1, isAdmin: false };
const bob: VisibilityUser = { deptId: 2, isAdmin: false };
const noDept: VisibilityUser = { deptId: null, isAdmin: false };

const res = (
  permission: null | string,
  deptId: null | number = null,
): ShareableResource => ({ deptId, permission });

describe('buildVisibilityWhere', () => {
  it('admin 无过滤条件，可见全部', () => {
    expect(buildVisibilityWhere(admin, { userId: 9 })).toEqual({});
  });

  it('普通用户 = 自己的 + 全公司 + 本部门 team', () => {
    expect(buildVisibilityWhere(alice, { userId: 9 })).toEqual({
      OR: [
        { userId: 9 },
        { permission: 'public' },
        { deptId: 1, permission: 'team' },
      ],
    });
  });

  it('无部门用户不得到 team 分支，避免 deptId=null 互相撞见', () => {
    expect(buildVisibilityWhere(noDept, { createBy: 'x' })).toEqual({
      OR: [{ createBy: 'x' }, { permission: 'public' }],
    });
  });
});

describe('canViewResource', () => {
  it('创建者与 admin 恒可见', () => {
    expect(canViewResource(res('me'), bob, true)).toBe(true);
    expect(canViewResource(res('me'), admin, false)).toBe(true);
  });

  it('public 对所有人可见', () => {
    expect(canViewResource(res('public'), bob, false)).toBe(true);
    expect(canViewResource(res('public'), noDept, false)).toBe(true);
  });

  it('team 仅同部门可见', () => {
    expect(canViewResource(res('team', 1), alice, false)).toBe(true);
    expect(canViewResource(res('team', 1), bob, false)).toBe(false);
  });

  it('team 但 deptId 为空 → 谁都看不到（历史脏数据，创建时已被拒）', () => {
    expect(canViewResource(res('team', null), alice, false)).toBe(false);
    expect(canViewResource(res('team', null), noDept, false)).toBe(false);
  });

  it('me 对非创建者不可见', () => {
    expect(canViewResource(res('me'), alice, false)).toBe(false);
  });

  it('permission 为空按最严处理', () => {
    expect(canViewResource(res(null), alice, false)).toBe(false);
  });
});

describe('canEditResource：共享只给读，写恒限创建者 + admin', () => {
  it('创建者与 admin 可写', () => {
    expect(canEditResource(bob, true)).toBe(true);
    expect(canEditResource(admin, false)).toBe(true);
  });

  it('public 资源非创建者不可写——否则任何人都能删全公司知识库', () => {
    expect(canEditResource(alice, false)).toBe(false);
  });

  it('同部门 team 资源非创建者同样不可写', () => {
    expect(canEditResource(alice, false)).toBe(false);
  });
});

describe('where 与 canView 语义一致（同一份 shareBranches 派生）', () => {
  const samples: ShareableResource[] = [
    res('me'),
    res('team', 1),
    res('team', 2),
    res('team', null),
    res('public'),
    res(null),
  ];

  for (const user of [alice, bob, noDept]) {
    it(`deptId=${user.deptId} 时两条路径结论相同`, () => {
      for (const resource of samples) {
        const byBranch = shareBranches(user).some((branch) =>
          matchesShareBranch(resource, branch),
        );
        expect(canViewResource(resource, user, false)).toBe(byBranch);
      }
    });
  }
});

describe('assertCanShareAs', () => {
  const grant = (o: Partial<ShareGrantUser> = {}): ShareGrantUser => ({
    deptId: null,
    isAdmin: false,
    isDeptAdmin: false,
    ...o,
  });

  it('不设权限或设为 me 时不校验', () => {
    expect(() => {
      assertCanShareAs(grant(), undefined, '知识库');
    }).not.toThrow();
    expect(() => {
      assertCanShareAs(grant(), 'me', '知识库');
    }).not.toThrow();
  });

  it('team 需要部门主管或 admin', () => {
    expect(() => {
      assertCanShareAs(grant({ deptId: 1 }), 'team', '知识库');
    }).toThrow(/仅部门主管/);
    expect(() => {
      assertCanShareAs(
        grant({ deptId: 1, isDeptAdmin: true }),
        'team',
        '知识库',
      );
    }).not.toThrow();
  });

  it('team 且本人无部门时拒绝——正是「超管建的团队库谁都看不到」的成因', () => {
    expect(() => {
      assertCanShareAs(grant({ isAdmin: true }), 'team', '知识库');
    }).toThrow(/未归属部门/);
  });

  it('public 仅 admin', () => {
    expect(() => {
      assertCanShareAs(grant({ isDeptAdmin: true }), 'public', '助手');
    }).toThrow(/仅超级管理员/);
    expect(() => {
      assertCanShareAs(grant({ isAdmin: true }), 'public', '助手');
    }).not.toThrow();
  });
});
