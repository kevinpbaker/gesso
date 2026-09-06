/**
 * `create-gesso-app`: scaffolds a Gesso application (`ROADMAP.md` F7's
 * last item).
 *
 * What it writes is the configuration this framework is for. The
 * application runs in a render worker; the page's own script creates
 * the app, hands it a worker constructor and mounts it, and that is the
 * whole of the main thread's job.
 *
 * The one thing this CLI does that a public scaffolder would not is
 * vendor its own dependencies. No `@gesso/*` package is on a registry,
 * so a generated `package.json` that named a version would produce a
 * project that cannot install. Instead the CLI packs the packages it
 * needs out of this workspace with `pnpm pack`, drops the tarballs into
 * the new project's `vendor/` directory and writes `file:` specifiers
 * at them. That is the same route `scripts/check-install.ts` takes, and
 * it is the route that exercises each package's `publishConfig`, which
 * is the only thing that rewrites `exports` from `src/*.ts` to `dist`.
 * `ADOPTION_ROADMAP.md` A7 is where that ends; `decisions/0082` says
 * what changes on the day it does.
 *
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app --no-build
 *
 * Only the web template exists. `@gesso/electrobun` is `ROADMAP.md` E1
 * and has not been written, so there is nothing an Electrobun template
 * could depend on; asking for one says that rather than producing a
 * project that cannot run.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

/**
 * Packages the generated project depends on, in dependency order.
 *
 * `devtools` and `vite-plugin` joined the first three when the feedback
 * loop was wired in by default (`decisions/0082`): the plugin is what
 * writes the worker construction and the hot-replacement wiring, and it
 * loads the overlay from devtools the first time the worker throws.
 * Both are development dependencies of the generated project and
 * neither is reachable from a production build.
 */
const VENDORED = ['core', 'framework', 'components', 'devtools', 'vite-plugin'];
/** Where the packed tarballs land inside the generated project. */
const VENDOR_DIR = 'vendor';
/** Template files whose names cannot be checked into this repository as-is. */
const RENAMED = new Map([['_gitignore', '.gitignore']]);

const packageRoot = join(import.meta.dirname, '..');
const workspaceRoot = join(packageRoot, '..', '..');

interface Options {
  readonly target: string;
  readonly name: string;
  readonly template: string;
  readonly force: boolean;
  readonly build: boolean;
}

const USAGE = `Usage: create-gesso-app <directory> [options]

Creates a Gesso application in <directory>: a Vite project whose
interface is built, laid out and painted in a render worker.

Options:
  --name <name>     Package name for the new project. Defaults to the
                    directory's own name.
  --template <name> Which template to write. Only "web" exists.
  --force           Write into a directory that already has files in it.
  --no-build        Pack the workspace packages without rebuilding them
                    first. Only safe when dist/ is already current.
  -h, --help        Print this.
`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): Options {
  let target: string | undefined;
  let name: string | undefined;
  let template = 'web';
  let force = false;
  let build = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        console.log(USAGE);
        process.exit(0);
        break;
      case '--force':
        force = true;
        break;
      case '--no-build':
        build = false;
        break;
      case '--name':
        name = argv[++i];
        break;
      case '--template':
        template = argv[++i] ?? '';
        break;
      default:
        if (arg.startsWith('-')) {
          fail(`Unknown option ${arg}.\n\n${USAGE}`);
        }
        if (target !== undefined) {
          fail(`Two directories were given, ${target} and ${arg}.\n\n${USAGE}`);
        }
        target = arg;
    }
  }

  if (target === undefined) {
    fail(`A directory to create is required.\n\n${USAGE}`);
  }
  if (name !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    fail(`"${name}" is not a usable package name: use lowercase letters, digits, dots, dashes and underscores.`);
  }

  const absolute = isAbsolute(target) ? target : resolve(process.cwd(), target);
  return { target: absolute, name: name ?? basename(absolute), template, force, build };
}

