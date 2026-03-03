import type { Assistant } from '@prisma/generated/client';

export class AssistantEntity implements Assistant {
  assistantId: null | string;
  avatar: null | string;
  createdAt: Date;
  description: null | string;
  emptyResponse: null | string;
  frequencyPenalty: number;
  id: number;
  keywordsSimilarityWeight: number;
  maxTokens: number;
  modelName: string;
  name: string;
  opener: null | string;
  presencePenalty: number;
  prompt: null | string;
  similarityThreshold: number;
  temperature: number;
  topK: number;
  topN: number;
  topP: number;
  updatedAt: Date;
  userId: number;
}

export class SessionEntity {
  chatId: string;
  createDate: string;
  id: string;
  messages: {
    content: string;
    role: string;
  }[];
  name: string;
  updateDate: string;
}
