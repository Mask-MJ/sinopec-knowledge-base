import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type AggregatedGMVStatistic =
  components['schemas']['AggregatedGMVStatistic'];
export type ShopAnalyticsReportItem =
  components['schemas']['ShopAnalyticsReportItem'];
export type QueryGMVParams =
  operations['StatisticsController_getAggregatedGMV']['parameters']['query'];
export type QueryAnalyticsParams =
  operations['StatisticsController_getAnalyticsReport']['parameters']['query'];
export type QueryFinancialReportParams =
  operations['StatisticsController_getFinancialReport']['parameters']['query'];

/**
 * 每日财务报表条目（后端 financial-report 接口的响应结构）
 * NOTE: OpenAPI spec 未定义该接口的响应体，此类型手动维护
 * TODO: 后端补全 OpenAPI spec 后删除此手动类型，改用 components['schemas'] 自动生成
 */
export interface FinancialReportItem {
  /** 日期 */
  date: string;

  // ====== 基础/销售 ======
  /** 订单数 */
  orders: number;
  /** SKU 订单数 */
  skuOrders: number;
  /** GMV */
  gmv: number | string;
  /** 净销售额 */
  netSales: number | string;
  /** 退款金额 */
  refunds: number | string;
  /** 售出数量 */
  unitsSold: number;
  /** 买家数 */
  buyers: number;
  /** 取消/退货数 */
  cancellationsAndReturns: number;
  /** 商品曝光量 */
  productImpressions: number;
  /** 商品页浏览量 */
  productPageViews: number;

  // ====== GMV 渠道分布 ======
  /** 直播 GMV */
  gmvLive: number | string;
  /** 日常 GMV */
  dailyGmv: number | string;
  /** 视频 GMV */
  gmvVideo: number | string;
  /** 商品卡 GMV */
  gmvProductCard: number | string;

  // ====== 成本 ======
  /** 货物成本 */
  costOfGoods: number | string;
  /** 成本占比 */
  costRatio: number | string;
  /** 商品平台折扣 */
  platformDiscount: number | string;
  /** 运费平台折扣 */
  shippingFeePlatformDiscount: number | string;
  /** 运营成本金额 */
  operatingCostAmount: number | string;
  /** 运营成本占比 */
  operatingCostRatio: number | string;
  /** 退货成本调整（GMV*2%货损） */
  returnCostAndDamage: number | string;
  /** 直播人工成本 */
  liveLaborCost: number | string;

  // ====== 广告 ======
  /** 投流费用 */
  adSpend: number | string;
  /** 投流费用占比 */
  adSpendRatio: number | string;
  /** 投流收入 */
  adRevenue: number | string;
  /** 广告 ROI */
  adROI: number | string;

  // ====== 利润 ======
  /** 结算金额 */
  settlementAmount: number | string;
  /** 毛利 */
  grossProfit: number | string;
  /** 毛利率 */
  grossProfitRate: number | string;
  /** 退货率 */
  returnRate: number | string;

  // ====== 元数据 ======
  /** 币种 */
  currency: string;
  /** 汇率 */
  exchangeRate: number;
}

/**
 * 获取 GMV 汇总统计（支持按店铺、日期过滤）
 * @description 返回服务端计算的财务指标：退货率、日常GMV、结算金额、毛利、毛利率
 */
export function getAggregatedGMV(query?: QueryGMVParams) {
  return client.GET('/api/erp/statistics/gmv', { params: { query } });
}

/**
 * 获取店铺分析报表
 * @description 可传入多个店铺ID获取报表，不传则获取全部店铺数据
 */
export function getAnalyticsReport(query?: QueryAnalyticsParams) {
  return client.GET('/api/erp/statistics/analytics', { params: { query } });
}

/**
 * 获取每日财务报表
 * @description 支持多店铺和日期范围筛选，返回每日财务明细数据
 * NOTE: OpenAPI spec 中该接口响应为 content:never，使用手动类型定义
 */
export async function getFinancialReport(
  query?: QueryFinancialReportParams,
): Promise<{ data: FinancialReportItem[] }> {
  const res = await client.GET('/api/erp/statistics/financial-report', {
    params: { query },
  });
  return { data: (res.data as unknown as FinancialReportItem[]) ?? [] };
}

/**
 * 汇率条目（后端 exchange-rates 接口的响应结构）
 * NOTE: OpenAPI spec 未定义该接口的响应体，此类型手动维护
 */
export interface ExchangeRateItem {
  /** 币种代码，如 USD, CNY, JPY */
  currency: string;
  /** 相对于基准货币的汇率 */
  rate: number | string;
}

/**
 * 获取汇率列表
 * @description 返回后端维护的货币汇率数据
 * NOTE: OpenAPI spec 中该接口响应为 content:never，使用手动类型定义
 */
export async function getExchangeRates(): Promise<{
  data: ExchangeRateItem[];
}> {
  const res = await client.GET('/api/erp/statistics/exchange-rates');
  return { data: (res.data as unknown as ExchangeRateItem[]) ?? [] };
}

/**
 * 手动同步汇率
 * @description 触发后端从外部数据源同步最新汇率
 */
export function syncExchangeRates() {
  return client.POST('/api/erp/statistics/sync-exchange-rates');
}
