<script setup lang="ts">
import type { CreateMenuDto, MenuInfo, UpdateMenuDto } from '@/api/system/menu';
import type { TreeSelectOption } from 'naive-ui';
import type { ProDataTableColumns } from 'pro-naive-ui';

import { has } from 'lodash-es';
import { NTag } from 'naive-ui';
import { createProDrawerForm } from 'pro-naive-ui';

import {
  createMenu,
  deleteMenu,
  getMenuDetail,
  getMenuList,
  updateMenu,
} from '@/api/system/menu';
import TableAction from '@/components/common/TableAction.vue';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';
import { transformationTree } from '@/utils';

definePage({
  meta: {
    title: 'page.system.menu.title',
    type: 'menu',
  },
});

const loading = ref(false);
const tableData = ref<MenuInfo[]>([]);
const menusList = ref<TreeSelectOption[]>([]);
const columns = computed<ProDataTableColumns<MenuInfo>>(() => [
  { title: $t('page.system.menu.name'), key: 'name' },
  {
    title: $t('page.system.menu.type'),
    key: 'type',
    render: (rowData) => {
      const typeMap = {
        link: 'info',
        catalog: 'warning',
        menu: 'success',
        embedded: 'primary',
        button: 'default',
      } as const;
      return h(
        NTag,
        { type: typeMap[rowData.type as keyof typeof typeMap] },
        () => $t(`page.system.menu.${rowData.type}`),
      );
    },
  },
  {
    title: $t('page.system.menu.icon'),
    key: 'icon',
    render: (row) => h('i', { class: row.icon }),
  },
  { title: $t('page.system.menu.permission'), key: 'permission' },
  { title: $t('page.system.menu.path'), key: 'path' },
  {
    title: $t('common.status'),
    key: 'status',
    width: 100,
    render: (rowData) =>
      h(NTag, { type: rowData.status ? 'success' : 'error' }, () =>
        rowData.status ? $t('common.enable') : $t('common.disable'),
      ),
  },
  {
    title: $t('common.action'),
    key: 'actions',
    width: 250,
    render: (row) =>
      h(TableAction, {
        actions: [
          {
            type: 'edit',
            auth: PERMISSION.SYSTEM.MENU.UPDATE,
            onClick: () => edit(row),
          },
          {
            type: 'del',
            auth: PERMISSION.SYSTEM.MENU.DELETE,
            onClick: async () => {
              await deleteMenu(row.id);
              getTableData();
            },
          },
        ],
      }),
  },
]);
const title = computed(() =>
  has(drawerForm.values.value, 'id')
    ? $t('page.system.menu.editMenu')
    : $t('page.system.menu.addMenu'),
);
const drawerForm = createProDrawerForm<
  CreateMenuDto | MenuInfo | UpdateMenuDto
>({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      has(drawerForm.values.value, 'id')
        ? await updateMenu(
            drawerForm.values.value.id as number,
            values as UpdateMenuDto,
          )
        : await createMenu(values as CreateMenuDto);
      drawerForm.close();
      getTableData();
    } finally {
      loading.value = false;
    }
  },
});
const edit = async (row: MenuInfo) => {
  const { data } = await getMenuDetail(row.id);
  drawerForm.values.value = data || ({} as MenuInfo);
  drawerForm.open();
};
const getTableData = async () => {
  const { data } = await getMenuList();
  if (!data) return;
  tableData.value = transformationTree(data, null);
  menusList.value = transformationTree(
    data
      .filter((item) => item.type !== 'button')
      .map((item) => ({
        label: (item.title ? $t(item.title) : item.name) || item.name,
        key: item.id,
        id: item.id,
        parentId: item.parentId,
      })),
    null,
  );
};
onMounted(() => {
  getTableData();
});
</script>

