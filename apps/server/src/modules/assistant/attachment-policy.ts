// cspell:ignore tika presentationml
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

import { BadRequestException } from '@nestjs/common';

/**
 * 对话附件的上传规则。
 *
 * 附件由 RAGFlow 在每次发送时同步解析（Plain Text，不做 OCR），解析结果全文拼进本轮
 * 用户消息。背景见 docs/spike-chat-attachment.md §1.3、§2.2、§6.1 D3。
 */

/** 每轮提问最多带几个附件（需求定值）。 */
export const MAX_ATTACHMENTS_PER_TURN = 5;

/**
 * 单个附件的字节上限：20 MiB。
 *
 * 比知识库入库的 50 MiB 小：入库是异步排队，附件却是**每次发送**都在 RAGFlow API
 * 进程里同步重新解析，直接叠加到首字延迟上（39 页、4.57 万字的 PDF 实测 +4.8 秒）。
 * RAGFlow 自己的上限是 1 GiB，等于没有，只能在我们这里卡。
 * 真正约束上下文的是解析出的字数（spike §2.2 建议合计约 6 万字），解析前量不到；
 * 字节数只用来挡住明显过大的文件，上线前用真实报告实测后再调。
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * 扩展名 → 允许的 MIME。只收 RAGFlow 离线环境下能解析的格式（D3）：
 * doc / ppt 只能靠 tika，离线环境大概率不可用；不支持的格式会让整轮回答变成 `**ERROR**`。
 */
const ALLOWED_TYPES: Readonly<Record<string, readonly string[]>> = {
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.html': ['text/html'],
  '.md': ['text/markdown', 'text/x-markdown', 'text/plain'],
  '.pdf': ['application/pdf'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  '.txt': ['text/plain'],
};

/** 浏览器认不出文件类型时给的 MIME，此时只能看扩展名。 */
const UNKNOWN_MIME = 'application/octet-stream';

const LEGACY_FORMATS: Readonly<Record<string, string>> = {
  '.doc': 'docx',
  '.ppt': 'pptx',
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

/** 返回拒收原因；可以收时返回 undefined。 */
export function attachmentRejection(
  file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>,
): string | undefined {
  const ext = extensionOf(file.originalname);
  const legacyTarget = LEGACY_FORMATS[ext];
  if (legacyTarget) {
    return `暂不支持 ${ext} 格式，请另存为 ${legacyTarget} 后再上传`;
  }

  const mimes = ALLOWED_TYPES[ext];
  if (
    !mimes ||
    (file.mimetype !== UNKNOWN_MIME && !mimes.includes(file.mimetype))
  ) {
    return `不支持的文件类型: ${ext || file.mimetype}，仅支持 pdf / docx / pptx / md / html / txt`;
  }
  return undefined;
}

export const ATTACHMENT_MULTER_OPTIONS: MulterOptions = {
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter: (_req, file, cb) => {
    const reason = attachmentRejection(file);
    if (reason) {
      cb(new BadRequestException(reason), false);
    } else {
      cb(null, true);
    }
  },
};

/** 归属表里组装 RAGFlow `files` 所需的字段。 */
interface AttachmentRow {
  createdBy: string;
  fileId: string;
  mimeType: string;
  name: string;
}

/**
 * 组装 completions 的 `files`：RAGFlow 只读 `id / name / mime_type / created_by`
 * （`created_by` 决定去哪个桶取文件），按客户端给出的附件顺序排列。
 */
export function toRagflowFiles(
  rows: readonly AttachmentRow[],
  orderedIds: readonly string[],
) {
  const byId = new Map(rows.map((row) => [row.fileId, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            id: row.fileId,
            name: row.name,
            mime_type: row.mimeType,
            created_by: row.createdBy,
          },
        ]
      : [];
  });
}
