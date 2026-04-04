import { describe, expect, it } from 'vitest';

import { HealthService } from './health.service';

describe('HealthService', () => {
  it('should return health status with version and timestamp', () => {
    const service = new HealthService();
    const result = service.check();

    expect(result).toHaveProperty('status', 'ok');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('timestamp');
    expect(typeof result.version).toBe('string');
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
