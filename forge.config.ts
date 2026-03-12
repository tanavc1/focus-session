import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG }  from '@electron-forge/maker-dmg';
import { MakerZIP }  from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: {
    name:        'Focus',
    executableName: 'Focus',
    appBundleId: 'com.focussession.app',
    appVersion:  process.env.APP_VERSION ?? require('./package.json').version,
    appCopyright: `Copyright © ${new Date().getFullYear()} Focus Session`,
    icon: './assets/icon',
    asar: {
      // Extract only the .node binary to app.asar.unpacked so dlopen can load it.
      // The JS package stays inside the asar so require('better-sqlite3') resolves.
      // AutoUnpackNativesPlugin handles this automatically — unpackDir is NOT used
      // because it would move the entire package outside the asar, breaking require().
      unpack: '**/*.node',
    },
    // Signing: set APPLE_ID + APPLE_TEAM_ID + APPLE_PASSWORD for full notarisation.
    // Without those env vars, signing is handled by the CI codesign step (or skipped
    // in local dev — run `codesign --force --deep --sign - Focus.app` manually if needed).
    ...(process.env.APPLE_ID ? {
      osxSign: {},
      osxNotarize: {
        tool: 'notarytool',
        appleId:          process.env.APPLE_ID!,
        appleIdPassword:  process.env.APPLE_PASSWORD!,
        teamId:           process.env.APPLE_TEAM_ID!,
      },
    } : {}),
  },

  rebuildConfig: {
    extraModules: ['better-sqlite3'],
  },

  makers: [
    new MakerDMG({
      format:   'ULFO',   // best compressed format for macOS 10.11+
      overwrite: true,
    }, ['darwin']),
    new MakerZIP({}, ['darwin']),
  ],

  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry:  'src/electron-main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry:  'src/electron-preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name:   'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
