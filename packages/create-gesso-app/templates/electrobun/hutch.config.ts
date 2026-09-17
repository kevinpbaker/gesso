// @hutch cli=0.24.3
/**
 * What `hutch run <script>` does, and which Electrobun to fetch.
 *
 * Every script begins with `hutch electrobun prepare`, because that is
 * the step that writes `.hutch/devkit`, and both `vite.config.ts` and
 * `tsconfig.json` read the SDK from there. Electrobun is a toolchain
 * Hutch downloads rather than a package a registry serves, so a
 * project that skipped this would have nothing to build against.
 *
 * The first line of this file is a pragma Hutch reads, not a comment
 * for you, and it has to stay the first line. It pins the Hutch that
 * runs these scripts to the one the Electrobun 2.0.1 bootstrap installs
 * and the one this template was checked with. Without it `hutch run`
 * fetches the newest launcher, and on 2026-09-15 and again on
 * 2026-09-16 that launcher (0.26.0) failed this project's distributable
 * build: it expected a `cottontail-core` binary in the Cottontail
 * release Electrobun 2.0.1 bundles into an application (0.5.0), which
 * does not ship one, and stopped with `CopySourceMissing`. The dev
 * build was unaffected. Move the pin and `electrobun.version` together,
 * and check `hutch run build` when you do.
 */
export default {
  // npm installs this project, not Hutch's own resolver. The vendored
  // Gesso packages ask each other for version ranges no registry can
  // answer, and `overrides` in package.json is what points those
  // requests at the tarballs in vendor/. Hutch's built-in resolver
  // resolves a relative `file:` override against the package that asked
  // rather than against this directory, and fails with `FileNotFound`;
  // npm resolves it from here. When the packages are published and
  // vendor/ goes, this line can go with it.
  packageManager: 'npm',
  scripts: {
    install: ['hutch', 'install'],
    start: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev',
    dev: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch',
    // The window's assets on Vite's dev server, and the application
    // around them, so a change to a component reloads the webview
    // without rebuilding the native side.
    'dev:hmr': ['hutch', 'pm', 'exec', '--', 'concurrently', 'hutch run hmr', 'hutch run start'],
    hmr: 'hutch electrobun prepare && hutch pm exec -- vite --port 5173',
    build: 'hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable',
    typecheck: 'hutch electrobun prepare && hutch pm exec -- tsc --noEmit'
  },
  electrobun: {
    version: '2.0.1'
  }
};
