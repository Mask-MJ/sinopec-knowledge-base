import type { INestApplication } from '@nestjs/common';

import { Buffer } from 'node:buffer';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { MAX_ATTACHMENT_BYTES } from './attachment-policy';

// 走真实的 multer 拦截器，验证上传端点的大小 / 数量 / 类型限制确实生效，
// 而不只是常量写对了。
describe('assistantController 附件上传端点', () => {
  let app: INestApplication;
  const uploadAttachments = vi.fn().mockResolvedValue([]);
  const url = '/1/sessions/s1/attachments';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        { provide: AssistantService, useValue: { uploadAttachments } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    uploadAttachments.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('合法文件交给 service，带上助手与会话', async () => {
    await request(app.getHttpServer())
      .post(url)
      .attach('files', Buffer.from('# hi'), {
        filename: 'a.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    expect(uploadAttachments).toHaveBeenCalledWith('1', undefined, 's1', [
      expect.objectContaining({ originalname: 'a.md' }),
    ]);
  });

  it('超过单文件大小上限返回 413，不进 service', async () => {
    await request(app.getHttpServer())
      .post(url)
      .attach('files', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), {
        filename: 'big.txt',
        contentType: 'text/plain',
      })
      .expect(413);

    expect(uploadAttachments).not.toHaveBeenCalled();
  });

  it('一次超过 5 个文件返回 400，不进 service', async () => {
    let req = request(app.getHttpServer()).post(url);
    for (let i = 0; i < 6; i++) {
      req = req.attach('files', Buffer.from('x'), {
        filename: `${i}.txt`,
        contentType: 'text/plain',
      });
    }
    await req.expect(400);

    expect(uploadAttachments).not.toHaveBeenCalled();
  });

  it('白名单外的类型返回 400，不进 service', async () => {
    const res = await request(app.getHttpServer())
      .post(url)
      .attach('files', Buffer.from('x'), {
        filename: 'a.doc',
        contentType: 'application/msword',
      })
      .expect(400);

    expect((res.body as { message: string }).message).toContain('另存为 docx');
    expect(uploadAttachments).not.toHaveBeenCalled();
  });
});
