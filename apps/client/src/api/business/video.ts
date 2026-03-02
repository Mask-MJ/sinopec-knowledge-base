import type { components, operations } from '#/openapi';

import { client } from '@/utils';

export type VideoInfo = components['schemas']['VideoEntity'];
export type VideoPerformance = components['schemas']['VideoPerformanceEntity'];
export type VideoSearchParams =
  operations['VideoController_findWithPagination']['parameters']['query'];
export type UpdateVideoDto = components['schemas']['UpdateVideoDto'];

// 获取视频列表（分页）
export function getPublishedVideos(query: VideoSearchParams) {
  return client.GET('/api/business/video', { params: { query } });
}

// 获取视频性能分析数据
export function getVideoPerformance(
  id: number,
  query?: { dateRange?: string[] },
) {
  return client.GET('/api/business/video/{id}/performance', {
    params: { path: { id }, query },
  });
}

// 修改视频信息
export function updateVideo(body: UpdateVideoDto) {
  return client.PATCH('/api/business/video/{id}', {
    body,
    params: { path: { id: body.id } },
  });
}

// 根据ID获取视频详情
// NOTE: 后端暂无 /api/business/video/{id} 单资源端点，使用列表查询代替
export function getVideoById(videoId: number) {
  return client.GET('/api/business/video', {
    params: {
      query: {
        current: 1,
        pageSize: 1, // 只需获取单个视频
        videoId,
        status: 5,
        order: 'desc',
      },
    },
  });
}
