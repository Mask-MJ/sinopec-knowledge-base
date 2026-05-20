/* eslint-disable unicorn/prefer-module , unicorn/no-process-exit , no-console , n/prefer-global/buffer , @typescript-eslint/no-explicit-any , @typescript-eslint/no-unsafe-assignment , @typescript-eslint/no-unsafe-member-access , @typescript-eslint/no-unnecessary-condition , @typescript-eslint/use-unknown-in-catch-callback-variable */
// cspell:disable-file
//
// 0520 第二批评测知识库一键搭建脚本（RAGFlow HTTP-only，不依赖 NestJS / child_process）：
//   1. GET 现有 prod-v2 dataset → 复制 embedding_model / chunk_method / parser_config
//   2. POST /api/v1/datasets 建新库
//   3. 遍历 --source-dir 下的预处理产物（.md 来自 pandoc，.pdf 原文件）
//   4. multipart POST /api/v1/datasets/<id>/documents 上传
//   5. POST /api/v1/datasets/<id>/chunks 触发解析
//   6. 轮询 documents.run 直到全部 DONE / FAIL
//   7. 写出 configs/0520-baseline.json 评测配置
//
// 由 setup-kb-0520.sh 包装调用以保证 docx 先走 pandoc 预处理（与 prod 同 path）。
//
// 直接用法：
//   pnpm exec dotenvx run --env-file=.env -- tsx scripts/eval/setup-kb-0520.ts \
//     --source-dir /tmp/0520-prepared \
//     --kb-name eval-0520 \
//     --src-dataset 6ec4cd18476611f1a9b8932ed31a3307 \
//     --assistant   b7e94c58476611f1a9b8932ed31a3307

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const HOST = process.env.RAGFLOW_HOST ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';
const PROD_BLACKLIST = (process.env.RAGFLOW_PROD_KEY_BLACKLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!HOST || !API_KEY) {
  console.error('RAGFLOW_HOST / RAGFLOW_API_KEY required');
  process.exit(1);
}
if (PROD_BLACKLIST.includes(API_KEY)) {
  console.error('Refusing to run with blacklisted (production) API key');
  process.exit(1);
}

interface Args {
  assistant: string;
  configFilename?: string;
  datasetQuestions?: string;
  embeddingModel?: string;
  experimentId?: string;
  kbName: string;
  sourceDir: string;
  srcDataset: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[++i] ?? '';
    switch (flag) {
      case '--assistant': {
        a.assistant = val;
        break;
      }
      case '--config-filename': {
        a.configFilename = val;
        break;
      }
      case '--dataset-questions': {
        a.datasetQuestions = val;
        break;
      }
      case '--embedding-model': {
        // 可选：覆盖从源 dataset 复制的 embedding_model。
        // 用于评测不同 embedding（如 text-embedding-v4@Tongyi-Qianwen）时的 A/B 库构建。
        a.embeddingModel = val;
        break;
      }
      case '--experiment-id': {
        a.experimentId = val;
        break;
      }
      case '--kb-name': {
        a.kbName = val;
        break;
      }
      case '--source-dir': {
        a.sourceDir = val;
        break;
      }
      case '--src-dataset': {
        a.srcDataset = val;
        break;
      }
    }
  }
  if (!a.sourceDir || !a.kbName || !a.srcDataset || !a.assistant) {
    console.error(
      'Usage: tsx setup-kb-0520.ts --source-dir <path> --kb-name <name> --src-dataset <id> --assistant <id> ' +
        '[--embedding-model <name>] [--experiment-id <id>] [--config-filename <name>] [--dataset-questions <file>]',
    );
    process.exit(1);
  }
  return a as Args;
}

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const r = await fetch(HOST + path, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(
      `${method} ${path} HTTP ${r.status}: ${text.slice(0, 200)}`,
    );
  }
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} non-JSON: ${text.slice(0, 200)}`);
  }
  if (j.code !== 0) {
    throw new Error(`${method} ${path} code=${j.code}: ${j.message ?? ''}`);
  }
  return j.data as T;
}

async function apiUpload<T>(
  path: string,
  files: Array<{ buffer: Buffer; name: string; type?: string }>,
): Promise<T> {
  const fd = new FormData();
  for (const f of files) {
    const ab = new Uint8Array(f.buffer);
    fd.append(
      'file',
      new File([ab], f.name, { type: f.type ?? 'application/octet-stream' }),
    );
  }
  const r = await fetch(HOST + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: fd,
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`POST ${path} HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  const j = JSON.parse(text);
  if (j.code !== 0) {
    throw new Error(`POST ${path} code=${j.code}: ${j.message ?? ''}`);
  }
  return j.data as T;
}

