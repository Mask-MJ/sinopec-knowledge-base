import type { KeywordMatcher } from './keyword-matcher';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import {
  CONCURRENCY,
  KEYWORD_MATCHER,
  MAX_KEYWORDS,
} from './chunk-tagger.constants';
import { inferProjectKeywords } from './keyword-matcher';

interface RagflowChunk {
  content?: string;
  id: string;
}

interface ListChunksResponse {
  chunks?: RagflowChunk[];
  total?: number;
}

export interface TagDocumentResult {
  empty: number;
  failed: number;
  totalChunks: number;
  updated: number;
}

const PAGE_SIZE = 100;

@Injectable()
export class ChunkTaggerService {
  private readonly logger = new Logger(ChunkTaggerService.name);

  constructor(
    private readonly ragflow: RagflowService,
    @Inject(KEYWORD_MATCHER) private readonly matcher: KeywordMatcher,
  ) {}

  /**
   * 给单个 doc 的所有 chunk 写入 important_keywords。全自动与回填共用。
   *
   * 单个 chunk 的 PUT 失败会被计入 `failed` 并继续处理其余 chunk —— 本方法**不会**因
   * 个别失败而 reject。调用方应检查返回的 `failed` 字段判断是否存在部分失败
   * (例如 failed 等于 totalChunks 往往意味着鉴权/网络等系统性故障)。
   * 注意:列 chunk 的 GET 失败仍会向上 reject(无法继续)。
   */
  async tagDocument(
    datasetId: string,
    docId: string,
    docName: string,
  ): Promise<TagDocumentResult> {
    const chunks = await this.listChunks(datasetId, docId);
    const projectKws = inferProjectKeywords(docName);
    const result: TagDocumentResult = {
      totalChunks: chunks.length,
      updated: 0,
      empty: 0,
      failed: 0,
    };

    await this.processBatch(chunks, CONCURRENCY, async (chunk) => {
      const matched = this.matcher.match(chunk.content ?? '');
      const kws = [...new Set([...projectKws, ...matched])].slice(
        0,
        MAX_KEYWORDS,
      );
      if (kws.length === 0) {
        result.empty++;
        return;
      }
      try {
        await this.ragflow.request(
          'PATCH',
          `/api/v1/datasets/${datasetId}/documents/${docId}/chunks/${chunk.id}`,
          { important_keywords: kws },
        );
        result.updated++;
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `PATCH chunk ${chunk.id} 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    this.logger.log(
      `tagDocument ${docName}: total=${result.totalChunks} updated=${result.updated} empty=${result.empty} failed=${result.failed}`,
    );
    return result;
  }

  private async listChunks(
    datasetId: string,
    docId: string,
  ): Promise<RagflowChunk[]> {
    const all: RagflowChunk[] = [];
    const MAX_PAGES = 1000;
    let page = 1;
    for (; page <= MAX_PAGES; page++) {
      const data = await this.ragflow.request<ListChunksResponse>(
        'GET',
        `/api/v1/datasets/${datasetId}/documents/${docId}/chunks`,
        { page, page_size: PAGE_SIZE },
      );
      const chunks = data.chunks ?? [];
      all.push(...chunks);
      if (
        chunks.length < PAGE_SIZE ||
        (data.total !== undefined && all.length >= data.total)
      ) {
        return all;
      }
    }
    this.logger.warn(
      `listChunks 命中 ${MAX_PAGES} 页安全上限 (doc ${docId}),仅收集 ${all.length} 个 chunk,可能未覆盖全部`,
    );
    return all;
  }

  private async processBatch<T>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
      await Promise.all(
        items.slice(i, i + concurrency).map((item) => fn(item)),
      );
    }
  }
}
