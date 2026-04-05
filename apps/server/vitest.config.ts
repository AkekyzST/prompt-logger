import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    reporters: 'default',
    passWithNoTests: true,
    setupFiles: ['./test/setup-env.ts'],
  },
});
