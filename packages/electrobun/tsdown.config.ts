import { defineConfig } from 'tsdown';

/**
 * Three entries, and the split is the package's whole argument.
 *
 * `src/view.ts` runs on a webview's main thread and reaches for
 * `MessagePort`. `src/main.ts` runs in another process and reaches for
 * `serveChannels`. Neither imports the other, and `src/index.ts` is
 * the wire format they agree on.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/view.ts', 'src/main.ts', 'src/desktop.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  clean: true
});
