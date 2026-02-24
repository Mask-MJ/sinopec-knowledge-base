import { mergeConfig } from 'vitest/config';

import { baseConfig } from './vitest.base';

export default mergeConfig(baseConfig, {
  test: {
    include: ['**/*.e2e-spec.ts'],
  },
});
