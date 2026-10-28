import { describe, expect, it } from 'vitest';

import { Box, Text, UiEnvironmentKeys, darkTheme, lightTheme, type UiChild } from 'gesso-core';
import type { Inputs } from '../FunctionComponent';
import { mockCanvas } from '../app/RuntimeTestUtils';
import type { PictureCanvas } from '../app/renderFrame';
import { resultText } from './AgentSurface';
import { renderModule, type RenderDependencies } from './render';

/**
 * `render_frame`'s rules, over the mock canvas: which export it draws,
 * how it is given inputs, where it looks for a module, and what it says
 * back. The pixels need a browser and are checked there.
 */

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function Pill(inputs: Inputs<{ label: string }>): UiChild {
  seen.push(inputs.label.value);
  return Box({ height: 32 }, Text({ text: inputs.label }));
}
let seen: string[] = [];

/** A project served from memory: module paths to their exports. */
function project(modules: Record<string, Record<string, unknown>>, theme = darkTheme) {
  const asked: string[] = [];
  const deps: RenderDependencies = {
    load: async path => {
      asked.push(path);
      const found = modules[path];
      if (found === undefined) {
        throw new TypeError(`Failed to fetch dynamically imported module: ${path}`);
      }
      return found;
    },
    appTheme: () => theme,
    frame: {
      settleMs: 100,
      createCanvas: (width, height) =>
        Object.assign(mockCanvas(width, height), {
          convertToBlob: async () => new Blob([PNG], { type: 'image/png' })
        }) as PictureCanvas
    }
  };
  return { deps, asked };
}

describe('renderModule', () => {
  it('draws the only component a module exports, with its inputs, and answers with the picture', async () => {
    seen = [];
    const { deps, asked } = project({ '/src/ui/Pill.tsx': { Pill, helper: () => 1 } });

    const result = await renderModule({ module: 'src/ui/Pill', inputs: { label: 'Open' }, width: 390 }, deps);

    expect(result.isError).toBe(false);
    expect(asked).toEqual(['/src/ui/Pill.tsx']);
    expect(seen).toEqual(['Open']);
    expect(result.content[0]).toEqual({
      type: 'image',
      data: btoa(String.fromCharCode(...PNG)),
      mimeType: 'image/png'
    });
    expect(resultText(result)).toBe(
      'Pill from src/ui/Pill.tsx, 390×32 at 1x, in the app theme. As tall as its content; give a height to draw a ' +
        'whole screen that fills the window.'
    );
    expect(result.structuredContent).toMatchObject({ export: 'Pill', width: 390, height: 32, clipped: false });
  });

  it('draws an exported element, and the default export ahead of the rest', async () => {
    const screen = Box({ height: 50 });
    const { deps } = project({
      '/src/mocks/Settings.ts': { default: screen, Pill },
      '/src/mocks/Board.tsx': { Board: Box({ height: 70 }) }
    });

    const settings = await renderModule({ module: 'src/mocks/Settings.ts', width: 200 }, deps);
    const board = await renderModule({ module: 'src/mocks/Board', width: 200, height: 600 }, deps);

    expect(resultText(settings)).toContain('default from src/mocks/Settings.ts, 200×50');
    expect(resultText(board)).toBe('Board from src/mocks/Board.tsx, 200×600 at 1x, in the app theme.');
  });

  it("draws light and dark in the application's own themes when it has them", async () => {
    const { deps } = project({ '/src/ui/Pill.tsx': { Pill } });
    let seen: unknown;
    const own = { ...darkTheme, density: 'compact' as const };
    const withThemes: RenderDependencies = {
      ...deps,
      themes: () => ({ dark: own }),
      frame: { ...deps.frame, settleMs: 100 }
    };
    const probe = async (theme: 'light' | 'dark') => {
      seen = undefined;
      function Probe(): UiChild {
        return Box({ height: 10, ref: node => (seen = node?.environment?.get(UiEnvironmentKeys.theme)) });
      }
      withThemes.load = async () => ({ Probe });
      await renderModule({ module: 'src/Probe', width: 100, theme }, withThemes);
      return seen;
    };
    expect(await probe('dark')).toBe(own);
    expect(await probe('light')).toBe(lightTheme);
  });

  it('says which export to choose, and what loaded nothing', async () => {
    const { deps } = project({ '/src/ui/Two.tsx': { Pill, Other: Pill } });

    const two = await renderModule({ module: 'src/ui/Two', width: 200 }, deps);
    const wrong = await renderModule({ module: 'src/ui/Two', export: 'Missing', width: 200 }, deps);
    const none = await renderModule({ module: 'src/ui/Nowhere', width: 200 }, deps);

    expect(resultText(two)).toBe('src/ui/Two.tsx exports Pill, Other; say which with export.');
    expect(resultText(wrong)).toBe(
      'src/ui/Two.tsx has no component or element exported as Missing. It exports Pill, Other.'
    );
    expect(none.isError).toBe(true);
    expect(resultText(none)).toContain(
      'No module loads from src/ui/Nowhere: tried src/ui/Nowhere.tsx, src/ui/Nowhere.ts'
    );
  });
});
