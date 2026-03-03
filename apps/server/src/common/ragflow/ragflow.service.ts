import type { AxiosRequestConfig } from 'axios';
import type { Readable } from 'node:stream';

import { Buffer } from 'node:buffer';

import { HttpService } from '@nestjs/axios';
import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** RAGFlow 通用响应结构 */
interface RagflowResponse<T = unknown> {
  code: number;
  data: T;
  message?: string;
}

/** RAGFlow 健康检查响应 */
interface HealthStatus {
  db: string;
  doc_engine: string;
  redis: string;
  status: string;
  storage: string;
}

@Injectable()
export class RagflowService {
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
    this.timeout = 30_000; // 30s 默认超时

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
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.get(url, {
        headers: this.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 120_000,
      });

      return {
        contentDisposition: response.headers['content-disposition'],
        contentType: response.headers['content-type'],
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
   * 健康检查
   */
  async healthCheck(): Promise<HealthStatus> {
    const url = `${this.host}/v1/system/healthz`;
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
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.request<
        RagflowResponse<T>
      >({
        method,
        url,
        data: method === 'GET' ? undefined : data,
        params: method === 'GET' ? data : config?.params,
        headers: this.getHeaders(config?.headers as Record<string, string>),
        timeout: this.timeout,
        ...config,
      });

      if (response.data.code !== 0) {
        throw new ConflictException(
          `RAGFlow 请求失败: ${response.data.message ?? '未知错误'}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
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
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.request({
        method,
        url,
        data,
        headers: this.getHeaders({ 'Content-Type': 'application/json' }),
        responseType: 'stream',
        timeout: 0, // 流式请求不设超时
      });

      return response.data as Readable;
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
    const url = `${this.host}${path}`;
    try {
      const response = await this.httpService.axiosRef.post<RagflowResponse<T>>(
        url,
        formData,
        {
          headers: this.getHeaders(),
          timeout: 120_000, // 上传超时 2 分钟
        },
      );

      if (response.data.code !== 0) {
        throw new ConflictException(
          `RAGFlow 上传失败: ${response.data.message ?? '未知错误'}`,
        );
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error(`RAGFlow 上传异常: ${path}`, error);
      throw new ServiceUnavailableException(
        'RAGFlow 服务暂时不可用，请稍后重试',
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
}
