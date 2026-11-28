import { defineConfig } from 'tsdown';

/**
 * One entry. Yjs, y-protocols, lib0 and RxJS are peers and stay
 * imports, so an application has one copy of each: two copies of Yjs
 * in one worker is the classic way to break `instanceof` inside it.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  platform: 'neutral',
  sourcemap: true,
  clean: true
});
