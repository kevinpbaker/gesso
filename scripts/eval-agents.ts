/**
 * The agent eval: the same tasks, asked of the same agent, in the same
 * issue tracker built twice, once in Gesso and once in React.
 *
 *   node scripts/eval-agents.ts                       every task, every arm, once
 *   node scripts/eval-agents.ts --repeat 3            three runs of each
 *   node scripts/eval-agents.ts --arms gesso,react --tasks assign-one,delete
 *   node scripts/eval-agents.ts --model sonnet
 *   node scripts/eval-agents.ts --write               the writing half: see `eval-agents/write.ts`
 *
 * Three arms, differing only in how the agent reaches the tracker:
 *
 *   - `gesso`: the Gesso tracker's own MCP endpoint, everything on it:
 *     the channel (`tracker_view`, `tracker_update` …) and the screen
 *     (`ui_snapshot`, `ui_press` …). What a Gesso app offers with
 *     nothing more written than its contract's JSDoc.
 *   - `gesso-screen`: the same endpoint with only the screen tools, to
 *     tell how much is the channel and how much is the semantics tree.
 *   - `react`: the React twin through Playwright's MCP server, attached
 *     to the same kind of headless Chrome. What an agent has for a React
 *     app nobody wrote an agent interface for. Its tools that run
 *     scripts in the page are turned off, so the agent works the screen
 *     as a person would, as the Gesso arms do.
 *
 * The agent is Claude Code itself, `claude -p`, signed in as whoever
 * runs this, with every built-in tool off, no settings but the run's own
 * and nothing but the arm's MCP server, in an empty folder. Each run
 * gets a fresh browser and a freshly seeded tracker; the checker reads
 * the tracker's issues afterwards (`scripts/eval-agents/tasks.ts`).
 * A `@confirm` command in the Gesso arms puts `window.confirm` to the
 * person; here the runner answers yes and counts that it was asked.
 *
 * Results go to `evals/agents/results/<date>-<model>/`: `summary.md`,
 * `summary.json`, and every run's transcript. `evals/agents/README.md`
 * says what this measures and what it does not.
 *
 * It spends the signed-in account's usage: about a few cents to a dime
 * a run on Sonnet. `--dry` prints what it would run and stops.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import type { Issue } from '../apps/eval-tracker/src/model.ts';
import { findChrome, openPage, waitFor, type DevTools } from './lib/devtools.ts';
import { mcpTool, parse, runClaude } from './eval-agents/claude.ts';
import { tasks, type Task, type Verdict } from './eval-agents/tasks.ts';
import { OPERATE_TASK, runWrite, summariseWrite, WRITE_TASK, type WriteArmName } from './eval-agents/write.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT_MCP = '@playwright/mcp@0.0.86';

/** Told before every task, the same in every arm: what is in front of the agent, and how to finish. */
const PREAMBLE =
  'An issue tracker is open in front of the person, and your tools reach it. Do what they ask in it, then reply ' +
  'in one or two sentences saying what you did or answering their question. Do not ask them anything back.\n\n';

type ArmName = 'gesso' | 'gesso-screen' | 'react';

interface Arm {
  readonly name: ArmName;
  readonly port: number;
  /** Starts the app's dev server. */
  serve(): ChildProcess;
  /** The MCP config for `claude`, given the browser's DevTools port. */
  mcp(devtoolsPort: number): object;
  readonly allowed: readonly string[];
  readonly disallowed: readonly string[];
  /** Waits for the app in the browser to be ready to be worked. */
  ready(devtools: DevTools): Promise<void>;
  /** The tracker's issues as they are now. */
  issues(devtools: DevTools): Promise<Issue[]>;
}

const SCREEN_TOOLS = ['ui_snapshot', 'ui_press', 'ui_type', 'ui_focus', 'ui_key'].map(t => `mcp__tracker__${t}`);

