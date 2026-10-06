import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';

import { PaginateDto } from '@/common/dto/base.dto';

export class GenerateWeeklyReportDto {
  /**
   * 分公司（字典 weeklyReport.branch 的键值）
   * @example '华东分公司'
   */
  @IsNotEmpty()
  @IsString()
  branch: string;

  /**
   * 报告日期
   * @example '2025-09-20'
   */
  @IsDateString(
    { strict: true },
    { message: '报告日期无效，格式应为 YYYY-MM-DD' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '报告日期格式应为 YYYY-MM-DD' })
  reportDate: string;

  /**
   * 报告类型（字典 weeklyReport.type 的键值）
   * @example 'weekly'
   */
  @IsNotEmpty()
  @IsString()
  reportType: string;
}

export class QueryWeeklyReportDto extends PaginateDto {}
