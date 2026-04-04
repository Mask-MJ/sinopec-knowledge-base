<script setup lang="ts">
import type { DictDataInfo, DictInfo } from '@/api/system/dict';
import type { ProDataTableColumns } from 'pro-naive-ui';

import { NTag } from 'naive-ui';
import { createProModalForm } from 'pro-naive-ui';

import {
  createDict,
  createDictData,
  deleteDict,
  deleteDictData,
  getDictDataDetail,
  getDictDataList,
  getDictDetail,
  getDictList,
  updateDict,
  updateDictData,
} from '@/api/system/dict';
import TableAction from '@/components/common/TableAction.vue';
import { PERMISSION } from '@/config/constants/permissionCodes';
import { $t } from '@/locales';

definePage({
  meta: {
    title: 'system.dict.title',
    type: 'menu',
  },
});

const current = ref(0);
const dictList = ref<DictInfo[]>([]);
const dictData = ref<DictDataInfo[]>([]);
const loading = ref(false);

const columns = computed<ProDataTableColumns<DictDataInfo>>(() => [
  { title: $t('page.system.dict.name'), key: 'name' },
  { title: $t('page.system.dict.value'), key: 'value' },
  { title: $t('page.system.dict.sort'), key: 'order' },
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
    render: (row) =>
      h(TableAction, {
        actions: [
          {
            type: 'edit',
            auth: PERMISSION.SYSTEM.DICT.UPDATE,
            onClick: () => editDictData(row),
          },
          {
            type: 'del',
            auth: PERMISSION.SYSTEM.DICT.DELETE,
            onClick: async () => {
              await removeDictData(row);
            },
          },
        ],
      }),
  },
]);

const editDict = async (row: DictInfo) => {
  const { data } = await getDictDetail(row.id);
  dictModalForm.values.value = data;
  dictModalForm.open();
};

const removeDict = async (row: DictInfo) => {
  await deleteDict(row.id);
  await getDict();
};

const editDictData = async (row: DictDataInfo) => {
  const { data } = await getDictDataDetail(row.id);
  dictDataModalForm.values.value = data;
  dictDataModalForm.open();
};

const removeDictData = async (row: DictDataInfo) => {
  await deleteDictData(row.id);
  await getDictData();
};

watchEffect(async () => {
  const dict = dictList.value[current.value];
  if (dict) {
    loading.value = true;
    const { data } = await getDictDataList({ dictId: dict.id });
    dictData.value = data || [];
    loading.value = false;
  }
});

const dictModalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    try {
      dictModalForm.values.value.id
        ? await updateDict(dictModalForm.values.value.id, values)
        : await createDict(values);
      await getDict();
      dictModalForm.close();
    } catch (error) {
      console.warn(error);
    } finally {
      loading.value = false;
    }
  },
});

const dictDataModalForm = createProModalForm({
  onSubmit: async (values) => {
    loading.value = true;
    const dict = dictList.value[current.value];
    if (!dict) {
      loading.value = false;
      return;
    }
    try {
      dictDataModalForm.values.value.id
        ? await updateDictData(dictDataModalForm.values.value.id, values)
        : await createDictData({ ...values, dictId: dict.id });
      await getDictData();
      dictDataModalForm.close();
    } catch (error) {
      console.warn(error);
    }
    loading.value = false;
  },
});

const getDict = async () => {
  const { data } = await getDictList();
  dictList.value = data || [];
};

const getDictData = async () => {
  const dict = dictList.value[current.value];
  if (dict) {
    const { data } = await getDictDataList({ dictId: dict.id });
    dictData.value = data || [];
  }
};

onMounted(async () => {
  await getDict();
});
</script>

<template>
  <div class="flex-between flex-row">
    <n-card
      :title="$t('page.system.dict.dictType')"
      class="mr-4 h-full w-60 shrink-0"
      content-class="!px-4"
    >
      <template #header-extra>
        <n-button type="primary" ghost @click="dictModalForm.show.value = true">
          {{ $t('common.add') }}
        </n-button>
      </template>

      <n-scrollbar>
        <n-list>
          <n-list-item
            v-for="(item, index) in dictList"
            :key="item.id"
            class="mb-2 cursor-pointer rounded bg-gray-100 hover:bg-primary-100 !px-2"
            :class="current === index ? 'text-primary' : ''"
            @click="current = index"
          >
            <template #suffix>
              <n-flex class="w-20" justify="end">
                <n-button
                  size="tiny"
                  quaternary
                  type="primary"
                  @click="editDict(item)"
                >
                  <template #icon>
                    <i class="i-ant-design:edit-outlined"></i>
                  </template>
                </n-button>
                <n-button
                  size="tiny"
                  quaternary
                  type="error"
                  @click="removeDict(item)"
                >
                  <template #icon>
                    <i class="i-ant-design:delete-outlined"></i>
                  </template>
                </n-button>
              </n-flex>
            </template>
            {{ item.name }}
          </n-list-item>
        </n-list>
      </n-scrollbar>
    </n-card>
    <pro-data-table
      :data="dictData"
      class="h-full"
      :title="$t('page.system.dict.title')"
      flex-height
      row-key="id"
      :columns="columns"
    >
      <template #toolbar>
        <n-flex>
          <n-button
            type="primary"
            ghost
            @click="dictDataModalForm.show.value = true"
          >
            <template #icon>
              <i class="i-ant-design:plus-outlined"></i>
            </template>
            {{ $t('common.add') }}
          </n-button>
        </n-flex>
      </template>
    </pro-data-table>
    <pro-modal-form
      :form="dictModalForm"
      :loading="loading"
      :title="`${dictModalForm.values.value.id ? $t('page.system.dict.editDict') : $t('page.system.dict.addDict')}`"
      preset="card"
      label-width="80"
      label-placement="left"
    >
      <pro-input :title="$t('page.system.dict.name')" path="name" required />
      <pro-input :title="$t('page.system.dict.value')" path="value" required />
      <pro-radio-group
        :title="$t('common.status')"
        path="status"
        required
        :field-props="{
          options: [
            { label: $t('common.enable'), value: true },
            { label: $t('common.disable'), value: false },
          ],
        }"
      />
      <pro-textarea :title="$t('page.system.dict.remark')" path="remark" />
    </pro-modal-form>
    <pro-modal-form
      :form="dictDataModalForm"
      :loading="loading"
      :title="`${dictDataModalForm.values.value.id ? $t('page.system.dict.editDictData') : $t('page.system.dict.addDictData')}`"
      preset="card"
      label-width="100"
      label-placement="left"
    >
      <pro-input :title="$t('page.system.dict.name')" path="name" required />
      <pro-input :title="$t('page.system.dict.value')" path="value" required />
      <pro-radio-group
        :title="$t('common.status')"
        path="status"
        required
        :field-props="{
          options: [
            { label: $t('common.enable'), value: true },
            { label: $t('common.disable'), value: false },
          ],
        }"
      />
      <pro-digit :title="$t('page.system.dict.sort')" path="order" />
      <pro-textarea :title="$t('common.remark')" path="remark" />
    </pro-modal-form>
  </div>
</template>
