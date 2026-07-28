import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'test/acceptance/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**'],
      reporter: ['text'],
    },
  },
});
