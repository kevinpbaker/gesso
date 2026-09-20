#!/usr/bin/env node
/**
 * `create-gesso-app`: scaffolds a Gesso application (the
 * last item).
 *
 * What it writes is the configuration this framework is for. The
 * application runs in a render worker; the page's own script creates
 * the app, hands it a worker constructor and mounts it, and that is the
 * whole of the main thread's job.
 *
 * By default the generated `package.json` names the published
 * `gesso-*` packages by version range and an install goes to the
 * registry, which is what a scaffold anywhere else does.
 *
 * `--local` is the other route, and the one this CLI keeps that a
 * public scaffolder would not: it packs the packages a template needs
 * out of this workspace with `pnpm pack`, drops the tarballs into the
 * new project's `vendor/` directory and writes `file:` specifiers at
 * them. That is the only way to scaffold against changes that are not
 * released yet, it is the same route `scripts/check-install.ts` takes,
 * and it is the route that exercises each package's `publishConfig`,
 * which is the only thing that rewrites `exports` from `src/*.ts` to
 * `dist`. `pnpm check:scaffold` runs this way, so the gate tests the
 * working tree rather than the last release.
 *
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app --local
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app --local --no-build
 *   node packages/create-gesso-app/bin/create-gesso-app.ts ../my-app --template electrobun
 *
 * The two templates differ in what runs beneath the same application.
 * `web` is a Vite project a browser loads. `electrobun` is a native
 * window whose application layer is a separate process, and it is set
 * up by Hutch rather than by npm: the Electrobun SDK is projected into
 * a project by `hutch electrobun prepare` rather than installed from a
 * registry, so the generated project depends on the toolchain being
 * present and says so.
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

/** Where the packed tarballs land inside the generated project. */
const VENDOR_DIR = 'vendor';
/** Template files whose names cannot be checked into this repository as-is. */
const RENAMED = new Map([['_gitignore', '.gitignore']]);

interface Template {
  /** Workspace packages to pack into the project, in dependency order. */
  readonly vendored: readonly string[];
  /** Files carrying `{{name}}`, relative to the project directory. */
  readonly substitute: readonly string[];
  /** What to tell the person once the project is written. */
  readonly next: (name: string, where: string, local: boolean) => string;
}

/**
 * The templates, and the two things that differ between them: what a
 * project depends on, and how a person starts it.
 *
 * `devtools` and `vite-plugin` joined the web template's first three
 * when the feedback loop was wired in by default:
 * the plugin is what writes the worker construction and the
 * hot-replacement wiring, and it loads the overlay from devtools the
 * first time the worker throws. Both are development dependencies of
 * the generated project and neither is reachable from a production
 * build.
 */
const TEMPLATES: Record<string, Template> = {
  web: {
    vendored: ['core', 'framework', 'components', 'devtools', 'vite-plugin'],
    substitute: ['index.html', 'README.md'],
    next: (name, where, local) =>
      [
        `\nCreated ${name} in ${where}.\n`,
        `  cd ${where}`,
        '  pnpm install     # or npm install',
        '  pnpm dev\n',
        ...(local
          ? [
              'Gesso came from this workspace rather than the registry, packed into',
              'vendor/. The packed packages ask each other for version ranges, so npm',
              'is pointed at the tarballs by `overrides` in package.json and pnpm by',
              "`overrides` in pnpm-workspace.yaml. The project's README says how to",
              'move to the published packages.\n'
            ]
          : [])
      ].join('\n')
  },
  electrobun: {
    vendored: ['core', 'framework', 'components', 'electrobun'],
    substitute: ['electrobun.config.ts', 'src/main/index.ts', 'src/view/index.html', 'README.md'],
    next: (name, where) => `
Created ${name} in ${where}.

  cd ${where}
  hutch install
  hutch run dev

Hutch rather than npm, and this is the part to read before running it.
Electrobun 2.x is a toolchain a launcher downloads, not a package a
registry serves: \`hutch electrobun prepare\` projects the SDK into the
project's own .hutch/devkit, which is where vite.config.ts and
tsconfig.json look for it, and every script in hutch.config.ts runs that
first. \`hutch install\` runs npm underneath. If \`hutch\` is not on your
path yet, the project's README says how to get it.

\`pnpm check:scaffold:electrobun\` installs, typechecks and builds a
project like this one without opening it. The window itself is checked
by running it; the README records the last time that was done.
`
  }
};

