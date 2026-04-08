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

export class SessionEntity {
  /** 关联的助手聊天 ID */
  chatId: string;

  /** 创建日期 */
  createDate: string;

  /** 会话 ID */
  id: string;

  /** 消息列表 */
  messages: {
    /** 消息内容 */
    content: string;
    /** 消息角色 */
    role: string;
  }[];

  /** 会话名称 */
  name: string;

  /** 更新日期 */
  updateDate: string;
}
