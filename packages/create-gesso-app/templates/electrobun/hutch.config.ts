/**
 * What `hutch run <script>` does, and which Electrobun to fetch.
 *
 * Every script begins with `hutch electrobun prepare`, because that is
 * the step that writes `.hutch/devkit`, and both `vite.config.ts` and
 * `tsconfig.json` read the SDK from there. Electrobun is a toolchain
 * Hutch downloads rather than a package a registry serves, so a
 * project that skipped this would have nothing to build against.
 */
export default {
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
