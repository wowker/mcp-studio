import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {outDir: 'dist', emptyOutDir: true},
  server: {proxy: {'/api': 'http://127.0.0.1:8080'}},
  test: {environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true},
});
