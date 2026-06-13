/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Skip the WebContainer-touching modules — they require a browser
    // runtime with crossOriginIsolated=true and would never pass in
    // node. Tests for those flows go through dedicated mocks below.
    testTimeout: 10_000,
  },
});
