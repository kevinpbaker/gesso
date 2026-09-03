/**
 * Regenerates `packages/core/src/layout/textConformance/expected.json` from Chrome.
 *
 *   pnpm fixtures:text
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
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { rolldown } from 'rolldown';

import { textCaseFingerprint, textCases } from '../packages/core/src/layout/textConformance/cases.ts';
import { compareParagraphs, layoutWithGesso } from '../packages/core/src/layout/textConformance/compare.ts';
import type {
  ExpectedTextFixtures,
  FixtureFont
} from '../packages/core/src/layout/textConformance/expectedFixtures.ts';
import type { ConformanceFont, ConformanceFontId } from '../packages/core/src/layout/textConformance/fonts.ts';
import { conformanceFonts } from '../packages/core/src/layout/textConformance/fonts.ts';
import { casesToHtml, parseResults } from '../packages/core/src/layout/textConformance/toHtml.ts';
import { findChrome } from './lib/devtools.ts';

const here = dirname(fileURLToPath(import.meta.url));
const conformanceDir = join(here, '..', 'packages', 'core', 'src', 'layout', 'textConformance');
const outputPath = join(conformanceDir, 'expected.json');

async function main(): Promise<void> {
  const chrome = findChrome();
  const version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();

  const duplicate = findDuplicateName();
  if (duplicate !== undefined) {
    throw new Error(`Two text cases are named '${duplicate}'.`);
  }

  const fontFiles = resolveFonts();
  const fontSources = Object.fromEntries(
    conformanceFonts.map(font => [font.id, pathToFileURL(fontFiles[font.id].path).href])
  ) as Record<ConformanceFontId, string>;
  const gessoScript = await bundleInPage();

  const workDir = mkdtempSync(join(tmpdir(), 'gesso-text-fixtures-'));
  try {
    const pagePath = join(workDir, 'cases.html');
    writeFileSync(pagePath, casesToHtml(textCases, { fontSources, gessoScript }));
    const dom = execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1600,1200',
        // The fonts are served from file: URLs, which a file: page may
        // not read without this.
        '--allow-file-access-from-files',
        // The page measures after document.fonts.ready; virtual time
        // lets that promise settle before the DOM is dumped.
        '--virtual-time-budget=20000',
        `--user-data-dir=${join(workDir, 'profile')}`,
        '--dump-dom',
        pathToFileURL(pagePath).href
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const { fonts, results } = parseResults(dom);
    for (const font of conformanceFonts) {
      if (fonts[font.family] !== true) {
        throw new Error(`${font.face} did not load in Chrome from ${fontFiles[font.id].path}.`);
      }
    }
    const byName = new Map(results.map(result => [result.name, result]));

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
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** `inPage.ts` as one self-contained script defining `GessoTextConformance`. */
async function bundleInPage(): Promise<string> {
  const bundle = await rolldown({
    input: join(conformanceDir, 'inPage.ts'),
    platform: 'browser',
    logLevel: 'silent'
  });
  try {
    const { output } = await bundle.generate({ format: 'iife', name: 'GessoTextConformance' });
    return output[0].code;
  } finally {
    await bundle.close();
  }
}

interface ResolvedFont {
  path: string;
  record: FixtureFont;
}

function resolveFonts(): Record<ConformanceFontId, ResolvedFont> {
  const resolved = {} as Record<ConformanceFontId, ResolvedFont>;
  for (const font of conformanceFonts) {
    const path = findFontFile(font);
    const bytes = readFileSync(path);
    resolved[font.id] = {
      path,
      record: {
        face: font.face,
        file: path.slice(path.lastIndexOf('/') + 1),
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex')
      }
    };
  }
  return resolved;
}

function findFontFile(font: ConformanceFont): string {
  const override = process.env[font.env];
  const candidates = override !== undefined ? [override] : font.candidates.map(expandHome);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `${font.face} was not found. Tried: ${candidates.join(', ')}. Install it or set ${font.env} to the file.`
  );
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
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
