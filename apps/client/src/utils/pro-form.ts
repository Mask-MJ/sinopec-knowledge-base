import { createProDrawerForm, createProModalForm } from 'pro-naive-ui';

/**
 * pro-form 项目级默认封装
 *
 * pro-naive-ui 的 `createProDrawerForm` / `createProModalForm` 有两个默认
 * 行为会带来心智偏移：
 *
 *   1. `omitNil` / `omitEmptyString` 默认 true — 会在 `onSubmit(values)`
 *      时悄悄删掉 null/undefined/'' 字段，导致 rule 校验时与 onSubmit
 *      拿到的 shape 不一致（典型症状：空行 `{key:'', value:null}` →
 *      `{}` → `item.key.trim()` 崩）。本封装禁用这两个开关。
 *   2. `onSubmitFailed` 未传时，pro-naive-ui 源码里 `if (!onSubmitFailed)
 *      throw errors` — validation 失败被重抛成 unhandled promise rejection，
 *      UI 无任何反馈。本封装默认提取首条 rule 错误消息弹 `$message.warning`，
 *      并吞掉冒泡。
 *
 * 调用方若需覆盖默认（极少情况），可在 options 里显式传 `omitNil` /
 * `onSubmitFailed` 等。
 */

type ProDrawerFormOptions<T> = Parameters<typeof createProDrawerForm<T>>[0];
type ProModalFormOptions<T> = Parameters<typeof createProModalForm<T>>[0];

/** naive-ui validate 失败时 reject 的形态是 `ValidationError[][]`（外层按 field 分组） */
function firstValidationMessage(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  for (const fieldErrors of errors) {
    if (!Array.isArray(fieldErrors)) continue;
    for (const err of fieldErrors) {
      const msg = (err as null | { message?: string })?.message;
      if (typeof msg === 'string' && msg) return msg;
    }
  }
  return undefined;
}

function defaultOnSubmitFailed(errors: unknown) {
  const msg = firstValidationMessage(errors);
  if (msg) window.$message.warning(msg);
}

export function createAppDrawerForm<T = unknown>(
  options: ProDrawerFormOptions<T> = {},
) {
  return createProDrawerForm<T>({
    omitNil: false,
    omitEmptyString: false,
    onSubmitFailed: defaultOnSubmitFailed,
    ...options,
  });
}

export function createAppModalForm<T = unknown>(
  options: ProModalFormOptions<T> = {},
) {
  return createProModalForm<T>({
    omitNil: false,
    omitEmptyString: false,
    onSubmitFailed: defaultOnSubmitFailed,
    ...options,
  });
}
