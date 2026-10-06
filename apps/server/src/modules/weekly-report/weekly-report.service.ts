import type { WeeklyReportEntity } from './weekly-report.entity';
import type { PrismaService } from '@/common/database/prisma.extension';
import type { ActiveUserData } from '@/modules/auth/interfaces/active-user-data.interface';

import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';

import { PRISMA_SERVICE_TOKEN } from '@/common/database/prisma.extension';

import {
  GenerateWeeklyReportDto,
  QueryWeeklyReportDto,
} from './weekly-report.dto';

/** 分公司清单、报告类型都放在字典管理里，对方答复前可随时增改 */
export const BRANCH_DICT = 'weeklyReport.branch';
export const REPORT_TYPE_DICT = 'weeklyReport.type';

const DEFAULT_TIMEOUT_SECONDS = 300;
/** 对方响应体写日志时的截断长度，防止整页 HTML 错误页刷屏 */
const LOG_BODY_LIMIT = 2000;

function toLogText(body: unknown): string {
  // JSON.stringify(undefined) 实际返回 undefined，类型声明没体现
  const text =
    typeof body === 'string'
      ? body
      : (JSON.stringify(body) as string | undefined);
  return (text ?? '').slice(0, LOG_BODY_LIMIT);
}

/**
 * reportDate 是 @db.Date，Prisma 给的是 UTC 零点的 Date。
 * 直接返回会序列化成 ISO 时间，前端请求层按本地时区转换后，负时区会差一天；
 * 所以对外一律给纯日期串 YYYY-MM-DD。
 */
function withPlainDate<T extends { reportDate: Date }>(report: T) {
  return {
    ...report,
    reportDate: report.reportDate.toISOString().slice(0, 10),
  };
}