function inferMimeType(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.md') return 'text/markdown';
  if (ext === '.docx')
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function pollUntilParsed(
  datasetId: string,
  totalExpected: number,
): Promise<{ failed: string[]; ok: number }> {
  const start = Date.now();
  const TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟
  while (true) {
    const docs = await api<{
      docs: Array<{
        chunk_count?: number;
        id: string;
        name: string;
        run: string;
      }>;
    }>('GET', `/api/v1/datasets/${datasetId}/documents?page=1&page_size=100`);
    const list = docs.docs ?? [];
    const summary: Record<string, number> = {};
    for (const d of list) summary[d.run] = (summary[d.run] ?? 0) + 1;
    const ok = summary.DONE ?? 0;
    const fail = summary.FAIL ?? 0;
    const elapsed = Math.floor((Date.now() - start) / 1000);
    console.log(
      `  [${elapsed}s] ${list.length}/${totalExpected} docs, status:`,
      summary,
    );
    if (ok + fail >= totalExpected) {
      const failed = list.filter((d) => d.run === 'FAIL').map((d) => d.name);
      return { ok, failed };
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error(`parsing timed out after ${TIMEOUT_MS / 1000}s`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Host: ...${HOST.slice(-30)}  Key: ...${API_KEY.slice(-4)}`);
  console.log(`Source dir: ${args.sourceDir}`);
  console.log(`KB name: ${args.kbName}`);
  console.log(`Src dataset (config template): ${args.srcDataset}`);
  console.log(`Assistant (eval will reuse): ${args.assistant}`);

  // 1. GET 源 dataset 拿 embedding/chunk_method（parser_config 不复制：源含 RAGFlow 0.24 才有的
  //    `image_context_size` 字段，POST /api/v1/datasets 不接受。用项目 DEFAULT 同款 clean 配置。）
  const list = await api<any[]>(
    'GET',
    `/api/v1/datasets?id=${args.srcDataset}`,
  );
  const src = list[0];
  if (!src) throw new Error(`source dataset ${args.srcDataset} not found`);
  const embeddingModel = args.embeddingModel ?? src.embedding_model;
  const embeddingOrigin = args.embeddingModel
    ? 'override (CLI)'
    : 'source dataset';
  console.log(
    `\n>> Source dataset config: embedding=${src.embedding_model} chunk_method=${src.chunk_method}`,
  );
  console.log(`>> Embedding to use: ${embeddingModel}  (${embeddingOrigin})`);

  // 2. POST 建新库（parser_config 镜像 common/defaults/knowledge-base.defaults.ts）
  const parserConfig = {
    layout_recognize: 'DeepDOC',
    chunk_token_num: 512,
    delimiter: '\n',
    raptor: {
      use_raptor: false,
      prompt:
        'Please summarize the following paragraphs. Be careful with the numbers, do not make things up. Paragraphs as following:\n      {cluster_content}\nThe above is the content you need to summarize.',
      max_token: 256,
      threshold: 0.1,
      max_cluster: 64,
      random_seed: 0,
    },
    graphrag: {
      use_graphrag: false,
      entity_types: ['organization', 'person', 'geo', 'event', 'category'],
      method: 'light',
    },
  };
  const created = await api<{ id: string }>('POST', '/api/v1/datasets', {
    name: args.kbName,
    embedding_model: embeddingModel,
    chunk_method: src.chunk_method,
    parser_config: parserConfig,
    description: `0520 evaluation KB — auto-created from setup-kb-0520.ts. Source: test-docs/0520/. Embedding: ${embeddingModel}.`,
  });
  const newId = created.id;
  console.log(`\n>> Created new dataset: id=${newId}`);

  // 3. 收集预处理产物
  const files = readdirSync(args.sourceDir)
    .filter((f) => /\.(?:md|pdf)$/i.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`no .md / .pdf files found in ${args.sourceDir}`);
  }
  console.log(`\n>> Uploading ${files.length} files:`);
  for (const f of files) console.log(`     - ${f}`);

  // 4. 上传（一次性 multipart 发全部，与生产 uploadDocuments 同款）
  const payload = files.map((f) => {
    const full = resolve(args.sourceDir, f);
    return {
      name: basename(f),
      buffer: readFileSync(full),
      type: inferMimeType(f),
    };
  });
  const uploaded = await apiUpload<Array<{ id: string; name: string }>>(
    `/api/v1/datasets/${newId}/documents`,
    payload,
  );
  console.log(`\n>> Uploaded ${uploaded.length} docs`);
  const documentIds = uploaded.map((d) => d.id);

  // 5. 触发解析
  await api('POST', `/api/v1/datasets/${newId}/chunks`, {
    document_ids: documentIds,
  });
  console.log(`\n>> Parsing triggered for ${documentIds.length} docs`);

  // 6. 轮询
  console.log(`\n>> Polling until DONE / FAIL (10s interval, 30min timeout):`);
  const { ok, failed } = await pollUntilParsed(newId, documentIds.length);
  console.log(`\n>> Parsing finished: ok=${ok}  failed=${failed.length}`);
  if (failed.length > 0) {
    console.error('  Failed docs:');
    for (const n of failed) console.error(`   - ${n}`);
  }

  // 7. 写出 eval config（默认是 0520-baseline.json，可由 --experiment-id / --config-filename override）
  const experimentId = args.experimentId ?? '0520-baseline';
  const configFilename = args.configFilename ?? `${experimentId}.json`;
  const datasetQuestions = args.datasetQuestions ?? 'questions-0520.json';
  const cfgPath = resolve(__dirname, `configs/${configFilename}`);
  // 复用 prod-v2-topn10 同款 retrieval 参数（实测最佳生产配置）
  const cfg = {
    experimentId,
    _desc: `0520 第二批客户评测：独立 KB（仅装 0520 工程文档），embedding=${embeddingModel}。复用 prod-v2 assistant 与 prod-v2-topn10 检索参数。`,
    datasetIds: [newId],
    assistantId: args.assistant,
    split: 'all',
    retrieval: {
      topK: 1024,
      similarityThreshold: 0.2,
      vectorSimilarityWeight: 0.3,
      keyword: false,
      topN: 10,
    },
    dataset: datasetQuestions,
  };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`\n>> Wrote eval config: ${cfgPath}`);
  console.log(`\nNext step:`);
  console.log(
    `  pnpm exec dotenvx run --env-file=.env -- tsx scripts/eval/run.ts --config scripts/eval/configs/${configFilename} --split all`,
  );
}

main().catch((error) => {
  console.error('FATAL:', error);
  process.exit(1);
});
