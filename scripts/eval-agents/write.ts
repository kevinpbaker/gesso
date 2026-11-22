/**
 * The write half of the agent eval: a fresh agent builds the same small
 * app twice, once from `create-gesso-app` and once from a Vite + React
 * starter, and the result is scored for what it cost to get to green and
 * for whether another agent can then operate it.
 *
 *   node scripts/eval-agents.ts --write                    both arms, once
 *   node scripts/eval-agents.ts --write --repeat 3 --model opus
 *   node scripts/eval-agents.ts --write --no-agent         the harness alone, on the untouched starters
 *
 * Each run starts from a copy of a starter installed once per eval:
 *
 *   - `gesso`: `create-gesso-app --local`, so the packages in this
 *     checkout. The agent has the project's `AGENTS.md` (which its
 *     `CLAUDE.md` loads), the documentation for models (`llms.txt` and
 *     the section files it names, copied into `docs/`), and the dev
 *     server's MCP endpoint with a browser page open on it: the design
 *     tools (`library_*`, `tokens_view`, `render_frame`) and the screen.
 *   - `react`: `evals/agents/react-starter`, React 19 and Vite with a
 *     counter. The agent has what it already knows, and Playwright's MCP
 *     server on a browser page open on the dev server, to look at what it
 *     built, with its tools that run script in the page turned off.
 *
 * In both, the agent can read, write and edit files and run the
 * project's `typecheck` and `build`, and nothing else; it works in a
 * temporary folder, so there is no other source to read.
 *
 * What is scored, after the agent says it is done:
 *
 *   - whether `npm run typecheck` and `npm run build` pass;
 *   - its wrong guesses: the typecheck and build runs it made that
 *     failed, from the transcript;
 *   - what it wrote: files and lines changed against the starter;
 *   - whether it is operable with no extra code: the tools the running
 *     app offers an agent beyond the screen, and a second, fresh agent
 *     given only the arm's MCP server and asked to add an expense, which
 *     passes when the expense is then on the screen.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { findChrome, openPage, waitFor, type DevTools } from '../lib/devtools.ts';
import { mcpRequest, parse, runClaude } from './claude.ts';

const PLAYWRIGHT_MCP = '@playwright/mcp@0.0.86';

/** The app both agents are asked for, word for word. */
export const WRITE_TASK =
  'Build an expense tracker in this project, in place of the starter screen. It lists expenses, each with an ' +
  'amount in dollars, a category (Food, Transport, Home or Fun) and a note. It has a form to add one, a way to ' +
  'delete one that asks the person first, and the total of all of them at the top. Start it with three expenses ' +
  'of your choosing. Keep `npm run typecheck` passing, and look at what you built before you call it done. When ' +
  'you are done, reply with one sentence saying so.';

/**
 * What the build agent is told of its shell, in both arms. It may run
 * `npm run typecheck`, `npm run build` and commands that only read; a
 * file written through the shell is refused, and an agent refused once
 * gave up on the shell and never typechecked (the first full run).
 */
export const SHELL_NOTE =
  ' Write and change files with the Write and Edit tools. The shell runs `npm run typecheck`, `npm run build` ' +
  'and commands that only read, from the project folder as it is.';

/** What a second agent is asked of the result, in both arms. */
export const OPERATE_TASK =
  'An expense tracker is open in front of the person, and your tools reach it. Add an expense of $4.50 in the ' +
  'Food category with the note Coffee. Then reply in one sentence saying what you did. Do not ask them anything.';

export type WriteArmName = 'gesso' | 'react';

interface WriteArm {
  readonly name: WriteArmName;
  readonly port: number;
  /** Told before the task: what this arm's agent has to work with. */
  readonly preamble: string;
  /** The MCP servers the agent has, given the browser's DevTools port. */
  mcp(devtoolsPort: number): object;
  /** Its MCP tools the agents may use. */
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
}

