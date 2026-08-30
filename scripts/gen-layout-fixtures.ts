/**
 * Regenerates `packages/core/src/layout/conformance/expected.json` from Chrome.
 *
 *   pnpm fixtures:layout
 *
 * Every case in `cases.ts` is translated to HTML, the whole set is
 * rendered once by headless Chrome, and each element's box is read
 * back relative to its case viewport. No browser-automation
 * dependency: `--dump-dom` serialises the page after its inline
 * script has run, and the script writes the boxes into the DOM.
 *
 * Set CHROME_BIN to pick the binary; otherwise the usual names are
 * tried. Runs directly under Node ≥ 22 (type stripping), which is why
 * this file and the modules it imports contain only erasable syntax.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { caseFingerprint, layoutCases } from '../packages/core/src/layout/conformance/cases.ts';
import { casesToHtml, parseResults } from '../packages/core/src/layout/conformance/toHtml.ts';
import type { ExpectedFixtures } from '../packages/core/src/layout/conformance/expectedFixtures.ts';

const CHROME_CANDIDATES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];

const here = dirname(fileURLToPath(import.meta.url));
const conformanceDir = join(here, '..', 'packages', 'core', 'src', 'layout', 'conformance');
const outputPath = join(conformanceDir, 'expected.json');
// Ahem (public domain, from web-platform-tests): every glyph is a 1em
// square, so real text has knowable widths. Embedded as a data URI so
// the file:// page needs no font-loading permissions.
const ahem = readFileSync(join(conformanceDir, 'fonts', 'Ahem.ttf')).toString('base64');

const chrome = findChrome();
const version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();

const duplicate = findDuplicateName();
if (duplicate !== undefined) {
  throw new Error(`Two layout cases are named '${duplicate}'.`);
}

const workDir = mkdtempSync(join(tmpdir(), 'gesso-layout-fixtures-'));
try {
  const pagePath = join(workDir, 'cases.html');
  writeFileSync(pagePath, casesToHtml(layoutCases, { ahemFontDataUri: `data:font/truetype;base64,${ahem}` }));
  const dom = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,900',
      // The page measures after document.fonts.ready; virtual time lets
      // that promise settle before the DOM is dumped.
      '--virtual-time-budget=10000',
      `--user-data-dir=${join(workDir, 'profile')}`,
      '--dump-dom',
      pathToFileURL(pagePath).href
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const { probe, results } = parseResults(dom);
  if (Math.abs(probe.width - 50) > 0.01 || Math.abs(probe.height - 12) > 0.01) {
    throw new Error(`Ahem did not load: a 5-glyph 10px probe measured ${probe.width}×${probe.height}, expected 50×12.`);
  }
  const byName = new Map(results.map(result => [result.name, result.boxes]));

  const fixtures: ExpectedFixtures = {
    generator: { chrome: version, generatedAt: new Date().toISOString() },
    cases: {}
  };
  for (const layoutCase of layoutCases) {
    const boxes = byName.get(layoutCase.name);
    if (boxes === undefined) {
      throw new Error(`Chrome produced no boxes for '${layoutCase.name}'.`);
    }
    fixtures.cases[layoutCase.name] = { fingerprint: caseFingerprint(layoutCase), boxes };
  }
  writeFileSync(outputPath, `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log(`Wrote ${layoutCases.length} cases to ${outputPath} using ${version}.`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

function findChrome(): string {
  const candidates = process.env.CHROME_BIN ? [process.env.CHROME_BIN] : CHROME_CANDIDATES;
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next name
    }
  }
  throw new Error(`No Chrome binary found. Tried: ${candidates.join(', ')}. Set CHROME_BIN.`);
}

function findDuplicateName(): string | undefined {
  const seen = new Set<string>();
  for (const layoutCase of layoutCases) {
    if (seen.has(layoutCase.name)) {
      return layoutCase.name;
    }
    seen.add(layoutCase.name);
  }
  return undefined;
}
