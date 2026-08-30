// cspell:ignore aliyun
import type { RagflowModelItem } from './ragflow.service';

import { describe, expect, it } from 'vitest';

import { toLlmItems } from './ragflow.service';

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
