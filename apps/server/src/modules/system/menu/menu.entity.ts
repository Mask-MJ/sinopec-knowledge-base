import { Menu } from '@prisma/generated/client';

export class MenuEntity implements Menu {
  activeIcon: null | string;
  activePath: null | string;
  affixTab: boolean;
  affixTabOrder: number;
  badge: null | string;
  badgeType: string;
  badgeVariants: string;
  children?: MenuEntity[] | null;
  hideChildrenInMenu: boolean;
  hideInBreadcrumb: boolean;
  hideInMenu: boolean;
  hideInTab: boolean;
  icon: null | string;
  id: number;
  iframeSrc: null | string;
  keepAlive: boolean;
  link: null | string;
  maxNumOfOpenTabs: null | number;
  name: string;
  noBasicLayout: boolean;
  openInNewWindow: boolean;
  order: number;
  parentId: null | number;
  path: string;
  permission: string;
  query: null | string;
  redirect: null | string;
  status: boolean;
  title: null | string;
  type: string;
}
