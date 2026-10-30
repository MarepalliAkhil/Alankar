import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import photoManifest from './vite-plugins/photo-manifest.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // 127.0.0.1 (not "localhost") so Node does not try IPv6 first on Windows.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';

  return {
    plugins: [react(), photoManifest()],
    server: {
      port: 5173,
      strictPort: true,
      // The role policy lives in ../shared (one file for backend and frontend).
      fs: { allow: ['.', '../shared'] },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      testTimeout: 20000,
      css: false,
      restoreMocks: true,
      // Browser tests (Playwright) run with `npm run e2e`, not here.
      exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    },
  };
});
