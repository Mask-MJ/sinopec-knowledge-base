# Spike：物探智问对话内上传附件参与回答

> 调研日期：2026-09-28 · 性质：技术调研（静态源码分析 + 本机 v0.27.1 冒烟），未改业务代码
> 需求来源：`界面UI调整-20260905.pptx` 第 4、5 页 ——「要支持附件上传功能，能够上传文本文档（pdf、word、ppt、html、md 等）参与回答」
> RAGFlow 源码基线：`ragflow-src/` = `v0.27.1`（`b9df87c4c`）

## 结论

1. **RAGFlow v0.27.1 原生支持对话临时附件**，分两步：先 `POST /api/v1/documents/upload` 上传，只把文件存进对象存储、**不解析、不入库**；再在 `POST /api/v1/chat/completions` 里带上 `files`（上传接口返回的对象数组），由 RAGFlow 在**本轮请求中同步解析**，把全文拼到这条用户问题后面。
2. 附件**只对它所在的那一轮生效**，不进任何数据集，也不参与向量检索；知识库检索照常进行，两者一起交给 LLM。
3. 我们用的 RESTful 原生端点可以直接这么调，`question` + `files` 的写法源码里有明确分支。但 **`files` 没写进 chat completions 的官方 API 文档**，属于「RAGFlow 自家前端在用、但没写进文档」的参数，升级时要当作回归点来测。
4. **推荐：走原生方案**，由我们后端代理上传、记录附件归属，调 completions 时在服务端组装 `files`。预计 **3～4 人日**。三个前置决策已于 2026-09-29 定下，见 [§6.1](#61-已定决策2026-09-29)。
5. 主链路已在**本机 docker 的 v0.27.1 上实测跑通**（2026-09-28），结果见 [§7](#7-本机实测v0271)。实测补出两个静态分析没看到的问题：**追问时模型会编造附件内容**；**附件内容会被标成知识库引用 `[ID:n]`**。v0.26.4 的差异是用 `git show v0.26.4:…` 静态比对得出的，见 [§5](#5-版本差异与验证状态)。

---

## 1. RAGFlow 自己的 Web 前端怎么做

### 1.1 调用链

| 步骤 | 位置 | 行为 |
|---|---|---|
| 选中文件 | [ragflow-src/web/src/pages/next-chats/hooks/use-upload-file.ts#L24-L48](../ragflow-src/web/src/pages/next-chats/hooks/use-upload-file.ts#L24-L48) | 逐个调用 `uploadAndParseFile`，把返回的 `data` 存进 `currentFiles` |
| 上传请求 | [ragflow-src/web/src/hooks/use-chat-request.ts#L520-L535](../ragflow-src/web/src/hooks/use-chat-request.ts#L520-L535) | multipart 请求，字段为 `file` + `conversation_id` |
| URL | [ragflow-src/web/src/utils/api.ts#L288](../ragflow-src/web/src/utils/api.ts#L288) | `documentInfoUpload: ${restAPIv1}/documents/upload` |
| 发送消息 | [ragflow-src/web/src/pages/next-chats/hooks/use-send-chat-message.ts#L214-L262](../ragflow-src/web/src/pages/next-chats/hooks/use-send-chat-message.ts#L214-L262) | 把 `files` 挂在最后一条 user message 上 |
| completion 请求体 | [ragflow-src/web/src/services/chat-completion-stream.ts#L62-L75](../ragflow-src/web/src/services/chat-completion-stream.ts#L62-L75) | `{chat_id, session_id, messages, pass_all_history_messages: true, …}` |

前端带了 `conversation_id`，但后端上传接口只读 `file` 和 `url`（[ragflow-src/api/apps/restful_apis/document_api.py#L159-L161](../ragflow-src/api/apps/restful_apis/document_api.py#L159-L161)），所以**上传这一步和会话没有绑定**。

### 1.2 上传接口：`POST /api/v1/documents/upload`

- 路由：[ragflow-src/api/apps/restful_apis/document_api.py#L128-L188](../ragflow-src/api/apps/restful_apis/document_api.py#L128-L188)。支持 API Key 鉴权（`@login_required`，与我们在用的 `/api/v1/chats` 相同）。
- 实现：[ragflow-src/api/db/services/file_service.py#L813-L909](../ragflow-src/api/db/services/file_service.py#L813-L909)。普通文件走 `structured()`（[#L814-L831](../ragflow-src/api/db/services/file_service.py#L814-L831)）：生成 uuid，`put_blob` 到对象存储桶 `{tenant_id}-downloads`（[#L742-L745](../ragflow-src/api/db/services/file_service.py#L742-L745)），返回 `{id, name, size, extension, mime_type, created_by, created_at, preview_url}`。
- **不写 Document 表、不进数据集、不建解析任务**。唯一的校验是 `check_doc_health`，只检查文件名长度和可选的文件数上限：[ragflow-src/api/db/services/document_service.py#L120-L128](../ragflow-src/api/db/services/document_service.py#L120-L128)。
- 大小上限：请求体受 `MAX_CONTENT_LENGTH` 限制，默认 1 GiB（[ragflow-src/api/apps/__init__.py#L81](../ragflow-src/api/apps/__init__.py#L81)）。**等于没有实际限制，大小要在我们这边卡。**
- 官方文档有记录：[ragflow-src/docs/references/http_api_reference.md#L7022-L7100](../ragflow-src/docs/references/http_api_reference.md#L7022-L7100)。

### 1.3 解析：同步，在 completion 请求里现场做

- `get_files_content(messages[-1], …)` 只取**最后一条消息**的 `files`：[ragflow-src/api/db/services/dialog_service.py#L399-L409](../ragflow-src/api/db/services/dialog_service.py#L399-L409)。
- 往下调用 `FileService.get_files` → `FileService.parse`，用 5 个线程并发解析：[ragflow-src/api/db/services/file_service.py#L911-L932](../ragflow-src/api/db/services/file_service.py#L911-L932)。
- `parse` 的固定参数（[ragflow-src/api/db/services/file_service.py#L708-L721](../ragflow-src/api/db/services/file_service.py#L708-L721)）：
  - `layout_recognize="Plain Text"`：PDF 走 PlainParser 纯文本抽取（[ragflow-src/rag/app/naive.py#L158-L163](../ragflow-src/rag/app/naive.py#L158-L163)），**不做 DeepDOC 版面分析、不做 OCR，扫描件 PDF 抽出来是空的**。
  - `chunk_token_num=16096`，最后把所有 chunk **全文拼接**，格式为 `\n -----------------\nFile: {filename}\nContent as following: \n…`。
  - ppt/pptx 走 presentation 解析器，其余走 naive。
- 各格式的支持情况（naive 按扩展名分派，[ragflow-src/rag/app/naive.py#L1063-L1312](../ragflow-src/rag/app/naive.py#L1063-L1312)）：

  | 格式 | 解析路径 | 离线环境风险 |
  |---|---|---|
  | pdf | PlainParser | 扫描件无文字 |
  | docx | naive Docx（[#L1063](../ragflow-src/rag/app/naive.py#L1063)） | 与入库同一个 DocxParser，会丢表格里的数字（见 DocxPreprocessService 注释） |
  | pptx | python-pptx（[ragflow-src/rag/app/presentation.py#L141-L153](../ragflow-src/rag/app/presentation.py#L141-L153)） | — |
  | **ppt** | python-pptx 读不了，失败后回退到 tika（[presentation.py#L154-L160](../ragflow-src/rag/app/presentation.py#L154-L160)） | **tika 依赖 Java 服务，离线环境大概率不可用** |
  | **doc** | 只能用 tika（[naive.py#L1289-L1300](../ragflow-src/rag/app/naive.py#L1289-L1300)） | 同上 |
  | md / html / txt | [#L1208](../ragflow-src/rag/app/naive.py#L1208) / [#L1265](../ragflow-src/rag/app/naive.py#L1265) / [#L1201](../ragflow-src/rag/app/naive.py#L1201) | — |
  | 其它 | 抛 `NotImplementedError`（[#L1312](../ragflow-src/rag/app/naive.py#L1312)） | **异常会让整轮回答变成 `**ERROR**`**（[chat_api.py#L1387-L1389](../ragflow-src/api/apps/restful_apis/chat_api.py#L1387-L1389)） |

- 耗时：解析发生在 `async_chat` 里、知识库检索**之前**（[dialog_service.py#L670](../ragflow-src/api/db/services/dialog_service.py#L670)），**会直接叠加到首字延迟上**，而且在 RAGFlow API 进程里执行，不走 task executor 队列。**实测**：39 页、4.57 万字的 PDF，首字延迟从 2.75 秒增加到 7.56 秒（+4.8 秒，包括解析和更长的 prefill），上传本身只要 0.08 秒（§7 T6）。另外，**每发送一次都会重新解析一遍**（重新生成也一样），没有缓存。

### 1.4 作用范围与生命周期

- **只对本轮生效**：附件文本拼在**临时构造**的 `msg` 列表上（[dialog_service.py#L866-L869](../ragflow-src/api/db/services/dialog_service.py#L866-L869)），不回写到会话。会话历史里只保存消息上的 `files` 元数据（[chat_api.py#L1286](../ragflow-src/api/apps/restful_apis/chat_api.py#L1286)）。下一轮 `get_files_content` 只看最后一条消息，所以用户追问「那第二章呢」时，**LLM 已经看不到附件原文**，只能看到上一轮自己的回答。**实测后果比「答不上来」更糟**：第二轮问附件里的负责人（上一轮回答里没提到），模型没有说不知道，而是**编了一个名字**（附件写的是「李青松」，模型答「张伟」，§7 T5）。
- **不参与检索**：检索用的 `questions` 取自原始 `messages[].content`（[dialog_service.py#L650](../ragflow-src/api/db/services/dialog_service.py#L650)），这时附件还没拼进去。检索范围始终是 `dialog.kb_ids`（[dialog_service.py#L790-L794](../ragflow-src/api/db/services/dialog_service.py#L790-L794)）。**不会串到知识库，也不会污染检索。**
- **清理**：
  - 删会话会顺带删掉消息里引用过的 blob：[chat_api.py#L965-L977](../ragflow-src/api/apps/restful_apis/chat_api.py#L965-L977)。
  - 删助手（[chat_api.py#L764-L822](../ragflow-src/api/apps/restful_apis/chat_api.py#L764-L822)）和删单条消息（[#L993-L1016](../ragflow-src/api/apps/restful_apis/chat_api.py#L993-L1016)）**都不清理 blob**。
  - **上传了但没发送的文件**没有任何接口能删，会一直留在 RAGFlow 的 MinIO 里。

## 2. RESTful API 在 completions 里怎么带文件

`POST /api/v1/chat/completions`（[chat_api.py#L1233](../ragflow-src/api/apps/restful_apis/chat_api.py#L1233)）支持两种写法：

```jsonc
// 写法 A：沿用我们现在的 question 形态，加一个顶层 files
// 见 chat_api.py#L242-L253：question 存在时，自动构造 messages 并挂上 req["files"]
{
  "chat_id": "...", "session_id": "...", "stream": true,
  "question": "这份报告的覆盖次数是多少？",
  "files": [ { "id": "...", "name": "a.pdf", "mime_type": "application/pdf", "created_by": "<tenant_id>", ... } ]
}

// 写法 B：RAGFlow 自家前端的形态，files 挂在最后一条 message 上
{ "chat_id": "...", "session_id": "...", "messages": [ { "role": "user", "content": "...", "files": [ ... ] } ] }
```

- `files` 的元素**就是上传接口返回的对象**。RAGFlow 真正读取的字段是 `id`、`name`、`mime_type`、`created_by`（[file_service.py#L916-L929](../ragflow-src/api/db/services/file_service.py#L916-L929)）。
- ⚠️ **`created_by` 决定从哪个桶取文件**（`{created_by}-downloads`），而这个值来自请求体。RAGFlow 这一侧没有校验文件归属。我们所有用户共用同一个 API Key，也就是同一个 RAGFlow 租户，**所以在 RAGFlow 这一层，我们的用户之间完全没有隔离**。**绝对不能把前端传来的 `files` 直接透传**，必须由服务端查自己的归属表后再组装。
- 顶层的 `files` 还会随 `**req` 传进 `async_chat` 的 kwargs，在 `prompt_config["system"].format(**kwargs)` 里被当作多余参数忽略，没有副作用（[dialog_service.py#L858](../ragflow-src/api/db/services/dialog_service.py#L858)）。
- 官方文档里 chat completions 的参数列表**没有 `files`**（[http_api_reference.md#L4168-L4185](../ragflow-src/docs/references/http_api_reference.md#L4168-L4185)），agent completions 的有（[#L4721](../ragflow-src/docs/references/http_api_reference.md#L4721)）。

### 2.1 两个会直接影响效果的坑

**坑 1：空召回短路，附件会被无视（已实测复现）。** 如果知识库检索没有命中，并且助手配置了 `empty_response`，RAGFlow 会直接返回这句空回复，**根本不调 LLM**（[dialog_service.py#L836-L843](../ragflow-src/api/db/services/dialog_service.py#L836-L843)）。我们的知识库助手默认 `empty_response = '知识库中未找到您要的答案！'`（[assistant.service.ts#L51](../apps/server/src/modules/assistant/assistant.service.ts#L51)、[#L201-L203](../apps/server/src/modules/assistant/assistant.service.ts#L201-L203)），相似度阈值是 0.2。

实测（§7 T2 / T9）：附件是一份菜单时，问「附件菜单里周三午餐是什么？」，检索还能召回 8 个不相关的片段，所以正常作答；但「周三吃什么」「hello」和英文提问都召回 0 个片段，**直接返回空回复**。把 `empty_response` 置空后，同样的问题都能用附件正确作答（T10）。

**坑 2：附件内容被标成知识库引用（已实测复现）。** 线上助手用的提示词是 DTO 默认值 `DEFAULT_ASSISTANT_SYSTEM_PROMPT`（[assistant.defaults.ts#L72](../apps/server/src/common/defaults/assistant.defaults.ts#L72)，由 [assistant.dto.ts#L145](../apps/server/src/modules/assistant/assistant.dto.ts#L145) 引用），**不是** service 里的 `KB_CHAT_PROMPT`。它要求回答时标注 `[ID:n]`，但附件没有 ID。实测里模型的做法是：
- 把附件内容标成 `[ID:0]`，这个 ID 实际指向一个不相关报告的知识库片段，**前端「参考资料」就会显示一篇毫不相干的报告**；
- 或者自造 `[ID: k77]` 这类非法格式。

原先担心的「第 5 条会让模型拒绝使用附件」，在测试模型上**没有出现**。但线上用的是 Qwen3.6-27B，这一点仍需要在线上模型上复测。

处理办法：在提示词里说明「用户消息里 `File: … Content as following:` 之后的内容是用户上传的附件，可以作为依据；**引用附件时写「（附件：文件名）」，不要标 `[ID:n]`**」。**提示词存在每个助手自己的配置里，改完默认值还要 PUT 一次现役的物探智问助手。**

### 2.2 上下文长度

- 附件全文拼接后，整组消息过一次 `message_fit_in(msg, max_tokens * 0.95)`（[dialog_service.py#L870](../ragflow-src/api/db/services/dialog_service.py#L870)）。这里的 `max_tokens` 是模型在 RAGFlow 里登记的上下文长度，我们部署时登记的是 `CHAT_MAX_TOKENS=262144`（[deploy/ragflow/bootstrap.sh#L29](../deploy/ragflow/bootstrap.sh#L29)）。
- 超长时的截断策略（[ragflow-src/rag/prompts/generator.py#L69-L135](../ragflow-src/rag/prompts/generator.py#L69-L135)）：
  1. 先丢掉全部历史消息，只留 system 和最后一条 user；
  2. 还放不下时：如果 system（含知识库片段）占比超过 80%，就优先保住 user（问题 + 附件），**知识库片段被截断**；否则保住 system，**截掉附件尾部**。问题本身在消息开头，不会被截掉。
- 输出预算会被压缩：`gen_conf["max_tokens"] = min(设定值, 上下文 - 已用)`（[dialog_service.py#L877](../ragflow-src/api/db/services/dialog_service.py#L877)）。附件越大，能生成的回答越短。
- token 用 tiktoken 计数（[generator.py#L74-L86](../ragflow-src/rag/prompts/generator.py#L74-L86)），和 Qwen 的分词器口径不同，而且 vLLM 的真实 `max_model_len` 必须 ≥ 登记值，否则请求会被模型服务拒绝。**所以我们这边应该自己卡一个明显更小的上限**，建议附件文本合计不超过约 6 万字（先按经验定，上线前用真实文档实测后再调）。

## 3. 我们这边的接入点

现状：[assistant.service.ts#L118-L180](../apps/server/src/modules/assistant/assistant.service.ts#L118-L180) 的 `completions` 只透传 `question / session_id / stream / user_id`。流式响应走 [ragflow.service.ts#L254-L278](../apps/server/src/common/ragflow/ragflow.service.ts#L254-L278) 的 `requestStream`，然后原样 pipe 给前端。

| 位置 | 改动 |
|---|---|
| `prisma/models/` | 新增 `AssistantAttachment`：`fileId`（RAGFlow 返回的 id）、`assistantId`、`sessionId`、`userId`、`name`、`mimeType`、`size`、`createdBy`（RAGFlow tenant）、`createdAt` |
| `assistant.controller.ts` | 新增 `POST :id/sessions/:sessionId/attachments`，用 `FileInterceptor('file')`，扩展名/MIME 白名单 + 大小上限，写法参照 [knowledge-base.controller.ts#L337-L380](../apps/server/src/modules/knowledge-base/knowledge-base.controller.ts#L337-L380) |
| `assistant.service.ts` | `uploadAttachment`：先 `assertCanView` + `assertOwnsSession`，再 `docxPreprocess.preprocessFiles`（docx 转 md，顺带绕开 DocxParser 丢数字的问题，见 [docx-preprocess.service.ts#L79-L89](../apps/server/src/common/docx-preprocess/docx-preprocess.service.ts#L79-L89)），然后 `ragflow.uploadFile('/api/v1/documents/upload', form)`，最后落库 |
| `assistant.service.ts#completions` | 按 `dto.attachmentIds` 查 `AssistantAttachment`，条件是 `userId = 当前用户 AND sessionId = dto.sessionId`，数量对不上就返回 403。**在服务端组装 `files`**，流式和非流式两个分支都要加 |
| `assistant.dto.ts` | `CreateCompletionsDto` 加 `attachmentIds?: string[]`（`@ArrayMaxSize(5)`） |
| `common/ragflow` | **不用改**，`uploadFile` / `requestStream` 已经够用 |
| `assistant.module.ts` | 引入 `DocxPreprocessModule` |
| 提示词与空回复 | 见 §2.1 |
| 前端 `components/chat/ChatPanel.vue`、`composables/useChat.ts`、`api/assistant.ts` | 上传按钮、附件标签（可删除）、发送时带 `attachmentIds`；历史消息里展示 `files`（RAGFlow 会话列表本身就带这个字段）。之后重跑 `pnpm -F @sinopec-kb/client openapi` |

## 4. 备选方案对比

原生方案可行，下面两个方案只作对照。

| 维度 | ① 原生 `files`（推荐） | ② 我们自己解析、拼进 question | ③ 每个会话建临时数据集 |
|---|---|---|---|
| 隔离性 | 靠我们的归属表。RAGFlow 层不隔离（§2），但附件不进任何数据集，**不会串到知识库** | 同 ①，而且文件不出我们的服务 | **差**。chat 的检索范围是助手级的 `kb_ids`（[dialog_service.py#L794](../ragflow-src/api/db/services/dialog_service.py#L794)），completions **不能按请求换数据集**，`doc_ids` 也只能在 `kb_ids` 内部缩小范围（[#L654-L657](../ragflow-src/api/db/services/dialog_service.py#L654-L657)）。要做只能**每个会话再建一个临时助手**，或者改共享助手（这样会串到所有用户） |
| 延迟 | 上传只存文件，很快。每轮同步解析，叠加到首字延迟上（39 页 PDF 实测 +4.8 秒） | 上传时解析一次，发送时没有额外开销 | **分钟级**。要走 `POST /datasets/{id}/chunks` → `queue_tasks` 异步入队（[chunk_api.py#L197-L258](../ragflow-src/api/apps/restful_apis/chunk_api.py#L197-L258)），与管理员入库共用 task executor，再加 embedding，前端还得轮询 |
| 解析质量 | Plain Text，不 OCR；docx 可以先经 pandoc 转 md | pandoc 能读 docx/html/md，**不能读 pdf**；本机 2.17 也**不能读 pptx**（生产 alpine 镜像的版本没核）。pdf/pptx 都要新增依赖，`node_modules` 里目前没有 | 可以用完整的 DeepDOC，质量最好 |
| 清理成本 | 删会话时自动清理已发送的附件。没发送的和删助手留下的是孤儿文件，占空间但不会泄露 | 零（不用存；要存也只在我们自己库里） | 高。数据集、临时助手、ES 索引三处都要删，删失败就是孤儿数据集 |
| 上下文风险 | 由 RAGFlow 的 `message_fit_in` 兜底，但我们自己也要卡上限（§2.2） | 完全由我们控制，但要自己估 token，历史消息也要自己截断 | 最低，只召回 top_n 个片段。代价是「总结全文」这类问题答不好 |
| 多轮追问 | 附件只对本轮生效 | 同 ① | 会话期间一直有效 |
| 工作量 | 3～4 人日 | 4～6 人日（主要花在 pdf/pptx 解析依赖和截断逻辑上） | 6～8 人日以上 |

## 5. 版本差异与验证状态

| 结论 | v0.27.1 | v0.26.4 |
|---|---|---|
| 上传接口 `POST /api/v1/documents/upload` | 静态 + **本机实测** | 静态：同路由，`document_api.py#L107` |
| completions 支持 `question + files` | 静态 + **本机实测** | 静态：同逻辑，`chat_api.py#L221-L222` |
| completions 的入口函数 | `rag_agent`，`reasoning` 为 0 时转给 `async_chat`（[dialog_service.py#L1995-L2002](../ragflow-src/api/db/services/dialog_service.py#L1995-L2002)） | 直接调 `async_chat` |
| **附件注入位置** | **拼到最后一条 user 消息末尾**（[dialog_service.py#L868-L869](../ragflow-src/api/db/services/dialog_service.py#L868-L869)） | **拼到 system 提示词末尾**（v0.26.4 `dialog_service.py#L777`） |
| `message_fit_in` 截断策略 | 静态源码 | 静态：两版之间这个函数没有改动 |
| 空召回短路 | 有（**本机实测复现**） | 有（静态） |

- 注入位置不同，会影响 §2.2 里「超长时截谁」的结果，也会影响模型把附件当成「指令」还是「用户材料」来对待。**所以效果评估必须在 v0.27.1 上做，不能拿本机 v0.26.4 的结果代替。**
- 上表中 v0.27.1 一列的上传、`question + files`、空召回短路三项，已经在本机 v0.27.1 实例上实测确认（§7）。v0.26.4 一列仍是纯静态结论：做冒烟时本机实例已经没有 v0.26.4 的镜像了。

## 6. 推荐方案与工作量

**推荐方案 ①：原生 `files`，由我们后端代理上传并记录归属。** 理由：RAGFlow 已经把解析、拼接、截断、随会话清理都做完了，我们只需要补上 RAGFlow 缺的那一块：**用户间隔离**。附件不进数据集，从机制上就不会串到知识库。

### 6.1 已定决策（2026-09-29）

| # | 问题 | 决定 | 备选（未采纳） | 依据 |
|---|---|---|---|---|
| D1 | 知识库空召回时附件被忽略（§2.1 坑 1） | 把物探智问助手的 `empty_response` **置空**，交给提示词第 5 条「不知道就说不知道」兜底 | 保持现状，接受「附件问题在知识库没命中时答不了」 | 实测置空后可以用附件作答（§7 T10）。代价：没命中的问题也会走一次 LLM，回复措辞不再固定 |
| D2 | 追问时模型编造附件内容（§1.4） | 附件**只对本轮生效**。前端在附件标签旁提示「附件仅用于本次提问，追问请重新附上」；提示词要求「本轮消息没有附件时，不要回答附件细节」 | 后端给后续提问自动带上最近一次的附件（每轮多几秒，+0.5 人日） | 和需求「参与本轮回答」一致。**提示词约束能不能管住线上模型，还要验证** |
| D3 | 格式白名单 | 只收 `pdf / docx / pptx / md / html / txt`。`doc` / `ppt` 前端提示「请另存为 docx / pptx」 | 放开 `doc` / `ppt` | 离线环境下 tika 大概率不可用（§1.3），不支持的格式会让整轮回答报错（§7 T7） |

工作量（1 人）：

| 项 | 人日 |
|---|---|
| 后端：归属表 + 迁移、上传端点（白名单/大小/docx 预处理）、completions 组装 `files` 与鉴权、单测 | 1.5 |
| 前端：上传交互、附件标签、历史消息展示、openapi 重新生成 | 1～1.5 |
| 提示词调整（附件出处写法、D2 追问约束）+ 现役助手 PUT（含 D1 置空）+ 在 v0.27.1 + Qwen3.6-27B 上用真实报告做效果验证（含首字延迟、超长截断、T4/T5 复测） | 0.5～1 |
| **合计** | **3～4** |

有意不做的：
- 上传后没发送的孤儿文件：前端在「点发送」时才上传，把孤儿限制在 completion 失败这一种情况。孤儿量成为问题时，再加一个按 `AssistantAttachment` 表对账的定时清理。
- 附件在多轮对话中持续生效：需求只要求「参与本轮回答」。需要时再考虑在后续轮次重新带上 `files`，代价是每轮重新解析一次。
- 扫描件 OCR：Plain Text 路径不支持。真有需求时再评估方案 ③ 或走 DeepDOC。

## 7. 本机实测（v0.27.1）

- **环境**：本机 docker，`infiniflow/ragflow:v0.27.1`，:59380。做测试时，原来的 v0.26.4 实例已被删除、镜像也不在了；本次沿用 v0.26.4 留下的数据卷，**升级到 v0.27.1 后起栈**，起栈前先把 4 个卷备份到了本次 session 的 scratchpad。
- **模型**：`Qwen/Qwen3-30B-A3B-Instruct-2507@siliconflow`（选它是因为不开思考、响应快）。**线上用的是 Qwen3.6-27B**，所以涉及模型行为的结论（T4、T5）需要在线上模型上复测。
- **知识库**：本机「测试知识库」，6 篇顺北 / 中 21 等报告。KB 助手用的是线上同款 `DEFAULT_ASSISTANT_SYSTEM_PROMPT`，相似度阈值 0.2，top_n 30，不开 rerank。
- **测试助手**：3 个（无知识库；有知识库且带空回复；有知识库且不带空回复），测完连同会话一起删除。
- **脚本**：session scratchpad 下的 `smoke/run.py`。

| 编号 | 场景 | 结果 |
|---|---|---|
| 上传 | `POST /api/v1/documents/upload`，md / pdf / xyz | 0.01～0.08 秒，返回结构与 §1.2 一致。`created_by` = API Key 所属租户 |
| T1 | 无知识库，附虚构的 K-77 简报，问炮数和道距 | ✅ 答出 43210 炮 / 17.5 m |
| T5 | T1 同一会话，不带附件追问负责人 | ❌ **编造答案**：答「张伟」，附件里写的是「李青松」 |
| T2 | KB + 空回复，附菜单，问「附件菜单里周三午餐是什么？」 | 检索召回 8 个不相关片段，没有短路；答对了，但标成 `[ID:0]`，指向一篇不相关报告的片段 |
| T9 | 同 T2，问「周三吃什么」「hello」和英文总结 | ❌ 召回 0 个片段，**全部返回「知识库中未找到您要的答案！」** |
| T10 | KB，空回复置空，问 T9 里的两个问题 | ✅ 都用附件正确作答 |
| T3 | 同 T2，但空回复置空 | 与 T2 相同 |
| T4 | KB，空回复置空，附 K-77 问炮数 | 答对 43210，但引用写成非法的 `[ID: k77]`；首字 14.9 秒（召回 30 个片段，prompt 较长） |
| T7 | 附 `.xyz` | ❌ 0.03 秒内返回 `**ERROR**: file type not supported yet…`，整轮失败 |
| T6 | 无知识库，问顺北 42 报告的坐标系；不带附件 vs 带 39 页、4.57 万字的原报告 PDF | 首字 2.75 秒 → **7.56 秒**。不带附件时模型编了「CGCS2000」；带附件后答对「1954 北京坐标系、6° 带」，并引用了原文 |
| T8 | 删除 T1 会话后检查对象存储 | ✅ 已发送附件的 blob：存在 → **已删除**；上传后没发送的 blob：**仍然存在**（孤儿） |
