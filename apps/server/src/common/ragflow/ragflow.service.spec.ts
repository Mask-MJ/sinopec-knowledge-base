// cspell:ignore aliyun
import type { RagflowModelItem } from './ragflow.service';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import type { InternalAxiosRequestConfig } from 'axios';

import { Logger } from '@nestjs/common';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RagflowService, toLlmItems } from './ragflow.service';

const model = (o: Partial<RagflowModelItem> = {}): RagflowModelItem => ({
  instance_id: 'i1',
  instance_name: 'aliyun-maas',
  model_type: ['chat'],
  name: 'qwen3.8-max',
  provider_id: 'p1',
  provider_name: 'OpenAI-API-Compatible',
  ...o,
});

describe('toLlmItems', () => {
  it('带出实例名拼成三段引用，否则 RAGFlow 会按 default 找实例而报 LookupError', () => {
    const [item] = toLlmItems([model()]);
    expect(item?.fid).toBe('aliyun-maas@OpenAI-API-Compatible');
    expect(`${item?.llm_name}@${item?.fid}`).toBe(
      'qwen3.8-max@aliyun-maas@OpenAI-API-Compatible',
    );
  });

  it('没有实例名时退回两段，兼容旧实例', () => {
    const [item] = toLlmItems([model({ instance_name: '' })]);
    expect(item?.fid).toBe('OpenAI-API-Compatible');
  });

  it('一个模型挂多种类型时按类型展开', () => {
    const items = toLlmItems([model({ model_type: ['chat', 'image2text'] })]);
    expect(items.map((i) => i.model_type)).toEqual(['chat', 'image2text']);
    expect(new Set(items.map((i) => i.fid)).size).toBe(1);
  });

  it('model_type 缺失时不产出条目', () => {
    expect(toLlmItems([model({ model_type: undefined })])).toEqual([]);
  });
});

describe('ragflowService 错误日志不带 API key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const KEY = 'ragflow-FAKE-KEY';
  const axiosError = () =>
    new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED', {
      headers: new AxiosHeaders({ Authorization: `Bearer ${KEY}` }),
      data: 'FILE-BODY',
    } as InternalAxiosRequestConfig);

  const setup = () => {
    const axiosRef = {
      post: vi.fn().mockRejectedValue(axiosError()),
      request: vi.fn().mockRejectedValue(axiosError()),
    };
    const service = new RagflowService(
      { axiosRef } as unknown as HttpService,
      {
        get: (k: string) =>
          ({ RAGFLOW_HOST: 'http://rf', RAGFLOW_API_KEY: KEY })[k],
      } as unknown as ConfigService,
    );
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    return { logged, service };
  };

  // 实测：AxiosError.toJSON() 带 config.headers，winston 的 json 格式会把
  // `Authorization: Bearer <key>` 原样写进日志文件。
  it.each([
    ['uploadFile', (s: RagflowService) => s.uploadFile('/x', new FormData())],
    ['request', (s: RagflowService) => s.request('POST', '/x', {})],
    ['requestStream', (s: RagflowService) => s.requestStream('POST', '/x', {})],
  ])('%s 失败时只记错误摘要', async (_name, call) => {
    const { logged, service } = setup();

    await expect(call(service)).rejects.toThrow(/暂时不可用/);

    expect(logged).toHaveBeenCalled();
    const text = JSON.stringify(logged.mock.calls);
    expect(text).toContain('ECONNREFUSED');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('FILE-BODY');
  });
});
