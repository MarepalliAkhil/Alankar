import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import photoManifest from './vite-plugins/photo-manifest.js';

/** Big libraries in their own long-cached files. Only libraries every page needs are here; the
 * chart and drag-and-drop libraries load only with the signed-in pages that use them. */
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
  if (/node_modules[\\/](react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'router';
  if (/node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query';
  if (/node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return 'charts';
  if (/node_modules[\\/]@dnd-kit[\\/]/.test(id)) return 'dnd';
  return undefined;
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // 127.0.0.1 (not "localhost") so Node does not try IPv6 first on Windows.
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000';
  // `npm run build:analyze` (or ANALYZE=true) writes dist-stats.html: a map of every file.
  const plugins = [react(), photoManifest()];
  if (mode === 'analyze' || env.ANALYZE?.trim() === 'true') {
    const name = 'rollup-plugin-visualizer';
    const { visualizer } = await import(/* @vite-ignore */ name);
    plugins.push(visualizer({ filename: 'dist-stats.html', gzipSize: true, template: 'treemap' }));
  }

  return {
    plugins,
    build: {
      // No source maps in production (scripts/check-build.mjs fails the build if one appears).
      sourcemap: false,
      // dist/.vite/manifest.json: lets the bundle budget find the public first-load files.
      manifest: true,
      rollupOptions: { output: { manualChunks } },
    },
    server: {
      port: 5173,
      strictPort: true,
      // The role policy lives in ../shared (one file for backend and frontend).
      fs: { allow: ['.', '../shared'] },
      // Test and build output must never trigger a reload while a test is running.
      watch: {
        ignored: [
          '**/e2e-results/**',
          '**/e2e-report/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/photos-originals/**',
          '**/.last-run.json',
        ],
      },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, ws: true },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      testTimeout: 20000,
      // Only the main stylesheet is processed, so tests can read its rules with `?raw`.
      css: { include: [/design\/index\.css/] },
      restoreMocks: true,
      // Browser tests (Playwright) run with `npm run e2e`, not here.
      exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
    },
  };
});
