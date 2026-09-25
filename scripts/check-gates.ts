/**
 * Every gate is in CI, and CI runs no gate that does not exist.
 *
 * This repository's claims are backed by scripts that end in a verdict,
 * and a verdict nobody reads is worth nothing. Three of them had drifted
 * out of the workflow by the time anyone counted: `check:rest` and
 * `check:video` were written, committed and then run by nobody, and
 * `check:bundle` was added to `pnpm check` without being added to CI,
 * which is the same mistake one step later. A fourth, `check:a11y`, was
 * in CI and failing on every run for a reason nobody had looked at.
 *
 * So the rule is checked rather than written down: every `check:*`,
 * `parity:*` and `*:check` script in the root manifest is named by
 * `.github/workflows/ci.yml`, and every gate the workflow names still
 * exists. It is a string search over two files and it costs nothing, so
 * it lives in `pnpm check` with the rest.
 *
 *   node scripts/check-gates.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Scripts that are gates someone else runs, rather than plumbing.
 *
 * `*:update` writes baselines and is the opposite of a gate. `check`
 * itself is the local bundle of the Node-only ones. The rest are
 * developer conveniences that report rather than judge.
 */
const NOT_A_GATE = new Set(['check', 'check:a11y:update']);

function isGate(name: string): boolean {
  if (NOT_A_GATE.has(name) || name.endsWith(':update')) {
    return false;
  }
  return name.startsWith('check:') || name.startsWith('parity:') || name.endsWith(':check');
}

const manifest = JSON.parse(readFileSync(at('../package.json'), 'utf8')) as { scripts: Record<string, string> };
const workflow = readFileSync(at('../.github/workflows/ci.yml'), 'utf8');

const gates = Object.keys(manifest.scripts).filter(isGate).sort();
const missing = gates.filter(gate => !new RegExp(`pnpm ${gate.replaceAll(':', '\\:')}(\\s|$)`, 'm').test(workflow));

/** pnpm's own subcommands, which are not scripts and never will be. */
const PNPM_BUILTINS = new Set(['install', 'exec', 'run', 'dlx', 'add', 'why', 'list', 'store', 'publish', 'pack']);

/** What the workflow claims to run, so a renamed script is caught from the other side. */
const named = [...workflow.matchAll(/run: pnpm ([\w:-]+)/g)].map(match => match[1]!);
const unknown = [...new Set(named)]
  .filter(name => !PNPM_BUILTINS.has(name) && manifest.scripts[name] === undefined)
  .sort();

const problems: string[] = [];
if (missing.length > 0) {
  problems.push(
    `These gates are in package.json and in no CI job, so nothing runs them:\n    ${missing.join('\n    ')}\n` +
      '  Add a step to .github/workflows/ci.yml, or rename the script if it is not a gate.'
  );
}
if (unknown.length > 0) {
  problems.push(
    `CI names scripts that no longer exist:\n    ${unknown.join('\n    ')}\n` +
      '  Update .github/workflows/ci.yml, or put the script back.'
  );
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`\n✗ ${problem}`);
  }
  process.exitCode = 1;
} else {
  console.log(`${gates.length} gates, every one of them named by a CI job.`);
}
