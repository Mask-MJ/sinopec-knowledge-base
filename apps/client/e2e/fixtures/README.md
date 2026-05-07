<!-- cspell:ignore noimg -->

# E2E fixtures

Source `.docx` files used by `kb-manual-comparison.spec.ts` to compare RAGFlow's `naive` vs `manual` chunk-method on the same documents.

The files are not committed (see `.gitignore`). They are pulled from RAGFlow's MinIO bucket of the prod KB. To repopulate locally:

```bash
ssh ragflow 'docker exec docker-minio-1 sh -c "
  mc alias set local http://localhost:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD >/dev/null 2>&1
  mkdir -p /tmp/fix
  for f in \"2014年页岩气地震攻关试验项目采集报告-打印_noimg.docx\" \\
           \"2024年塔里木盆地顺托果勒西区块顺北21井区三维地震勘探资料采集项目工程设计_noimg.docx\" \\
           \"2024年塔里木盆地顺托果勒西区块顺北21井区三维地震勘探资料采集项目试验报告_noimg.docx\"; do
    mc cp \"local/6ec4cd18476611f1a9b8932ed31a3307/$f\" \"/tmp/fix/$f\"
  done"' \
  && ssh ragflow 'docker cp docker-minio-1:/tmp/fix/. /tmp/fix/ && tar -czf /tmp/fix.tar.gz -C /tmp/fix .' \
  && scp ragflow:/tmp/fix.tar.gz /tmp/fix.tar.gz \
  && tar -xzf /tmp/fix.tar.gz -C apps/client/e2e/fixtures/
```

Coverage rationale:

| File | Covers | Rationale |
| --- | --- | --- |
| `2014年页岩气...采集报告-打印_noimg.docx` | Q18 / Q19 | naive parser drops half of numeric ranges (`0-4m` → `0`, `395-1000` → `395`); want to verify manual parser preserves them. |
| `2024年...工程设计_noimg.docx` | Q6 | "一升一降三确保" heading is in chunk #29, definitions in chunk #30-#33; want to see if manual parser keeps them under one chunk. |
| `2024年...试验报告_noimg.docx` | Q18 cross-check | This doc has the proper `36线×6炮×528道` form; baseline for what well-parsed observation parameters look like. |
