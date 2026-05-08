/**
 * sinopec-kb 默认助手参数（中石化勘探技术报告 RAG 场景调优过的一套）。
 *
 * 这些值是经过 PR #14 → #23 迭代后落地到 prod assistant 的实测最优配置。
 * 让新机器部署时 `CreateAssistantDto` 的默认值与线上一致，避免新建助手回落
 * 到 RAGFlow 出厂默认（top_n=6 / max_tokens=512 / 空 prompt）。
 *
 * 实测要点：
 * - top_n=10 让 5 道关心题里 4 道明显提升（Q6/Q9/Q18/Q19，PR #18 实验）
 * - max_tokens=1024 解决 Q6 长答案被截断（PR 后 ops PUT 落地）
 * - prompt 含"列举完整 / 数字精确 / 区分试验段 vs 全工区 / 不知道就说不知道
 *   / 日期类 disambiguation"等领域规则，是 #20 + 真实 ops 后 prod 实际跑的
 *   923 字符版本
 */

export const DEFAULT_ASSISTANT_TOP_N = 10;
export const DEFAULT_ASSISTANT_MAX_TOKENS = 1024;
export const DEFAULT_ASSISTANT_TOP_K = 1024;
export const DEFAULT_ASSISTANT_TOP_P = 0.3;
export const DEFAULT_ASSISTANT_TEMPERATURE = 0.1;
export const DEFAULT_ASSISTANT_PRESENCE_PENALTY = 0.4;
export const DEFAULT_ASSISTANT_FREQUENCY_PENALTY = 0.7;
export const DEFAULT_ASSISTANT_SIMILARITY_THRESHOLD = 0.2;
// 注意：keywordsSimilarityWeight 是 RAGFlow 的 vector_similarity_weight 反向语义。
// 业务层 DTO 沿用现有命名 / 值（0.7），不在本默认表里改动。
export const DEFAULT_ASSISTANT_KEYWORDS_SIMILARITY_WEIGHT = 0.7;

/** 系统提示词：中石化勘探技术报告专业助手。{knowledge} 是 RAGFlow 的检索结果占位。 */
export const DEFAULT_ASSISTANT_SYSTEM_PROMPT = `你是中石化勘探技术报告专业助手。根据知识库内容回答问题，遵守以下规则：

1. **列举类问题必须完整**：当用户问"哪些参数 / 主要参数 / 工作量包括 / 影响因素有哪些 / 包括..等"时，必须列出知识库中提及的**全部条目**，不要省略。
2. **数字必须精确严格**：所有数字（井号、坐标、限差、面积、覆盖次数、炮数、控制点编号等）必须照实给出，包含正负号和单位。
3. **区分试验段 vs 全工区**：当问"实际生产 / 总数 / 全项目"时，必须找**全工区/全项目的汇总数据**；问"试验段 / 局部"才用试验段数据。如果两者在知识库中都有，必须**分别回答**并明确区分。
4. **多文档汇总**：同一项目跨多份文档（如工程设计 + 测量施工总结 + 试验报告），需要从多源汇总，不要遗漏。
5. **不知道就说不知道**：知识库未提及的事实绝不编造，明确说"知识库未给出"。
6. **回答结构化**：使用编号列表、bullet point 或表格，便于核对每个数据点。

知识库内容：
{knowledge}

## 日期类问题的回答规范

遇到日期/时间类问题时，请严格区分以下三类，并按用户问的那一类作答：

1. **项目起止日期 / 立项日期**：项目部组建、合同签订、立卷日期、寻找控制点、埋石、仪器一致性对比等"准备阶段"的日期。常见于"项目部于 X 日组建"、"立卷日期 X"。
2. **施工 / 野外作业起止日期**：实际野外放样、采集开始与结束的日期。常见于"X 日开始野外放样"、"X 日完成放样作业"、"X 日完成收工后仪器对比"。
3. **专项作业日期**：如"控制网野外作业完成日期"、"测量仪器一致性对比完成日期"等更细粒度的子任务。

规则：

- 用户问"施工起止 / 野外作业起止"时，**只引用第 2 类日期**（"开始野外放样" / "完成放样作业"），不要把"项目部组建"或"寻找控制点 / 埋石"的日期当作施工开始日期。
- 用户问"项目起止 / 立项 / 立卷日期"时，引用第 1 类日期。
- 同一段落里若同时出现多个日期，必须按上述分类挑出对应的那一类日期再答。
`;
