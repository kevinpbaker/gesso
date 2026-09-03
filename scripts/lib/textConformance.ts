import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { rolldown } from 'rolldown';

import type { TextCase } from '../../packages/core/src/layout/textConformance/cases.ts';
import type { FixtureFont } from '../../packages/core/src/layout/textConformance/expectedFixtures.ts';
import type { ConformanceFont, ConformanceFontId } from '../../packages/core/src/layout/textConformance/fonts.ts';
import { conformanceFonts } from '../../packages/core/src/layout/textConformance/fonts.ts';
import { casesToHtml, parseResults, type CaseResult } from '../../packages/core/src/layout/textConformance/toHtml.ts';

/**
 * The part of the text conformance harness that runs Chrome: the fonts
 * on this machine, the in-page bundle of `layoutParagraph`, and one
 * headless page per batch of cases. Shared by `gen-text-fixtures.ts`,
 * which records the committed fixtures, and `wring-titles.ts`, which
 * puts a live corpus through the same comparison without recording it.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const conformanceDir = join(here, '..', '..', 'packages', 'core', 'src', 'layout', 'textConformance');

export interface ResolvedFont {
  path: string;
  record: FixtureFont;
}

export function resolveFonts(): Record<ConformanceFontId, ResolvedFont> {
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

export async function bundleInPage(): Promise<string> {
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

export interface ChromeRun {
  chrome: string;
  fontFiles: Record<ConformanceFontId, ResolvedFont>;
  gessoScript: string;
}

export async function prepareChrome(chrome: string): Promise<ChromeRun> {
  return { chrome, fontFiles: resolveFonts(), gessoScript: await bundleInPage() };
}

/** Renders the cases in one headless page and returns Chrome's and the page's Gesso's results by name. */
export function renderInChrome(run: ChromeRun, cases: readonly TextCase[]): Map<string, CaseResult> {
  const fontSources = Object.fromEntries(
    conformanceFonts.map(font => [font.id, pathToFileURL(run.fontFiles[font.id].path).href])
  ) as Record<ConformanceFontId, string>;
  const workDir = mkdtempSync(join(tmpdir(), 'gesso-text-conformance-'));
  try {
    const pagePath = join(workDir, 'cases.html');
    writeFileSync(pagePath, casesToHtml(cases, { fontSources, gessoScript: run.gessoScript }));
    const dom = execFileSync(
      run.chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1600,1200',
        '--allow-file-access-from-files',
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
        throw new Error(`${font.face} did not load in Chrome from ${run.fontFiles[font.id].path}.`);
      }
    }
    return new Map(results.map(result => [result.name, result]));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
