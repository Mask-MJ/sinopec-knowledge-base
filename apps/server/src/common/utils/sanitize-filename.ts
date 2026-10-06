import { Buffer } from 'node:buffer';

/** RAGFlow check_doc_health 的上限，按 UTF-8 字节计（不是字符数） */
const MAX_FILENAME_BYTES = 255;
/** 超过这个长度的「.xxx」不当扩展名看 */
const MAX_EXTENSION_LENGTH = 16;

/**
 * 净化文件名，移除路径遍历和特殊字符。
 * 保留 Unicode 字母（含中文）、数字、空格、连字符、下划线和点号，其余替换为下划线。
 *
 * 超长时按 UTF-8 字节截到 255 以内并保留扩展名：RAGFlow 按字节拒收超长文件名，
 * 又按扩展名选解析器，截掉扩展名会让整轮回答报错。
 */
export function sanitizeFilename(filename: string): string {
  const clean = filename.replaceAll(/[^\p{L}\p{N}\s\-_.]/gu, '_');
  if (Buffer.byteLength(clean) <= MAX_FILENAME_BYTES) return clean;

  const dot = clean.lastIndexOf('.');
  const ext =
    dot > 0 && clean.length - dot <= MAX_EXTENSION_LENGTH
      ? clean.slice(dot)
      : '';
  const budget = MAX_FILENAME_BYTES - Buffer.byteLength(ext);

  let stem = '';
  let used = 0;
  // 按码点累加，不会把多字节字符切成半个
  for (const char of clean.slice(0, clean.length - ext.length)) {
    const size = Buffer.byteLength(char);
    if (used + size > budget) break;
    stem += char;
    used += size;
  }
  return stem + ext;
}