<template>
  <n-flex class="h-full" vertical size="large">
    <pro-data-table
      :title="$t('page.system.menu.title')"
      row-key="id"
      :columns="columns"
      :data="tableData"
      :pagination="false"
    >
      <template #toolbar>
        <n-flex>
          <n-button type="primary" ghost @click="drawerForm.show.value = true">
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
            {{ $t('common.add') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <pro-drawer-form
      :form="drawerForm"
      :loading="loading"
      label-placement="left"
      width="800"
    >
      <pro-drawer-content :title="title" :native-scrollbar="false">
        <n-grid :cols="2" x-gap="16">
          <n-gi :span="2">
            <pro-radio-group
              :title="$t('page.system.menu.type')"
              path="type"
              required
              :field-props="{
                type: 'button',
                options: [
                  {
                    label: $t('page.system.menu.catalog'),
                    value: 'catalog',
                  },
                  { label: $t('page.system.menu.menu'), value: 'menu' },
                  {
                    label: $t('page.system.menu.button'),
                    value: 'button',
                  },
                  {
                    label: $t('page.system.menu.embedded'),
                    value: 'embedded',
                  },
                  { label: $t('page.system.menu.link'), value: 'link' },
                ],
              }"
            />
          </n-gi>
          <n-gi>
            <pro-input
              :title="$t('page.system.menu.menuName')"
              path="name"
              required
            />
          </n-gi>
          <n-gi>
            <pro-tree-select
              :title="$t('page.system.menu.parent')"
              path="parentId"
              :field-props="{
                options: menusList,
              }"
            />
          </n-gi>
          <n-gi>
            <pro-input :title="$t('page.system.menu.menuTitle')" path="title" />
          </n-gi>
          <n-gi>
            <pro-input
              :title="$t('page.system.menu.permission')"
              path="permission"
            />
          </n-gi>
          <n-gi>
            <pro-radio-group
              :title="$t('page.system.menu.status')"
              path="status"
              required
              :field-props="{
                type: 'button',
                options: [
                  { label: $t('common.enable'), value: true },
                  { label: $t('common.disable'), value: false },
                ],
              }"
            />
          </n-gi>
          <n-gi v-if="drawerForm.values.value.type === 'menu'">
            <pro-input
              :title="$t('page.system.menu.activePath')"
              path="activePath"
            />
          </n-gi>

          <template v-if="drawerForm.values.value.type !== 'button'">
            <n-gi>
              <pro-input
                :title="$t('page.system.menu.path')"
                path="path"
                required
              />
            </n-gi>
            <n-gi>
              <pro-input
                :title="$t('page.system.menu.icon')"
                path="icon"
                required
              >
                <template #suffix>
                  <i :class="drawerForm.values.value.icon"></i>
                </template>
              </pro-input>
            </n-gi>
            <n-gi>
              <pro-input
                :title="$t('page.system.menu.activeIcon')"
                path="activeIcon"
              >
                <template #suffix>
                  <i :class="drawerForm.values.value.activeIcon"></i>
                </template>
              </pro-input>
            </n-gi>
            <n-gi>
              <pro-input
                :title="$t('page.system.menu.badgeType.title')"
                path="badgeType"
              />
            </n-gi>
            <n-gi>
              <pro-input :title="$t('page.system.menu.badge')" path="badge" />
            </n-gi>
            <n-gi>
              <pro-input
                :title="$t('page.system.menu.badgeVariants')"
                path="badgeVariants"
              />
            </n-gi>
          </template>
          <n-gi v-if="drawerForm.values.value.type === 'embedded'">
            <pro-input
              :title="$t('page.system.menu.linkSrc')"
              path="iframeSrc"
            />
          </n-gi>
          <n-gi v-if="drawerForm.values.value.type === 'link'">
            <pro-input :title="$t('page.system.menu.link')" path="link" />
          </n-gi>
          <template v-if="drawerForm.values.value.type === 'menu'">
            <n-gi span="2">
              <n-divider>
                {{ $t('page.system.menu.advancedSettings') }}
              </n-divider>
            </n-gi>
            <n-gi>
              <pro-checkbox
                :title="$t('page.system.menu.affixTab')"
                path="affixTab"
              />
            </n-gi>
            <n-gi>
              <pro-checkbox
                :title="$t('page.system.menu.keepAlive')"
                path="keepAlive"
              />
            </n-gi>
            <n-gi>
              <pro-checkbox
                :title="$t('page.system.menu.hideInBreadcrumb')"
                path="hideInBreadcrumb"
              />
            </n-gi>
            <n-gi>
              <pro-checkbox
                :title="$t('page.system.menu.hideInMenu')"
                path="hideInMenu"
              />
            </n-gi>
            <n-gi>
              <pro-checkbox
                :title="$t('page.system.menu.hideInTab')"
                path="hideInTab"
              />
            </n-gi>
          </template>
        </n-grid>
      </pro-drawer-content>
    </pro-drawer-form>
  </n-flex>
</template>
