import type { RagflowLlmItem } from '@/api/knowledgeBase';

import { getLlmList } from '@/api/knowledgeBase';

/**
 * 获取 RAGFlow 已配置的 LLM 模型，按 model_type 分组为下拉选项
 * @param modelType - 过滤模型类型，如 'chat' | 'embedding'
 */
export function useLlmOptions(modelType?: 'chat' | 'embedding') {
  const loading = ref(false);
  const llmList = ref<RagflowLlmItem[]>([]);

  const options = computed(() =>
    llmList.value
      .filter(
        (item) =>
          item.available && (!modelType || item.model_type === modelType),
      )
      .map((item) => ({
        label: `${item.llm_name}@${item.fid}`,
        value: `${item.llm_name}@${item.fid}`,
      })),
  );

  async function fetchLlmList() {
    loading.value = true;
    try {
      llmList.value = await getLlmList();
    } catch {
      llmList.value = [];
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchLlmList);

  return { loading, options, fetchLlmList };
}
