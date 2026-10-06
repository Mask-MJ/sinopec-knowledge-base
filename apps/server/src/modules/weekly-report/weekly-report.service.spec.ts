import type { PrismaService } from '@/common/database/prisma.extension';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { MockInstance } from 'vitest';

import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AxiosError, AxiosHeaders, CanceledError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockActiveUser,
  createMockPrismaService,
} from '@/test-utils/mock.factory';

import { WeeklyReportService } from './weekly-report.service';

const URL = 'http://report.test/generate_report';
const API_KEY = 'test-weekly-key-should-never-be-logged';
const DTO = {
  branch: '华东分公司',
  reportDate: '2025-09-20',
  reportType: 'weekly',
};

const axiosConfig = (): InternalAxiosRequestConfig => ({
  headers: new AxiosHeaders({ Authorization: `Bearer ${API_KEY}` }),
});

describe('weeklyReportService', () => {
  const http = { axiosRef: { post: vi.fn() } };
  let prisma: ReturnType<typeof createMockPrismaService>;
  let logError: MockInstance<Logger['error']>;

  const build = (env: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      WEEKLY_REPORT_URL: URL,
      WEEKLY_REPORT_API_KEY: API_KEY,
      ...env,
    };
    const config = {
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    };
    return new WeeklyReportService(
      http as unknown as HttpService,
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
  };

  /** 所有 error 日志拼起来，用来断言上下文写了、key 没写 */
  const loggedText = () => JSON.stringify(logError.mock.calls);

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks 不清实现，post 是跨用例共享的，残留的 Once 值会串到下一条
    http.axiosRef.post.mockReset();
    prisma = createMockPrismaService();
    prisma.client.dictData.findFirst.mockResolvedValue({ id: 1 });
    prisma.client.weeklyReport.create.mockImplementation(
      ({ data }: { data: object }) => ({ id: 7, ...data }),
    );
    logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generate', () => {
    it('成功：按对方协议转发，默认超时 300 秒，正文落库', async () => {
      http.axiosRef.post.mockResolvedValue({ data: { report: '# 周报正文' } });

      const result = await build().generate(createMockActiveUser(), DTO);

      expect(http.axiosRef.post).toHaveBeenCalledWith(
        URL,
        {
          branch: '华东分公司',
          report_date: '2025-09-20',
          report_type: 'weekly',
        },
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
          timeout: 300_000,
          signal: expect.any(AbortSignal),
        },
      );
      expect(prisma.client.weeklyReport.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          branch: '华东分公司',
          reportDate: new Date('2025-09-20'),
          reportType: 'weekly',
          content: '# 周报正文',
        },
      });
      // 返回纯日期串：若给 ISO 时间，前端请求层会按本地时区转换，负时区下会差一天
      expect(result).toMatchObject({
        id: 7,
        content: '# 周报正文',
        reportDate: '2025-09-20',
      });
    });

    it('超时：翻译成 504 中文提示，秒数取自配置，不落库，日志不带 key', async () => {
      http.axiosRef.post.mockRejectedValue(
        new AxiosError(
          'timeout of 60000ms exceeded',
          'ECONNABORTED',
          axiosConfig(),
        ),
      );

      const promise = build({ WEEKLY_REPORT_TIMEOUT_SECONDS: 60 }).generate(
        createMockActiveUser(),
        DTO,
      );

      await expect(promise).rejects.toThrow(GatewayTimeoutException);
      await expect(promise).rejects.toThrow('周报生成超时（超过 60 秒）');
      expect(http.axiosRef.post.mock.calls[0]?.[2]).toMatchObject({
        timeout: 60_000,
      });
      expect(prisma.client.weeklyReport.create).not.toHaveBeenCalled();
      expect(loggedText()).toContain('华东分公司');
      expect(loggedText()).not.toContain(API_KEY);
    });

    it('对方一直不返回完：总时长到点就中止并报超时，之后可重试', async () => {
      // axios 的 timeout 只是空闲超时，对方持续发心跳就永不触发；
      // 这里模拟一个只有被 abort 才会结束的请求
      http.axiosRef.post.mockImplementationOnce(
        (_url: string, _body: unknown, { signal }: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              reject(new CanceledError(undefined, undefined, axiosConfig()));
            });
          }),
      );
      const service = build({ WEEKLY_REPORT_TIMEOUT_SECONDS: 0.05 });
      const user = createMockActiveUser();

      await expect(service.generate(user, DTO)).rejects.toThrow(
        GatewayTimeoutException,
      );

      http.axiosRef.post.mockResolvedValue({ data: { report: '# 周报正文' } });
      await expect(service.generate(user, DTO)).resolves.toMatchObject({
        id: 7,
      });
    });

    it.each([
      [500, BadGatewayException, '周报服务内部出错'],
      [422, BadGatewayException, '周报服务未能处理本次请求（HTTP 422）'],
      // 不能原样回 401：前端会当成本系统登录失效而把用户踢出去
      [401, ServiceUnavailableException, '周报服务鉴权失败'],
    ])(
      '对方报错 HTTP %i：翻译成中文提示，完整响应进日志，不落库',
      async (status, ExceptionType, message) => {
        const body = { detail: `upstream failure ${status}` };
        http.axiosRef.post.mockRejectedValue(
          new AxiosError(
            'Request failed',
            'ERR_BAD_RESPONSE',
            axiosConfig(),
            null,
            {
              status,
              data: body,
              headers: {},
              statusText: '',
              config: axiosConfig(),
            } as AxiosResponse,
          ),
        );

        const promise = build().generate(createMockActiveUser(), DTO);

        await expect(promise).rejects.toThrow(ExceptionType);
        await expect(promise).rejects.toThrow(message);
        expect(prisma.client.weeklyReport.create).not.toHaveBeenCalled();
        expect(loggedText()).toContain(`upstream failure ${status}`);
        expect(loggedText()).not.toContain(API_KEY);
      },
    );

    it('对方返回 200 但没有 report 正文：报 502，不落库', async () => {
      http.axiosRef.post.mockResolvedValue({ data: { error: 'no data' } });

      await expect(
        build().generate(createMockActiveUser(), DTO),
      ).rejects.toThrow(BadGatewayException);
      expect(prisma.client.weeklyReport.create).not.toHaveBeenCalled();
      expect(loggedText()).toContain('no data');
    });

    it.each([
      ['URL', { WEEKLY_REPORT_URL: '' }],
      ['API key', { WEEKLY_REPORT_API_KEY: '' }],
    ])('未配置 %s：返回「周报服务未配置」，不发请求', async (_, env) => {
      const promise = build(env).generate(createMockActiveUser(), DTO);

      await expect(promise).rejects.toThrow(ServiceUnavailableException);
      await expect(promise).rejects.toThrow('周报服务未配置');
      expect(http.axiosRef.post).not.toHaveBeenCalled();
    });

    it('同一用户同参数并发生成：只打一次对方服务、只落一条，结束后可再次生成', async () => {
      let finish: (value: unknown) => void = () => undefined;
      http.axiosRef.post
        .mockResolvedValue({ data: { report: '# 周报正文' } })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          }),
        );
      const service = build();
      const user = createMockActiveUser();

      // 第二次模拟刷新页面后重新点「生成」
      const first = service.generate(user, DTO);
      const second = service.generate(user, DTO);
      // 别人同参数、自己换个报告类型，都不该被合并
      const other = service.generate(createMockActiveUser({ sub: 9 }), DTO);
      const monthly = service.generate(user, { ...DTO, reportType: 'monthly' });
      await vi.waitFor(() => {
        expect(http.axiosRef.post).toHaveBeenCalledTimes(3);
      });
      finish({ data: { report: '# 周报正文' } });

      const [a, b] = await Promise.all([first, second, other, monthly]);
      expect(b).toBe(a);
      expect(prisma.client.weeklyReport.create).toHaveBeenCalledTimes(3);

      await service.generate(user, DTO);
      expect(http.axiosRef.post).toHaveBeenCalledTimes(4);
    });

    it('并发合并的那次失败：两边都拿到同一个错误，之后可重试', async () => {
      http.axiosRef.post.mockRejectedValueOnce(
        new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED', axiosConfig()),
      );
      const service = build();
      const user = createMockActiveUser();

      const results = await Promise.allSettled([
        service.generate(user, DTO),
        service.generate(user, DTO),
      ]);

      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(http.axiosRef.post).toHaveBeenCalledTimes(1);

      http.axiosRef.post.mockResolvedValue({ data: { report: '# 周报正文' } });
      await expect(service.generate(user, DTO)).resolves.toMatchObject({
        id: 7,
      });
    });

    it('分公司不在字典（或已停用）：直接 400，不打对方服务', async () => {
      prisma.client.dictData.findFirst.mockResolvedValueOnce(null);

      await expect(
        build().generate(createMockActiveUser(), DTO),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.client.dictData.findFirst).toHaveBeenCalledWith({
        where: {
          value: '华东分公司',
          status: true,
          dict: { value: 'weeklyReport.branch', status: true },
        },
        select: { id: true },
      });
      expect(http.axiosRef.post).not.toHaveBeenCalled();
    });
  });

  it('历史列表的 reportDate 同样是纯日期串', async () => {
    prisma.client.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: false });
    prisma.client.weeklyReport.paginate.mockReturnValue({
      withPages: vi
        .fn()
        .mockResolvedValue([
          [{ id: 1, reportDate: new Date('2025-09-20') }],
          { totalCount: 1 },
        ]),
    });

    const { list } = await build().findAll(createMockActiveUser(), {});

    expect(list).toEqual([{ id: 1, reportDate: '2025-09-20' }]);
  });

  describe('可见范围', () => {
    it('普通用户只能取到自己的记录', async () => {
      prisma.client.user.findUniqueOrThrow.mockResolvedValue({
        isAdmin: false,
      });
      prisma.client.weeklyReport.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        build().remove(3, createMockActiveUser({ sub: 5 })),
      ).rejects.toThrow('周报不存在或已被删除');
      expect(prisma.client.weeklyReport.deleteMany).toHaveBeenCalledWith({
        where: { id: 3, userId: 5 },
      });
    });

    it('管理员不加归属条件', async () => {
      prisma.client.user.findUniqueOrThrow.mockResolvedValue({ isAdmin: true });
      prisma.client.weeklyReport.findFirst.mockResolvedValue({
        id: 3,
        reportDate: new Date('2025-09-20'),
      });

      await build().findOne(3, createMockActiveUser({ sub: 5 }));

      expect(prisma.client.weeklyReport.findFirst).toHaveBeenCalledWith({
        where: { id: 3 },
      });
    });
  });
});
