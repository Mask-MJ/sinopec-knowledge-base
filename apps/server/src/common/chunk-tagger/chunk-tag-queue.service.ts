import type { PendingItem } from './chunk-tag-store';

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RagflowService } from '@/common/ragflow/ragflow.service';

import { ChunkTagStore } from './chunk-tag-store';
import {
  JOB_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  RUN,
} from './chunk-tagger.constants';
import { ChunkTaggerService } from './chunk-tagger.service';

interface RagflowDoc {
  id: string;
  name: string;
  run: string;
}

interface ListDocsResponse {
  docs?: RagflowDoc[];
  total?: number;
}

/** 分页列 documents 的单页步长 */
const DOCS_PAGE_SIZE = 1000;

/**
 * chunk-tag 后台轮询器:`@Interval` 周期触发 `pollOnce()`,对每个待办 doc 按
 * RAGFlow parse 状态决定打 tag / 弃置 / 保留。打 tag 链路任何失败都被 catch
 * 降级,绝不抛回调度器。
 */
@Injectable()
export class ChunkTagQueueService {
  private isPolling = false;
  private readonly logger = new Logger(ChunkTagQueueService.name);

  constructor(
    private readonly store: ChunkTagStore,
    private readonly ragflow: RagflowService,
    private readonly tagger: ChunkTaggerService,
  ) {}

  /** 轮询一次。可单独 await(测试用)。 */
  async pollOnce(): Promise<void> {
    if (this.isPolling) return; // 单实例重入守卫
    this.isPolling = true;
    try {
      const pending = await this.store.listPending();
      if (pending.length === 0) return;

      const docMaps = await this.loadDocMaps(pending);
      const now = Date.now();
      for (const item of pending) {
        try {
          await this.handlePending(item, docMaps, now);
        } catch (error) {
          // 单 member 失败隔离:保留到下一轮,不中断其余 pending
          this.logger.warn(
            `处理待办 ${item.member} 失败(保留下轮重试):${this.msg(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(`pollOnce 异常(降级,下一轮重试):${this.msg(error)}`);
    } finally {
      this.isPolling = false;
    }
  }

  /** `@Interval` 薄包装:仅触发 pollOnce(重入由 pollOnce 内 isPolling 守卫)。 */
  @Interval(POLL_INTERVAL_MS)
  tick(): void {
    void this.pollOnce();
  }

  /** 对单个待办 doc 按 run 状态决策。抛出则由 pollOnce 的 per-member catch 兜住。 */
  private async handlePending(
    { member, enqueuedAt }: PendingItem,
    docMaps: Map<string, Map<string, RagflowDoc> | null>,
    now: number,
  ): Promise<void> {
    const [datasetId, docId] = member.split(':');
    if (!datasetId || !docId) {
      await this.store.remove(member);
      return;
    }
    const docMap = docMaps.get(datasetId);
    if (!docMap) {
      // 该 dataset 本轮列举失败/缺失(暂时性):保留待办下轮重试,绝不误删
      return;
    }
    const doc = docMap.get(docId);
    if (!doc) {
      // 列举成功但 doc 不在列表:doc 真被删,移除
      await this.store.remove(member);
      this.logger.warn(`待办 ${member} 对应 doc 已不存在,移除`);
      return;
    }
    switch (doc.run) {
      case RUN.CANCEL:
      case RUN.FAIL: {
        await this.store.remove(member);
        this.logger.warn(`待办 ${member} parse ${doc.run},移除`);
        break;
      }
      case RUN.DONE: {
        const result = await this.tagger.tagDocument(
          datasetId,
          docId,
          doc.name,
        );
        await this.store.remove(member);
        this.logger.log(
          `已为 ${doc.name} 打 tag:total=${result.totalChunks} updated=${result.updated} failed=${result.failed}`,
        );
        break;
      }
      case RUN.RUNNING:
      case RUN.UNSTART: {
        if (now - enqueuedAt > JOB_TIMEOUT_MS) {
          await this.store.remove(member);
          this.logger.error(
            `待办 ${member} parse 超过 ${JOB_TIMEOUT_MS}ms 仍未完成,弃置(疑似卡死)`,
          );
        }
        break; // 未超时:保留到下一轮
      }
      default: {
        // 未知 run 值(如 SCHEDULE='5'):保留,不误删
        this.logger.debug(`待办 ${member} 未知 run 值 '${doc.run}',保留`);
        break;
      }
    }
  }

  /** 分页拉全某 dataset 的 documents(total 缺失时只靠短页终止,不静默截断)。 */
  private async listAllDocs(datasetId: string): Promise<RagflowDoc[]> {
    const all: RagflowDoc[] = [];
    for (let page = 1; page < 1000; page++) {
      const data = await this.ragflow.request<ListDocsResponse>(
        'GET',
        `/api/v1/datasets/${datasetId}/documents`,
        { page, page_size: DOCS_PAGE_SIZE },
      );
      const docs = data.docs ?? [];
      all.push(...docs);
      if (
        docs.length < DOCS_PAGE_SIZE ||
        (data.total !== undefined && all.length >= data.total)
      ) {
        break;
      }
    }
    return all;
  }

  /**
   * 按 datasetId 分组,每个 dataset 分页拉全 documents,建 docId→doc 映射。
   * 列举**失败**(暂时性,如 RAGFlow 抖动/重启)时该 dataset 映射置 `null`,与
   * "列举成功但 doc 不在列表"(doc 真删除)严格区分——前者保留待办下轮重试,
   * 只有后者才 remove。绝不能让一次列举失败误删整批待办。
   */
  private async loadDocMaps(
    pending: PendingItem[],
  ): Promise<Map<string, Map<string, RagflowDoc> | null>> {
    const datasetIds = new Set(
      pending
        .map((p) => p.member.split(':')[0])
        .filter((id): id is string => id !== undefined && id !== ''),
    );
    const maps = new Map<string, Map<string, RagflowDoc> | null>();
    for (const datasetId of datasetIds) {
      try {
        const docs = await this.listAllDocs(datasetId);
        const byId = new Map<string, RagflowDoc>();
        for (const doc of docs) byId.set(doc.id, doc);
        maps.set(datasetId, byId);
      } catch (error) {
        // 列举失败是暂时性的:置 null,handlePending 保留该 dataset 的 member 下轮重试(不误删)
        this.logger.warn(
          `列 dataset ${datasetId} documents 失败(保留待办,下轮重试):${this.msg(error)}`,
        );
        maps.set(datasetId, null);
      }
    }
    return maps;
  }

  private msg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
