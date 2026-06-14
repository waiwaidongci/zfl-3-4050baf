import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.js', 'tests/**/*.spec.js'],
    exclude: ['tests/smoke/browser/**'],
    setupFiles: ['./tests/setup.js'],
    reporters: ['default', 'hanging-process'],
    outputFile: {
      junit: './coverage/junit-report.xml'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['composables/**/*.js', 'utils/**/*.js'],
      exclude: ['tests/**', 'node_modules/**'],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 40,
        lines: 40
      },
      perFile: false,
      100: false
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    slowTestThreshold: 1000,
    logHeapUsage: false,
    passWithNoTests: false
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url))
    }
  }
});
