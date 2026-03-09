import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Electron main process uses Node.js semantics
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        'electron',
        'child_process',
        'path',
        'fs',
        'os',
        'util',
        'events',
        'stream',
        'crypto',
        'url',
        'http',
        'https',
        'net',
        'tls',
        'zlib',
        'buffer',
      ],
    },
  },
});
