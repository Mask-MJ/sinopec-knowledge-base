import type { KnowledgeBase } from '@prisma/generated/client';

export class KnowledgeBaseEntity implements KnowledgeBase {
  avatar: null | string;
  chunkMethod: string;
  createBy: string;
  createdAt: Date;
  datasetId: null | string;
  deptId: null | number;
  description: null | string;
  embeddingModel: string;
  id: number;
  name: string;
  order: number;
  parserConfig: KnowledgeBase['parserConfig'];
  permission: null | string;
  updateBy: null | string;
  updatedAt: Date;
}

export class DocumentEntity {
  chunkMethod: string;
  chunkNum: number;
  createDate: string;
  createdBy: string;
  createTime: number;
  datasetId: string;
  id: string;
  location: string;
  metaFields: object;
  name: string;
  parserConfig: object;
  processBeginAt: null | string;
  processDuration: number;
  progress: number;
  progressMsg: string;
  run: string;
  size: number;
  sourceType: string;
  status: string;
  suffix: string;
  thumbnail: string;
  tokenNum: number;
  type: string;
  updateDate: string;
  updateTime: number;
}

export class ChunkEntity {
  available: boolean;
  content: string;
  docnmKwd: string;
  documentId: string;
  id: string;
  imageId: string;
  importantKeywords: string[];
  positions: string[];
}
