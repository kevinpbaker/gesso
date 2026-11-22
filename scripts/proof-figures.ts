/**
 * The figures the README and the docs quote as proof, computed from the
 * repository rather than typed.
 *
 * "Every figure is produced by a script in the repository, and the
 * script is the claim." That was true of the scripts and not of the
 * prose: the README said 4,640 tests and the docs said 2,850, the two
 * disagreed on how many paragraphs and how many pinned divergences the
 * text harness has, and each was a number somebody had once copied out
 * of a terminal. So each figure that the repository can answer is now
 * written between two markers, and this script writes what goes there:
 *
 *   <!-- proof:tests -->7,916<!-- /proof -->
 *   <!-- proof:text-pinned Words -->Nine<!-- /proof -->
 *
 * A key with no format is written with digits and thousands separators.
 * `words` writes it in words, and `Words` capitalises the first, for a
 * figure that opens a sentence. The markers are HTML comments, which
 * GitHub drops and VitePress keeps out of the page, so neither renders
 * them.
 *
 * Where each figure comes from:
 *
 *   - `tests`, `test-files`: vitest's JSON report of a full run, every
 *     test vitest collects, skipped ones included, and every spec file.
 *   - `layout-cases`, `layout-pinned`, `layout-agreeing`: the cases in
 *     `packages/core/src/layout/conformance/cases.ts`; a case with a
 *     `divergence` runs as `it.fails`. The conformance spec already
 *     fails when `expected.json` holds a case `cases.ts` does not, so
 *     counting the definitions counts the fixtures.
 *   - `text-paragraphs`, `text-pinned`, `text-agreeing`: the same, from
 *     `packages/core/src/layout/textConformance/cases.ts`.
 *   - `shell-budget-kb`: `SHELL_BUDGET` in `check-bundle-size.ts`.
 *   - `parity-max-percent`: the default `PARITY_MAX_PERCENT` in
 *     `check-webgpu-parity.ts`.
 *
 * What it cannot answer stays typed, because it needs a build, a
 * browser or a GPU: the shell's measured size, a parity reading, the
 * demo's worst tick, how long the suite takes.
 *
 *   pnpm proof:update                        # runs the suite, rewrites the figures
 *   pnpm proof:check                         # runs the suite, fails if a figure is stale
 *   pnpm proof:check --report vitest.json    # reads a run that already happened
 *
 * `--report` takes the file `vitest run --reporter=json
 * --outputFile.json=…` writes, which is how `pnpm check` and CI avoid
 * running the suite twice. It must be a run of the whole suite: a
 * filtered run reports fewer tests, and the check says so as a stale
 * figure.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { layoutCases } from '../packages/core/src/layout/conformance/cases.ts';
import { textCases } from '../packages/core/src/layout/textConformance/cases.ts';

const root = join(import.meta.dirname, '..');

/** The pages that may carry figures: the README and every page of the site. */
function pages(): string[] {
  const found = [join(root, 'README.md')];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) {
        continue;
      }
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.endsWith('.md')) {
        found.push(path);
      }
    }
  };
  walk(join(root, 'apps/docs'));
  return found;
}

interface VitestReport {
  readonly numTotalTests: number;
  readonly success: boolean;
  readonly testResults: readonly unknown[];
}

function readReport(path: string): VitestReport {
  const report = JSON.parse(readFileSync(path, 'utf8')) as Partial<VitestReport>;
  if (typeof report.numTotalTests !== 'number' || !Array.isArray(report.testResults)) {
    throw new Error(`${path} is not a vitest JSON report.`);
  }
  return report as VitestReport;
}

