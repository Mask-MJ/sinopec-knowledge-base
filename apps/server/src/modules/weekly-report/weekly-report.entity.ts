import type { WeeklyReport } from '@prisma/generated/client';

import { OmitType } from '@nestjs/swagger';

export class WeeklyReportEntity implements Omit<WeeklyReport, 'reportDate'> {
  /** 分公司 */
  branch: string;

  /** 报告正文（Markdown） */
  content: string;

  /** 生成时间 */
  createdAt: Date;

  /** 主键 ID */
  id: number;

  /**
   * 报告日期（纯日期串，不带时区）
   * @example '2025-09-20'
   */
  reportDate: string;

  /** 报告类型 */
  reportType: string;

  /** 生成人 ID */
  userId: number;
}

/** 历史列表项：不带正文，点开再按 id 取 */
export class WeeklyReportListItemEntity extends OmitType(WeeklyReportEntity, [
  'content',
]) {}
