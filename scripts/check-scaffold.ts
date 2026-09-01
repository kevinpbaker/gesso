/**
 * Scaffold check (`ROADMAP.md` F7's last item).
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
 *   node scripts/check-scaffold.ts           # scaffold, install, build, run
 *   node scripts/check-scaffold.ts --keep    # leave the project behind
 *   node scripts/check-scaffold.ts --no-build  # trust the built dist
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DevTools, findChrome, openPage, waitFor } from './lib/devtools.ts';

/** Not 5173 or 5174: those belong to whatever the developer already has running. */
const DEV_PORT = 5186;
const DEVTOOLS_PORT = 9336;
const root = join(import.meta.dirname, '..');
const keep = process.argv.includes('--keep');
const build = !process.argv.includes('--no-build');

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
  const main = readFileSync(join(app, 'src', 'main.ts'), 'utf8');
  if (!main.includes("new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })")) {
    throw new Error('src/main.ts no longer constructs the worker literally, so no bundler will emit its chunk.');
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
  const chrome = findChrome();
  const work = mkdtempSync(join(tmpdir(), 'gesso-scaffold-'));
  const app = join(work, 'my-app');
  const profile = join(work, 'chrome-profile');
  let dev: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;

  try {
    console.log('scaffolding…');
    run(
      'node',
      [
        join('packages', 'create-gesso-app', 'bin', 'create-gesso-app.ts'),
        app,
        '--name',
        'my-app',
        ...(build ? [] : ['--no-build'])
      ],
      root
    );
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

    ({ browser, devtools } = await openPage(chrome, {
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
    // `@gesso/framework`, recorded in `decisions/0048-create-gesso-app.md`
    // and not a thing this scaffold can work around; when it is fixed,
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
