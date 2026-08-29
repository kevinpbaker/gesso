/**
 * Regenerates `src/ui/layout/conformance/expected.json` from Chrome.
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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { caseFingerprint, layoutCases } from '../src/ui/layout/conformance/cases.ts';
import { casesToHtml, parseResults } from '../src/ui/layout/conformance/toHtml.ts';
import type { ExpectedFixtures } from '../src/ui/layout/conformance/expectedFixtures.ts';

const CHROME_CANDIDATES = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'];

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, '..', 'src', 'ui', 'layout', 'conformance', 'expected.json');

const chrome = findChrome();
const version = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();

const duplicate = findDuplicateName();
if (duplicate !== undefined) {
  throw new Error(`Two layout cases are named '${duplicate}'.`);
}

const workDir = mkdtempSync(join(tmpdir(), 'nodal-layout-fixtures-'));
try {
  const pagePath = join(workDir, 'cases.html');
  writeFileSync(pagePath, casesToHtml(layoutCases));
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
      `--user-data-dir=${join(workDir, 'profile')}`,
      '--dump-dom',
      pathToFileURL(pagePath).href
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const results = parseResults(dom);
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
