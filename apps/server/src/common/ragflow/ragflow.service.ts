import type { AxiosRequestConfig } from 'axios';
import type { Readable } from 'node:stream';

import { Buffer } from 'node:buffer';

import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** RAGFlow 通用响应结构 */
interface RagflowResponse<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

/** RAGFlow LLM 模型项 */
export interface RagflowLlmItem {
  available: boolean;
  fid: string;
  llm_name: string;
  max_tokens?: number;
  model_type: string;
  status: string;
  tags?: string;
}

/** RAGFlow 0.26 `GET /api/v1/models` 返回的模型项 */
export interface RagflowModelItem {
  instance_id: string;
  instance_name: string;
  model_type: string[];
  name: string;
  provider_id: string;
  provider_name: string;
}

/** RAGFlow 健康检查响应 */
interface HealthStatus {
  db: string;
  doc_engine: string;
  redis: string;
  status: string;
  storage: string;
}

/**
 * 把 `GET /api/v1/models` 的 provider/instance 模型项摊平成 RagflowLlmItem。
 *
 * `fid` 拼进模型引用（`<llm_name>@<fid>`）。RAGFlow 解析引用时右对齐取字段：
 * 两段 `model@provider` 会把 instance 名当成 `default`，而实例真名不是
 * `default` 时它抛 `LookupError: Instance default not found`（源码虽有
 * 「provider 下仅一个 active 实例就回退」的分支，实测并未生效）。
 * 因此带出实例名拼成三段 `model@instance@provider`，不依赖那个回退。
 * 老实例没有 instance_name 时退回两段，保持兼容。
 */
export function toLlmItems(models: RagflowModelItem[]): RagflowLlmItem[] {
  return models.flatMap((model) =>
    (model.model_type ?? []).map((type) => ({
      // 能出现在该接口里的模型都是租户已挂载的，视为可用
      available: true,
      fid: model.instance_name
        ? `${model.instance_name}@${model.provider_name}`
        : model.provider_name,
      llm_name: model.name,
      model_type: type,
      status: '1',
    })),
  );
}

@Injectable()
export class RagflowService {
  private static readonly RAGFLOW_CONFLICT = 103;
  /**
   * 根据 RAGFlow 错误码抛出对应的 HTTP 异常
   */
  /** RAGFlow 业务错误码 */
  private static readonly RAGFLOW_NOT_FOUND = 102;
  private readonly apiKey: string;
  private readonly host: string;

  private readonly logger = new Logger(RagflowService.name);

  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.host = configService.get<string>('RAGFLOW_HOST', '');
    this.apiKey = configService.get<string>('RAGFLOW_API_KEY', '');
    this.timeout = 120_000; // 120s 默认超时

