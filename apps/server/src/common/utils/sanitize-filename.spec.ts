import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { sanitizeFilename } from './sanitize-filename';

describe('sanitizeFilename', () => {
  it('保留中文、数字、空格、连字符、下划线和点号，其余替换为下划线', () => {
    expect(sanitizeFilename('../报告(终版) 2026-1_a.pdf')).toBe(
      '.._报告_终版_ 2026-1_a.pdf',
    );
  });

  // RAGFlow check_doc_health 按 UTF-8 字节限 255，按字符截断时 86 个以上汉字就会被拒
  it('超长时按 UTF-8 字节截到 255 以内，并保留扩展名', () => {
    const result = sanitizeFilename(`${'测'.repeat(200)}.pdf`);

    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(255);
    expect(result.endsWith('.pdf')).toBe(true);
    expect(result).toBe(`${'测'.repeat(83)}.pdf`);
  });

  it('超长 ASCII 文件名也保留扩展名，否则 RAGFlow 按扩展名选不到解析器', () => {
    const result = sanitizeFilename(`${'a'.repeat(300)}.docx`);

    expect(result).toHaveLength(255);
    expect(result.endsWith('.docx')).toBe(true);
  });

  it('不超长时原样返回', () => {
    const name = `${'测'.repeat(84)}.md`;
    expect(sanitizeFilename(name)).toBe(name);
  });
});
