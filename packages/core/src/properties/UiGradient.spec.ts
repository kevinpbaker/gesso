import { describe, expect, it } from 'vitest';

import { darkTheme } from '../environment/UiTheme';
import { UiGraph } from '../graph/UiGraph';
import { UiNodeType } from '../graph/UiNodeType';
import { percent } from '../layout/UiLength';
import { createPaintState, resolvePaintState } from '../rendering/PaintState';
import {
  gradientPaint,
  gradientsEqual,
  linearGradient,
  MAX_GRADIENT_STOPS,
  radialGradient,
  validateGradient,
  type UiGradientStop
} from './UiGradient';
import { resolveGradient } from './UiThemeColor';

const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

function themedNode() {
  const graph = new UiGraph();
  const parent = graph.createNode('parent', UiNodeType.Box);
  parent.setProperty('theme', darkTheme);
  graph.appendChild(graph.root, parent);
  const node = graph.createNode('node', UiNodeType.Box);
  graph.appendChild(parent, node);
  parent.environment = graph.buildNodeEnvironment(parent);
  node.environment = graph.buildNodeEnvironment(node);
  return node;
}

/**
 * Six decimal places, with -0 folded into 0.
 *
 * A cardinal angle in radians is not exact: `Math.sin(Math.PI)` is
 * 1.2e-16 rather than zero, so a gradient line that ought to end on the
 * box edge ends a fraction of a femtopixel past it. Both backends are given
 * the same numbers, so this is a readability problem in the assertions
 * rather than a parity one.
 */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6 + 0;
}

describe('gradient values', () => {
  it('builds a linear gradient and rejects one with too few stops', () => {
    const gradient = linearGradient(Math.PI, [{ color: '#000000' }, { color: '#ffffff' }]);
    expect(gradient.kind).toBe('linear');
    expect(gradient.stops).toHaveLength(2);
    expect(() => linearGradient(Math.PI, [{ color: '#000000' }])).toThrow(/at least two stops/);
  });

  it('refuses more stops than a gradient record holds, and says the limit', () => {
    const stops: UiGradientStop[] = Array.from({ length: MAX_GRADIENT_STOPS + 1 }, () => ({ color: '#000000' }));
    expect(() => linearGradient(0, stops)).toThrow(
      new RegExp(`${MAX_GRADIENT_STOPS + 1} stops exceeds the ${MAX_GRADIENT_STOPS}`)
    );
    // Exactly at the cap is fine; the error is about the ninth stop.
    expect(linearGradient(0, stops.slice(1)).stops).toHaveLength(MAX_GRADIENT_STOPS);
  });

  it('refuses offsets on only some stops rather than guessing the rest', () => {
    expect(() => linearGradient(0, [{ color: '#000000', offset: percent(0) }, { color: '#ffffff' }])).toThrow(
      /Give every stop an offset, or none of them/
    );
  });

  it('rejects an angle that is not a number, and an unknown kind', () => {
    expect(validateGradient({ kind: 'linear', angle: Number.NaN, stops: [] })).toMatch(/finite angle/);
    expect(validateGradient({ kind: 'conic', stops: [] })).toMatch(/unknown gradient kind/);
    expect(validateGradient(undefined)).toBeUndefined();
  });

  describe('gradientsEqual', () => {
    it('compares geometry and stops, and sees through equivalent colour spellings', () => {
      const a = linearGradient(Math.PI, [{ color: '#ff0000' }, { color: '#0000ff' }]);
      const b = linearGradient(Math.PI, [{ color: { r: 1, g: 0, b: 0, a: 1 } }, { color: '#0000ff' }]);
      expect(gradientsEqual(a, b)).toBe(true);
      expect(gradientsEqual(a, linearGradient(0, a.stops))).toBe(false);
      expect(gradientsEqual(a, radialGradient(a.stops))).toBe(false);
      expect(gradientsEqual(a, undefined)).toBe(false);
      expect(gradientsEqual(undefined, undefined)).toBe(true);
    });

    it('treats two palette names as different, as a colour property does', () => {
      const a = linearGradient(0, [{ color: 'primary' }, { color: 'surface' }]);
      const b = linearGradient(0, [{ color: 'secondary' }, { color: 'surface' }]);
      expect(gradientsEqual(a, b)).toBe(false);
    });
  });
});

describe('resolving a gradient against the theme', () => {
  it('resolves every stop that names a palette entry', () => {
    const node = themedNode();
    const resolved = resolveGradient(node, linearGradient(0, [{ color: 'primary' }, { color: 'surface' }]));
    expect(resolved?.stops.map(stop => stop.color)).toEqual([darkTheme.colors.primary, darkTheme.colors.surface]);
  });

  it('reaches the paint state, alongside the background colour', () => {
    const node = themedNode();
    node.setProperty('backgroundColor', 'background');
    node.setProperty('backgroundGradient', linearGradient(Math.PI, [{ color: 'primary' }, { color: 'secondary' }]));
    const state = resolvePaintState(node, createPaintState());
    expect(state.backgroundColor).toEqual(darkTheme.colors.background);
    expect(state.backgroundGradient?.stops[0].color).toEqual(darkTheme.colors.primary);
  });

  it('throws on a malformed gradient that skipped the builder, naming the fault', () => {
    const node = themedNode();
    expect(() => resolveGradient(node, { kind: 'linear', angle: 0, stops: [] })).toThrow(/at least two stops/);
  });

  it('gives up quietly on a stop whose colour nothing can resolve', () => {
    const node = themedNode();
    expect(resolveGradient(node, linearGradient(0, [{ color: 'not-a-colour' }, { color: '#fff' }]))).toBeUndefined();
  });
});

