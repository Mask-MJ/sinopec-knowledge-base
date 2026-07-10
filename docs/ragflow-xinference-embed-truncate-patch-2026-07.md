# RAGFlow XinferenceEmbed 截断兜底 — 运维处理单

> 处理日期：2026-07-10　目标机：`10.55.247.210`（`docker-ragflow-cpu-1` 容器）　RAGFlow 版本：v0.24.0

## 一、一句话问题

`XinferenceEmbed.encode` 把 chunk 直接送 xinference bge-m3，**未按 bge-m3 上限截断**；超 8192 tokens 的单条 chunk 让 xinference 500，整篇文档标 FAIL。**已通过 volume mount 一处 patch 兜底、无需改上游代码**，需要运维了解 patch 存在、以及下次升级 RAGFlow 时如何检查是否可移除。

## 二、影响与观察

- 4 个 KB 里 **18 篇** 文档稳定 FAIL（`run=4 / progress=-1`），全是 `_noimg.md`（[[feat-docx-preprocess]] 引入的 pandoc→md 产物）
- `progress_msg` 都指向同一处报错：
  ```
  [ERROR]Generate embedding error: Error code: 500 - {'detail': "[address=0.0.0.0:38953]
  This model's maximum context length is 8192 tokens. However, ... your prompt contains
  at least 8193 input tokens, ..."}
  ```
- 每篇 fail 都能重现（rerun API 立刻 fail），非偶发

## 三、根因（两层）

### 表层：docx cell 数字丢字 → 转 md → 出现 monster chunk

- [[feat-docx-preprocess]] 上线后，`.docx` 上传前经 pandoc 转 GFM `.md`
- 转换质量参差：部分复杂表格被输出为**整块 `<table>...</table>`** 或**巨型 pipe 表**（最极端一条 314k 字符），单块内没有任何 delimiter 匹配点
- RAGFlow 的 `naive_merge` 目标值 `chunk_token_num` 是软目标；遇到"无 delimiter 单段"就整块留作一个 chunk → 送 embed → 超 8192

### 里层：RAGFlow 与 bge-m3 用**不同的 tokenizer**

真正致命的根因。上游 v0.24 → v0.26.4 都没修：

| 位置 | tokenizer | 结果 |
|---|---|---|
| RAGFlow 内部 (`common/token_utils.py`) | tiktoken `cl100k_base` (GPT-4) | `chunk_token_num` / `truncate` 全用这把尺 |
| xinference 上跑的 bge-m3 | 模型自带的 XLM-RoBERTa SentencePiece | 服务端按这把尺判超 8192 |

两把尺子对同一段文本数出来不一样。对英文/表格类内容 bge-m3 密度 ≈ **1.001× cl100k**，cl100k 数出来"刚好 8182 安全"的 chunk，bge-m3 数出来 8193 → 严格拒。

**上游修复情况**：v0.24 → v0.26.4 之间上游 [`#15424`](https://github.com/infiniflow/ragflow/pull/15424) 只给 `OpenAIEmbed` 等 provider 加了 `truncate_to=8191`，**漏了 `XinferenceEmbed`**（作者假设 xinference 服务端会自截，实际 v2.11.0 不会）。也就是**升级 RAGFlow 不能自动救**。

## 四、Patch 内容

改 `rag/llm/embedding_model.py` 里 `XinferenceEmbed.encode`：

```python
def encode(self, texts: list):
    # ponytail: bge-m3 tokenizer 与 RAGFlow 内部用的 cl100k_base 尺度不一致
    #          upstream #15424 修了 OpenAI 类但漏了 Xinference. 用保守 cap 吸收差异.
    texts = [truncate(t, 6000) for t in texts]
    batch_size = 16
    ...
```

**为什么 cap = 6000**：实测最初用 `truncate(t, 8191)` 依然 500（一条 8182 cl100k tokens 的 chunk 被 bge-m3 数出 8193）。降到 6000 留出足够 buffer，即使 bge-m3 密度是 cl100k 的 1.3×，6000×1.3 = 7800 < 8192。

## 五、持久化 (已完成)

在 210 上：

```
/var/www/ragflow/docker/
├── docker-compose.yml            # ragflow-cpu 和 ragflow-gpu 两个 service 都加了 mount
├── docker-compose.yml.bak.<ts>   # patch 前的备份
└── patches/
    └── embedding_model.py        # patched 文件
```

`docker-compose.yml` 里加了：

```yaml
services:
  ragflow-cpu:
    volumes:
      # ... 原有的 volumes ...
      - ./patches/embedding_model.py:/ragflow/rag/llm/embedding_model.py
  ragflow-gpu:
    volumes:
      # 同上
```

**容器 recreate / 机器重启后 patch 依然生效**（已实测 `docker compose up -d ragflow-cpu` 触发 recreate 后 md5 匹配、rerun 通过）。

## 六、验证

- 修 delimiter (`\n\n|。|？|<HTML 表格标签>|pipe 表格`) 救了 12/18
- patch 上线后剩 6/18 全部 DONE
- `chunk_count` 数字：
  ```
  0492f388  DONE  1361 chunks (task_time 137s)  # 那条 314k pipe 表
  12120ce4  DONE  1359 chunks
  0d63ef30  DONE   605 chunks
  0464aa8c  DONE   502 chunks
  11e25b98  DONE   502 chunks
  d7c7ee96  DONE   502 chunks
  ```
- 总计 **18/18 fail → DONE**

## 七、副作用

- 单条 chunk 超 6000 cl100k tokens（≈ 20000 字符）时，**尾部会被截**丢失，向量不覆盖尾部内容。对巨型 pipe 表格来说尾部通常是重复行数据，损失可控
- 只保护 `XinferenceEmbed` provider。若未来切别的 embed 后端（TEI / Ollama）此 patch 不适用
- **不解决 tokenizer 尺度不一致的根本架构问题**——是本地兜底、不是根治

## 八、什么时候可以移除 patch

任一条成立即可撤除（rollback: 覆盖 compose 备份 + `docker compose up -d`）：

1. **上游修了**：`XinferenceEmbed.encode` 里出现了自带的 truncate（关注上游 `rag/llm/embedding_model.py` diff）
2. **换 embed 后端**：切到 TEI 或 Ollama 等**默认对超长自动截断**的 embed 服务
3. **上游改架构**：RAGFlow 内部 tokenizer 换成 embed model 自带的（不再用 cl100k 数）

## 九、相关

- [feat-docx-preprocess](../.changeset/feat-docx-preprocess.md) — 引入 pandoc→md 的初始动机（绕 docx cell 丢字 bug）
- [kb-optimization-report](kb-optimization-report.md) — KB 优化全景
- 上游 [PR #15424](https://github.com/infiniflow/ragflow/pull/15424) — 只覆盖 OpenAI/Mistral/Bedrock/Cohere/Ollama，漏了 Xinference
