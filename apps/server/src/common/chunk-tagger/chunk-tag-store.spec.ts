import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChunkTagStore } from './chunk-tag-store';

describe('chunkTagStore', () => {
  let backing: Record<string, unknown>;
  const cache = {
    get: vi.fn((k: string) => Promise.resolve(backing[k])),
    set: vi.fn((k: string, v: unknown) => {
      backing[k] = v;
      return Promise.resolve();
    }),
    del: vi.fn((k: string) => {
      const { [k]: _removed, ...rest } = backing;
      backing = rest;
      return Promise.resolve();
    }),
  };
  let store: ChunkTagStore;

  beforeEach(async () => {
    backing = {};
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [ChunkTagStore, { provide: CACHE_MANAGER, useValue: cache }],
    }).compile();
    store = moduleRef.get(ChunkTagStore);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enqueue writes each member with the current timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.enqueue('ds1', ['d1', 'd2']);
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d1', enqueuedAt: 1000 },
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
  });

  it('enqueue is idempotent and overwrites the timestamp', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(1000);
    await store.enqueue('ds1', ['d1']);
    now.mockReturnValueOnce(2000);
    await store.enqueue('ds1', ['d1']);
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d1', enqueuedAt: 2000 },
    ]);
  });

  it('listPending returns [] when nothing is enqueued', async () => {
    expect(await store.listPending()).toEqual([]);
  });

  it('remove deletes only the given member', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    await store.enqueue('ds1', ['d1', 'd2']);
    await store.remove('ds1:d1');
    expect(await store.listPending()).toEqual([
      { member: 'ds1:d2', enqueuedAt: 1000 },
    ]);
  });

  it('serializes concurrent enqueues without lost updates', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    cache.get.mockImplementation(async (k: string) => {
      await Promise.resolve();
      return backing[k];
    });
    await Promise.all([
      store.enqueue('ds1', ['a']),
      store.enqueue('ds1', ['b']),
    ]);
    const pending = await store.listPending();
    const members = pending.map((p) => p.member).sort();
    expect(members).toEqual(['ds1:a', 'ds1:b']);
  });
});
