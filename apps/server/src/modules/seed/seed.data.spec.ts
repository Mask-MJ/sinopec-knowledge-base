import type { Prisma } from '@prisma/generated/client';

import { describe, expect, it } from 'vitest';

import { COMMON_ROLE_MENU_PATHS, SEED_MENUS } from './seed.data';

/** 把嵌套的 children.create 展平成一维菜单列表 */
function flattenMenus(
  menus: Prisma.MenuCreateInput[],
): Prisma.MenuCreateInput[] {
  return menus.flatMap((menu) => {
    const children = menu.children?.create;
    const childList = Array.isArray(children) ? children : [];
    return [menu, ...flattenMenus(childList as Prisma.MenuCreateInput[])];
  });
}

const seededMenus = flattenMenus(SEED_MENUS);

describe('seed.data', () => {
  it('every common-role menu path exists in SEED_MENUS', () => {
    const seededPaths = new Set(seededMenus.map((menu) => menu.path));
    const missing = COMMON_ROLE_MENU_PATHS.filter(
      (path) => !seededPaths.has(path),
    );
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
});
