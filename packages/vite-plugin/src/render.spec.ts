import { describe, expect, it } from 'vitest';

import { transformRenderWorker } from './render';

/** Sluice's render worker entry, near enough. */
const ENTRY = [
  "import { renderRoot } from '@gesso/framework';",
  '',
  "import { ROUTES, SluiceApp } from './SluiceApp';",
  '',
  'renderRoot(SluiceApp).useRoutes(ROUTES);',
  ''
].join('\n');

describe('transformRenderWorker', () => {
  it('leaves a module that does not render a root alone', () => {
    expect(transformRenderWorker("import { serveChannels } from '@gesso/framework';\n").code).toBeNull();
  });

  it('accepts the module the root came from', () => {
    const out = transformRenderWorker(ENTRY).code!;
    expect(out).toContain('import.meta.hot.accept(["./SluiceApp"]');
    expect(out).toContain('__gessoLatest[0].SluiceApp');
  });

  it('keeps the builder chain, whether or not the entry assigned it', () => {
    const out = transformRenderWorker(ENTRY).code!;
    expect(out).toContain('__gessoRenderRoot(SluiceApp).useRoutes(ROUTES);');
    const assigned = transformRenderWorker(ENTRY.replace('renderRoot(SluiceApp)', 'const app = renderRoot(SluiceApp)'))
      .code!;
    expect(assigned).toContain('const app = __gessoRenderRoot(SluiceApp)');
  });

  it('hands the replaced services over, from whichever module they came from', () => {
    const entry = [
      "import { renderRoot } from '@gesso/framework';",
      "import { LiveApp, LiveFeed } from './LiveApp';",
      "import { Clock } from './Clock';",
      'renderRoot(LiveApp).useService(LiveFeed).useService(Clock);'
    ].join('\n');
    const out = transformRenderWorker(entry).code!;
    expect(out).toContain('import.meta.hot.accept(["./LiveApp", "./Clock"]');
    expect(out).toContain('reload(__gessoLatest[0].LiveApp, [__gessoLatest[0].LiveFeed, __gessoLatest[1].Clock])');
  });

  it('says why it could not wire an entry, rather than wiring the wrong thing', () => {
    const inline = [
      "import { renderRoot } from '@gesso/framework';",
      'const App = () => null;',
      'renderRoot(App);'
    ].join('\n');
    const wiring = transformRenderWorker(inline);
    expect(wiring.code).toBeNull();
    expect(wiring.skipped).toContain('App');
  });

  it('does not rewrite a module it has already rewritten', () => {
    const once = transformRenderWorker(ENTRY).code!;
    expect(transformRenderWorker(once).code).toBeNull();
  });
});
