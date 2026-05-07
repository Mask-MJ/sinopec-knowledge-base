import type { PandocRunner } from './docx-preprocess.service';

import { Buffer } from 'node:buffer';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DocxPreprocessService,
  PANDOC_RUNNER,
} from './docx-preprocess.service';

const docxMime =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function file(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: '页岩气.docx',
    encoding: '7bit',
    mimetype: docxMime,
    size: 4,
    buffer: Buffer.from('FAKE'),
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
    ...overrides,
  };
}

async function buildService(
  runner: PandocRunner,
): Promise<DocxPreprocessService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DocxPreprocessService,
      { provide: PANDOC_RUNNER, useValue: runner },
    ],
  }).compile();
  return moduleRef.get(DocxPreprocessService);
}

function at<T>(arr: T[], i: number): T {
  const value = arr[i];
  if (value === undefined) {
    throw new Error(`expected array index ${i} to be defined`);
  }
  return value;
}

describe('docxPreprocessService', () => {
  let runner: ReturnType<typeof vi.fn<PandocRunner>>;

  beforeEach(() => {
    runner = vi.fn<PandocRunner>();
  });

  it('converts .docx to .md, calling pandoc once per docx', async () => {
    runner.mockResolvedValue(
      Buffer.from('# converted markdown\n0-4m, 395-1000'),
    );
    const service = await buildService(runner);

    const out = at(await service.preprocessFiles([file()]), 0);

    expect(runner).toHaveBeenCalledTimes(1);
    expect(out.originalname).toBe('页岩气.md');
    expect(out.mimetype).toBe('text/markdown');
    expect(out.buffer.toString('utf8')).toContain('0-4m, 395-1000');
    expect(out.size).toBe(out.buffer.length);
  });

  it('passes non-docx files through untouched', async () => {
    const service = await buildService(runner);
    const pdf = file({
      originalname: 'manual.pdf',
      mimetype: 'application/pdf',
    });
    const out = at(await service.preprocessFiles([pdf]), 0);

    expect(runner).not.toHaveBeenCalled();
    expect(out).toBe(pdf);
  });

  it('detects docx by mimetype even when extension is missing', async () => {
    runner.mockResolvedValue(Buffer.from('md'));
    const service = await buildService(runner);
    const noExt = file({ originalname: 'no-extension', mimetype: docxMime });
    const out = at(await service.preprocessFiles([noExt]), 0);

    expect(runner).toHaveBeenCalledTimes(1);
    expect(out.mimetype).toBe('text/markdown');
    expect(out.originalname).toBe('no-extension'); // we only rename when .docx is present
  });

  it('falls back to original docx when pandoc throws', async () => {
    runner.mockRejectedValue(new Error('pandoc not found'));
    const service = await buildService(runner);
    const original = file();
    const out = at(await service.preprocessFiles([original]), 0);

    expect(out).toBe(original);
    expect(out.mimetype).toBe(docxMime);
  });

  it('processes multiple files independently', async () => {
    runner
      .mockResolvedValueOnce(Buffer.from('A'))
      .mockResolvedValueOnce(Buffer.from('B'));
    const service = await buildService(runner);
    const inputs = [
      file({ originalname: 'a.docx' }),
      file({ originalname: 'b.PDF', mimetype: 'application/pdf' }),
      file({ originalname: 'c.docx' }),
    ];
    const out = await service.preprocessFiles(inputs);

    expect(runner).toHaveBeenCalledTimes(2);
    expect(at(out, 0).originalname).toBe('a.md');
    expect(at(out, 1)).toBe(at(inputs, 1));
    expect(at(out, 2).originalname).toBe('c.md');
    expect(at(out, 0).buffer.toString('utf8')).toBe('A');
    expect(at(out, 2).buffer.toString('utf8')).toBe('B');
  });
});
