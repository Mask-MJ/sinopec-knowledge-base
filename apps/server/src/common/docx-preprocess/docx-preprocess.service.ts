import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

/**
 * Convert a docx buffer to a markdown buffer.
 *
 * Extracted as an injectable token so unit tests can stub pandoc out without
 * shelling out to a real binary.
 */
export type PandocRunner = (input: Buffer) => Promise<Buffer>;

export const PANDOC_RUNNER = Symbol('PANDOC_RUNNER');

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const MAX_PANDOC_BUFFER_BYTES = 50 * 1024 * 1024;

/**
 * Default runner: spawns the system `pandoc` binary, feeds the docx buffer on
 * stdin, and reads the markdown output from stdout. Errors propagate so the
 * caller can decide whether to fall back to the original file.
 */
export const defaultPandocRunner: PandocRunner = (input) =>
  new Promise<Buffer>((resolve, reject) => {
    const proc = spawn('pandoc', ['-f', 'docx', '-t', 'gfm']);
    const chunks: Buffer[] = [];
    let stderr = '';
    let totalBytes = 0;

    proc.stdout.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PANDOC_BUFFER_BYTES) {
        proc.kill();
        reject(
          new Error(
            `pandoc output exceeded ${MAX_PANDOC_BUFFER_BYTES} bytes, aborted`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pandoc exited ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });

function isDocx(file: Express.Multer.File): boolean {
  return /\.docx$/i.test(file.originalname) || file.mimetype === DOCX_MIME;
}

function rewriteAsMarkdown(
  file: Express.Multer.File,
  md: Buffer,
): Express.Multer.File {
  return {
    ...file,
    originalname: file.originalname.replace(/\.docx$/i, '.md'),
    mimetype: 'text/markdown',
    buffer: md,
    size: md.length,
  };
}

/**
 * Transparently convert each `.docx` upload to GitHub-flavoured markdown via
 * pandoc before the file reaches RAGFlow. Non-docx files pass through, and any
 * pandoc failure falls back to the original docx so we never block uploads on
 * a preprocessing error.
 *
 * Why this exists: RAGFlow 0.24's deepdoc DocxParser silently drops the second
 * number in many `<num>~<num>` / `<num>-<num>` table cells (e.g. `0-4m` →
 * `0`, `395-1000m/s` → `395/s`) and strips parameters around brackets
 * (`20m（inline）×40m` → `（inline）×`). Pandoc preserves them losslessly.
 */
@Injectable()
export class DocxPreprocessService {
  private readonly logger = new Logger(DocxPreprocessService.name);
  private readonly runner: PandocRunner;

  constructor(@Inject(PANDOC_RUNNER) @Optional() runner?: PandocRunner) {
    this.runner = runner ?? defaultPandocRunner;
  }

  async preprocessFiles(
    files: Express.Multer.File[],
  ): Promise<Express.Multer.File[]> {
    return Promise.all(files.map((file) => this.preprocessOne(file)));
  }

  private async preprocessOne(
    file: Express.Multer.File,
  ): Promise<Express.Multer.File> {
    if (!isDocx(file)) return file;
    try {
      const md = await this.runner(file.buffer);
      this.logger.log(
        `docx → md: ${file.originalname} (${file.size}B → ${md.length}B)`,
      );
      return rewriteAsMarkdown(file, md);
    } catch (error) {
      this.logger.warn(
        `docx → md preprocess failed for ${file.originalname}; uploading original docx instead. Reason: ${(error as Error).message}`,
      );
      return file;
    }
  }
}