@Injectable()
export class WeeklyReportService {
  private readonly apiKey: string;
  // ponytail: 进程内去重，单容器部署够用；起多实例时改用 Redis 锁
  private readonly inFlight = new Map<string, Promise<WeeklyReportEntity>>();
  private readonly logger = new Logger(WeeklyReportService.name);
  private readonly timeoutSeconds: number;
  private readonly url: string;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
    @Inject(PRISMA_SERVICE_TOKEN)
    private readonly prisma: PrismaService,
  ) {
    this.url = configService.get<string>('WEEKLY_REPORT_URL', '');
    this.apiKey = configService.get<string>('WEEKLY_REPORT_API_KEY', '');
    this.timeoutSeconds = configService.get<number>(
      'WEEKLY_REPORT_TIMEOUT_SECONDS',
      DEFAULT_TIMEOUT_SECONDS,
    );

    if (!this.url || !this.apiKey) {
      this.logger.warn(
        'WEEKLY_REPORT_URL / WEEKLY_REPORT_API_KEY 未配置，周报生成不可用',
      );
    }
  }

  async findAll(user: ActiveUserData, dto: QueryWeeklyReportDto) {
    const { current, pageSize } = dto;
    const [list, meta] = await this.prisma.client.weeklyReport
      .paginate({
        where: await this.visibleScope(user),
        omit: { content: true },
        orderBy: { createdAt: 'desc' },
      })
      .withPages({ page: current, limit: pageSize, includePageCount: true });

    return { list: list.map((report) => withPlainDate(report)), ...meta };
  }

  async findOne(id: number, user: ActiveUserData) {
    const report = await this.prisma.client.weeklyReport.findFirst({
      where: { id, ...(await this.visibleScope(user)) },
    });
    if (!report) throw new NotFoundException('周报不存在或已被删除');
    return withPlainDate(report);
  }

  /**
   * 同一用户同参数的生成合并成一次：用户等不及刷新页面再点「生成」时，
   * 直接等原来那次的结果，不重复占用对方服务、不重复落库。
   */
  generate(user: ActiveUserData, dto: GenerateWeeklyReportDto) {
    const key = [user.sub, dto.branch, dto.reportDate, dto.reportType].join(
      '\u0000',
    );
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const task = this.doGenerate(user, dto).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, task);
    return task;
  }

  private async doGenerate(
    user: ActiveUserData,
    dto: GenerateWeeklyReportDto,
  ): Promise<WeeklyReportEntity> {
    if (!this.url || !this.apiKey) {
      throw new ServiceUnavailableException('周报服务未配置，请联系管理员');
    }
    await this.assertInDict(BRANCH_DICT, dto.branch, '分公司');
    await this.assertInDict(REPORT_TYPE_DICT, dto.reportType, '报告类型');

    const content = await this.requestReport(dto);

    const report = await this.prisma.client.weeklyReport.create({
      data: {
        userId: user.sub,
        branch: dto.branch,
        reportDate: new Date(dto.reportDate),
        reportType: dto.reportType,
        content,
      },
    });
    return withPlainDate(report);
  }

  async remove(id: number, user: ActiveUserData) {
    const { count } = await this.prisma.client.weeklyReport.deleteMany({
      where: { id, ...(await this.visibleScope(user)) },
    });
    if (count === 0) throw new NotFoundException('周报不存在或已被删除');
    return { message: '删除周报成功' };
  }

  private async assertInDict(dictValue: string, value: string, label: string) {
    const hit = await this.prisma.client.dictData.findFirst({
      where: { value, status: true, dict: { value: dictValue, status: true } },
      select: { id: true },
    });
    if (!hit) throw new BadRequestException(`不支持的${label}：${value}`);
  }

  private async requestReport(dto: GenerateWeeklyReportDto): Promise<string> {
    const payload = {
      branch: dto.branch,
      report_date: dto.reportDate,
      report_type: dto.reportType,
    };

    let body: unknown;
    try {
      const response = await this.httpService.axiosRef.post<unknown>(
        this.url,
        payload,
        {
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: this.timeoutSeconds * 1000,
          // axios 的 timeout 在 Node 下是空闲超时，对方持续推数据就永不触发；
          // 总时长靠 signal 兜底，否则卡住的请求会让 inFlight 里的同参数生成一直卡死
          signal: AbortSignal.timeout(this.timeoutSeconds * 1000),
        },
      );
      body = response.data;
    } catch (error) {
      throw this.translateError(error, payload);
    }

    // 对方完整返回格式未定，目前只取 .report；定稿后再在这里补字段
    const report = (body as null | { report?: unknown })?.report;
    if (typeof report !== 'string' || !report.trim()) {
      this.logger.error(
        `周报服务返回缺少 report 正文: POST ${this.url} ${JSON.stringify(payload)} → ${toLogText(body)}`,
      );
      throw new BadGatewayException('周报服务返回的内容无法识别，请联系管理员');
    }
    return report;
  }

  /**
   * 把对方服务的失败翻译成用户看得懂的提示，完整上下文只进服务端日志。
   *
   * 日志里绝不能带 axios error 对象本身：它的 config.headers 里有 Bearer key。
   * 也不返回 401/403：前端拦截器会把 401 当成本系统登录失效。
   */
  private translateError(error: unknown, payload: object): HttpException {
    const target = `POST ${this.url} ${JSON.stringify(payload)}`;

    if (!isAxiosError<unknown>(error)) {
      this.logger.error(`周报服务调用异常: ${target}`, error);
      return new BadGatewayException('周报生成失败，请稍后重试');
    }

    if (error.response) {
      const { data, status } = error.response;
      this.logger.error(
        `周报服务返回 HTTP ${status}: ${target} → ${toLogText(data)}`,
      );
      if (status === 401 || status === 403) {
        return new ServiceUnavailableException(
          '周报服务鉴权失败，请联系管理员检查配置',
        );
      }
      if (status < 500) {
        return new BadGatewayException(
          `周报服务未能处理本次请求（HTTP ${status}），请检查分公司、日期和报告类型`,
        );
      }
      return new BadGatewayException('周报服务内部出错，请稍后重试');
    }

    // ERR_CANCELED 只会来自上面的总时长 signal
    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ERR_CANCELED'
    ) {
      this.logger.error(`周报服务超时（${this.timeoutSeconds}s）: ${target}`);
      return new GatewayTimeoutException(
        `周报生成超时（超过 ${this.timeoutSeconds} 秒），请稍后重试`,
      );
    }

    this.logger.error(
      `周报服务连接失败 [${error.code}] ${error.message}: ${target}`,
    );
    return new ServiceUnavailableException(
      '无法连接周报服务，请稍后重试或联系管理员',
    );
  }

  /**
   * 可见范围：普通用户只看自己的，admin 看全部。
   *
   * 与 resource-visibility.ts 的「me」档一致（admin 全放行、部门主管无额外读权）。
   * 周报没有共享档位，所以不走 buildVisibilityWhere 的 team / public 分支。
   * 删除沿用同一范围，等价于 canEditResource（创建者 + admin）。
   */
  private async visibleScope(user: ActiveUserData) {
    const { isAdmin } = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: { isAdmin: true },
    });
    return isAdmin ? {} : { userId: user.sub };
  }
}
