import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDMG }  from '@electron-forge/maker-dmg';
import { MakerZIP }  from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import path from 'path';
import fs from 'fs-extra';

const config: ForgeConfig = {
  packagerConfig: {
    name:        'Focus',
    executableName: 'Focus',
    appBundleId: 'com.focussession.app',
    appVersion:  process.env.APP_VERSION ?? require('./package.json').version,
    appCopyright: `Copyright © ${new Date().getFullYear()} Focus Session`,
    icon: './assets/icon',
    asar: {
      // AutoUnpackNativesPlugin will extend this to also unpack **/{.**,**}/**/*.node
      // so the better_sqlite3.node binary lands in app.asar.unpacked (required for dlopen).
      // The JS packages stay inside the asar so require() can resolve them.
      unpack: '**/*.node',
    },
    // Signing: set APPLE_ID + APPLE_TEAM_ID + APPLE_PASSWORD for full notarisation.
    // Without those env vars, signing is handled by the CI codesign step.
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

  hooks: {
    // The VitePlugin sets packagerConfig.ignore to only include '.vite/' files,
    // which correctly excludes pure-JS node_modules (bundled by Vite). But
    // better-sqlite3 is a native module that CANNOT be bundled — it must be on
    // the real filesystem for require() to find the JS package and dlopen to
    // load the binary.
    //
    // packageAfterCopy runs after electron-packager's file copy (so after the
    // ignore filter) but before asar packing. We inject the native packages
    // directly into the build path here so they end up in the asar alongside
    // the Vite output. AutoUnpackNativesPlugin then extracts the .node binary
    // to app.asar.unpacked so dlopen can load it.
    packageAfterCopy: async (_config, buildPath) => {
      const nativeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
      for (const mod of nativeModules) {
        const src  = path.join(__dirname, 'node_modules', mod);
        const dest = path.join(buildPath, 'node_modules', mod);
        await fs.copy(src, dest);
        console.log(`[forge] Injected native dep: ${mod}`);
      }
    },
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
