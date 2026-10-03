import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const templates = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

describe('the page a template makes', () => {
  // A full-page app hands a scroll it can't use back to the page, and on
  // a Mac the browser stretched the whole page and showed white behind it.
  for (const page of ['web/index.html', 'electrobun/src/view/index.html']) {
    it(`doesn't let the browser stretch the page (${page})`, () => {
      const html = readFileSync(join(templates, page), 'utf8');
      const rule = /html,\s*body\s*\{([^}]*)\}/.exec(html)?.[1] ?? '';
      expect(rule).toMatch(/overscroll-behavior:\s*none/);
    });
  }
});
