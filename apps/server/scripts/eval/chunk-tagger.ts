/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , no-console , unicorn/no-array-callback-reference */
// cspell:disable-file
//
// 给 RAGFlow KB 的所有 chunk 灌入 important_keywords（领域字典 + 正则匹配）。
// 绕过 RAGFlow 内建 tag_kb_ids 机制（多项目 KB 上跨文档串扰），用原生
// important_kwd 字段做 BM25 boost，不破坏向量分、不需重 ingest、可逆。
//
// 用法：
//   tsx scripts/eval/chunk-tagger.ts --kb <dataset_id> \
//     [--dict <path>] [--regex <path>] [--max-keywords 30] [--concurrency 5]
//
// 环境变量：
//   RAGFLOW_HOST       (e.g. http://100.64.0.4:9380)
//   RAGFLOW_API_KEY

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  inferProjectKeywords,
  loadDict,
  loadRegex,
  matchChunk,
} from '../../src/common/chunk-tagger/keyword-matcher';

interface Chunk {
  chunk_id: string;
  content?: string;
  content_with_weight?: string;
}

interface RagflowResponse<T> {
  code: number;
  data?: T;
  message?: string;
}

interface CliArgs {
  concurrency: number;
  dictPath: string;
  kb: string;
  maxKeywords: number;
  regexPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const defaults: CliArgs = {
    kb: '',
    dictPath: resolve(
      __dirname,
      '../../src/common/chunk-tagger/dataset',
      'sinopec-concept-dict.csv',
    ),
    regexPath: resolve(
      __dirname,
      '../../src/common/chunk-tagger/dataset',
      'sinopec-regex-catalog.json',
    ),
    maxKeywords: 30,
    concurrency: 5,
  };
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--concurrency': {
        args.concurrency = Number.parseInt(v ?? '5', 10);
        i++;

        break;
      }
      case '--dict': {
        args.dictPath = v ?? args.dictPath;
        i++;

        break;
      }
      case '--kb': {
        args.kb = v ?? '';
        i++;

        break;
      }
      case '--max-keywords': {
        args.maxKeywords = Number.parseInt(v ?? '30', 10);
        i++;

        break;
      }
      case '--regex': {
        args.regexPath = v ?? args.regexPath;
        i++;

        break;
      }
      // No default
    }
  }
  if (!args.kb) {
    console.error(
      'Usage: tsx chunk-tagger.ts --kb <dataset_id> [--dict <path>] [--regex <path>] [--max-keywords 30] [--concurrency 5]',
    );
    process.exit(1);
  }
  return args;
}

const HOST = process.env.RAGFLOW_HOST ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';
if (!HOST || !API_KEY) {
  console.error('RAGFLOW_HOST / RAGFLOW_API_KEY required');
  process.exit(1);
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${API_KEY}` },
  };
  if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] =
      'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(HOST + path, opts);
  const j = (await r.json()) as RagflowResponse<T>;
  if (j.code !== 0) {
    throw new Error(`${method} ${path}: ${JSON.stringify(j).slice(0, 300)}`);
  }
  return j.data as T;
}

async function processBatch<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    await Promise.all(slice.map(fn));
  }
}

interface DocSummary {
  id: string;
  name: string;
}

async function listDocs(kbId: string): Promise<DocSummary[]> {
  const data = await api<DocSummary[] | { docs?: DocSummary[] }>(
    'GET',
    `/api/v1/datasets/${kbId}/documents?page_size=200`,
  );
  return Array.isArray(data) ? data : (data?.docs ?? []);
}

async function listChunks(docId: string): Promise<Chunk[]> {
  const all: Chunk[] = [];
  for (let page = 1; page < 100; page++) {
    const r = await fetch(`${HOST}/v1/chunk/list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ doc_id: docId, page, size: 100, keywords: '' }),
    });
    const j = (await r.json()) as { data?: { chunks?: Chunk[] } };
    const chunks = j.data?.chunks ?? [];
    if (chunks.length === 0) break;
    all.push(...chunks);
    if (chunks.length < 100) break;
  }
  return all;
}

