// cspell:ignore tika
/**
 * 对话附件的前端预检，规则与服务端 attachment-policy.ts 保持一致。
 * 服务端才是真正的校验，这里只为在选文件时就给出看得懂的提示。
 */

/** 每轮提问最多带几个附件 */
export const MAX_ATTACHMENTS_PER_TURN = 5;

/** 单个附件上限 20 MB */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.md', '.html', '.txt'];

/** 旧格式依赖 RAGFlow 的 tika，离线环境解析不了，提示另存为新格式 */
const LEGACY_FORMATS: Record<string, string> = {
  '.doc': 'docx',
  '.ppt': 'pptx',
};

/** 文件选择框的 accept 属性 */
export const ATTACHMENT_ACCEPT = ALLOWED_EXTENSIONS.join(',');

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** 返回不能上传的原因；可以上传时返回 undefined */
export function attachmentError(file: File): string | undefined {
  const ext = extensionOf(file.name);
  const legacyTarget = LEGACY_FORMATS[ext];
  if (legacyTarget) {
    return `${file.name}：暂不支持 ${ext} 格式，请另存为 ${legacyTarget} 后再上传`;
  }
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `${file.name}：不支持的文件类型，仅支持 pdf / docx / pptx / md / html / txt`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name}：超过 20 MB，无法上传`;
  }
  return undefined;
}