function gessoArm(name: 'gesso' | 'gesso-screen', port: number): Arm {
  const url = `http://localhost:${port}/__gesso/mcp`;
  return {
    name,
    port,
    serve: () =>
      spawn('pnpm', ['--filter', 'gesso-eval-tracker', 'exec', 'vite', '--port', String(port), '--strictPort'], {
        cwd: root,
        stdio: 'ignore',
        detached: true
      }),
    mcp: () => ({ mcpServers: { tracker: { type: 'http', url } } }),
    allowed: name === 'gesso' ? ['mcp__tracker'] : SCREEN_TOOLS,
    disallowed:
      name === 'gesso'
        ? []
        : [
            'mcp__tracker__tracker_view',
            'mcp__tracker__tracker_update',
            'mcp__tracker__tracker_create',
            'mcp__tracker__tracker_remove'
          ],
    ready: async () => {
      await waitFor(
        'the tracker on the MCP endpoint',
        async () => ((await mcpTool(url, 'tracker_view')) === null ? undefined : true),
        30_000
      );
    },
    issues: async () => {
      const view = (await mcpTool(url, 'tracker_view')) as { issues: (Issue & Record<string, unknown>)[] };
      return view.issues.map(({ key, title, status, priority, assigneeId, labelIds }) => ({
        key,
        title,
        status,
        priority,
        assigneeId,
        labelIds
      }));
    }
  };
}

function reactArm(port: number): Arm {
  const dir = join(root, 'evals/agents/react-tracker');
  return {
    name: 'react',
    port,
    serve: () => {
      if (!existsSync(join(dir, 'node_modules'))) execFileSync('npm', ['ci'], { cwd: dir, stdio: 'inherit' });
      return spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
        cwd: dir,
        stdio: 'ignore',
        detached: true
      });
    },
    mcp: devtoolsPort => ({
      mcpServers: {
        browser: { command: 'npx', args: ['-y', PLAYWRIGHT_MCP, '--cdp-endpoint', `http://127.0.0.1:${devtoolsPort}`] }
      }
    }),
    allowed: ['mcp__browser'],
    // Running script in the page reaches past the screen, which the Gesso arms cannot; the rest leave the page.
    disallowed: [
      'mcp__browser__browser_evaluate',
      'mcp__browser__browser_run_code',
      'mcp__browser__browser_run_code_unsafe',
      'mcp__browser__browser_install',
      'mcp__browser__browser_file_upload'
    ],
    ready: async devtools => {
      await waitFor(
        'the React tracker',
        async () =>
          (await devtools.evaluate<boolean>(`typeof window.__evalTracker === 'function'`)) ? true : undefined,
        30_000
      );
    },
    issues: devtools => devtools.evaluate<Issue[]>('window.__evalTracker()')
  };
}

interface Run {
  readonly arm: ArmName;
  readonly task: string;
  readonly repeat: number;
  readonly verdict: Verdict;
  /** The run could not be judged: the harness failed, not the agent. */
  readonly harnessError?: string;
  readonly toolCalls: number;
  readonly toolErrors: number;
  readonly tools: Record<string, number>;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly turns: number;
  /** How many times the person was asked to approve something. */
  readonly asked: number;
  readonly answer: string;
}

