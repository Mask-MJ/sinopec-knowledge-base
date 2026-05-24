import type { KnowledgeBaseInfo } from '@/api/knowledgeBase';

import { getKnowledgeBaseList } from '@/api/knowledgeBase';

/**
 * 获取知识库列表并转换为下拉选项
 * 仅返回已同步到 RAGFlow 的知识库（有 datasetId 的）
 */
export function useKnowledgeBaseOptions() {
  const loading = ref(false);
  const knowledgeBaseList = ref<KnowledgeBaseInfo[]>([]);

  const options = computed(() =>
    knowledgeBaseList.value
      .filter((item) => item.datasetId)
      .map((item) => ({
        label: item.name,
        value: item.datasetId as string,
      })),
  );

  async function fetchKnowledgeBaseList() {
    loading.value = true;
    try {
      const { data } = await getKnowledgeBaseList({ pageSize: 999 });
      knowledgeBaseList.value = data?.list ?? [];
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[useKnowledgeBaseOptions] fetch failed', error);
      }
      knowledgeBaseList.value = [];
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchKnowledgeBaseList);

  return { loading, options, fetchKnowledgeBaseList };
}
