import {defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';

// Dev API target and the Origin the platform expects on write requests. The platform
// default origin is http://127.0.0.1:8080; override with MCP_STUDIO_DEV_ORIGIN when the
// local platform runs with a different MCP_STUDIO_ORIGIN.
const apiTarget = process.env.MCP_STUDIO_DEV_API ?? 'http://127.0.0.1:8080';
const apiOrigin = process.env.MCP_STUDIO_DEV_ORIGIN ?? apiTarget;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {outDir: 'dist', emptyOutDir: true,rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/zod/'))return 'schema-vendor';}}}},
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        // The platform rejects any non-GET/HEAD request whose Origin is not exactly
        // Config.Origin (403 origin_rejected). In dev the UI runs on localhost:5173
        // while the platform default origin is http://127.0.0.1:8080, so the proxied
        // request must carry the platform origin instead of the browser one.
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('Origin', apiOrigin));
        },
      },
    },
  },
  // Bound file workers so large React/SDK module imports do not starve async UI assertions.
  // Assertions, test timeouts and production budgets stay unchanged.
  test: {maxWorkers: 4, environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['tests/setup.ts'], restoreMocks: true},
});
