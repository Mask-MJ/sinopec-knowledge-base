import { describe, expect, it } from 'vitest';

import { chatToMarkdown } from './chat-markdown';

const reference = {
  chunks: [],
  doc_aggs: [
    { doc_id: 'd1', doc_name: '松北21井设计.pdf', count: 2 },
    { doc_id: 'd2', doc_name: '施工总结.docx', count: 1 },
  ],
};

describe('chatToMarkdown', () => {
  it('renders title, question/answer pairs and reference sources', () => {
    const markdown = chatToMarkdown('松北 21 井', [
      { role: 'user', content: '设计炮数是多少？' },
      {
        role: 'assistant',
        content: '设计炮数 63750 炮。[ID:0][ID:1]',
        reference,
      },
    ]);

    expect(markdown).toBe(
      [
        '# 松北 21 井',
        '## 问',
        '设计炮数是多少？',
        '## 答',
        '设计炮数 63750 炮。[1][2]',
        '**参考来源**',
        '- 松北21井设计.pdf\n- 施工总结.docx\n',
      ].join('\n\n'),
    );
  });

  it('skips empty messages and omits sources when there are none', () => {
    const markdown = chatToMarkdown('t', [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '' },
      {
        role: 'assistant',
        content: 'a',
        reference: { chunks: [], doc_aggs: [] },
      },
    ]);

    expect(markdown).toBe('# t\n\n## 问\n\nq\n\n## 答\n\na\n');
  });

  it('drops the assistant greeting that precedes the first question', () => {
    const markdown = chatToMarkdown('t', [
      { role: 'assistant', content: '你好！我是你的助理' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);

    expect(markdown).toBe('# t\n\n## 问\n\nq\n\n## 答\n\na\n');
    expect(
      chatToMarkdown('t', [{ role: 'assistant', content: '你好！' }]),
    ).toBe('');
  });

  it('returns empty string when there is nothing to export', () => {
    expect(chatToMarkdown('t', [])).toBe('');
    expect(chatToMarkdown('t', [{ role: 'user', content: '  ' }])).toBe('');
  });
});
