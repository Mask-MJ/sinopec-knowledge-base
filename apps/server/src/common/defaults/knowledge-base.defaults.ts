/**
 * sinopec-kb 默认知识库 parser_config（中石化勘探技术报告 docx → naive 切片场景）。
 *
 * 让新机器部署时新建 KB 自动启用与 prod KB 一致的解析参数：
 * - layout_recognize=DeepDOC 比 Plain Text 多保留表格结构
 * - chunk_token_num=512 / delimiter='\n' 是 PR #18 实验实测最佳点
 * - raptor 与 graphrag 默认 OFF：这俩在内存紧张机器（< 32 GB）会触发 OOM。
 *   prod 上是手工开启的，新机器要不要开取决于内存规格；想全开请通过 env
 *   `KB_DEFAULT_RAPTOR=1` / `KB_DEFAULT_GRAPHRAG=1` 显式打开。
 */
import process from 'node:process';

const RAPTOR_ON = process.env.KB_DEFAULT_RAPTOR === '1';
const GRAPHRAG_ON = process.env.KB_DEFAULT_GRAPHRAG === '1';

export const DEFAULT_KB_PARSER_CONFIG = {
  layout_recognize: 'DeepDOC',
  chunk_token_num: 512,
  delimiter: '\n',
  raptor: {
    use_raptor: RAPTOR_ON,
    prompt:
      'Please summarize the following paragraphs. Be careful with the numbers, do not make things up. Paragraphs as following:\n      {cluster_content}\nThe above is the content you need to summarize.',
    max_token: 256,
    threshold: 0.1,
    max_cluster: 64,
    random_seed: 0,
  },
  graphrag: {
    use_graphrag: GRAPHRAG_ON,
    entity_types: ['organization', 'person', 'geo', 'event', 'category'],
    method: 'light',
  },
} as const;
