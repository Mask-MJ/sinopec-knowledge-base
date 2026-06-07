import type { Cache } from 'cache-manager';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';

/** 待办 cache key(自动落在 CacheModule 的 sinopec-kb namespace 下) */
const PENDING_KEY = 'chunk-tag:pending';

export interface PendingItem {
  /** 入队时间戳(ms) */
  enqueuedAt: number;
  /** `${datasetId}:${docId}` */
  member: string;
}

type PendingMap = Record<string, number>;

/**
 * chunk-tag 待办存储:cache-manager 单 key JSON + 进程内 mutex 串行 read-modify-write。
 * 单实例下 mutex 保证 enqueue/remove 交错不丢更新;多实例边界见 spec §8。
 * set 不传 ttl(CacheModule 无默认 ttl),待办不会被动过期。
 */
@Injectable()
export class ChunkTagStore {
  private mutex: Promise<unknown> = Promise.resolve();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** 入队一批 doc;member 已存在则覆盖时间戳(天然幂等)。 */
  async enqueue(datasetId: string, docIds: string[]): Promise<void> {
    const now = Date.now();
    await this.withLock(async () => {
      const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
      const updated = { ...map };
      for (const docId of docIds) {
        updated[`${datasetId}:${docId}`] = now;
      }
      await this.cache.set(PENDING_KEY, updated);
    });
  }

  /** 列出全部待办(为空返回 [])。只读,不加锁。 */
  async listPending(): Promise<PendingItem[]> {
    const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
    return Object.entries(map).map(([member, enqueuedAt]) => ({
      enqueuedAt,
      member,
    }));
  }

  /** 移除一个待办 member。 */
  async remove(member: string): Promise<void> {
    await this.withLock(async () => {
      const map = (await this.cache.get<PendingMap>(PENDING_KEY)) ?? {};
      const { [member]: _removed, ...rest } = map;
      await this.cache.set(PENDING_KEY, rest);
    });
  }

  /** 串行化 read-modify-write,防 enqueue/remove 交错丢更新。 */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.mutex.then(fn, fn);
    this.mutex = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
