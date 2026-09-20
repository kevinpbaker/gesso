/**
 * Refuses a publish that would ship a broken package.
 *
 * Two ways to ship one, both silent until somebody installs it:
 *
 * `publishConfig.exports` is what rewrites every entry from `src/*.ts`
 * to `dist`, and that rewrite is pnpm's, not npm's. `npm publish` here
 * uploads a manifest pointing at `./src/index.ts` — a path the tarball
 * does not even contain, because `files` is the built output. Every
 * import of the published package then fails to resolve. `pnpm pack`
 * and `npm pack` were compared: the exports differ exactly this way.
 *
 * And `changeset publish` does not build. A publish from a tree whose
 * `dist` is stale or absent ships the last build, or nothing.
 *
 * Run from `prepublishOnly`, which both package managers honour.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const agent = process.env.npm_config_user_agent ?? '';
const name = process.env.npm_package_name ?? 'this package';

if (!agent.startsWith('pnpm/')) {
  console.error(
    `\nRefusing to publish ${name} with ${agent.split('/')[0] || 'this tool'}.\n\n` +
      `  pnpm applies publishConfig.exports; npm does not. Publishing here\n` +
      `  with npm uploads a manifest whose exports point at ./src/*.ts,\n` +
      `  which is not in the tarball, and every import of it fails.\n\n` +
      `  Use \`pnpm changeset:publish\`, or \`pnpm publish\` in this directory.\n  CI packs with pnpm and uploads the tarball with npm; see RELEASING.md.\n`
  );
  process.exit(1);
}

const entry = join(process.cwd(), 'dist', 'index.js');
if (!existsSync(entry)) {
  console.error(
    `\nRefusing to publish ${name}: dist/index.js is missing.\n\n` +
      `  \`changeset publish\` does not build. Run \`pnpm build\` first.\n`
  );
  process.exit(1);
}
