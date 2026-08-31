/**
 * E2E 批次配置：语料目录 / 题集 / 环境变量读取，四个 spec 共用。
 *
 * 评测数据按批次放在仓库根 `test-docs/<批次>/`（整个目录 gitignore，不入库）。
 * 换一批数据只改环境变量，不改代码：
 *   E2E_DOCS_DIR=test-docs/0820 E2E_QUESTIONS_FILE=questions-0820.json
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set (see apps/client/.env.example)`);
  }
  return value;
}

/** 仓库根下的语料目录，默认第一批 0420。 */
export const DOCS_DIR = resolve(
  __dirname,
  '../../..',
  process.env.E2E_DOCS_DIR ?? 'test-docs/0420',
);

/** 批次名（DOCS_DIR 的最后一段），用于给结果文件命名，避免多批互相覆盖。 */
export const BATCH_LABEL = DOCS_DIR.split('/').pop() ?? 'unknown';

/** 题集 JSON，与 DOCS_DIR 配套切换。 */
export const QUESTIONS_PATH = resolve(
  __dirname,
  '../../server/scripts/eval/dataset',
  process.env.E2E_QUESTIONS_FILE ?? 'questions.json',
);

/**
 * `test-docs/<批次>/` 里除语料外还混着题集本身（`RAG问题和参考答案*.docx`）
 * 与说明 `.md`。题集当语料传上去会污染知识库，必须排除。
 *
 * 收 pdf：0420/0520 两批各有 1~3 份 pdf 语料，前端 accept 与服务端
 * fileFilter 白名单都支持（见 knowledge-base.controller.ts 的 ALLOWED_EXTS）。
 *
 * ponytail: 上传接口 FilesInterceptor 上限 10 个文件/请求，当前最大批次
 * （0820）正好 10 个。再多的批次要改成分批 POST。
 */
export function isCorpusDoc(filename: string): boolean {
  return (
    /\.(?:docx?|pdf)$/i.test(filename) &&
    !filename.startsWith('RAG问题和参考答案')
  );
}