    if (!this.host) {
      this.logger.warn('RAGFLOW_HOST 未配置，RAGFlow 相关功能将不可用');
    }
    if (!this.apiKey) {
      this.logger.warn('RAGFLOW_API_KEY 未配置，RAGFlow 相关功能将不可用');
    }
  }

  /**
   * 文件下载请求（返回 arraybuffer）
   */
  async downloadFile(path: string): Promise<{
    contentDisposition?: string;
    contentType?: string;
    data: Buffer;
  }> {
    this.ensureConfigured();
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.get<Buffer>(url, {
        headers: this.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 120_000,
      });

      return {
        contentDisposition: response.headers['content-disposition'] as
          | string
          | undefined,
        contentType: response.headers['content-type'] as string | undefined,
        data: response.data,
      };
    } catch (error) {
      this.logger.error(`RAGFlow 下载异常: ${path}`, error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
      );
    }
  }

  /**
   * 获取已配置的 LLM 模型列表
   *
   * RAGFlow 0.26 起模型改由 provider/instance 机制管理，旧的 `GET /v1/llm/list`
   * 读的是 `tenant_llm` 表、在新机制下恒为空，因此改用 `GET /api/v1/models`。
   * 新接口返回扁平数组且 `model_type` 是数组（一个模型可同时是 chat 和 image2text），
   * 这里按 type 展开成每类一条，保持 RagflowLlmItem 的既有形状不变。
   */
  async getLlmList(): Promise<RagflowLlmItem[]> {
    this.ensureConfigured();
    const url = `${this.host}/api/v1/models`;
    try {
      const response = await this.httpService.axiosRef.get<
        RagflowResponse<RagflowModelItem[]>
      >(url, {
        headers: this.getHeaders(),
        timeout: 10_000,
      });

      if (response.data.code !== 0) {
        this.throwRagflowError(
          response.data.message ?? '未知错误',
          response.data.code,
        );
      }

      return toLlmItems(response.data.data ?? []);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error('RAGFlow 获取 LLM 列表异常', error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
      );
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<HealthStatus> {
    const url = `${this.host}/api/v1/system/healthz`;
    try {
      const response = await this.httpService.axiosRef.get<HealthStatus>(url, {
        timeout: 5000,
      });
      return response.data;
    } catch (error) {
      this.logger.warn('RAGFlow 健康检查失败', error);
      throw new ServiceUnavailableException('RAGFlow 服务不可用');
    }
  }

  /**
   * 通用 JSON 请求（GET / POST / PUT / PATCH / DELETE）
   * 自动处理 RAGFlow code !== 0 的错误
   */
  async request<T = unknown>(
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    this.ensureConfigured();
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.request<
        RagflowResponse<T>
      >({
        method,
        url,
        data: method === 'GET' ? undefined : data,
        params:
          method === 'GET'
            ? data
            : (config?.params as Record<string, unknown> | undefined),
        headers: this.getHeaders(config?.headers as Record<string, string>),
        timeout: this.timeout,
        ...config,
      });

      if (response.data.code !== 0) {
        this.throwRagflowError(
          response.data.message ?? '未知错误',
          response.data.code,
        );
      }

      return response.data.data;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(`RAGFlow 请求异常: ${method} ${path}`, error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
      );
    }
  }

  /**
   * 流式请求（用于 SSE 对话补全）
   * 返回原始 Node.js Readable 流
   */
  async requestStream(
    method: 'POST',
    path: string,
    data?: unknown,
  ): Promise<Readable> {
    this.ensureConfigured();
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.request<Readable>({
        method,
        url,
        data,
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        responseType: 'stream',
        timeout: 0, // 流式请求不设超时
      });

      return response.data;
    } catch (error) {
      this.logger.error(`RAGFlow 流式请求异常: ${path}`, error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
      );
    }
  }

  /**
   * 文件上传请求（multipart/form-data）
   */
  async uploadFile<T = unknown>(path: string, formData: FormData): Promise<T> {
    this.ensureConfigured();
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.post<RagflowResponse<T>>(
        url,
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 120_000, // 上传超时 2 分钟
        },
      );

      if (response.data.code !== 0) {
        this.throwRagflowError(
          response.data.message ?? '未知错误',
          response.data.code,
        );
      }

      return response.data.data;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      this.logger.error(`RAGFlow 上传异常: ${path}`, error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
      );
    }
  }

  /**
   * 检查 RAGFlow 是否已配置
   */
  private ensureConfigured(): void {
    if (!this.host || !this.apiKey) {
      throw new ServiceUnavailableException(
        'RAGFlow 服务未配置，相关功能暂不可用',
      );
    }
  }
  /**
   * 构建请求头（含 Authorization）
   */
  private getHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    };
  }

  private throwRagflowError(message: string, code: number): never {
    const fullMessage = `RAGFlow: ${message}`;
    if (code === RagflowService.RAGFLOW_NOT_FOUND)
      throw new NotFoundException(fullMessage);
    if (code === RagflowService.RAGFLOW_CONFLICT)
      throw new ConflictException(fullMessage);
    throw new BadRequestException(fullMessage);
  }
}
