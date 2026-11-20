/**
 * The screenshot gates, run in the baselines' own environment on this
 * machine.
 *
 * `pnpm screenshots` and `pnpm docs:screenshots` refuse to compare a
 * capture from one Chrome and set of system fonts with a baseline from
 * another, and the baselines come from GitHub's ubuntu-latest runner
 * with a pinned Chrome for Testing. That made recapturing them a trip
 * through the screenshot-baselines workflow and its artifact. This runs
 * the same two scripts inside scripts/screenshots-docker/Dockerfile, which
 * is that environment, so a Mac or a Windows machine with Docker can
 * check against the committed baselines and write new ones CI accepts.
 *
 * The repository is copied into a volume rather than mounted, so the
 * container installs Linux `node_modules` of its own and never touches
 * the host's, and only the screenshot directories are copied back. The
 * copy and the pnpm store are kept between runs, so only the first run
 * pays for a full install.
 *
 *   node scripts/screenshots-docker.ts                    # check routes and docs
 *   node scripts/screenshots-docker.ts --update           # recapture both
 *   node scripts/screenshots-docker.ts --only routes      # or docs
 *   node scripts/screenshots-docker.ts --route renderers-compare
 *   node scripts/screenshots-docker.ts --repo ../elsewhere   # another checkout
 *
 * On Apple silicon the container runs as x86-64 under emulation, because
 * Chrome for Testing has no Linux ARM build: a run takes minutes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const IMAGE = 'gesso-screenshots';
const WORK_VOLUME = 'gesso-screenshots-work';
const CACHE_VOLUME = 'gesso-screenshots-cache';

interface Options {
  update: boolean;
  only: 'routes' | 'docs' | 'both';
  repo: string;
  passThrough: string[];
}

function parse(argv: readonly string[]): Options {
  const options: Options = { update: false, only: 'both', repo: resolve(here, '..'), passThrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--update') {
      options.update = true;
    } else if (arg === '--only') {
      const value = argv[++i];
      if (value !== 'routes' && value !== 'docs') {
        throw new Error(`--only takes routes or docs, not ${String(value)}`);
      }
      options.only = value;
    } else if (arg === '--repo') {
      options.repo = resolve(argv[++i] ?? '');
    } else {
      // --route and --app belong to the route script.
      options.passThrough.push(arg);
      if ((arg === '--route' || arg === '--app') && argv[i + 1] !== undefined) {
        options.passThrough.push(argv[++i]!);
      }
    }
  }
  if (options.passThrough.length > 0 && options.only === 'both') {
    options.only = 'routes';
  }
  return options;
}

/** The Chrome the workflow pins, so the image and the baselines cannot drift apart. */
function pinnedChrome(): string {
  const workflow = readFileSync(resolve(here, '..', '.github', 'workflows', 'screenshot-baselines.yml'), 'utf8');
  const match = /SCREENSHOT_CHROME:\s*'([\d.]+)'/.exec(workflow);
  if (match === null) {
    throw new Error(
      'screenshot-baselines.yml no longer names SCREENSHOT_CHROME; the image cannot know which Chrome to install.'
    );
  }
  return match[1]!;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function main(): void {
  const options = parse(process.argv.slice(2));
  if (!existsSync(resolve(options.repo, 'pnpm-workspace.yaml'))) {
    throw new Error(`${options.repo} is not a Gesso checkout.`);
  }
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
  } catch {
    throw new Error('Docker is not running. Start Docker Desktop (or another engine) and try again.');
  }

  const chrome = pinnedChrome();
  const tag = `${IMAGE}:${chrome}`;
  console.log(`building ${tag} (once per Chrome version; later runs reuse it)…`);
  execFileSync(
    'docker',
    [
      'build',
      '--platform',
      'linux/amd64',
      '--build-arg',
      `CHROME_VERSION=${chrome}`,
      '-t',
      tag,
      resolve(here, 'screenshots-docker')
    ],
    { stdio: 'inherit' }
  );

  const update = options.update ? ' --update' : '';
  const extra = options.passThrough.map(shellQuote).join(' ');
  const gates: { name: string; command: string; screenshots: string }[] = [];
  if (options.only !== 'docs') {
    gates.push({
      name: 'routes',
      command: `node scripts/check-route-screenshots.ts${update} ${extra}`,
      screenshots: 'apps/playground/screenshots'
    });
  }
  if (options.only !== 'routes') {
    gates.push({
      name: 'docs',
      command: `node scripts/check-docs-screenshots.ts${update}`,
      screenshots: 'apps/docs/screenshots'
    });
  }

  if (options.only !== 'routes') {
    warnAboutMemory();
  }

  // One container per gate, so each starts with all of Docker's memory.
  let failed = 0;
  for (const gate of gates) {
    console.log(`== ${gate.name}`);
    const status = runGate(tag, options.repo, gate.command, gate.screenshots);
    if (status !== 0) {
      console.log(`== ${gate.name} failed`);
      failed = 1;
    }
  }
  process.exit(failed);
}

/**
 * The docs build peaks near 8 GB under emulation, against under 2 GB
 * natively (Rosetta translating the bundler's native code is what costs
 * it), and Docker Desktop gives its VM 8 GB by default. Short of memory
 * the build is killed with no message but `Killed`, so this says why
 * before it happens.
 */
// 11 rather than 12: a VM set to 12 GB reports about 11.6 of it.
const DOCS_MEMORY_BYTES = 11 * 1024 ** 3;

function warnAboutMemory(): void {
  try {
    const total = Number(execFileSync('docker', ['info', '--format', '{{.MemTotal}}'], { encoding: 'utf8' }).trim());
    if (total > 0 && total < DOCS_MEMORY_BYTES) {
      console.warn(
        `Docker has ${(total / 1024 ** 3).toFixed(1)} GB; the docs build needs about 8 GB under emulation and may be ` +
          'killed. Raise it to 12 GB or more in Docker Desktop: Settings, Resources, Memory.'
      );
    }
  } catch {
    // An engine that will not say is left to try.
  }
}

/**
 * Inside the container: copy the checkout in, install, run the gate, and
 * copy its screenshot directory back whatever the gate said, so a failure
 * leaves its `.actual.png` beside the baseline it missed.
 */
function runGate(tag: string, repo: string, command: string, screenshots: string): number {
  const script = `
set -uo pipefail
export COREPACK_HOME=/cache/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
rsync -a --delete \\
  --exclude node_modules --exclude .git --exclude dist \\
  --exclude .vitepress/cache --exclude .vitepress/dist \\
  /repo/ /work/ || exit 1
# Build output is not kept: a build killed partway leaves a cache the
# next one trips over.
rm -rf /work/apps/docs/.vitepress/cache /work/apps/docs/.vitepress/dist
cd /work
pnpm config set store-dir /cache/pnpm-store >/dev/null
pnpm install --frozen-lockfile --reporter=silent || exit 1
${command}
status=$?
rsync -a --include '*.png' --include 'manifest.json' --exclude '*' "/work/${screenshots}/" "/repo/${screenshots}/"
exit $status
`;

  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '--shm-size=1g',
      '-v',
      `${repo}:/repo`,
      '-v',
      `${WORK_VOLUME}:/work`,
      '-v',
      `${CACHE_VOLUME}:/cache`,
      tag,
      'bash',
      '-c',
      script
    ],
    { stdio: 'inherit' }
  );
  return result.status ?? 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