async function runOnce(
  arm: Arm,
  task: Task,
  repeat: number,
  model: string,
  out: string,
  devtoolsPort: number
): Promise<Run> {
  const profile = mkdtempSync(join(tmpdir(), 'gesso-eval-chrome-'));
  const work = mkdtempSync(join(tmpdir(), 'gesso-eval-agent-'));
  const transcript = join(out, 'transcripts', `${arm.name}--${task.id}--${repeat}.jsonl`);
  const base = { arm: arm.name, task: task.id, repeat };
  let opened: Awaited<ReturnType<typeof openPage>> | undefined;
  let person: Awaited<ReturnType<typeof thePerson>> | undefined;
  try {
    // A browser that will not start is this run's harness error, not the end of the eval.
    opened = await openPage(findChrome(), {
      url: `http://localhost:${arm.port}/`,
      devtoolsPort,
      windowSize: [1280, 900],
      profileDir: profile
    });
    const { devtools } = opened;
    person = await thePerson(devtoolsPort);
    await arm.ready(devtools);
    const config = join(work, 'mcp.json');
    writeFileSync(config, JSON.stringify(arm.mcp(devtoolsPort)));
    const args = [
      '-p',
      PREAMBLE + task.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      model,
      '--mcp-config',
      config,
      '--strict-mcp-config',
      '--tools',
      '',
      '--setting-sources',
      'project',
      '--no-session-persistence',
      '--permission-mode',
      'dontAsk',
      '--allowedTools',
      ...arm.allowed,
      ...(arm.disallowed.length > 0 ? ['--disallowedTools', ...arm.disallowed] : [])
    ];
    const lines = await runClaude(args, work, transcript);
    const parsed = parse(lines);
    if (parsed.mcpProblem !== undefined) {
      return { ...base, ...parsed, asked: 0, verdict: fail('not judged'), harnessError: parsed.mcpProblem };
    }
    const asked = person.asked.length;
    const issues = await arm.issues(devtools);
    return { ...base, ...parsed, asked, verdict: task.check({ issues, answer: parsed.answer }) };
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      verdict: fail('not judged'),
      harnessError: said,
      toolCalls: 0,
      toolErrors: 0,
      tools: {},
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      turns: 0,
      asked: 0,
      answer: ''
    };
  } finally {
    person?.close();
    opened?.devtools.close();
    opened?.browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * The person at the browser, as far as an agent's request reaches them:
 * every dialog the page opens (a Gesso `@confirm` command's
 * `window.confirm`) is written down and answered yes, as they would
 * click OK. Over a connection of its own to the page, with the Page
 * domain enabled, so it holds across a reload.
 */
async function thePerson(devtoolsPort: number): Promise<{ asked: string[]; close(): void }> {
  const targets = (await (await fetch(`http://localhost:${devtoolsPort}/json`)).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const page = targets.find(target => target.type === 'page')!;
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  const asked: string[] = [];
  let id = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as { method?: string; params?: { message?: string } };
    if (message.method === 'Page.javascriptDialogOpening') {
      asked.push(message.params?.message ?? '');
      socket.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    }
  });
  socket.send(JSON.stringify({ id: id++, method: 'Page.enable' }));
  return { asked, close: () => socket.close() };
}

const fail = (why: string): Verdict => ({ pass: false, why });

/**
 * Opens the app once before its runs and lets it settle. A dev server
 * optimises dependencies on the first load and then reloads the page,
 * which in a run would reset the tracker under the agent.
 */
async function warm(arm: Arm, devtoolsPort: number): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), 'gesso-eval-chrome-'));
  const { browser, devtools } = await openPage(findChrome(), {
    url: `http://localhost:${arm.port}/`,
    devtoolsPort,
    windowSize: [1280, 900],
    profileDir: profile
  });
  try {
    await arm.ready(devtools);
    await sleep(5000);
  } finally {
    devtools.close();
    browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

const median = (values: readonly number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

function summarise(runs: readonly Run[], meta: Record<string, string>): string {
  const arms = [...new Set(runs.map(run => run.arm))];
  const taskIds = [...new Set(runs.map(run => run.task))];
  const judged = (arm: string) => runs.filter(run => run.arm === arm && run.harnessError === undefined);
  const k = (n: number) => `${(n / 1000).toFixed(0)}k`;
  const lines = [
    `# Agent eval, ${meta.date}`,
    '',
    Object.entries(meta)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n'),
    '',
    '| Arm | Tasks passed | Median tool calls | Median input tokens | Median output tokens | Median time | Cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...arms.map(arm => {
      const done = judged(arm);
      return `| ${arm} | ${done.filter(run => run.verdict.pass).length} of ${done.length} | ${median(done.map(r => r.toolCalls))} | ${k(median(done.map(r => r.inputTokens)))} | ${k(median(done.map(r => r.outputTokens)))} | ${(median(done.map(r => r.durationMs)) / 1000).toFixed(0)} s | $${done.reduce((a, r) => a + r.costUsd, 0).toFixed(2)} |`;
    }),
    '',
    '## By task',
    '',
    `| Task | ${arms.join(' | ')} |`,
    `| --- | ${arms.map(() => '---').join(' | ')} |`,
    ...taskIds.map(task => {
      const cells = arms.map(arm => {
        const these = runs.filter(run => run.arm === arm && run.task === task && run.harnessError === undefined);
        if (these.length === 0) return 'not run';
        return `${these.filter(run => run.verdict.pass).length}/${these.length}, ${median(these.map(r => r.toolCalls))} calls`;
      });
      return `| ${task} | ${cells.join(' | ')} |`;
    }),
    '',
    '## Every run',
    '',
    '| Arm | Task | # | Result | Calls | Errors | Asked | Why |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | --- |',
    ...runs.map(
      run =>
        `| ${run.arm} | ${run.task} | ${run.repeat} | ${run.harnessError !== undefined ? 'harness error' : run.verdict.pass ? 'pass' : 'fail'} | ${run.toolCalls} | ${run.toolErrors} | ${run.asked} | ${(run.harnessError ?? run.verdict.why).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} |`
    )
  ];
  return lines.join('\n') + '\n';
}

