/**
 * 币种纯工具函数
 *
 * 无副作用、无 Vue 响应式依赖，可在 composable、utils、helpers 任意层级直接引用。
 */

/**
 * 获取币种符号（基于 Intl.NumberFormat）
 *
 * 利用浏览器内置数据自动解析币种符号，无需手动维护映射表。
 *
 * @example
 * getCurrencySymbol('USD') // '$'
 * getCurrencySymbol('JPY') // '¥'
 * getCurrencySymbol('EUR') // '€'
 */
export function getCurrencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * 使用 Intl.NumberFormat 格式化货币金额
 *
 * @example
 * formatCurrency(1234.5, 'USD')  // "$1,234.50"
 * formatCurrency(1234.5, 'JPY')  // "¥1,234.50"
 * formatCurrency(1234.5, 'GBP')  // "£1,234.50"
 */
export function formatCurrency(
  amount: null | number | string | undefined,
  currencyCode: string,
  locale = 'en-US',
): string {
  const num = Number(amount);
  if (Number.isNaN(num)) return '-';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[currency] formatCurrency failed', error);
    }
    return String(num);
  }
}
