import type { Assistant } from '@prisma/generated/client';

export class AssistantEntity implements Assistant {
  /** 外部助手 ID */
  assistantId: null | string;

  /** 助手头像 URL */
  avatar: null | string;

  /** 创建时间 */
  createdAt: Date;

  /** RAGFlow 关联的数据集ID列表 */
  datasetIds: string[];

  /** 所属部门ID（仅 permission="team" 时有意义） */
  deptId: null | number;

  /** 助手描述 */
  description: null | string;

  /** 空响应返回内容 */
  emptyResponse: null | string;

  /** 频率惩罚 */
  frequencyPenalty: number;

  /** 主键 ID */
  id: number;

  /** 是否为通用助手 */
  isGeneral: boolean;

  /** 关键词相似度权重 */
  keywordsSimilarityWeight: number;

  /** 最大生成长度 */
  maxTokens: number;

  /** 聊天模型名称 */
  modelName: string;

  /** 助手名称 */
  name: string;

  /** 开场问候语 */
  opener: null | string;

  /** 访问权限：me 仅自己 / team 本部门 / public 全公司 */
  permission: string;

  /** 存在惩罚 */
  presencePenalty: number;

  /** 提示词模板 */
  prompt: null | string;

  /** 加权关键字相似度 */
  similarityThreshold: number;

  /** 温度 */
  temperature: number;

  /** 重新排序或选择前 k 个项目 */
  topK: number;

  /** 生成的回复数量 */
  topN: number;

  /** 核心采样 */
  topP: number;

  /** 更新时间 */
  updatedAt: Date;

  /** 所属用户 ID */
  userId: number;
}

/** RAGFlow 引用块（assistant 消息附带的检索片段） */
export class ReferenceChunkEntity {
  /** 块文本内容 */
  content: string;

  /** 数据集 ID */
  dataset_id: string;

  /** 文档类型 */
  doc_type: string;

  /** 文档 ID */
  document_id: string;

  /** 文档名称 */
  document_name: string;

  /** 块 ID */
  id: string;

  /** 关联图片 ID */
  image_id: string;

  /** 块在文档中的位置（页码 / 边界） */
  positions: number[][];

  /** 综合相似度（0~1） */
  similarity: number;

  /** 关键词相似度 */
  term_similarity: number;

  /** 关联资源 URL */
  url: null | string;

  /** 向量相似度 */
  vector_similarity: number;
}

/** RAGFlow 文档聚合（按文档汇总的引用次数） */
export class ReferenceDocAggEntity {
  /** 该文档被引用的块数 */
  count: number;

  /** 文档 ID */
  doc_id: string;

  /** 文档名称 */
  doc_name: string;
}

/** RAGFlow 消息引用数据（仅 assistant 消息可能携带） */
export class ReferenceEntity {
  /** 命中的引用块列表 */
  chunks: ReferenceChunkEntity[];

  /** 文档维度的聚合统计 */
  doc_aggs: ReferenceDocAggEntity[];
}

/** 会话历史中的单条消息 */
export class SessionMessageEntity {
  /** 消息内容 */
  content: string;

  /** 引用数据（assistant 消息可能包含，由 RAGFlow 在答复时返回） */
  reference?: ReferenceEntity;

  /** 消息角色 */
  role: string;
}

export class SessionEntity {
  /** 关联的助手聊天 ID */
  chatId: string;

  /** 创建日期 */
  createDate: string;

  /** 会话 ID */
  id: string;

  /** 消息列表 */
  messages: SessionMessageEntity[];

  /** 会话名称 */
  name: string;

  /** 更新日期 */
  updateDate: string;
}
