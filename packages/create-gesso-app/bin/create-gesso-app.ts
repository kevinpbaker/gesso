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
 * vendor its own dependencies. `@gesso/core`, `@gesso/framework` and
 * `@gesso/components` are not on a registry, so a generated
 * `package.json` that named a version would produce a project that
 * cannot install. Instead the CLI packs the three packages out of this
 * workspace with `pnpm pack`, drops the tarballs into the new project's
 * `vendor/` directory and writes `file:` specifiers at them. That is
 * the same route `scripts/check-install.ts` takes, and it is the route
 * that exercises each package's `publishConfig`, which is the only
 * thing that rewrites `exports` from `src/*.ts` to `dist`.
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
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

/** Packages the generated project depends on, in dependency order. */
const VENDORED = ['core', 'framework', 'components'];
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
 * Packs the workspace packages into the new project and returns the
 * `file:` specifier for each.
 *
 * The specifiers are relative to the project directory, so the whole
 * directory can be moved or copied and still install.
 */
function vendorPackages(options: Options): Map<string, string> {
  if (options.build) {
    console.log('building the Gesso packages…');
    execFileSync('pnpm', ['--filter', './packages/*', 'build'], { cwd: workspaceRoot, stdio: 'ignore' });
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
    overrides?: Record<string, string>;
  };
  manifest.name = options.name;
  for (const [pkg, specifier] of specifiers) {
    if (manifest.dependencies[pkg] === undefined) {
      fail(`The ${options.template} template does not depend on ${pkg}, so there is nowhere to vendor it.`);
    }
    manifest.dependencies[pkg] = specifier;
  }
  manifest.overrides = Object.fromEntries(specifiers);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
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
  substitute(options);

  const where = options.target.startsWith(process.cwd())
    ? options.target.slice(process.cwd().length + 1)
    : options.target;
  console.log(`
Created ${options.name} in ${where}.

  cd ${where}
  npm install
  npm run dev

npm rather than pnpm: the vendored tarballs satisfy each other's version
ranges in npm's tree, and pnpm 11 goes to the registry for them instead.
The reason, and what to change once the packages are published, are both
in the project's README.
`);
}

main();
