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
 * - 开场白（第一条 user 之前的 assistant 消息）reference → drop。RAGFlow
 *   有时会把 reference 错挂到开场白上（quirk），但开场白文本里没有 [ID:N]
 *   标记，前端 ReferenceSourceList 仍会无条件渲染 doc_aggs，导致用户在
 *   "你好！我是你的助理" 下看到一堆参考来源 —— 必须在透传层丢弃。
 *
 * 该函数是纯函数，不修改入参。
 */
export function normalizeMessageReferences(
  messages: ReadonlyArray<RagflowRawMessage>,
): NormalizedMessage[] {
  let seenUser = false;
  return messages.map((msg) => {
    const { reference, ...rest } = msg;
    if (msg.role === 'user') {
      seenUser = true;
      return { ...rest };
    }
    const isOpener = msg.role === 'assistant' && !seenUser;
    if (isOpener || !reference || reference.length === 0) {
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
