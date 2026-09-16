import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // core/ 是纯逻辑，不需要 DOM：测试跑在 node 环境
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
