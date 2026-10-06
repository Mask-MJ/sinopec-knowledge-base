import type { Prisma } from '@prisma/generated/client';

import { describe, expect, it } from 'vitest';

import {
  COMMON_ROLE_BUTTON_PERMISSIONS,
  COMMON_ROLE_MENU_PATHS,
  GENERAL_CHAT_ROLE_BUTTON_PERMISSIONS,
  GENERAL_CHAT_ROLE_MENU_PATHS,
  SEED_MENUS,
  SEED_ROLES,
} from './seed.data';

type FlatMenu = Prisma.MenuCreateInput & { parentPath?: string };

/** 把嵌套的 children.create 展平成一维菜单列表，并记下父菜单 path */
function flattenMenus(
  menus: Prisma.MenuCreateInput[],
  parentPath?: string,
): FlatMenu[] {
  return menus.flatMap((menu) => {
    const children = menu.children?.create;
    const childList = Array.isArray(children) ? children : [];
    return [
      { ...menu, parentPath },
      ...flattenMenus(childList as Prisma.MenuCreateInput[], menu.path),
    ];
  });
}

const seededMenus = flattenMenus(SEED_MENUS);

/** SeedService 只挂父菜单在角色菜单里的按钮，这里按同一规则找不到的码就是挂不上的 */
function unreachableButtons(
  menuPaths: readonly string[],
  permissions: readonly string[],
) {
  return permissions.filter(
    (permission) =>
      !seededMenus.some(
        (menu) =>
          menu.type === 'button' &&
          menu.permission === permission &&
          menuPaths.includes(menu.parentPath ?? ''),
      ),
  );
}

describe('seed.data', () => {
  it.each([
    ['common', COMMON_ROLE_MENU_PATHS],
    ['general-chat', GENERAL_CHAT_ROLE_MENU_PATHS],
  ])('every %s role menu path exists in SEED_MENUS', (_role, menuPaths) => {
    const seededPaths = new Set(seededMenus.map((menu) => menu.path));
    const missing = menuPaths.filter((path) => !seededPaths.has(path));
    expect(missing).toEqual([]);
  });

  it.each(['/portal', '/qa'])(
    'front page %s is hidden from the admin sidebar and tab bar',
    (path) => {
      const menu = seededMenus.find((item) => item.path === path);
      expect(menu).toMatchObject({ hideInMenu: true, hideInTab: true });
      expect(COMMON_ROLE_MENU_PATHS).toContain(path);
    },
  );

  describe('common role (front pages only)', () => {
    it('only sees the portal and the knowledge base Q&A', () => {
      expect([...COMMON_ROLE_MENU_PATHS].sort()).toEqual(['/portal', '/qa']);
    });

    it('only holds the buttons /qa needs to chat', () => {
      expect([...COMMON_ROLE_BUTTON_PERMISSIONS].sort()).toEqual([
        'assistant:completions:create',
        'assistant:sessions:create',
        'assistant:sessions:delete',
        'assistant:sessions:update',
      ]);
    });

    it('gets its buttons from /qa itself', () => {
      expect(
        unreachableButtons(['/qa'], COMMON_ROLE_BUTTON_PERMISSIONS),
      ).toEqual([]);
    });
  });

  describe('general-chat role', () => {
    it('is seeded as a role', () => {
      expect(SEED_ROLES).toContainEqual(
        expect.objectContaining({ name: '通用聊天', value: 'general-chat' }),
      );
    });

    it('sees /dashboard/chat and its parent catalog (sidebar tree root)', () => {
      expect([...GENERAL_CHAT_ROLE_MENU_PATHS].sort()).toEqual([
        '/dashboard',
        '/dashboard/chat',
      ]);
    });

    it('holds the buttons /dashboard/chat needs', () => {
      expect([...GENERAL_CHAT_ROLE_BUTTON_PERMISSIONS].sort()).toEqual([
        'assistant:completions:create',
        'assistant:general:create',
        'assistant:sessions:create',
        'assistant:sessions:delete',
        'assistant:sessions:update',
      ]);
      expect(
        unreachableButtons(
          GENERAL_CHAT_ROLE_MENU_PATHS,
          GENERAL_CHAT_ROLE_BUTTON_PERMISSIONS,
        ),
      ).toEqual([]);
    });
  });
});
