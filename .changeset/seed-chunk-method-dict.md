---
'@sinopec-kb/server': patch
---

feat: 新增分块方式字典种子 + 幂等同步机制

- `SEED_DICTS` 增加 `knowledgeBase.chunkMethod` 字典（naive/laws/manual/presentation/qa/table 共 6 项），值与 RAGFlow Dataset SDK 的 `chunk_method` 枚举对齐。
- `SeedService` 新增 `syncSeedDicts`，在 `onApplicationBootstrap` 阶段幂等执行：
  - 字典本身缺失 → 完整新建
  - 字典已存在 → 仅按 value 补缺失的 dictData，不动运维已手改内容

老环境（如测试 2）下次重启 server 即可拿到新字典，无需手工到字典管理 UI 操作。
