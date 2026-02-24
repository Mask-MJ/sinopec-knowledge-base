// ERP 模块 Mock 工厂函数（占位）
// TODO: 根据实际 ERP 模块 DTO 实现

export const createMockBuyer = (overrides?: Record<string, any>) => ({
  id: 1,
  name: 'Test Buyer',
  ...overrides,
});

export const createMockCreateBuyerDto = (overrides?: Record<string, any>) => ({
  name: 'Test Buyer',
  ...overrides,
});

export const createMockOrder = (overrides?: Record<string, any>) => ({
  id: 1,
  orderNo: 'ORD-001',
  ...overrides,
});

export const createMockCreateOrderDto = (overrides?: Record<string, any>) => ({
  orderNo: 'ORD-001',
  ...overrides,
});

export const createMockShop = (overrides?: Record<string, any>) => ({
  id: 1,
  name: 'Test Shop',
  ...overrides,
});

export const createMockCreateShopDto = (overrides?: Record<string, any>) => ({
  name: 'Test Shop',
  ...overrides,
});