const BUILD_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(npm run typecheck:*)', 'Bash(npm run build:*)'];
const BROWSER_SCRIPT_TOOLS = [
  'mcp__browser__browser_evaluate',
  'mcp__browser__browser_run_code',
  'mcp__browser__browser_run_code_unsafe',
  'mcp__browser__browser_install',
  'mcp__browser__browser_file_upload'
];

function arms(): Record<WriteArmName, WriteArm> {
  return {
    gesso: {
      name: 'gesso',
      port: 5421,
      preamble:
        'You are in a new Gesso project, made with create-gesso-app. Gesso documentation written for models is in ' +
        "docs/llms.txt and the files it names, which are in docs/ too. The app's dev server is running, with the app " +
        'open in a browser, and your MCP tools reach it.\n\n',
      mcp: () => ({ mcpServers: { app: { type: 'http', url: 'http://localhost:5421/__gesso/mcp' } } }),
      allowed: ['mcp__app'],
      disallowed: []
    },
    react: {
      name: 'react',
      port: 5422,
      preamble:
        'You are in a new React project, made with Vite. Its dev server is running, with the app open in a browser, ' +
        'and your MCP tools reach the browser.\n\n',
      mcp: devtoolsPort => ({
        mcpServers: {
          browser: {
            command: 'npx',
            args: ['-y', PLAYWRIGHT_MCP, '--cdp-endpoint', `http://127.0.0.1:${devtoolsPort}`]
          }
        }
      }),
      allowed: ['mcp__browser'],
      disallowed: BROWSER_SCRIPT_TOOLS
    }
  };
}

export interface WriteRun {
  readonly arm: WriteArmName;
  readonly repeat: number;
  readonly harnessError?: string;
  readonly typecheck: boolean;
  readonly typeErrors: number;
  readonly build: boolean;
  /** Typecheck and build runs the agent made, and how many of them failed: its wrong guesses. */
  readonly checks: number;
  readonly wrongGuesses: number;
  readonly toolErrors: number;
  readonly toolCalls: number;
  readonly files: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  /** Tools the running app offers an agent beyond the screen and design tools: its channels'. */
  readonly appTools: readonly string[];
  /** A second agent could add an expense, and it was then on the screen. */
  readonly operable: boolean | null;
  readonly operateCalls: number;
  readonly operateTools: Record<string, number>;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly answer: string;
}

/** Tools every Gesso dev server offers, whatever the app is: not the app's own. */
const GENERIC = /^(ui_|library_|tokens_view$|render_frame$|windows_)/;

export interface WriteOptions {
  readonly root: string;
  readonly model: string;
  readonly repeats: number;
  readonly arms: readonly WriteArmName[];
  /** Run everything but the two agents: what the harness says of the untouched starters. */
  readonly noAgent: boolean;
  readonly keep: boolean;
  readonly out: string;
  readonly meta: Record<string, string>;
}