describe('placing a gradient in a box', () => {
  const stops = [
    { offset: undefined, color: BLACK },
    { offset: undefined, color: WHITE }
  ];

  it('runs a zero angle up the box and pi down it, through the centre', () => {
    const up = gradientPaint({ kind: 'linear', angle: 0, stops }, 100, 40);
    expect({ x0: round(up.x0), y0: round(up.y0), x1: round(up.x1), y1: round(up.y1) }).toEqual({
      x0: 50,
      y0: 40,
      x1: 50,
      y1: 0
    });
    const down = gradientPaint({ kind: 'linear', angle: Math.PI, stops }, 100, 40);
    expect({ x0: round(down.x0), y0: round(down.y0), x1: round(down.x1), y1: round(down.y1) }).toEqual({
      x0: 50,
      y0: 0,
      x1: 50,
      y1: 40
    });
  });

  it('runs a quarter turn left to right', () => {
    const across = gradientPaint({ kind: 'linear', angle: Math.PI / 2, stops }, 100, 40);
    expect({ x0: round(across.x0), y0: round(across.y0), x1: round(across.x1), y1: round(across.y1) }).toEqual({
      x0: 0,
      y0: 20,
      x1: 100,
      y1: 20
    });
  });

  it('lengthens the gradient line on a diagonal so the corners sit on its ends', () => {
    // At 45 degrees over a square the line is the diagonal: |w·sin| +
    // |h·cos| = 100/√2 + 100/√2 = √2 · 100.
    const diagonal = gradientPaint({ kind: 'linear', angle: Math.PI / 4, stops }, 100, 100);
    const length = Math.hypot(diagonal.x1 - diagonal.x0, diagonal.y1 - diagonal.y0);
    expect(round(length)).toBe(round(Math.SQRT2 * 100));
  });

  it('spreads offsetless stops evenly, and reads pixels and percentages the same way', () => {
    const even = gradientPaint(
      {
        kind: 'linear',
        angle: Math.PI / 2,
        stops: [
          { offset: undefined, color: BLACK },
          { offset: undefined, color: WHITE },
          { offset: undefined, color: BLACK }
        ]
      },
      100,
      10
    );
    expect(even.stops.map(stop => stop.offset)).toEqual([0, 0.5, 1]);

    // The gradient line is 100 long, so 25 px and percent(25) agree.
    const placed = gradientPaint(
      {
        kind: 'linear',
        angle: Math.PI / 2,
        stops: [
          { offset: 25, color: BLACK },
          { offset: percent(75), color: WHITE }
        ]
      },
      100,
      10
    );
    expect(placed.stops.map(stop => stop.offset)).toEqual([0.25, 0.75]);
  });

  it('clamps stops into the gradient and never lets one go backwards', () => {
    const placed = gradientPaint(
      {
        kind: 'linear',
        angle: Math.PI / 2,
        stops: [
          { offset: percent(60), color: BLACK },
          { offset: percent(20), color: WHITE },
          { offset: percent(400), color: BLACK }
        ]
      },
      100,
      10
    );
    expect(placed.stops.map(stop => stop.offset)).toEqual([0.6, 0.6, 1]);
  });

  it('centres a radial gradient and reaches the farthest corner by default', () => {
    const placed = gradientPaint(
      { kind: 'radial', centerX: undefined, centerY: undefined, radius: undefined, stops },
      80,
      60
    );
    expect({ x: placed.x0, y: placed.y0 }).toEqual({ x: 40, y: 30 });
    expect(round(placed.radius)).toBe(round(Math.hypot(40, 30)));
  });

  it('takes a radial centre in pixels or as a percentage of the box', () => {
    const pixels = gradientPaint({ kind: 'radial', centerX: 10, centerY: 5, radius: 20, stops }, 80, 60);
    expect({ x: pixels.x0, y: pixels.y0, r: pixels.radius }).toEqual({ x: 10, y: 5, r: 20 });
    const fractions = gradientPaint(
      { kind: 'radial', centerX: percent(0), centerY: percent(0), radius: percent(50), stops },
      80,
      60
    );
    expect({ x: fractions.x0, y: fractions.y0 }).toEqual({ x: 0, y: 0 });
    // percent(50) of the farthest corner, which from the top-left is the
    // whole diagonal.
    expect(round(fractions.radius)).toBe(round(Math.hypot(80, 60) / 2));
  });
});
