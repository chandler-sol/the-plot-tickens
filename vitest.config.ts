import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: '"test"', __BUILD_TIME__: '"2026-01-01T00:00:00Z"' },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    env: { TZ: 'America/New_York' },
    testTimeout: 20000,
  },
});