export async function runWrite(options: WriteOptions): Promise<WriteRun[]> {
  const cache = mkdtempSync(join(tmpdir(), 'gesso-eval-write-'));
  const runs: WriteRun[] = [];
  let devtoolsPort = 9421;
  try {
    for (const name of options.arms) {
      const arm = arms()[name];
      console.log(`preparing the ${name} starter…`);
      const starter = prepare(arm, options.root, cache);
      for (let repeat = 1; repeat <= options.repeats; repeat++) {
        const run = await writeOnce(arm, starter, repeat, options, devtoolsPort);
        devtoolsPort += 2;
        runs.push(run);
        console.log(
          `${name} write #${repeat}: ${run.harnessError !== undefined ? `harness error: ${run.harnessError}` : `typecheck ${run.typecheck ? 'green' : `red (${run.typeErrors})`}, build ${run.build ? 'ok' : 'failed'}, ${run.wrongGuesses} of ${run.checks} checks failed, ${run.files} files +${run.linesAdded}, app tools ${run.appTools.length}, operable ${run.operable ?? 'not asked'}`} ($${run.costUsd.toFixed(2)})`
        );
        writeFileSync(join(options.out, 'write-summary.json'), JSON.stringify({ meta: options.meta, runs }, null, 2));
      }
    }
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
  writeFileSync(join(options.out, 'write-summary.md'), summariseWrite(runs, options.meta));
  return runs;
}

/** A starter installed once, copied for each run. */
function prepare(arm: WriteArm, root: string, cache: string): string {
  const app = join(cache, arm.name, 'my-app');
  mkdirSync(join(cache, arm.name), { recursive: true });
  if (arm.name === 'gesso') {
    execFileSync(
      'node',
      [join('packages', 'create-gesso-app', 'bin', 'create-gesso-app.ts'), app, '--name', 'my-app', '--local'],
      { cwd: root, stdio: 'ignore' }
    );
    const docs = join(root, 'apps/docs/.vitepress/dist');
    if (!existsSync(join(docs, 'llms.txt'))) {
      console.log('building the documentation for its llms.txt…');
      execFileSync('pnpm', ['docs:build'], { cwd: root, stdio: 'ignore' });
    }
    mkdirSync(join(app, 'docs'));
    for (const file of readdirSync(docs).filter(name => /^llms.*\.txt$/.test(name) && name !== 'llms-full.txt')) {
      cpSync(join(docs, file), join(app, 'docs', file));
    }
  } else {
    cpSync(join(root, 'evals/agents/react-starter'), app, {
      recursive: true,
      filter: source => !source.includes('node_modules')
    });
  }
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], { cwd: app, stdio: 'ignore' });
  return app;
}

