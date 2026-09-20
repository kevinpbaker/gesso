/**
 * Scaffold check (the last item).
 *
 * "Someone runs the CLI, gets a directory, runs the commands it prints,
 * and sees a working Gesso app in a browser." This script is that
 * sentence, executed: it runs `create-gesso-app` into a temporary
 * directory, installs the generated project with npm, typechecks it,
 * builds it, then starts the **dev** server the CLI told the person to
 * start and drives it in headless Chrome until the counter counts.
 *
 * It is the sibling of `check-install.ts` and differs from it in three
 * ways, each of which is the point of the file:
 *
 *   - The project under test is generated rather than committed, so
 *     what is checked is the template and the CLI, not a hand-kept
 *     example that has drifted from either.
 *   - It runs `npm run dev`, not `vite preview`. The scaffold's whole
 *     shape rests on `new Worker(new URL('./worker.ts', ...))`, and dev
 *     and build resolve that expression by different routes; a
 *     production build passing says nothing about the command the CLI
 *     actually prints.
 *   - It asserts a worker target exists in the browser. A render worker
 *     that failed to start would leave `mount` quietly drawing nothing,
 *     which looks the same from the page as a blank first frame.
 *
 * The button is found through the accessibility mirror rather than by
 * arithmetic over painted pixels: the scaffold's screen has a button
 * with a name, the mirror puts that name in the DOM, and clicking where
 * the mirror says the button is checks both halves at once. The count
 * itself is read from a screenshot rather than from the mirror, because
 * the mirror does not carry it; see the comment on that comparison.
 *
 * The Electrobun template is checked as far as a headless machine can
 * follow it, which is everything short of the window: the same scaffold,
 * `hutch install`, `hutch run typecheck`, a development bundle whose
 * loose files are inspected (the page, the render worker's chunk, and a
 * main-process bundle that carries the RPC handler), and the
 * distributable build. Nothing here opens a window and nothing here can.
 * This mode needs Hutch, which is found through `HUTCH`,
 * the path, or where the Electrobun npm bootstrap leaves it.
 *
 *   node scripts/check-scaffold.ts           # scaffold, install, build, run
 *   node scripts/check-scaffold.ts --keep    # leave the project behind
 *   node scripts/check-scaffold.ts --no-build  # trust the built dist
 *   node scripts/check-scaffold.ts --template electrobun  # no window
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

/** Not 5173 or 5174: those belong to whatever the developer already has running. */
const DEV_PORT = 5186;
const DEVTOOLS_PORT = 9336;
const root = join(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');
const build = !process.argv.includes('--no-build');
const templateFlag = process.argv.indexOf('--template');
const template = templateFlag === -1 ? 'web' : process.argv[templateFlag + 1];
if (template !== 'web' && template !== 'electrobun') {
  console.error(`There is no "${template}" template to check. Pass web or electrobun.`);
  process.exit(1);
}

/**
 * Whether the page has given its canvas away.
 *
 * The main thread cannot read this canvas back, and that is the
 * evidence rather than the obstacle: `getContext('2d')` on a canvas
 * whose control has been transferred throws, and it can only have been
 * transferred to the render worker. So the frames are compared as
 * screenshots below, the way the route screenshot gate compares them.
 */
const CANVAS_OWNERSHIP = `(() => {
  const canvas = document.querySelector('#app canvas');
  if (!canvas) return 'no canvas';
  try {
    return canvas.getContext('2d') === null ? 'no context' : 'main thread';
  } catch (error) {
    return String(error.message).includes('transferred') ? 'worker' : 'threw: ' + error.message;
  }
})()`;

/** Everything the accessibility mirror is saying, which is the screen in text. */
const READ_MIRROR = `(() => {
  const mirror = document.querySelector('[data-gesso-semantics]');
  if (!mirror || mirror.children.length === 0) return null;
  return {
    text: mirror.textContent,
    controls: Array.from(mirror.querySelectorAll('[role]')).map(el => el.getAttribute('role') + ':' + el.getAttribute('aria-label'))
  };
})()`;

/** Where the mirror says the named control is, in CSS pixels. */
const findControl = (role: string, name: string) => `(() => {
  const el = document.querySelector('[data-gesso-semantics] [role="${role}"][aria-label="${name}"]');
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
})()`;

function run(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/** The names the generated screen has to expose, whatever else it grows. */
function checkTemplateShape(app: string): void {
  // The literal `new Worker(new URL(...))` used to be asserted here,
  // because a refactor into a variable would leave the template looking
  // fine and emitting no worker chunk. It is now written by
  // `@gesso/vite-plugin` instead of by the template,
  // so what has to be true has moved: the config has to carry the
  // plugin, and `main.ts` has to be free of the incantation the plugin
  // exists to remove. The chunk itself is still checked, harder than a
  // string search could: the browser below has to start a real worker.
  const config = readFileSync(join(app, 'vite.config.ts'), 'utf8');
  if (!config.includes('gesso()')) {
    throw new Error('vite.config.ts no longer uses @gesso/vite-plugin, so nothing will construct the render worker.');
  }
  const main = readFileSync(join(app, 'src', 'main.ts'), 'utf8');
  if (/^\s*renderWorker:/m.test(main)) {
    throw new Error('src/main.ts names a worker again; the plugin is meant to be what writes that.');
  }
  const tsconfig = readFileSync(join(app, 'tsconfig.json'), 'utf8');
  for (const line of ['"jsx": "react-jsx"', '"jsxImportSource": "@gesso/framework"']) {
    if (!tsconfig.includes(line)) {
      throw new Error(`tsconfig.json is missing ${line}, so the template's markup will not compile.`);
    }
  }
  if (!existsSync(join(app, 'src', 'App.tsx'))) {
    throw new Error('The template stopped being JSX; the documentation teaches JSX.');
  }
}

/**
 * The names the Electrobun template has to keep, whatever else it grows.
 *
 * Three of them are the shape of the window: the worker construction
 * written out where a bundler can see it (this template has no Vite
 * plugin to write it), the Vite config aliasing the projected SDK, and
 * the two JSX lines. Two are the fixes a fresh scaffold needed on the
 * day it was first opened: npm underneath `hutch
 * install`, because Hutch's own resolver cannot follow the relative
 * `file:` overrides the vendored packages rely on, and the Hutch pin on
 * the first line, because a newer launcher failed the distributable
 * build. A template that lost either would install or build for whoever
 * edited it and fail for the next person.
 */
function checkElectrobunTemplateShape(app: string): void {
  const main = readFileSync(join(app, 'src', 'view', 'main.ts'), 'utf8');
  if (!main.includes("new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })")) {
    throw new Error(
      'src/view/main.ts no longer constructs the render worker literally, so no chunk will be emitted for it.'
    );
  }
  const config = readFileSync(join(app, 'vite.config.ts'), 'utf8');
  if (!config.includes('electrobunViteAliases')) {
    throw new Error("vite.config.ts no longer aliases the projected SDK, so 'electrobun/view' will not resolve.");
  }
  const tsconfig = readFileSync(join(app, 'tsconfig.json'), 'utf8');
  for (const line of ['"jsx": "react-jsx"', '"jsxImportSource": "@gesso/framework"']) {
    if (!tsconfig.includes(line)) {
      throw new Error(`tsconfig.json is missing ${line}, so the template's markup will not compile.`);
    }
  }
  if (!existsSync(join(app, 'src', 'render', 'App.tsx'))) {
    throw new Error('The template stopped being JSX; the documentation teaches JSX.');
  }
  const hutch = readFileSync(join(app, 'hutch.config.ts'), 'utf8');
  if (!/^\/\/ @hutch cli=\d+\.\d+\.\d+/.test(hutch)) {
    throw new Error(
      'hutch.config.ts no longer begins with the `// @hutch cli=` pin, so `hutch run` will fetch whatever launcher is newest.'
    );
  }
  if (!hutch.includes("packageManager: 'npm'")) {
    throw new Error(
      "hutch.config.ts no longer selects npm, so `hutch install` will fail on the vendored packages' overrides."
    );
  }
}

/**
 * Where Hutch is.
 *
 * `HUTCH` names the binary outright. Failing that, the path; failing
 * that, the place the Electrobun npm bootstrap caches the launcher,
 * under `HUTCH_HOME` or `~/.hutch`, for any Electrobun version. Nothing
 * is downloaded here: the toolchain is a few hundred megabytes and
 * fetching it is a decision for whoever runs this, not for the gate.
 */
function findHutch(): string {
  if (process.env.HUTCH !== undefined && existsSync(process.env.HUTCH)) {
    return process.env.HUTCH;
  }
  const binary = process.platform === 'win32' ? 'hutch.exe' : 'hutch';
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir !== '' && existsSync(join(dir, binary))) {
      return join(dir, binary);
    }
  }
  const platform = `${process.platform === 'darwin' ? 'darwin' : process.platform}-${process.arch}`;
  const homes = [process.env.HUTCH_HOME, join(homedir(), '.hutch')].filter(
    (home): home is string => home !== undefined
  );
  for (const home of homes) {
    const bootstrap = join(home, 'npm', 'electrobun');
    if (!existsSync(bootstrap)) {
      continue;
    }
    for (const version of readdirSync(bootstrap).sort().reverse()) {
      const candidate = join(bootstrap, version, platform, 'bin', binary);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(
    'hutch was not found. Set HUTCH to the binary, put it on the path, or run\n' +
      '`npx electrobun@2.0.1 --help` once, which caches the launcher under ~/.hutch/npm.'
  );
}

/** The one directory matching a prefix, or an error naming what was there. */
function onlyChild(dir: string, prefix: string): string {
  const matches = existsSync(dir) ? readdirSync(dir).filter(entry => entry.startsWith(prefix)) : [];
  if (matches.length !== 1) {
    throw new Error(`Expected one ${prefix}* under ${dir}, found ${matches.length ? matches.join(', ') : 'nothing'}.`);
  }
  return join(dir, matches[0]);
}

/**
 * Scaffolds the Electrobun template and takes it as far as a build.
 *
 * The development bundle is built and read before the distributable
 * one, because only the former leaves its files loose: the page, the
 * render worker's chunk under `assets` (which is what lets the window
 * start a worker at all), and the main-process bundle, which has to
 * carry the RPC handler for the scaffold's `src/main` to have been
 * bundled with the vendored adapter. The distributable build compresses
 * all of that into an archive, so for it the assertion is that the
 * launcher and the archive exist.
 */
async function checkElectrobun(app: string): Promise<void> {
  const hutch = findHutch();
  console.log(`  using ${hutch}`);
  checkElectrobunTemplateShape(app);

  console.log('installing it (hutch install, npm underneath)…');
  run(hutch, ['install'], app);
  if (!existsSync(join(app, 'node_modules', '@gesso', 'electrobun', 'package.json'))) {
    throw new Error('hutch install finished without @gesso/electrobun in node_modules.');
  }

  console.log('typechecking it…');
  run(hutch, ['run', 'typecheck'], app);

  console.log('building the window and a development bundle…');
  run(hutch, ['electrobun', 'prepare'], app);
  run(hutch, ['pm', 'exec', '--', 'vite', 'build', '--logLevel', 'warn'], app);
  run(hutch, ['electrobun', 'build'], app);
  const dev = onlyChild(onlyChild(join(app, 'build'), 'dev-'), 'my-app');
  const views = join(dev, 'Resources', 'app', 'views', 'mainview');
  if (!existsSync(join(views, 'index.html'))) {
    throw new Error(`The bundle has no page at ${join(views, 'index.html')}.`);
  }
  const assets = existsSync(join(views, 'assets')) ? readdirSync(join(views, 'assets')) : [];
  if (!assets.some(asset => asset.startsWith('render.worker-') && asset.endsWith('.js'))) {
    throw new Error(`The bundle carries no render worker chunk. Assets: ${assets.join(', ') || 'none'}.`);
  }
  const mainBundle = join(dev, 'Resources', 'app', 'bun', 'index.js');
  if (!existsSync(mainBundle) || !readFileSync(mainBundle, 'utf8').includes('gessoFrame')) {
    throw new Error(`The main process bundle at ${mainBundle} is missing, or does not carry the gessoFrame handler.`);
  }
  console.log(`  the page, the render worker chunk and the main process bundle are all in ${dev}`);

  console.log('building the distributable…');
  run(hutch, ['electrobun', 'build', '--env=stable'], app);
  const stable = onlyChild(onlyChild(join(app, 'build'), 'stable-'), 'my-app');
  const launcher = join(stable, 'bin', process.platform === 'win32' ? 'launcher.exe' : 'launcher');
  const archives = readdirSync(join(stable, 'Resources')).filter(entry => entry.endsWith('.tar.zst'));
  if (!existsSync(launcher) || archives.length === 0) {
    throw new Error(`The distributable at ${stable} has no launcher or no archive.`);
  }
  console.log(`  ${stable} has a launcher and ${archives[0]}`);
  console.log(
    '\nscaffold check ok: create-gesso-app --template electrobun produces a project that installs, typechecks and builds.\n' +
      'No window was opened, because nothing headless can.'
  );
}

/**
 * Waits for a dedicated worker to exist in the browser.
 *
 * The target's `url` is reported empty for a module worker, so there is
 * nothing to match on but the type. That is enough here: the page this
 * check opens has exactly one worker to start, and if `renderWorker`
 * had not been called there would be none.
 */
async function waitForWorkerTarget(): Promise<void> {
  await waitFor(
    'the render worker to start',
    async () => {
      const targets = (await (await fetch(`http://localhost:${DEVTOOLS_PORT}/json`)).json()) as { type: string }[];
      return targets.some(target => target.type === 'worker') ? true : undefined;
    },
    20_000
  );
}

/** A PNG of the page, base64, for telling one frame from the next. */
async function screenshot(devtools: DevTools): Promise<string> {
  const reply = (await devtools.send('Page.captureScreenshot', { format: 'png' })) as { data: string };
  return reply.data;
}

async function main(): Promise<void> {
  // Found before anything is scaffolded, so a machine without a browser
  // fails in a sentence rather than after an install.
  const chrome = template === 'web' ? findChrome() : undefined;
  const work = mkdtempSync(join(tmpdir(), 'gesso-scaffold-'));
  const app = join(work, 'my-app');
  const profile = join(work, 'chrome-profile');
  let dev: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  try {
    console.log(`scaffolding the ${template} template…`);
    run(
      'node',
      [
        join('packages', 'create-gesso-app', 'bin', 'create-gesso-app.ts'),
        app,
        '--name',
        'my-app',
        '--template',
        template,
        ...(build ? [] : ['--no-build'])
      ],
      root
    );
    if (template === 'electrobun') {
      await checkElectrobun(app);
      return;
    }
    checkTemplateShape(app);

    // npm, not pnpm, and for the reason the generated README gives: the
    // vendored tarballs satisfy each other's version ranges in npm's
    // tree, and pnpm 11 resolves them against a registry instead.
    console.log('installing it…');
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], app);

    console.log('typechecking it…');
    run('npm', ['run', '--silent', 'typecheck'], app);

    console.log('building it…');
    run('npm', ['run', '--silent', 'build', '--', '--logLevel', 'warn'], app);

    console.log('starting the dev server the CLI told them to start…');
    // Its own process group, so the vite that `npm run dev` spawns can
    // be stopped with it. Nothing outside this group is ever signalled:
    // the ports another server holds are that server's business.
    dev = spawn('npm', ['run', '--silent', 'dev', '--', '--port', String(DEV_PORT), '--strictPort'], {
      cwd: app,
      stdio: 'ignore',
      detached: true
    });
    const pageUrl = `http://localhost:${DEV_PORT}/`;
    await waitFor('the dev server', async () => ((await fetch(pageUrl)).ok ? true : undefined), 60_000);

    ({ browser, devtools } = await openPage(chrome!, {
      url: pageUrl,
      devtoolsPort: DEVTOOLS_PORT,
      windowSize: [800, 600],
      profileDir: profile
    }));

    await waitForWorkerTarget();

    const mirror = await waitFor(
      'the screen to reach the accessibility mirror',
      async () => (await devtools!.evaluate<{ text: string; controls: string[] } | null>(READ_MIRROR)) ?? undefined,
      30_000
    );
    for (const control of ['button:Add one', 'switch:Show the hint']) {
      if (!mirror.controls.includes(control)) {
        throw new Error(`The screen is missing ${control}. It has: ${mirror.controls.join(', ') || 'nothing'}.`);
      }
    }
    if (!mirror.text.includes('Clicks: 0')) {
      throw new Error(`The counter did not start at zero. The screen reads: ${mirror.text}`);
    }
    console.log(`  the screen reads "${mirror.text}" and offers ${mirror.controls.join(', ')}`);

    // Asked after the screen is up, because the canvas is handed over
    // as the app mounts rather than as the element is created.
    const ownership = await devtools.evaluate<string>(CANVAS_OWNERSHIP);
    if (ownership !== 'worker') {
      throw new Error(`The canvas is drawn on the ${ownership}, so the scaffold is not the worker configuration.`);
    }
    console.log('  the canvas has been transferred, so the interface is being painted off the main thread');

    const button = await waitFor(
      'the button to be laid out',
      async () =>
        (await devtools!.evaluate<{ x: number; y: number } | null>(findControl('button', 'Add one'))) ?? undefined,
      15_000
    );

    // The pointer is parked in the corner for both pictures. Hover and
    // press are published as interaction state, so a frame taken with
    // the cursor on the button would differ from one taken with it away
    // whether or not the click ever reached `onClick`; parked at both
    // ends, the only thing left that can have changed is the count.
    await devtools.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    let last = await screenshot(devtools);
    const before = await waitFor(
      'the screen to stop changing on its own',
      async () => {
        const shot = await screenshot(devtools!);
        const settled = shot === last;
        last = shot;
        return settled ? shot : undefined;
      },
      10_000
    );

    for (const type of ['mousePressed', 'mouseReleased'] as const) {
      await devtools.send('Input.dispatchMouseEvent', {
        type,
        x: button.x,
        y: button.y,
        button: 'left',
        clickCount: 1
      });
    }
    await devtools.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });

    // The picture, and not the mirror's text, is what says the count
    // moved. A bound `text` change repaints but is not re-emitted as a
    // semantics patch, so the mirror still reads `Clicks: 0` after a
    // click that plainly painted `Clicks: 1`. That is a defect in
    // `@gesso/framework` and not a thing this scaffold can work around; when it is fixed,
    // this can assert on the text instead, which would be the better
    // check.
    const after = await waitFor(
      `the frame to change after clicking (${button.x}, ${button.y})`,
      async () => {
        const shot = await screenshot(devtools!);
        return shot !== before ? shot : undefined;
      },
      10_000
    );
    console.log(`  clicking the button repainted the screen (${before.length} to ${after.length} bytes of PNG)`);
    console.log(
      '\nscaffold check ok: create-gesso-app produces a project that installs, typechecks, builds and counts.'
    );
  } finally {
    devtools?.close();
    browser?.kill();
    if (dev?.pid !== undefined) {
      try {
        process.kill(-dev.pid, 'SIGTERM');
      } catch {
        dev.kill();
      }
    }
    if (keep) {
      console.log(`project kept at ${app}`);
    } else {
      // Never let cleanup mask the failure that brought us here.
      try {
        rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        console.warn(`could not remove ${work}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

main().catch(error => {
  console.error(`\nscaffold check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
