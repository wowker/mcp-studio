import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {outDir: 'dist', emptyOutDir: true,rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/zod/'))return 'schema-vendor';}}}},
  server: {proxy: {'/api': process.env.MCP_STUDIO_DEV_API ?? 'http://127.0.0.1:8080'}},
  // Bound file workers so large React/SDK module imports do not starve async UI assertions.
  // Assertions, test timeouts and production budgets stay unchanged.
  test: {maxWorkers: 4, environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true},
});
