# 中石化知识库项目 — 5 月周报

---

## 第 13 周（4/29 ~ 5/5）：RAG 评测体系搭建与 SSE 链路稳定性

### 本周工作内容

1. **RAG 评测体系搭建（服务端）**
   - 引入完整的 RAG evaluation harness
   - 评测 Assistant 同步逻辑保留 prompt 与 llm config
   - 生产构建排除 eval 脚本，避免污染发布产物
   - 新增 prod「测试 2」chat assistant 的评测配置

2. **SSE 流式链路稳定性修复**
   - 服务端：去掉 Transform 中间层，透明转发 RAGFlow SSE
   - 客户端：流关闭时 flush 残余 buffer，使用 MutationObserver 渲染引用 chip
   - 部署：nginx `/api/` 关闭 buffering，解决 SSE 卡顿
   - session message schema 暴露 RAGFlow reference 字段
   - 历史会话恢复时保留 citation 引用

3. **Assistant 与权限基础能力**
   - 助手默认模型支持配置化
   - seed 权限与已部署库菜单权限对齐，admin 密码加固
   - 应用更名为「物探大模型」

4. **Prompt 优化**
   - 默认 KB prompt 针对中石化勘探报告场景强化

### 下周工作计划

- Chat 引用链路收尾 + 知识库分块方式字典化 + 文档预处理

### 备注

- 无

---

## 第 14/15 周（5/6 ~ 5/19）：分块方式字典化、docx 预处理与评测迭代

### 本周工作内容

1. **知识库分块方式字典化**
   - 服务端：新增分块方式字典种子 + 幂等同步逻辑
   - 客户端：分块方式下拉改字典驱动，修复 `parserConfig` 字段名与 DTO 不一致
   - 新增 Playwright UI E2E 对比不同 chunk-method 表现

2. **docx 文档预处理**
   - 上传时通过 pandoc 将 docx 预处理为 md，提升 RAG 召回质量
   - 评测数据集 Q9 / Q14 / Q18 的 ground truth 与 docx 实际内容对齐

3. **Chat 引用与会话体验修复**
   - 历史会话引用 popover 恢复，停止空响应污染
   - 用户头像白底处理 + 移除多余 opener 引用
   - SSE 引用对象在 `structuredClone` 前先 `toRaw`，避免 Proxy 报错
   - RAGFlow reference index 修复 off-by-one 合并 bug

4. **评测体系迭代**
   - docx→md 迁移后完整重跑评测
   - LLM Judge 改为 N 次复评取平均，降低评分波动
   - prod-v2 baseline `top_n` 从 6 升到 10
   - 新增 chat-eval-all-questions 业务 API 级 E2E
   - sealing sinopec-tuned assistant + KB 默认配置（资产固化）
   - Q14 prompt 消歧义草稿 + 运维同步脚本

### 下周工作计划

- 客户问题集评测 + embedding 模型 A/B 实验

### 备注

- 无

---

## 第 16 周（5/20 ~ 5/26）：客户评测集 + 前端基础设施大规模移植

### 本周工作内容

1. **客户问题集与多模型评测（5/20）**
   - 新增 0520 客户评测集（30 题）+ 补齐 Q12 reference.doc
   - 评测 runner 支持多 dataset
   - 修复评测打分中 bare-number 假阳性
   - text-embedding-v4 A/B 评测脚手架（中途放弃，留作后续）

2. **前端基础设施（5/24 ~ 5/25）**
   - **布局体系**
     - 移植 `LayoutTabs.vue`（拖拽 / 右键菜单 / 溢出 / 滚动）+ 配套 composables
     - 接入 `default.vue` 默认布局
     - `LayoutHeader` 新增全屏切换 + 偏好设置入口
     - 移植 `PreferencesDrawer`，支持实时偏好编辑 + localStorage 持久化
     - KeepAlive 缓存上限 20 个组件（`:max=20`）
   - **工具与 composables**
     - 移植 4 个 utility infra 模块 + format/currency 工具
     - 移植 `useFormLoading` / `useEditLoading`，统一错误策略
     - latest-request-guard（防过期响应覆盖最新结果）
     - `ApiError` 类导出，错误 toast 去重
     - `useDateRangeShortcuts` 修正以 `maxDate` 为基准做减法
   - **权限 / 错误体验**
     - 权限初始化失败时 loadingBar 暴露 error 状态
     - 无权限时 fallback 到首个可访问菜单（替代 403）
     - `changePassword` 401 不触发 token refresh
     - 401 通知所有订阅者，避免并发请求漏刷
     - iOS 下载 fallback 用 toast 替代 console
     - catch 块改为日志输出，不再静默吞错
   - **TableAction 与版本检查**
     - `TableAction` 新增下拉菜单 + 确认对话框
     - 客户端版本检查：更新提示 + 午夜自动刷新

3. **OpenAPI Spec 分模块（5/25）**
   - 服务端按模块拆分 Swagger spec，提供全量 spec 切换器
   - 客户端消费分模块 spec，tree-shake 友好

4. **Assistant 默认模型自动识别（5/25）**
   - 从 RAGFlow `/v1/llm/list` 自动解析默认 chat model
   - 替代手工硬编码配置

5. **部署修复（5/25）**
   - Dockerfile Alpine 镜像换清华源，解决国内 `apk add` 卡死
   - 忽略本地 `.worktrees/`，支持并行 agent 开发

### 备注

- 本周共约 60 个 commit，集中在 5/24 ~ 5/25，前端基础设施移植已基本完成

---

## 月度统计

| 类型         |   数量 |
| ------------ | -----: |
| `fix`        |     32 |
| `feat`       |     25 |
| `chore`      |     17 |
| `style`      |      8 |
| `refactor`   |      2 |
| Merge / 其他 |     12 |
| **合计**     | **96** |

## 月度关键里程碑

- ✅ RAG 评测体系建成，可量化对比 prompt / embedding / top_n 等变量
- ✅ Chat 引用链路修复完成，SSE 全链路稳定
- ✅ 知识库分块方式字典化、docx 预处理上线
- ✅ 前端基础设施从 data-hub 迁移完成（布局 / 工具 / 权限错误处理 / 版本检查）
- ✅ Swagger 按模块拆分，前端 API 类型 tree-shake 友好
- ✅ 应用更名为「物探大模型」，Dockerfile 国内镜像源修复
