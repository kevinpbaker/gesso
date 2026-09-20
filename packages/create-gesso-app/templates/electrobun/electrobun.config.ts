import type { ElectrobunConfig } from 'electrobun';

/**
 * What Electrobun builds, and where it looks for it.
 *
 * `electrobun` resolves through `.hutch/devkit`, which
 * `hutch electrobun prepare` writes. There is no `electrobun` package
 * in `node_modules` and there is not meant to be: the SDK is projected
 * into the project by the toolchain rather than installed from a
 * registry.
 */
export default {
  app: {
    name: '{{name}}',
    // Reverse DNS, and yours rather than this one. The operating
    // system uses it to tell one application from another, so two
    // applications sharing an identifier share a great deal else.
    identifier: 'com.example.{{name}}',
    version: '0.0.1'
  },
  build: {
    mainProcess: 'cottontail',
    cottontail: {
      // A TypeScript entrypoint, which Electrobun bundles for itself.
      // It reaches `gesso-electrobun` through `node_modules` like any
      // other dependency, which is why this project vendors the
      // packages rather than linking them: the Gesso repository's own
      // Electrobun applications have to pre-bundle their main process
      // with esbuild, because a workspace package is not installed
      // anywhere the bundler can see it.
      entrypoint: 'src/main/index.ts'
    },
    copy: {
      // What Vite wrote, put where a `views://` url will look for it.
      // The render worker is one of the chunks under `assets`, so the
      // second line is what lets a window start a worker at all.
      'dist/index.html': 'views/mainview/index.html',
      'dist/assets': 'views/mainview/assets'
    },
    watchIgnore: ['dist/**'],
    // Gesso paints through a 2D canvas, so the webview each platform
    // already ships is enough. Bundling CEF would put Chromium, and
    // therefore WebGPU, in the application on every platform, at a
    // considerable size.
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false }
  }
} satisfies ElectrobunConfig;
