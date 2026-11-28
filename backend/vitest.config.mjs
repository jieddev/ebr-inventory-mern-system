import { defineConfig } from 'vitest/config';

// Two kinds of tests (see TESTING.md):
//   unit:        pure logic, no database. Fast: run on every save and before every push.
//   integration: the HTTP API against a throwaway in-memory MongoDB replica set (never the real
//                database: test/helpers/db.js refuses anything but localhost).
export default defineConfig({
  test: {
    setupFiles: ['test/setup/env.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['test/unit/**/*.test.js'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          globalSetup: ['test/setup/globalSetup.js'],
          // One worker: every file shares the one in-memory replica set and clears it between tests.
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
