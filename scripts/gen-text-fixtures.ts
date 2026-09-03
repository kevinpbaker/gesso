/**
 * Regenerates `packages/core/src/layout/textConformance/expected.json` from Chrome.
 *
 *   pnpm fixtures:text            # rewrite expected.json
 *   pnpm fixtures:text:check      # compare a fresh Chrome run with expected.json, write nothing
 *
 * `--check` is the CI form: it renders every case exactly as a
 * regeneration would and fails if Chrome's lines, box or baseline for
 * any case have moved from the committed ones by more than the case's
 * tolerance, or if a case's fingerprint is stale. The Chrome version,
 * the font files and the recorded widths are not compared, because the
 * runner's Chrome and fonts are not this machine's; what has to hold is
 * that the committed lines are still the lines Chrome draws.
 *
 * The twin of `gen-layout-fixtures.ts` for real text. Every case in
 * `textConformance/cases.ts` becomes a paragraph in one HTML document,
 * rendered once by headless Chrome in a real font served from this
 * machine. The page's script reads each paragraph's lines back through
 * `Range.getClientRects()`, and runs Gesso's own `layoutParagraph`,
 * bundled from the repository by rolldown and inlined, against the
 * page's canvas, recording every run width it measures. Both go into
 * the fixture; the spec replays the recording and compares.
 *
 * The fonts are found on the machine, never vendored (see `fonts.ts`);
 * `GESSO_FONT_SANS=/path/to/face.ttf` names one explicitly. Set
 * CHROME_BIN to pick the browser. Runs under vite-node because the
 * comparison it prints imports the paragraph algorithm, which is not
 * erasable-syntax-only.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { textCaseFingerprint, textCases } from '../packages/core/src/layout/textConformance/cases.ts';
import {
  compareParagraphs,
  layoutWithGesso,
  TEXT_TOLERANCE
} from '../packages/core/src/layout/textConformance/compare.ts';
import { REGENERATE_TEXT_FIXTURES } from '../packages/core/src/layout/textConformance/RecordedTextMeasurer.ts';
import type { ChromeParagraph } from '../packages/core/src/layout/textConformance/toHtml.ts';
import type { ExpectedTextFixtures } from '../packages/core/src/layout/textConformance/expectedFixtures.ts';
import { conformanceFonts } from '../packages/core/src/layout/textConformance/fonts.ts';
import { findChrome } from './lib/devtools.ts';
import { conformanceDir, prepareChrome, renderInChrome } from './lib/textConformance.ts';

const checkOnly = process.argv.includes('--check');

const outputPath = join(conformanceDir, 'expected.json');

async function main(): Promise<void> {
  const chrome = findChrome();
  const version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();

  const duplicate = findDuplicateName();
  if (duplicate !== undefined) {
    throw new Error(`Two text cases are named '${duplicate}'.`);
  }

  const run = await prepareChrome(chrome);
  const fontFiles = run.fontFiles;
  {
    const byName = renderInChrome(run, textCases);

    const fixtures: ExpectedTextFixtures = {
      generator: {
        chrome: version,
        generatedAt: new Date().toISOString(),
        fonts: Object.fromEntries(conformanceFonts.map(font => [font.id, fontFiles[font.id].record]))
      },
      cases: {}
    };
    const agreeing: string[] = [];
    const diverging: string[] = [];
    const pinnedDetails: string[] = [];
    const resolved: string[] = [];
    const unpinned: string[] = [];
    for (const textCase of textCases) {
      const result = byName.get(textCase.name);
      if (result === undefined) {
        throw new Error(`Chrome produced no result for '${textCase.name}'.`);
      }
      fixtures.cases[textCase.name] = {
        fingerprint: textCaseFingerprint(textCase),
        chrome: result.chrome,
        recording: result.recording
      };

      // The spec replays the recording; make sure the replay is the
      // run the page saw, or the fixture would test something else.
      const replay = layoutWithGesso(textCase, result.recording);
      const drift = replay.lines
        .map((line, i) => {
          const inPage = result.gesso.lines[i];
          return inPage === undefined || inPage.start !== line.start || inPage.end !== line.end
            ? `line ${i}`
            : undefined;
        })
        .filter(entry => entry !== undefined);
      if (drift.length > 0 || replay.lines.length !== result.gesso.lines.length) {
        throw new Error(
          `${textCase.name}: replaying the recording did not reproduce the page's lines (${drift.join(', ')}).`
        );
      }

      const differences = compareParagraphs(replay, result.chrome, textCase.tolerance);
      if (differences.length === 0) {
        if (textCase.divergence !== undefined) {
          resolved.push(textCase.name);
        } else {
          agreeing.push(textCase.name);
        }
      } else if (textCase.divergence !== undefined) {
        diverging.push(textCase.name);
        pinnedDetails.push(`  ${textCase.name}: ${textCase.divergence}\n${differences.join('\n')}`);
      } else {
        unpinned.push(`${textCase.name}\n${differences.join('\n')}`);
      }
    }
    if (checkOnly) {
      checkAgainstCommitted(fixtures);
      return;
    }
    writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);

    const fontSummary = conformanceFonts.map(font => `${font.face} (${fontFiles[font.id].record.file})`).join(', ');
    console.log(`Wrote ${textCases.length} cases to ${outputPath} using ${version} and ${fontSummary}.`);
    console.log(`  ${agreeing.length} agree with Chrome, ${diverging.length} diverge as pinned.`);
    if (pinnedDetails.length > 0) {
      console.log(`  Pinned divergences, for checking each note against what Chrome did:`);
      for (const entry of pinnedDetails) {
        console.log(entry);
      }
    }
    if (resolved.length > 0) {
      console.log(`  Pinned divergences that now agree (remove the note):\n    ${resolved.join('\n    ')}`);
    }
    if (unpinned.length > 0) {
      console.log(`  Unpinned differences (${unpinned.length}); the spec will fail until each is fixed or pinned:`);
      for (const entry of unpinned) {
        console.log(`  ${entry}`);
      }
    }
  }
}

/**
 * Compares what Chrome drew now with what `expected.json` says it drew
 * when the fixtures were generated, case by case, within each case's
 * tolerance. Exits non-zero on the first difference set.
 */