/** Checks the template exists, and explains the one that does not. */
function templateDir(template: string): string {
  if (template === 'electrobun') {
    fail(
      'There is no Electrobun template yet. `@gesso/electrobun` is ROADMAP.md E1 and has not been\n' +
        'written, so a template for it would scaffold a project with nothing to depend on. Use\n' +
        '--template web; the application code is the same either way, because an Electrobun window\n' +
        'runs the same render worker behind a webview.'
    );
  }
  const dir = join(packageRoot, 'templates', template);
  if (!existsSync(dir)) {
    const available = readdirSync(join(packageRoot, 'templates')).join(', ');
    fail(`There is no "${template}" template. Available: ${available}.`);
  }
  return dir;
}

function prepareTarget(options: Options): void {
  if (!existsSync(options.target)) {
    mkdirSync(options.target, { recursive: true });
    return;
  }
  const existing = readdirSync(options.target);
  if (existing.length > 0 && !options.force) {
    fail(`${options.target} is not empty (${existing.length} entries). Pass --force to write into it anyway.`);
  }
}

/**
 * Whether a package's `dist` is older than anything in its `src`.
 *
 * A newest-mtime comparison rather than a build system: it is wrong
 * only in the direction of building something that did not need it,
 * and a missing `dist` always builds. `--no-build` skips the question
 * entirely for the case where the caller knows.
 */
function needsBuild(pkg: string): boolean {
  const dir = join(workspaceRoot, 'packages', pkg);
  const dist = join(dir, 'dist');
  if (!existsSync(dist)) {
    return true;
  }
  return newestChange(join(dir, 'src')) > newestChange(dist);
}

/** The most recent modification time anywhere under a directory. */
function newestChange(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestChange(path) : statSync(path).mtimeMs);
  }
  return newest;
}

/**
 * Packs the workspace packages into the new project and returns the
 * `file:` specifier for each.
 *
 * The specifiers are relative to the project directory, so the whole
 * directory can be moved or copied and still install.
 */
function vendorPackages(options: Options): Map<string, string> {
  if (options.build) {
    // Only the packages that go into the project, and only the ones
    // whose `dist` is older than their `src`. Building the whole
    // workspace took the better part of a minute for a scaffold that
    // does not install two of the packages it built, and every second
    // of it was spent between a person typing a command and seeing
    // anything happen.
    const stale = VENDORED.filter(needsBuild);
    if (stale.length > 0) {
      console.log(`building ${stale.join(', ')}…`);
      const filters = stale.flatMap(pkg => ['--filter', `./packages/${pkg}`]);
      execFileSync('pnpm', [...filters, 'build'], { cwd: workspaceRoot, stdio: 'ignore' });
    }
  }

  const into = join(options.target, VENDOR_DIR);
  rmSync(into, { recursive: true, force: true });
  mkdirSync(into, { recursive: true });

  console.log('packing them into the new project…');
  const specifiers = new Map<string, string>();
  for (const pkg of VENDORED) {
    const before = new Set(readdirSync(into));
    execFileSync('pnpm', ['pack', '--pack-destination', into], {
      cwd: join(workspaceRoot, 'packages', pkg),
      stdio: 'ignore'
    });
    const created = readdirSync(into).filter(entry => !before.has(entry) && entry.endsWith('.tgz'));
    if (created.length !== 1) {
      fail(`pnpm pack in packages/${pkg} produced ${created.length} tarballs, expected 1.`);
    }
    specifiers.set(`@gesso/${pkg}`, `file:${VENDOR_DIR}/${created[0]}`);
  }
  return specifiers;
}

/** Copies the template, renaming the files that had to be disguised. */
function copyTemplate(from: string, options: Options): void {
  // `force` here is not the option of the same name: whether writing
  // into an occupied directory is allowed was settled by `prepareTarget`,
  // and a template file always wins over whatever it lands on.
  cpSync(from, options.target, { recursive: true, force: true });
  for (const [disguised, real] of RENAMED) {
    const path = join(options.target, disguised);
    if (existsSync(path)) {
      renameSync(path, join(options.target, real));
    }
  }
}

