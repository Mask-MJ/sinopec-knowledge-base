<script lang="ts" setup>
import type { ButtonProps, PopconfirmProps, TooltipProps } from 'naive-ui';

import { isBoolean, isFunction } from 'lodash-es';
import { NButton, NPopconfirm, NSpace, NTooltip } from 'naive-ui';

import { $t } from '@/locales';
import { hasPermission } from '@/utils/permission';

interface ActionItem {
  auth?: string;
  buttonProps?: ButtonProps;
  icon?: string;
  // 业务控制是否显示
  ifShow?: ((action: ActionItem) => boolean) | boolean;
  label?: string;
  // 需要调用的事件
  onClick?: (...arg: any[]) => any;
  popConfirmProps?: PopconfirmProps & { content: string };
  tooltipProps?: TooltipProps & { content: string };
  // 编辑和删除几乎每个表格都有，所以提取出来
  type?: 'del' | 'edit';
}
const props = defineProps({
  actions: { type: Array as PropType<ActionItem[]>, default: () => [] },
  divider: { type: Boolean, default: false },
  stopButtonPropagation: { type: Boolean, default: true },
});

function isIfShow(action: ActionItem): boolean {
  const ifShow = action.ifShow;

  let isIfShow = true;

  if (isBoolean(ifShow)) {
    isIfShow = ifShow;
  }
  if (isFunction(ifShow)) {
    isIfShow = ifShow(action);
  }
  return isIfShow;
}

const getActions = computed(() => {
  return (toRaw(props.actions) || [])
    .filter((action) => {
      // 权限过滤 hasPermission(action.auth)
      if (action.auth && !hasPermission(action.auth)) {
        return false;
      }
      return isIfShow(action);
    })
    .map((action): ActionItem => {
      if (action.type === 'edit') {
        return {
          label: $t('common.edit'),
          buttonProps: {
            type: 'primary',
            quaternary: true,
            onClick: () => action.onClick?.(),
          },
        };
      } else if (action.type === 'del') {
        return {
          label: $t('common.delete'),
          buttonProps: { type: 'error', quaternary: true },
          popConfirmProps: {
            content: $t('common.deleteConfirm'),
            onPositiveClick: async () => {
              try {
                await action.onClick?.();
                window.$message.success($t('common.deleteSuccess'));
              } catch (error) {
                window.$message.error(
                  `${$t('common.operationFailed')} ${error}`,
                );
              }
            },
          },
        };
      } else {
        return action;
      }
    });
});

function onCellClick(e: MouseEvent) {
  if (!props.stopButtonPropagation) return;
  const path = e.composedPath() as HTMLElement[];
  const isInButton = path.find((ele) => {
    return ele.tagName?.toUpperCase() === 'BUTTON';
  });
  isInButton && e.stopPropagation();
}

const RenderTooltip = (action: ActionItem) => {
  const { tooltipProps } = action;
  return tooltipProps
    ? h(NTooltip, tooltipProps, {
        trigger: () => renderPopconfirm(action),
        default: () => tooltipProps.content,
      })
    : renderPopconfirm(action);
};

const renderPopconfirm = (action: ActionItem) => {
  const { popConfirmProps } = action;
  return Object.keys(popConfirmProps || {}).length > 0
    ? h(NPopconfirm, popConfirmProps, {
        trigger: () => renderButton(action),
        default: () => popConfirmProps?.content ?? '是否确认删除',
      })
    : renderButton(action);
};

const renderButton = (action: ActionItem) => {
  const { icon, label, buttonProps } = action;
  return h(NButton, { size: 'small', ...buttonProps }, () => [
    icon && h('i', { class: [icon, !!label && 'mr-1'] }),
    label && h('span', label),
  ]);
};
</script>
<template>
  <div @click="onCellClick">
    <NSpace>
      <template v-for="action in getActions" :key="`${action.label}`">
        <RenderTooltip v-bind="action" />
      </template>
    </NSpace>
  </div>
</template>
