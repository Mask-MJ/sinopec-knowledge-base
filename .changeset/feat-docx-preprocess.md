---
'@sinopec-kb/server': minor
---

<!-- cspell:ignore docx pandoc deepdoc -->

feat: 上传 docx 时透明地走 pandoc 转 markdown，绕开 RAGFlow 0.24 deepdoc DocxParser 的 cell 数字丢字 bug

**Why**：调研 prod RAGFlow ES 索引发现 RAGFlow 0.24 的 deepdoc `DocxParser` 在解析 docx 表格 cell 时会**静默丢字**：

- `0-4m` → `0`，`395-1000m/s` → `395/s` （范围下/上限被吞）
- `20m（inline）×40m（crossline）` → `（inline）×（crossline）`（括号外数字消失）
- 观测系统代码 `20L32S378P168F` → `32S378P168F`（前缀 `20L` 不进索引）

后果是召回环节即使打满分，LLM 也拿不到完整数字，所有 retrieval / embedding / chunk_method 调优都救不回来。离线把同 3 份 docx 走 `pandoc -f docx -t gfm` 转 md 后再 ingest，**所有丢失的数字在 ES 索引里全部回归**（shadow KB 实测 7/7 命中）。

**What**：

- 新增 `apps/server/src/common/docx-preprocess/`：`DocxPreprocessService` 在 `KnowledgeBaseService.uploadDocuments` 之前对每个文件做一次拦截，`.docx` 走 pandoc 转 GFM，其余文件透传；pandoc 失败时退化到原始 docx 上传，保证不会因为预处理崩了断业务。
- 转换后 `originalname` 从 `xxx.docx` 改成 `xxx.md`，`mimetype` 改成 `text/markdown`，`buffer` 与 `size` 跟随更新；下游 RAGFlow 把 md 当 plain text 走 naive parser 解析。
- `pandoc` 调用通过可注入的 `PandocRunner` 抽象，单测用 mock runner 不依赖系统 binary。
- `Dockerfile` production stage `apk add --no-cache pandoc`，运行时镜像内置 pandoc。

**对现有 KB 的影响**：本 PR 只对**新上传**的 docx 生效；prod KB 里已经存在的、被 deepdoc 吃过字的文档，需要后续单独跑一次重 ingest 脚本（不在本 PR 范围）。
