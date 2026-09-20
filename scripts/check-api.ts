/**
 * API report.
 *
 * Each publishable package's public surface is committed as
 * `packages/<name>/api/<name>.api.d.ts`, and this script regenerates it
 * from the declarations tsdown emits and fails when the committed copy
 * disagrees. A change to what `gesso-core` exports then shows up as a
 * reviewable diff in the pull request that makes it, which is the whole
 * point of the exercise: nothing else in the repository notices when a
 * type quietly widens.
 *
 * The report is *derived* from `dist/**\/*.d.ts` rather than being those
 * files, for two reasons:
 *
 *   - Comments are stripped. The rolled-up declarations carry every doc
 *     comment in the package — 110 kB for the framework — so editing a
 *     sentence would read as an API change and the gate would cry wolf
 *     until people stopped reading it.
 *   - Chunk hashes and the aliases that come with them are normalised
 *     away. An entry legitimately re-exports from a shared chunk —
 *     `gesso-framework` and its `jsx-runtime` entry must share one copy
 *     of the module state behind `@Define` — and the emit names those
 *     imports `{ C as channel, D as Component, … }`. Adding one export
 *     renumbers every letter, so the raw declarations would report a
 *     one-line change as forty kilobytes of diff. Import and export
 *     lists are therefore stripped of generated aliases, sorted, and
 *     written one name per line, which is also what makes an added
 *     export read as an added line.
 *
 * It is not built with the TypeScript compiler API, which would give
 * exact signatures per symbol, because the `typescript` package here is
 * the 7.0 native port: `ts.createProgram` is undefined, and pinning a
 * second copy of TypeScript for one script is a worse trade than
 * post-processing the emit.
 *
 *   node scripts/check-api.ts            # verify; exits non-zero on drift
 *   node scripts/check-api.ts --update   # rewrite the committed reports
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The publishable packages, in the order the report should read. */
const PACKAGES = ['core', 'framework', 'components', 'testing', 'devtools', 'electrobun'];

const root = join(import.meta.dirname, '..');
const update = process.argv.includes('--update');

/** Every `.d.ts` under a directory, depth-first, with stable ordering. */
function declarationFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...declarationFiles(path));
    } else if (entry.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Drops a content hash from a chunk's name.
 *
 * `FunctionComponent-Bjd3Lj5d.d.ts` → `FunctionComponent.d.ts`. The hash
 * is a function of the chunk's contents, which the report quotes in
 * full, so keeping it would only add churn.
 */
function normalizeChunkName(name: string): string {
  return name.replace(/-[A-Za-z0-9_-]{8}(\.d\.ts)$/, '$1');
}

/** A single- or double-letter local name the bundler generated. */
const GENERATED_ALIAS = /^[A-Za-z_$][A-Za-z0-9_$]{0,2}$/;

/**
 * Rewrites one `{ … }` clause into a sorted, alias-free, one-per-line list.
 *
 * `{ C as channel, a as ComponentType }` becomes `channel` and
 * `ComponentType` on their own lines. An alias is dropped only when the
 * local name looks generated; a deliberate rename such as
 * `EditingState as EditingState$1` is kept, because it is part of what
 * the entry exposes.
 */
function normalizeNameList(clause: string): string {
  const names = clause
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => {
      const match = /^(.+?)\s+as\s+(.+)$/.exec(part);
      if (match === null) {
        return part;
      }
      // Which side is the generated one depends on the direction: an
      // import reads `{ C as channel }` and an export of the same
      // declaration reads `{ accumulatedOffsetTo as Xt }`. Keep the side
      // that does not look generated; when both do, keep the longer, so
      // the choice is at least deterministic.
      const left = match[1].trim();
      const right = match[2].trim();
      const leftGenerated = GENERATED_ALIAS.test(left);
      const rightGenerated = GENERATED_ALIAS.test(right);
      if (leftGenerated && !rightGenerated) {
        return right;
      }
      if (rightGenerated && !leftGenerated) {
        return left;
      }
      if (leftGenerated && rightGenerated) {
        return left.length > right.length ? left : right;
      }
      return part;
    })
    .sort((a, b) => a.localeCompare(b));
  return names.map(name => `  ${name}`).join(',\n');
}

