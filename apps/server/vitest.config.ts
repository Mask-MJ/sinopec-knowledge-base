import { mergeConfig } from 'vitest/config';

import { baseConfig } from './vitest.base';

export default mergeConfig(baseConfig, {
  test: {
    exclude: ['dist/**', 'node_modules/**'],
  },
});
