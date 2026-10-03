import { describe, expect, it } from 'vitest';

import { UiNodeType } from '../../graph/UiNodeType';
import { Constraints } from '../../layout/LayoutTypes';
import { callArgs, callNames, RenderHarness } from '../RenderTestUtils';
import { PRECISE_ABOVE, PreciseContext } from './PreciseContext';
import type { Canvas2DContext } from './Canvas2DContext';

/** A context that writes down what it was asked, and keeps a translate-only matrix. */
function recorder() {
  const calls: [string, unknown[]][] = [];
  let e = 0;
  let f = 0;
  const context = new Proxy({} as Record<string, unknown>, {
    get(_target, name: string) {
      if (name === 'getTransform') {
        return () => ({ a: 1, b: 0, c: 0, d: 1, e, f });
      }
      return (...args: unknown[]) => {
        calls.push([name, args]);
        if (name === 'translate') {
          e += args[0] as number;
          f += args[1] as number;
        }
      };
    },
    set() {
      return true;
    }
  }) as unknown as Canvas2DContext;
  return { context, calls };
}

describe('PreciseContext', () => {
  it('passes an ordinary translation straight through', () => {
    const { context, calls } = recorder();
    const precise = new PreciseContext(context);
    precise.translate(0, -50);
    precise.fillRect(0, 60, 10, 10);
    expect(calls).toEqual([
      ['translate', [0, -50]],
      ['fillRect', [0, 60, 10, 10]]
    ]);
  });

  it('holds a huge translation back and hands the canvas the small number it cancels to', () => {
    const { context, calls } = recorder();
    const precise = new PreciseContext(context);
    // A row of a five-million-row grid, scrolled to: in float32 both of
    // these round to multiples of eight, and the row lands off its pixel.
    precise.translate(0, -129_999_740);
    precise.fillRect(0, 129_999_766, 100, 26);
    precise.fillText('7.82', 4, 129_999_783);
    expect(calls).toEqual([
      ['fillRect', [0, 26, 100, 26]],
      ['fillText', ['7.82', 4, 43]]
    ]);
    expect(precise.getTransform?.().f).toBe(-129_999_740);
  });

  it('scopes what it holds to save and restore', () => {
    const { context, calls } = recorder();
    const precise = new PreciseContext(context);
    precise.save();
    precise.translate(0, -PRECISE_ABOVE * 4);
    precise.translate(5, 0);
    precise.restore();
    precise.fillRect(1, 2, 3, 4);
    expect(calls.filter(([name]) => name !== 'save' && name !== 'restore')).toEqual([['fillRect', [1, 2, 3, 4]]]);
  });

  it('writes the translation out before a rotation, which does not commute with it', () => {
    const { context, calls } = recorder();
    const precise = new PreciseContext(context);
    precise.translate(0, -PRECISE_ABOVE * 2);
    precise.rotate(1);
    precise.fillRect(0, 0, 1, 1);
    expect(calls.map(([name]) => name)).toEqual(['translate', 'rotate', 'fillRect']);
    expect(calls[0][1]).toEqual([0, -PRECISE_ABOVE * 2]);
  });

  it('drops what it holds when the whole matrix is replaced', () => {
    const { context, calls } = recorder();
    const precise = new PreciseContext(context);
    precise.translate(0, -PRECISE_ABOVE * 2);
    precise.setTransform(2, 0, 0, 2, 0, 0);
    precise.fillRect(0, 0, 1, 1);
    expect(calls.at(-1)).toEqual(['fillRect', [0, 0, 1, 1]]);
  });
});

describe('Canvas2DRenderer, scrolled millions of pixels down', () => {
  it('draws a row at the bottom of a huge scroll where it belongs', () => {
    const h = new RenderHarness();
    const scroll = h.createNode('scroll', UiNodeType.ScrollView);
    scroll.setProperty('width', 200);
    scroll.setProperty('height', 100);
    const spacer = h.createNode('spacer', UiNodeType.Box);
    spacer.setProperty('height', 129_999_740);
    spacer.setProperty('flexShrink', 0);
    const row = h.createNode('row', UiNodeType.Box);
    row.setProperty('height', 26);
    row.setProperty('flexShrink', 0);
    row.setProperty('backgroundColor', '#f00');
    h.append(scroll, spacer, row);
    scroll.setProperty('scrollY', 129_999_740);
    h.layout(scroll, Constraints.loose(800, 600));
    h.render(scroll);

    // The canvas is never asked to translate by a hundred and thirty
    // million, and the row is filled at its place on screen: the scroll
    // clamps to the content less the 100-pixel viewport, which leaves
    // the 26-pixel row 74 pixels down.
    expect(callArgs(h.context, 'translate').every(([, y]) => Math.abs(y as number) < PRECISE_ABOVE)).toBe(true);
    expect(callArgs(h.context, 'fillRect')).toEqual([[0, 74, 200, 26]]);
    expect(callNames(h.context)).toContain('fillRect');
  });
});
