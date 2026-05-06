import type {
  ReferenceChunkEntity,
  ReferenceDocAggEntity,
  ReferenceEntity,
} from './assistant.entity';

/** RAGFlow 持久化的 chunk 类型 = 我们的 ReferenceChunkEntity 形状一致 */
export type RagflowChunk = ReferenceChunkEntity;

/** RAGFlow GET /sessions 返回的原始 message — reference 是扁平 chunk 数组 */
export interface RagflowRawMessage {
  content: string;
  reference?: RagflowChunk[];
  role: string;
}

/** Normalize 后的 message — reference 是前端期望的 { chunks, doc_aggs } */
export interface NormalizedMessage {
  content: string;
  reference?: ReferenceEntity;
  role: string;
}

/**
 * 把 RAGFlow GET /sessions 返回的扁平 chunk 数组规范成前端期望的
 * `{ chunks, doc_aggs }` 形态。
 *
 * RAGFlow 持久化格式（实测 v0.x）：`messages[i].reference: ReferenceChunkEntity[]`
 * SSE 流式格式：`reference: { chunks, doc_aggs }`
 * 前端 `Reference` 类型按 SSE 格式建模，要让历史会话也能用同一套渲染，
 * server 在透传层做格式归一：从 chunks 按 document_id 派生 doc_aggs。
 *
 * 容错：
 * - reference 字段缺失 / 为空数组 → drop（不输出 reference 键）
 * - user 消息 → 透传不动
 *
 * 该函数是纯函数，不修改入参。
 */
export function normalizeMessageReferences(
  messages: ReadonlyArray<RagflowRawMessage>,
): NormalizedMessage[] {
  return messages.map((msg) => {
    const { reference, ...rest } = msg;
    if (!reference || reference.length === 0) {
      return { ...rest };
    }
    return { ...rest, reference: buildReferenceEntity(reference) };
  });
}

function buildReferenceEntity(chunks: RagflowChunk[]): ReferenceEntity {
  const aggMap = new Map<string, ReferenceDocAggEntity>();
  for (const c of chunks) {
    const existing = aggMap.get(c.document_id);
    if (existing) {
      existing.count += 1;
    } else {
      aggMap.set(c.document_id, {
        doc_id: c.document_id,
        doc_name: c.document_name,
        count: 1,
      });
    }
  }
  return {
    chunks: [...chunks],
    doc_aggs: [...aggMap.values()],
  };
}
