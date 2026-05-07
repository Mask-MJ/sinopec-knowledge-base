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
 * 修复 RAGFlow `GET /api/v1/chats/{id}/sessions` API 的 off-by-one merge bug。
 *
 * RAGFlow `conversation` 表设计：`message` 列存消息列表，`reference` 列存引用
 * 列表（按 Q-A 轮次排，长度 = 已完成回答数 = assistant 数 - 1，开场白没引用）。
 * GET API merge 时（[ragflow/api/apps/sdk/session.py list_session()]）按顺序
 * 把 `ref[i]` 挂到第 i 个 `role != 'user'` 的 message 上，**没有跳过开场白**，
 * 导致整体错位：
 *
 *   messages[0] (开场白)   ← 被挂上 ref[0] = a1 的真实引用
 *   messages[2] (a1)       ← 被挂上 ref[1] = a2 的真实引用
 *   messages[4] (a2)       ← 被挂上 ref[2] = a3 的真实引用
 *   ...
 *   messages[2n] (a_n)     ← 没分到（ref 数组用完）
 *
 * 修复：把每条 assistant 上 RAGFlow 挂的 chunks 转移给"下一个 assistant"。
 * 开场白自己丢掉 reference；最新一条原本错位丢失的 reference 由倒数第二个
 * assistant 的 chunks 补回。
 *
 * 同时把 RAGFlow 持久化的扁平 `chunk[]` 包装成前端期望的
 * `{chunks, doc_aggs}` 形态（doc_aggs 从 chunks 按 document_id 聚合派生）。
 *
 * 该函数是纯函数，不修改入参。
 */
export function normalizeMessageReferences(
  messages: ReadonlyArray<RagflowRawMessage>,
): NormalizedMessage[] {
  const assistantIndexes: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'assistant') {
      assistantIndexes.push(i);
    }
  }

  const correctedChunksByIndex = new Map<number, RagflowChunk[]>();
  for (let k = 1; k < assistantIndexes.length; k++) {
    const prevAssistantIndex = assistantIndexes[k - 1];
    if (prevAssistantIndex === undefined) continue;
    const misplacedRef = messages[prevAssistantIndex]?.reference;
    if (misplacedRef && misplacedRef.length > 0) {
      const targetIndex = assistantIndexes[k];
      if (targetIndex !== undefined) {
        correctedChunksByIndex.set(targetIndex, misplacedRef);
      }
    }
  }

  return messages.map((msg, i) => {
    const { reference: _ignored, ...rest } = msg;
    const corrected = correctedChunksByIndex.get(i);
    if (!corrected || corrected.length === 0) {
      return { ...rest };
    }
    return { ...rest, reference: buildReferenceEntity(corrected) };
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