async function writeOnce(
  arm: WriteArm,
  starter: string,
  repeat: number,
  options: WriteOptions,
  devtoolsPort: number
): Promise<WriteRun> {
  const work = mkdtempSync(join(tmpdir(), 'gesso-eval-write-run-'));
  const app = join(work, 'my-app');
  const transcript = (part: string) => join(options.out, 'transcripts', `write-${arm.name}--${part}--${repeat}.jsonl`);
  cpSync(starter, app, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@localhost', ...args], {
      cwd: app,
      encoding: 'utf8'
    });
  git('init', '-q');
  writeFileSync(join(app, '.gitignore'), 'node_modules\ndist\n');
  git('add', '-A');
  git('commit', '-qm', 'starter');

  let dev: ChildProcess | undefined;
  let browser: ChildProcess | undefined;
  let devtools: DevTools | undefined;
  const profile = join(work, 'chrome');
  const base = { arm: arm.name, repeat };
  try {
    dev = spawn('npx', ['vite', '--port', String(arm.port), '--strictPort'], {
      cwd: app,
      stdio: 'ignore',
      detached: true
    });
    const url = `http://localhost:${arm.port}/`;
    await waitFor(`the ${arm.name} dev server`, async () => ((await fetch(url)).ok ? true : undefined), 60_000);
    ({ browser, devtools } = await openPage(findChrome(), {
      url,
      devtoolsPort,
      windowSize: [1280, 900],
      profileDir: profile
    }));
    await sleep(3000);

    const config = join(work, 'mcp.json');
    writeFileSync(config, JSON.stringify(arm.mcp(devtoolsPort)));
    const agent = (prompt: string, allowed: readonly string[], tools: string, part: string) =>
      runClaude(
        [
          '-p',
          prompt,
          '--output-format',
          'stream-json',
          '--verbose',
          '--model',
          options.model,
          '--mcp-config',
          config,
          '--strict-mcp-config',
          '--tools',
          tools,
          '--setting-sources',
          'project',
          '--no-session-persistence',
          '--permission-mode',
          'dontAsk',
          '--allowedTools',
          ...allowed,
          ...(arm.disallowed.length > 0 ? ['--disallowedTools', ...arm.disallowed] : [])
        ],
        app,
        transcript(part)
      );

    let built = { ...parse([]), checks: 0, wrongGuesses: 0 };
    if (!options.noAgent) {
      const lines = await agent(
        arm.preamble + WRITE_TASK + SHELL_NOTE,
        [...BUILD_TOOLS, ...arm.allowed],
        'Read,Write,Edit,Glob,Grep,Bash',
        'build'
      );
      built = { ...parse(lines), ...checksOf(lines) };
      if (built.mcpProblem !== undefined) throw new Error(built.mcpProblem);
    }

    const typecheck = spawnSync('npm', ['run', '--silent', 'typecheck'], { cwd: app, encoding: 'utf8' });
    const typeErrors = `${typecheck.stdout}${typecheck.stderr}`.match(/error TS\d+/g)?.length ?? 0;
    const build = spawnSync('npm', ['run', '--silent', 'build'], { cwd: app, encoding: 'utf8' });
    git('add', '-A');
    const changed = git('diff', '--cached', '--numstat', 'HEAD')
      .trim()
      .split('\n')
      .filter(line => line !== '' && !line.endsWith('package-lock.json'))
      .map(line => line.split('\t'));

    // A fresh page, on what the agent left.
    await devtools.send('Page.reload');
    await sleep(4000);
    const appTools =
      arm.name === 'gesso'
        ? (
            ((await mcpRequest(`http://localhost:${arm.port}/__gesso/mcp`, 'tools/list'))?.tools ?? []) as {
              name: string;
            }[]
          )
            .map(tool => tool.name)
            .filter(name => !GENERIC.test(name))
        : [];

    let operate = { ...parse([]) };
    let operable: boolean | null = null;
    if (options.noAgent) {
      // What the operate check reads, read from a starter whose screen is known: both have an Add one button.
      const text = await screenText(arm, devtools);
      if (!text.includes('Add one'))
        throw new Error(`The screen could not be read: it says ${JSON.stringify(text.slice(0, 200))}.`);
      if (arm.name === 'gesso') {
        // What the build agent looks at its work with: the screen tools must answer on the starter.
        const snapshot = await mcpRequest(`http://localhost:${arm.port}/__gesso/mcp`, 'tools/call', {
          name: 'ui_snapshot',
          arguments: {}
        });
        const said = (snapshot?.content?.[0]?.text ?? JSON.stringify(snapshot)) as string;
        if (snapshot?.isError === true || !said.includes('Add one'))
          throw new Error(`ui_snapshot could not read the starter: it says ${JSON.stringify(said.slice(0, 200))}.`);
      }
    } else {
      operate = parse(await agent(OPERATE_TASK, arm.allowed, '', 'operate'));
      operable = (await screenText(arm, devtools)).includes('Coffee');
    }

    return {
      ...base,
      typecheck: typecheck.status === 0,
      typeErrors,
      build: build.status === 0,
      checks: built.checks,
      wrongGuesses: built.wrongGuesses,
      toolErrors: built.toolErrors,
      toolCalls: built.toolCalls,
      files: changed.length,
      linesAdded: changed.reduce((sum, [added]) => sum + (Number(added) || 0), 0),
      linesRemoved: changed.reduce((sum, [, removed]) => sum + (Number(removed) || 0), 0),
      appTools,
      operable,
      operateCalls: operate.toolCalls,
      operateTools: operate.tools,
      costUsd: built.costUsd + operate.costUsd,
      durationMs: built.durationMs + operate.durationMs,
      answer: built.answer
    };
  } catch (error) {
    return {
      ...base,
      harnessError: error instanceof Error ? error.message : String(error),
      typecheck: false,
      typeErrors: 0,
      build: false,
      checks: 0,
      wrongGuesses: 0,
      toolErrors: 0,
      toolCalls: 0,
      files: 0,
      linesAdded: 0,
      linesRemoved: 0,
      appTools: [],
      operable: null,
      operateCalls: 0,
      operateTools: {},
      costUsd: 0,
      durationMs: 0,
      answer: ''
    };
  } finally {
    devtools?.close();
    browser?.kill();
    // Its own process group: npx leaves Vite running when only it is killed.
    if (dev?.pid !== undefined) {
      try {
        process.kill(-dev.pid);
      } catch {
        // Already gone.
      }
    }
    await sleep(300);
    if (options.keep) console.log(`  kept ${app}`);
    else rmSync(work, { recursive: true, force: true });
  }
}