function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback);
}

async function mainWrite(model: string, repeats: number): Promise<void> {
  const armNames = option('arms', 'gesso,react').split(',') as WriteArmName[];
  const noAgent = process.argv.includes('--no-agent');
  console.log(
    `Writing: ${armNames.length} arms × ${repeats} = ${armNames.length * repeats} runs on ${model}` +
      `${noAgent ? ', with no agent (the harness alone, on the untouched starters)' : ''}.`
  );
  if (process.argv.includes('--dry')) {
    console.log(`  build: ${WRITE_TASK}\n  then operate: ${OPERATE_TASK}`);
    return;
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = join(root, 'evals/agents/results', `${stamp}-${model}-write${noAgent ? '-no-agent' : ''}`);
  mkdirSync(join(out, 'transcripts'), { recursive: true });
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    model,
    claude: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    gesso: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    'playwright mcp': PLAYWRIGHT_MCP,
    repeats: String(repeats),
    ...(noAgent ? { agent: 'none: the harness alone' } : {})
  };
  const runs = await runWrite({
    root,
    model,
    repeats,
    arms: armNames,
    noAgent,
    keep: process.argv.includes('--keep'),
    out,
    meta
  });
  console.log(`\n${summariseWrite(runs, meta).split('## Every run')[0]}\nWritten to ${out}`);
}

async function main(): Promise<void> {
  const model = option('model', 'sonnet');
  const repeats = Number(option('repeat', '1'));
  if (process.argv.includes('--write')) {
    await mainWrite(model, repeats);
    return;
  }
  const armNames = option('arms', 'gesso,gesso-screen,react').split(',') as ArmName[];
  const all = tasks();
  const wanted = option('tasks', all.map(task => task.id).join(',')).split(',');
  const chosen = all.filter(task => wanted.includes(task.id));
  const arms = armNames.map(name =>
    name === 'react' ? reactArm(5402) : gessoArm(name, name === 'gesso' ? 5401 : 5403)
  );

  console.log(
    `${arms.length} arms × ${chosen.length} tasks × ${repeats} = ${arms.length * chosen.length * repeats} runs on ${model}.`
  );
  if (process.argv.includes('--dry')) {
    for (const task of chosen) console.log(`  ${task.id}: ${task.prompt}`);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const out = join(root, 'evals/agents/results', `${stamp}-${model}`);
  mkdirSync(join(out, 'transcripts'), { recursive: true });
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    model,
    claude: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    gesso: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    'playwright mcp': PLAYWRIGHT_MCP,
    repeats: String(repeats)
  };

  const runs: Run[] = [];
  let devtoolsPort = 9311;
  for (const arm of arms) {
    const server = arm.serve();
    try {
      await waitFor(
        `${arm.name}'s dev server`,
        async () => ((await fetch(`http://localhost:${arm.port}/`)).ok ? true : undefined),
        60_000
      );
      await warm(arm, devtoolsPort++);
      for (const task of chosen) {
        for (let repeat = 1; repeat <= repeats; repeat++) {
          const run = await runOnce(arm, task, repeat, model, out, devtoolsPort++);
          runs.push(run);
          const said =
            run.harnessError !== undefined
              ? `harness error: ${run.harnessError}`
              : `${run.verdict.pass ? 'pass' : 'FAIL'}: ${run.verdict.why}`;
          console.log(
            `${arm.name} ${task.id} #${repeat}: ${said} (${run.toolCalls} calls, ${(run.durationMs / 1000).toFixed(0)} s, $${run.costUsd.toFixed(3)})`
          );
          writeFileSync(join(out, 'summary.json'), JSON.stringify({ meta, runs }, null, 2));
        }
      }
    } finally {
      // Its own process group: pnpm and npx leave Vite running when only they are killed.
      if (server.pid !== undefined) process.kill(-server.pid);
    }
  }
  writeFileSync(join(out, 'summary.md'), summarise(runs, meta));
  console.log(`\n${summarise(runs, meta).split('## By task')[0]}\nWritten to ${out}`);
}

await main();