/**
 * Normalises the import and export clauses of a declaration file.
 *
 * Only whole-line statements are touched, which is all the emit
 * produces; a `{` inside a type body never starts a line with `import`
 * or `export {`.
 */
function normalizeClauses(source: string): string {
  return source.replace(
    /^(import|export)\s*\{([^}]*)\}\s*(from\s*"[^"]*")?;$/gm,
    (_all, keyword: string, clause: string, from: string | undefined) =>
      `${keyword} {\n${normalizeNameList(clause)}\n}${from === undefined ? '' : ` ${from}`};`
  );
}

/**
 * Strips comments and blank runs, so the report holds declarations only.
 *
 * Line-based on purpose: the input is generated, so a block comment
 * always owns its lines, and a `//` that is not a comment (inside a
 * string literal type) never starts one.
 */
function declarationsOnly(source: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.endsWith('*/')) {
        inBlock = false;
      }
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.endsWith('*/')) {
        inBlock = true;
      }
      continue;
    }
    if (trimmed.startsWith('//')) {
      continue;
    }
    if (trimmed.length === 0) {
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function buildReport(pkg: string): string {
  const dist = join(root, 'packages', pkg, 'dist');
  if (!existsSync(dist)) {
    throw new Error(`packages/${pkg}/dist is missing — run \`pnpm build\` first.`);
  }
  const files = declarationFiles(dist);
  if (files.length === 0) {
    throw new Error(`packages/${pkg}/dist holds no .d.ts files.`);
  }
  const sections = files
    .map(path => ({
      name: normalizeChunkName(relative(dist, path)),
      body: normalizeClauses(declarationsOnly(readFileSync(path, 'utf8')))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(section => `// ==== ${section.name} ====\n${section.body}`);

  return [
    `// API report for gesso-${pkg}.`,
    '//',
    '// Generated by `pnpm api:update` from the declarations tsdown emits, with',
    '// comments stripped and chunk hashes normalised. Committed so that a change',
    '// to the public surface is a reviewable diff. Do not edit by hand.',
    '',
    ...sections
  ].join('\n');
}

let drift = 0;
for (const pkg of PACKAGES) {
  const report = buildReport(pkg);
  const dir = join(root, 'packages', pkg, 'api');
  const file = join(dir, `${pkg}.api.d.ts`);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;

  if (update) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, report.endsWith('\n') ? report : `${report}\n`);
    console.log(`${current === null ? 'created' : 'updated'} ${relative(root, file)}`);
    continue;
  }

  if (current === null) {
    console.error(`missing ${relative(root, file)} — run \`pnpm api:update\`.`);
    drift += 1;
    continue;
  }
  if (current.trimEnd() !== report.trimEnd()) {
    console.error(`\ngesso-${pkg}: public surface differs from ${relative(root, file)}.\n`);
    // A unified diff is far easier to read than two files, and `diff` is
    // allowed to fail — it exits 1 precisely because they differ.
    try {
      const tmp = join(root, 'node_modules', `.api-${pkg}.d.ts`);
      writeFileSync(tmp, `${report}\n`);
      execFileSync('diff', ['-u', file, tmp], { stdio: 'inherit' });
    } catch {
      /* diff exits non-zero when the files differ, which is the point. */
    }
    drift += 1;
  }
}

if (drift > 0) {
  console.error(
    `\nAPI report out of date for ${drift} package${drift === 1 ? '' : 's'}. ` +
      'Run `pnpm api:update` and commit the result if the change is intended.'
  );
  process.exit(1);
}
console.log(`API report matches for ${PACKAGES.length} packages.`);