interface RunStats {
  emptyKw: number;
  failed: number;
  keywordsAvg: number;
  keywordsMax: number;
  keywordsMedian: number;
  totalChunks: number;
  updated: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Target KB: ${args.kb}`);
  console.log(`Dict: ${args.dictPath}`);
  console.log(`Regex: ${args.regexPath}`);

  const dict = loadDict(args.dictPath);
  const regexes = loadRegex(args.regexPath);
  console.log(
    `Loaded ${dict.size} dict terms, ${regexes.length} regex patterns`,
  );

  const docs = await listDocs(args.kb);
  console.log(`Docs in KB: ${docs.length}`);

  let totalChunks = 0;
  let updated = 0;
  let failed = 0;
  let emptyKw = 0;
  const keywordsHist: number[] = [];

  for (const doc of docs) {
    console.log(`\n[doc] ${doc.name}`);
    const projectKws = inferProjectKeywords(doc.name);
    if (projectKws.length > 0)
      console.log(`  project owner: [${projectKws.join(', ')}]`);
    const chunks = await listChunks(doc.id);
    console.log(`  chunks: ${chunks.length}`);
    totalChunks += chunks.length;
    const failedBefore = failed;
    const emptyBefore = emptyKw;

    await processBatch(chunks, args.concurrency, async (c) => {
      const text = c.content_with_weight ?? c.content ?? '';
      const matched = matchChunk(text, dict, regexes, args.maxKeywords);
      // 把"文档归属项目"作为强制 keyword 注入，确保即使 chunk 文本没显式
      // 提及项目名，retrieval 时也能按项目召回
      const kws = [...new Set([...projectKws, ...matched])].slice(
        0,
        args.maxKeywords,
      );
      keywordsHist.push(kws.length);
      if (kws.length === 0) {
        emptyKw++;
        return;
      }
      try {
        await api(
          'PUT',
          `/api/v1/datasets/${args.kb}/documents/${doc.id}/chunks/${c.chunk_id}`,
          { important_keywords: kws },
        );
        updated++;
      } catch (error) {
        failed++;
        if (failed - failedBefore <= 3) {
          console.log(`  FAIL ${c.chunk_id}: ${(error as Error).message}`);
        }
      }
    });
    console.log(
      `  updated: ${chunks.length - (emptyKw - emptyBefore) - (failed - failedBefore)} ` +
        `(failed=${failed - failedBefore}, empty=${emptyKw - emptyBefore})`,
    );
  }

  const sorted = [...keywordsHist].sort((a, b) => a - b);
  const stats: RunStats = {
    totalChunks,
    updated,
    emptyKw,
    failed,
    keywordsAvg:
      keywordsHist.reduce((s, n) => s + n, 0) /
      Math.max(1, keywordsHist.length),
    keywordsMedian: sorted[Math.floor(sorted.length / 2)] ?? 0,
    keywordsMax: keywordsHist.length > 0 ? Math.max(...keywordsHist) : 0,
  };

  console.log(`\n=== Summary ===`);
  console.log(`Total chunks: ${stats.totalChunks}`);
  console.log(
    `Updated: ${stats.updated}  Failed: ${stats.failed}  Empty: ${stats.emptyKw}`,
  );
  console.log(
    `Keywords/chunk: avg=${stats.keywordsAvg.toFixed(1)} median=${stats.keywordsMedian} max=${stats.keywordsMax}`,
  );

  const outPath = `/tmp/chunk-tagger-stats-${args.kb.slice(0, 8)}.json`;
  writeFileSync(outPath, JSON.stringify(stats, null, 2));
  console.log(`Stats: ${outPath}`);
}

main().catch((error: unknown) => {
  console.error('FATAL:', (error as Error).message);
  process.exit(1);
});