function checkAgainstCommitted(fresh: ExpectedTextFixtures): void {
  const committed = JSON.parse(readFileSync(outputPath, 'utf8')) as ExpectedTextFixtures;
  const problems: string[] = [];
  for (const textCase of textCases) {
    const before = committed.cases[textCase.name];
    const now = fresh.cases[textCase.name];
    if (before === undefined) {
      problems.push(`${textCase.name}: not in expected.json`);
      continue;
    }
    if (before.fingerprint !== now.fingerprint) {
      problems.push(`${textCase.name}: the case changed since expected.json was generated`);
      continue;
    }
    const differences = compareChrome(before.chrome, now.chrome, textCase.tolerance ?? TEXT_TOLERANCE);
    if (differences.length > 0) {
      problems.push(`${textCase.name}: Chrome's layout moved\n${differences.join('\n')}`);
    }
  }
  for (const name of Object.keys(committed.cases)) {
    if (fresh.cases[name] === undefined) {
      problems.push(`${name}: in expected.json but no longer a case`);
    }
  }
  const summary = `${textCases.length} cases against ${committed.generator.chrome} and ${Object.values(
    committed.generator.fonts
  )
    .map(font => font.face)
    .join(', ')}, now on ${fresh.generator.chrome}`;
  if (problems.length > 0) {
    console.error(`Text fixtures: ${problems.length} problem(s) checking ${summary}.\n${problems.join('\n')}`);
    console.error(REGENERATE_TEXT_FIXTURES);
    process.exitCode = 1;
    return;
  }
  console.log(`Text fixtures: Chrome still draws every one of ${summary}.`);
}

/** Chrome's paragraph then and now: the same lines, box and baseline within the tolerance. */
function compareChrome(before: ChromeParagraph, now: ChromeParagraph, tolerance: number): string[] {
  const differences: string[] = [];
  for (const key of ['width', 'height', 'baseline'] as const) {
    if (Math.abs(before[key] - now[key]) > tolerance) {
      differences.push(`  ${key}: was ${before[key]}, now ${now[key]}`);
    }
  }
  if (before.lines.length !== now.lines.length) {
    differences.push(`  line count: was ${before.lines.length}, now ${now.lines.length}`);
  }
  const count = Math.min(before.lines.length, now.lines.length);
  for (let i = 0; i < count; i++) {
    const a = before.lines[i];
    const b = now.lines[i];
    if (
      a.start !== b.start ||
      a.end !== b.end ||
      Math.abs(a.x - b.x) > tolerance ||
      Math.abs(a.width - b.width) > tolerance ||
      (a.truncated ?? false) !== (b.truncated ?? false)
    ) {
      differences.push(
        `  line ${i}: was [${a.start}..${a.end}) x ${a.x} w ${a.width}, now [${b.start}..${b.end}) x ${b.x} w ${b.width}`
      );
    }
  }
  return differences;
}

function findDuplicateName(): string | undefined {
  const seen = new Set<string>();
  for (const textCase of textCases) {
    if (seen.has(textCase.name)) {
      return textCase.name;
    }
    seen.add(textCase.name);
  }
  return undefined;
}

await main();