/** What the person would read on the screen now: the semantics outline for Gesso, the page's text for React. */
async function screenText(arm: WriteArm, devtools: DevTools): Promise<string> {
  if (arm.name === 'react') return devtools.evaluate<string>('document.body.innerText');
  const result = await mcpRequest(`http://localhost:${arm.port}/__gesso/mcp`, 'tools/call', {
    name: 'ui_snapshot',
    arguments: {}
  });
  return ((result?.content ?? []) as { text?: string }[]).map(part => part.text ?? '').join('\n');
}

/**
 * The typecheck and build runs a transcript shows, and how many failed:
 * a Bash call whose command runs `typecheck`, `tsc` or `build`, and
 * whose result is an error.
 */
export function checksOf(lines: readonly string[]): { checks: number; wrongGuesses: number } {
  const commands = new Map<string, string>();
  let checks = 0;
  let wrongGuesses = 0;
  for (const line of lines) {
    let event: Record<string, any>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    for (const part of event.message?.content ?? []) {
      if (event.type === 'assistant' && part.type === 'tool_use' && part.name === 'Bash') {
        commands.set(part.id, String(part.input?.command ?? ''));
      }
      if (event.type === 'user' && part.type === 'tool_result' && commands.has(part.tool_use_id)) {
        if (/\b(typecheck|tsc|build)\b/.test(commands.get(part.tool_use_id)!)) {
          checks++;
          if (part.is_error === true) wrongGuesses++;
        }
      }
    }
  }
  return { checks, wrongGuesses };
}

const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export function summariseWrite(runs: readonly WriteRun[], meta: Record<string, string>): string {
  const names = [...new Set(runs.map(run => run.arm))];
  const judged = (arm: string) => runs.filter(run => run.arm === arm && run.harnessError === undefined);
  const count = (done: readonly WriteRun[], pick: (run: WriteRun) => boolean) =>
    `${done.filter(pick).length} of ${done.length}`;
  return (
    [
      `# Agent eval, writing, ${meta.date}`,
      '',
      Object.entries(meta)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n'),
      '',
      '| Arm | Typecheck green | Build | Median wrong guesses | Median checks | Median files | Median lines added | App tools | Operable | Cost |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...names.map(arm => {
        const done = judged(arm);
        return `| ${arm} | ${count(done, run => run.typecheck)} | ${count(done, run => run.build)} | ${median(done.map(r => r.wrongGuesses))} | ${median(done.map(r => r.checks))} | ${median(done.map(r => r.files))} | ${median(done.map(r => r.linesAdded))} | ${median(done.map(r => r.appTools.length))} | ${count(done, run => run.operable === true)} | $${done.reduce((sum, r) => sum + r.costUsd, 0).toFixed(2)} |`;
      }),
      '',
      '## Every run',
      '',
      '| Arm | # | Typecheck | Build | Wrong guesses | Files | +Lines | App tools | Operable | Operating calls |',
      '| --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | ---: |',
      ...runs.map(run =>
        run.harnessError !== undefined
          ? `| ${run.arm} | ${run.repeat} | harness error: ${run.harnessError.replace(/\|/g, '/').slice(0, 120)} | | | | | | | |`
          : `| ${run.arm} | ${run.repeat} | ${run.typecheck ? 'green' : `${run.typeErrors} errors`} | ${run.build ? 'ok' : 'failed'} | ${run.wrongGuesses} of ${run.checks} | ${run.files} | ${run.linesAdded} | ${run.appTools.join(', ') || 'none'} | ${run.operable === null ? 'not asked' : run.operable ? 'yes' : 'no'} | ${run.operateCalls} |`
      )
    ].join('\n') + '\n'
  );
}
