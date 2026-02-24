// Business 模块 Mock 工厂函数（占位）
// TODO: 根据实际 Business 模块 DTO 实现

export const createMockInfluencer = (overrides?: Record<string, any>) => ({
  id: 1,
  name: 'Test Influencer',
  ...overrides,
});

export const createMockCreateInfluencerDto = (
  overrides?: Record<string, any>,
) => ({
  name: 'Test Influencer',
  ...overrides,
});

export const createMockTask = (overrides?: Record<string, any>) => ({
  id: 1,
  title: 'Test Task',
  ...overrides,
});

export const createMockCreateTaskDto = (overrides?: Record<string, any>) => ({
  title: 'Test Task',
  ...overrides,
});

export const createMockShowcase = (overrides?: Record<string, any>) => ({
  id: 1,
  name: 'Test Showcase',
  ...overrides,
});

export const createMockCreateShowcaseDto = (
  overrides?: Record<string, any>,
) => ({
  name: 'Test Showcase',
  ...overrides,
});
