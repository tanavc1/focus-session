import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '*.{node,dll}',
    },
    name: 'Focus Session',
    appBundleId: 'com.focussession.app',
  },
  rebuildConfig: {
    extraModules: ['better-sqlite3'],
  },
  makers: [
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/electron-main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/electron-preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