/**
 * Writes the project's name and its dependency specifiers.
 *
 * `overrides` carries the same specifiers, because `@gesso/framework`
 * and `@gesso/components` declare each other by version range. Without
 * it npm is free to go looking for `@gesso/core@^0.1.0` on a registry
 * that has never heard of it, and whether it does so depends on what
 * else is in the tree.
 */
function writeManifest(options: Options, specifiers: ReadonlyMap<string, string>): void {
  const path = join(options.target, 'package.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    name: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides?: Record<string, string>;
  };
  manifest.name = options.name;
  for (const [pkg, specifier] of specifiers) {
    // The plugin and the overlay are development dependencies and the
    // three runtime packages are not, so the specifier goes wherever
    // the template already declared the package.
    const where =
      manifest.dependencies[pkg] !== undefined
        ? manifest.dependencies
        : manifest.devDependencies[pkg] !== undefined
          ? manifest.devDependencies
          : undefined;
    if (where === undefined) {
      fail(`The ${options.template} template does not depend on ${pkg}, so there is nowhere to vendor it.`);
    }
    where[pkg] = specifier;
  }
  manifest.overrides = Object.fromEntries(specifiers);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Says the same thing to pnpm that `overrides` says to npm.
 *
 * `decisions/0048` chose npm and said pnpm did not work, and the reason
 * it gave is still exactly right: `pnpm pack` rewrites `workspace:^`
 * into `^0.1.0`, so the packed `@gesso/framework` asks for
 * `@gesso/core@^0.1.0` and pnpm 11 goes to a registry that has never
 * heard of it. What that record then rejected was shipping a
 * `pnpm-workspace.yaml` in a project that is not a workspace.
 *
 * That trade has moved. The file is five lines, it is the only place
 * pnpm 11 reads `overrides` from, and the alternative is a scaffold
 * that fails for the package manager this repository itself uses. It
 * says what it is for and it is deleted along with `vendor/` the day
 * the packages are published.
 */
function writePnpmOverrides(options: Options, specifiers: ReadonlyMap<string, string>): void {
  const lines = [
    '# The tarballs in vendor/ again, for pnpm.',
    '#',
    '# Gesso is not published, so the packed @gesso/* packages ask each',
    '# other for version ranges no registry can answer. npm reads the',
    '# `overrides` in package.json; pnpm 11 reads only this file. Both',
    '# go away when the packages are on a registry: delete vendor/, this',
    '# file and `overrides`, and put version ranges back.',
    'overrides:',
    ...[...specifiers].map(([pkg, specifier]) => `  '${pkg}': '${specifier}'`),
    ''
  ];
  writeFileSync(join(options.target, 'pnpm-workspace.yaml'), lines.join('\n'));
}

/** Substitutes the template's placeholders in the files that carry them. */
function substitute(options: Options): void {
  for (const relative of ['index.html', 'README.md']) {
    const path = join(options.target, relative);
    if (!existsSync(path)) {
      continue;
    }
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('{{name}}', options.name));
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(join(workspaceRoot, 'packages', 'core', 'package.json'))) {
    fail(
      'create-gesso-app has to run from inside the Gesso workspace: it packs the packages it\n' +
        'installs, because they are not published anywhere it could fetch them from.'
    );
  }

  const template = templateDir(options.template);
  prepareTarget(options);
  copyTemplate(template, options);
  const specifiers = vendorPackages(options);
  writeManifest(options, specifiers);
  writePnpmOverrides(options, specifiers);
  substitute(options);

  const where = options.target.startsWith(process.cwd())
    ? options.target.slice(process.cwd().length + 1)
    : options.target;
  console.log(`
Created ${options.name} in ${where}.

  cd ${where}
  pnpm install     # or npm install
  pnpm dev

Either works. The vendored tarballs ask each other for version ranges no
registry can answer, so npm is pointed at them by \`overrides\` in
package.json and pnpm by \`overrides\` in pnpm-workspace.yaml. Both go
away when the packages are published; the project's README says how.
`);
}

main();