/** A whole run of the suite, for when no report was handed in. */
function runSuite(): VitestReport {
  const dir = mkdtempSync(join(tmpdir(), 'gesso-proof-'));
  const output = join(dir, 'vitest.json');
  try {
    console.log('Running the suite for its test and file counts…');
    try {
      execFileSync(
        process.execPath,
        [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=json', `--outputFile.json=${output}`],
        { cwd: root, stdio: 'ignore' }
      );
    } catch {
      // A failing test still leaves a report with every test counted.
      // The failure is the test gate's to report, not this one's.
    }
    if (!existsSync(output)) {
      throw new Error('vitest wrote no report. Run `pnpm test:run` to see why.');
    }
    return readReport(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One constant out of a gate script, which cannot be imported because importing it runs it. */
function constantIn(script: string, pattern: RegExp): string {
  const source = readFileSync(join(root, 'scripts', script), 'utf8');
  const match = pattern.exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`Found no ${pattern} in scripts/${script}. Update scripts/proof-figures.ts to read it.`);
  }
  return match[1];
}

function figures(report: VitestReport): Map<string, number> {
  const layoutPinned = layoutCases.filter(layoutCase => layoutCase.divergence !== undefined).length;
  const textPinned = textCases.filter(textCase => textCase.divergence !== undefined).length;
  const shellBudget = Number(constantIn('check-bundle-size.ts', /const SHELL_BUDGET = ([\d_]+);/).replaceAll('_', ''));
  const parityMax = Number(constantIn('check-webgpu-parity.ts', /PARITY_MAX_PERCENT \?\? '([\d.]+)'/));
  return new Map([
    ['tests', report.numTotalTests],
    ['test-files', report.testResults.length],
    ['layout-cases', layoutCases.length],
    ['layout-pinned', layoutPinned],
    ['layout-agreeing', layoutCases.length - layoutPinned],
    ['text-paragraphs', textCases.length],
    ['text-pinned', textPinned],
    ['text-agreeing', textCases.length - textPinned],
    ['shell-budget-kb', shellBudget / 1000],
    ['parity-max-percent', parityMax]
  ]);
}

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen'
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function inWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    // A figure that outgrows words is one that should be written in digits.
    return value.toLocaleString('en-US');
  }
  if (value < 20) {
    return ONES[value]!;
  }
  const ones = value % 10;
  return TENS[Math.floor(value / 10)]! + (ones === 0 ? '' : `-${ONES[ones]!}`);
}

function format(value: number, style: string | undefined): string {
  if (style === 'words') {
    return inWords(value);
  }
  if (style === 'Words') {
    const words = inWords(value);
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  if (style !== undefined) {
    throw new Error(`Unknown figure format '${style}'. Use none, 'words' or 'Words'.`);
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** `<!-- proof:key -->value<!-- /proof -->`, or `<!-- proof:key Words -->…`. */
const MARKER = /<!-- proof:([a-z-]+)(?: (\w+))? -->(.*?)<!-- \/proof -->/g;

interface Stale {
  readonly where: string;
  readonly key: string;
  readonly written: string;
  readonly actual: string;
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const reportAt = args.indexOf('--report');
const report = reportAt === -1 ? runSuite() : readReport(args[reportAt + 1] ?? '');
const values = figures(report);

const stale: Stale[] = [];
const used = new Set<string>();
let markers = 0;
const changed: string[] = [];
for (const page of pages()) {
  const source = readFileSync(page, 'utf8');
  const name = relative(root, page);
  if (!source.includes('<!-- proof:')) {
    continue;
  }
  const opened = source.split('<!-- proof:').length - 1;
  const matched = [...source.matchAll(MARKER)].length;
  if (opened !== matched) {
    throw new Error(`${name} has ${opened} proof markers and ${matched} closed on the same line.`);
  }
  const next = source.replace(
    MARKER,
    (whole, key: string, style: string | undefined, written: string, offset: number) => {
      const value = values.get(key);
      if (value === undefined) {
        throw new Error(`${name} asks for a figure called '${key}'. Known: ${[...values.keys()].join(', ')}.`);
      }
      used.add(key);
      markers += 1;
      const actual = format(value, style);
      if (actual !== written) {
        const line = source.slice(0, offset).split('\n').length;
        stale.push({ where: `${name}:${line}`, key, written, actual });
      }
      return whole.replace(`-->${written}<!--`, `-->${actual}<!--`);
    }
  );
  if (next !== source) {
    changed.push(page);
    if (!check) {
      writeFileSync(page, next);
    }
  }
}

if (check) {
  if (stale.length > 0) {
    console.error(`\n✗ ${stale.length} proof figure${stale.length === 1 ? ' is' : 's are'} out of date:\n`);
    for (const { where, key, written, actual } of stale) {
      console.error(`    ${where}  ${key}: says ${written}, the repository says ${actual}`);
    }
    console.error('\n  Run `pnpm proof:update` and commit what it writes.');
    process.exitCode = 1;
  } else {
    console.log(`✓ ${markers} proof figures of ${used.size} kinds, every one of them what the repository says.`);
  }
} else if (changed.length > 0) {
  // A figure that gets longer widens a table column, so the tables are
  // realigned the way `pnpm format` would.
  execFileSync(join(root, 'node_modules/.bin/oxfmt'), changed, { cwd: root, stdio: 'inherit' });
  for (const { where, key, written, actual } of stale) {
    console.log(`  ${where}  ${key}: ${written} → ${actual}`);
  }
  console.log(
    `Rewrote ${stale.length} figure${stale.length === 1 ? '' : 's'} in ${changed.length} page${changed.length === 1 ? '' : 's'}.`
  );
} else {
  console.log(`${markers} proof figures of ${used.size} kinds, all current.`);
}
