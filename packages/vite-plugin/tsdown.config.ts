import { defineConfig } from 'tsdown';

/**
 * Two builds: the plugin, and the `gesso-channels` command.
 *
 * The plugin keeps `vite` external: this package runs inside a bundler
 * rather than beside one, so the `Plugin` type it implements has to be
 * the host's own or a config would fail to typecheck against it.
 *
 * `gesso-channels` describes contracts for a bundle Vite does not
 * build, an Electrobun main process. It is a Node program, so it is
 * built for Node, after the plugin and without cleaning what the plugin
 * wrote.
 *
 * Both keep TypeScript external: its checker is an optional peer the
 * application installs, loaded only when a contract is read.
 *
 * `sourcemap` for the same reason every other package here sets it: a
 * stack frame inside a published package should name the line somebody
 * wrote. It matters least here and is set anyway, because the answer to
 * "which packages ship maps" should be "all of them".
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    dts: true,
    platform: 'neutral',
    external: ['vite', /^typescript(\/|$)/],
    sourcemap: true,
    clean: true
  },
  {
    entry: ['bin/gesso-channels.ts'],
    format: 'esm',
    dts: false,
    platform: 'node',
    external: [/^typescript(\/|$)/],
    sourcemap: true,
    clean: false
  }
]);