const packageRoot = join(import.meta.dirname, '..');
const workspaceRoot = join(packageRoot, '..', '..');

interface Options {
  readonly target: string;
  readonly name: string;
  readonly template: string;
  readonly force: boolean;
  readonly build: boolean;
  /**
   * Install the packages out of this workspace instead of the registry.
   *
   * What every scaffold did before the packages were published, kept
   * because it is the only way to scaffold a project against changes
   * that are not released yet. `pnpm check:scaffold` runs this way, so
   * the gate tests the working tree rather than the last release.
   */
  readonly local: boolean;
}

const USAGE = `Usage: create-gesso-app <directory> [options]

Creates a Gesso application in <directory>: a project whose interface is
built, laid out and painted in a render worker.

Options:
  --name <name>     Package name for the new project. Defaults to the
                    directory's own name.
  --template <name> "web" for a Vite project a browser loads, or
                    "electrobun" for a native window with its state in a
                    main process. Defaults to "web".
  --force           Write into a directory that already has files in it.
  --local           Install the Gesso packages from this workspace, packed
                    into the project, instead of from the registry. Only
                    works inside a Gesso checkout.
  --no-build        With --local, pack without rebuilding first. Only safe
                    when dist/ is already current.
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
  let local = false;

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
      case '--local':
        local = true;
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
  return { target: absolute, name: name ?? basename(absolute), template, force, build, local };
}

/** Looks a template up, and lists the ones that exist when it is not one. */
function templateOf(name: string): Template {
  const template = TEMPLATES[name];
  if (template === undefined || !existsSync(join(packageRoot, 'templates', name))) {
    fail(`There is no "${name}" template. Available: ${Object.keys(TEMPLATES).join(', ')}.`);
  }
  return template;
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
function vendorPackages(options: Options, template: Template): Map<string, string> {
  if (options.build) {
    // Only the packages that go into the project, and only the ones
    // whose `dist` is older than their `src`. Building the whole
    // workspace took the better part of a minute for a scaffold that
    // does not install two of the packages it built, and every second
    // of it was spent between a person typing a command and seeing
    // anything happen.
    const stale = template.vendored.filter(needsBuild);
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
  for (const pkg of template.vendored) {
    const before = new Set(readdirSync(into));
    execFileSync('pnpm', ['pack', '--pack-destination', into], {
      cwd: join(workspaceRoot, 'packages', pkg),
      stdio: 'ignore'
    });
    const created = readdirSync(into).filter(entry => !before.has(entry) && entry.endsWith('.tgz'));
    if (created.length !== 1) {
      fail(`pnpm pack in packages/${pkg} produced ${created.length} tarballs, expected 1.`);
    }
    specifiers.set(`gesso-${pkg}`, `file:${VENDOR_DIR}/${created[0]}`);
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
 * `overrides` carries the same specifiers, because the packages declare
 * each other by version range: `gesso-framework` and
 * `gesso-components` do, and so does `gesso-electrobun`. Without it an
 * installer scaffolded with `--local` is free to resolve
 * `gesso-core@^0.1.0` off the registry rather than from the tarball
 * beside it, and whether it does so depends on what else is in the
 * tree. Without `--local` there are no specifiers and no `overrides`.
 */
function writeManifest(options: Options, specifiers: ReadonlyMap<string, string>): void {
  const path = join(options.target, 'package.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    name: string;
    dependencies: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string>;
  };
  manifest.name = options.name;
  for (const [pkg, specifier] of specifiers) {
    // The plugin and the overlay are development dependencies and the
    // runtime packages are not, so the specifier goes wherever the
    // template already declared the package.
    const where =
      manifest.dependencies[pkg] !== undefined
        ? manifest.dependencies
        : manifest.devDependencies?.[pkg] !== undefined
          ? manifest.devDependencies
          : undefined;
    if (where === undefined) {
      fail(`The ${options.template} template does not depend on ${pkg}, so there is nowhere to vendor it.`);
    }
    where[pkg] = specifier;
  }
  if (specifiers.size > 0) {
    manifest.overrides = Object.fromEntries(specifiers);
  } else {
    delete manifest.overrides;
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Says the same thing to pnpm that `overrides` says to npm.
 *
 * npm was chosen because pnpm did not work, and the reason is still
 * exactly right: `pnpm pack` rewrites `workspace:^` into `^0.1.0`, so
 * the packed `gesso-framework` asks for `gesso-core@^0.1.0` and pnpm 11
 * resolves it off the registry rather than from the tarball beside it,
 * which is a different copy of the package than the one this project
 * was told to use. What that record then rejected was shipping a
 * `pnpm-workspace.yaml` in a project that is not a workspace.
 *
 * That trade has moved. The file is five lines, it is the only place
 * pnpm 11 reads `overrides` from, and the alternative is a scaffold
 * that fails for the package manager this repository itself uses. It
 * says what it is for, and it is written only under `--local`.
 */
function writePnpmOverrides(options: Options, specifiers: ReadonlyMap<string, string>): void {
  const lines = [
    '# The tarballs in vendor/ again, for pnpm.',
    '#',
    '# This project was scaffolded with --local, so the packed gesso-*',
    '# packages ask each other for version ranges the registry would',
    '# answer with a different copy. npm reads the `overrides` in',
    '# package.json; pnpm 11 reads only this file. To move to the',
    '# published packages: delete vendor/, this file and `overrides`,',
    '# and put version ranges back.',
    'overrides:',
    ...[...specifiers].map(([pkg, specifier]) => `  '${pkg}': '${specifier}'`),
    ''
  ];
  writeFileSync(join(options.target, 'pnpm-workspace.yaml'), lines.join('\n'));
}

/**
 * Substitutes the template's placeholders in the files that carry them.
 *
 * The list is the template's rather than a walk of the tree, so that a
 * placeholder added to a file nobody listed fails visibly in the
 * generated project instead of being quietly left as `{{name}}`
 * somewhere it is never read.
 */
function substitute(options: Options, template: Template): void {
  for (const relative of template.substitute) {
    const path = join(options.target, relative);
    if (!existsSync(path)) {
      fail(`The ${options.template} template says ${relative} carries {{name}}, and it was not written.`);
    }
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('{{name}}', options.name));
  }
}

/**
 * Appends the `vendor/` explanation to the generated README.
 *
 * It lives here rather than in the template because a project made
 * without `--local` has no `vendor/`, and a README explaining a
 * directory that is not there is worse than one that says nothing.
 */
function explainVendoring(options: Options): void {
  const path = join(options.target, 'README.md');
  if (!existsSync(path)) {
    return;
  }
  const section = [
    '',
    '## Why `vendor/` exists, and how to remove it',
    '',
    'This project was scaffolded with `--local`, so it installs Gesso from',
    'a checkout rather than from the registry: the packages were packed',
    'into `vendor/` and the manifest points at the tarballs.',
    '',
    'The packed packages declare each other by version range, so without',
    'help a package manager is free to go looking for `gesso-core@^0.1.0`',
    'on the registry and get a different copy than the one beside it.',
    '`overrides` in `package.json` is what tells npm; `overrides` in',
    '`pnpm-workspace.yaml` is what tells pnpm, which reads it nowhere else.',
    '',
    'To pick up a further change, run `create-gesso-app --local` over this',
    'directory again with `--force`.',
    '',
    'To move to the published packages: delete `vendor/`, delete',
    '`pnpm-workspace.yaml`, delete `overrides`, and put version ranges back',
    'in `dependencies`.',
    ''
  ].join('\n');
  writeFileSync(path, readFileSync(path, 'utf8').trimEnd() + '\n' + section);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.local && !existsSync(join(workspaceRoot, 'packages', 'core', 'package.json'))) {
    fail(
      '--local packs the packages out of the Gesso workspace, and this is not one.\n' +
        'Run it from inside a checkout, or drop --local to install from the registry.'
    );
  }

  const template = templateOf(options.template);
  prepareTarget(options);
  copyTemplate(join(packageRoot, 'templates', options.template), options);
  // Without --local the template's own version ranges are the answer,
  // and the manifest needs nothing but its name.
  const specifiers = options.local ? vendorPackages(options, template) : new Map<string, string>();
  writeManifest(options, specifiers);
  if (options.local) {
    writePnpmOverrides(options, specifiers);
    explainVendoring(options);
  }
  substitute(options, template);

  const where = options.target.startsWith(process.cwd())
    ? options.target.slice(process.cwd().length + 1)
    : options.target;
  console.log(template.next(options.name, where, options.local));
}

main();
