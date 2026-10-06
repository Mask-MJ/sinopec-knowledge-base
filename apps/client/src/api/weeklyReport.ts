import type { components } from '#/openapi-weekly-report';

import { client } from '@/utils';

export type WeeklyReportInfo = components['schemas']['WeeklyReportEntity'];
export type WeeklyReportListItem =
  components['schemas']['WeeklyReportListItemEntity'];
export type GenerateWeeklyReportBody =
  components['schemas']['GenerateWeeklyReportDto'];

// 获取周报历史列表（不含正文）
export function getWeeklyReportList(pageSize: number) {
  return client.GET('/api/weekly-report/reports', {
    params: { query: { current: 1, pageSize } },
  });
}

// 获取周报详情
export function getWeeklyReportDetail(id: number) {
  return client.GET('/api/weekly-report/reports/{id}', {
    params: { path: { id } },
  });
}

// 生成周报（同步等待对方服务，可能要几分钟）
export function generateWeeklyReport(body: GenerateWeeklyReportBody) {
  return client.POST('/api/weekly-report/reports', { body });
}

// 删除周报
export function deleteWeeklyReport(id: number) {
  return client.DELETE('/api/weekly-report/reports/{id}', {
    params: { path: { id } },
  });
}
