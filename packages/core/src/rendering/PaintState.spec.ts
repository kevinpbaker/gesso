import { describe, expect, it } from 'vitest';

import { UiNode } from '../graph/UiNode';
import { UiNodeType } from '../graph/UiNodeType';
import { parseTransform } from '../properties/UiTransform';
import {
  computeObjectFitRect,
  createPaintState,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_TEXT_COLOR,
  isPaintVisible,
  normalizeTextAlign,
  normalizeVerticalAlign,
  resolvePaintState,
  type PaintState
} from './PaintState';

function nodeWith(props: Record<string, unknown>): UiNode {
  const node = new UiNode('node', UiNodeType.Box);
  for (const [key, value] of Object.entries(props)) {
    node.setProperty(key, value);
  }
  return node;
}

function resolve(props: Record<string, unknown>) {
  return resolvePaintState(nodeWith(props), createPaintState());
}

describe('resolvePaintState', () => {
  it('uses default paint values for an empty node', () => {
    const state = resolve({});
    expect(state.visible).toBe(true);
    expect(state.opacity).toBe(1);
    expect(state.backgroundColor).toBeUndefined();
    expect(state.image).toBeUndefined();
    expect(state.objectFit).toBe('fill');
    expect(state.borderColor).toBeUndefined();
    expect(state.borderWidth).toBe(0);
    expect(state.borderRadius).toEqual({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
    expect(state.hasTransform).toBe(false);
    expect(state.text).toBeUndefined();
    // The text half is not resolved for a node with no text, so these
    // are the untouched defaults rather than this node's answers. That
    // is why `lineHeight` is 0 and not a normal line height for the
    // default size: nothing resolved a font.
    expect(state.fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(state.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    expect(state.fontWeight).toBe(DEFAULT_FONT_WEIGHT);
    expect(state.lineHeight).toBe(0);
    expect(state.textColor).toEqual(DEFAULT_TEXT_COLOR);
    expect(state.textAlign).toBe('start');
    expect(state.verticalAlign).toBe('top');
  });

  it('respects the visible flag', () => {
    expect(resolve({ visible: false }).visible).toBe(false);
    expect(resolve({ visible: true }).visible).toBe(true);
    expect(resolve({}).visible).toBe(true);
  });

  it('clamps opacity into [0, 1]', () => {
    expect(resolve({ opacity: 0.5 }).opacity).toBe(0.5);
    expect(resolve({ opacity: 1.5 }).opacity).toBe(1);
    expect(resolve({ opacity: -0.2 }).opacity).toBe(0);
  });

  it('reads background and border colors as UiColor', () => {
    expect(resolve({ backgroundColor: '#ff0000' }).backgroundColor).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(resolve({ borderColor: 'blue' }).borderColor).toEqual({ r: 0, g: 0, b: 1, a: 1 });
  });

  it('reads border width and radius, clamping radius at zero', () => {
    const state = resolve({ borderWidth: 3, borderRadius: -4 });
    expect(state.borderWidth).toBe(3);
    expect(state.borderRadius).toEqual({ topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
    expect(resolve({ borderRadius: 8 }).borderRadius).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8
    });
  });

  it('reads an image only when it carries dimensions', () => {
    const image = { width: 10, height: 20 } as ImageBitmap;
    expect(resolve({ image }).image).toBe(image);
    expect(resolve({ image: {} }).image).toBeUndefined();
    expect(resolve({ image: 'nope' }).image).toBeUndefined();
  });

  it('normalizes object-fit', () => {
    expect(resolve({ objectFit: 'cover' }).objectFit).toBe('cover');
    expect(resolve({ objectFit: 'contain' }).objectFit).toBe('contain');
    expect(resolve({ objectFit: 'none' }).objectFit).toBe('none');
    expect(resolve({ objectFit: 'bogus' }).objectFit).toBe('fill');
  });

  it('reads text and text style', () => {
    const state = resolve({
      text: 'Hello',
      fontSize: 20,
      fontFamily: 'Arial',
      fontWeight: 700,
      lineHeight: 30,
      color: '#0f0'
    });
    expect(state.text).toBe('Hello');
    expect(state.fontSize).toBe(20);
    expect(state.fontFamily).toBe('Arial');
    expect(state.fontWeight).toBe(700);
    expect(state.lineHeight).toBe(30);
    expect(state.textColor).toEqual({ r: 0, g: 1, b: 0, a: 1 });
  });

  it('treats empty text as absent', () => {
    expect(resolve({ text: '' }).text).toBeUndefined();
  });

  it('treats invalid numeric styles as absent', () => {
    const state = resolve({ text: 'Hello', fontSize: 'big', fontWeight: '', lineHeight: -4, color: 5 });
    expect(state.fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(state.fontWeight).toBe(DEFAULT_FONT_WEIGHT);
    expect(state.lineHeight).toBe(DEFAULT_FONT_SIZE * 1.2);
    expect(state.textColor).toEqual(DEFAULT_TEXT_COLOR);
  });

  it('normalizes text alignment', () => {
    expect(resolve({ text: 'a', textAlign: 'center' }).textAlign).toBe('center');
    expect(resolve({ text: 'a', textAlign: 'right' }).textAlign).toBe('right');
    // start and end are kept as they are: which edge they mean depends
    // on the paragraph's direction, and placeLines decides it.
    expect(resolve({ text: 'a', textAlign: 'end' }).textAlign).toBe('end');
    expect(resolve({ text: 'a', textAlign: 'start' }).textAlign).toBe('start');
    expect(resolve({ text: 'a' }).textAlign).toBe('start');
  });

  it('normalizes vertical alignment', () => {
    expect(resolve({ text: 'a', verticalAlign: 'middle' }).verticalAlign).toBe('middle');
    expect(resolve({ text: 'a', verticalAlign: 'center' }).verticalAlign).toBe('middle');
    expect(resolve({ text: 'a', verticalAlign: 'bottom' }).verticalAlign).toBe('bottom');
    expect(resolve({ text: 'a', verticalAlign: 'top' }).verticalAlign).toBe('top');
  });
});

/**
 * The scratch is one object walked over the whole tree, so the failure
 * this half of the function can cause is a box drawn in the font and
 * colour of whichever text node the walk passed last. These check the
 * scratch itself; `Canvas2DRenderer.spec` checks that a real walk over
 * a label and its neighbour draws them apart.
 */
describe('resolvePaintState reusing a scratch', () => {
  it('leaves a box none of the text node resolved before it', () => {
    const scratch = createPaintState();
    resolvePaintState(
      nodeWith({
        text: 'Loud',
        fontSize: 40,
        fontFamily: 'Georgia',
        fontWeight: 900,
        lineHeight: 60,
        letterSpacing: 3,
        color: '#ff0000',
        textAlign: 'right',
        verticalAlign: 'bottom',
        textWrap: 'none',
        maxLines: 2,
        textOverflow: 'ellipsis',
        textDirection: 'rtl'
      }),
      scratch
    );
    expect(scratch.fontSize).toBe(40);

    const box = resolvePaintState(nodeWith({ backgroundColor: '#00ff00' }), scratch);
    expect(box.text).toBeUndefined();
    expect(box.fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(box.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    expect(box.fontWeight).toBe(DEFAULT_FONT_WEIGHT);
    expect(box.lineHeight).toBe(0);
    expect(box.letterSpacing).toBe(0);
    expect(box.textColor).toEqual(DEFAULT_TEXT_COLOR);
    expect(box.textAlign).toBe('start');
    expect(box.verticalAlign).toBe('top');
    expect(box.textWrap).toBe('word');
    expect(box.maxLines).toBeUndefined();
    expect(box.textOverflow).toBe('clip');
    expect(box.rtl).toBe(false);
  });

  it('leaves a box exactly the text half a fresh scratch has', () => {
    const scratch = createPaintState();
    resolvePaintState(nodeWith({ text: 'Loud', fontSize: 40, color: '#ff0000', textDirection: 'rtl' }), scratch);
    const box = resolvePaintState(nodeWith({}), scratch);
    const fresh = createPaintState();
    for (const field of TEXT_STYLE_FIELDS) {
      expect(box[field]).toEqual(fresh[field]);
    }
  });
});

/** Every field of the paint state that describes a paragraph. */
const TEXT_STYLE_FIELDS = [
  'fontSize',
  'fontFamily',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textColor',
  'textAlign',
  'verticalAlign',
  'textWrap',
  'maxLines',
  'textOverflow',
  'rtl'
] as const satisfies readonly (keyof PaintState)[];

describe('isPaintVisible', () => {
  // The renderers ask this before they resolve anything else, and then
  // draw whatever it lets through, so its only real requirement is that
  // it agrees with the test it replaced: `!visible || opacity === 0`
  // read off a fully resolved paint state.
  function agrees(props: Record<string, unknown>): void {
    const node = nodeWith(props);
    const state = resolvePaintState(node, createPaintState());
    expect(isPaintVisible(node)).toBe(state.visible && state.opacity !== 0);
  }

  it('agrees with the resolved paint state', () => {
    agrees({});
    agrees({ visible: true });
    agrees({ visible: false });
    agrees({ opacity: 1 });
    agrees({ opacity: 0.5 });
    agrees({ opacity: 0 });
    // Clamped to zero by resolvePaintState, so invisible either way.
    agrees({ opacity: -0.2 });
    agrees({ opacity: 1.5 });
    // Neither a number nor absent: it survives both comparisons.
    agrees({ opacity: 'half' });
    agrees({ visible: false, opacity: 1 });
    agrees({ visible: true, opacity: 0 });
  });
});

describe('parseTransform', () => {
  it('parses the pivot, a translation, scale and rotation', () => {
    const transform = parseTransform({
      x: 5,
      y: 3,
      translateX: 9,
      translateY: -4,
      scaleX: 2,
      scaleY: 0.5,
      rotation: 1.5
    });
    expect(transform).toEqual({ x: 5, y: 3, translateX: 9, translateY: -4, scaleX: 2, scaleY: 0.5, rotation: 1.5 });
  });

  it('reports identity transforms as absent', () => {
    expect(parseTransform({})).toBeUndefined();
    expect(parseTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })).toBeUndefined();
    expect(parseTransform(undefined)).toBeUndefined();
    expect(parseTransform('translate')).toBeUndefined();
  });

  it('fills defaults for partial transforms', () => {
    expect(parseTransform({ scaleX: 2 })).toEqual({
      x: 0,
      y: 0,
      translateX: 0,
      translateY: 0,
      scaleX: 2,
      scaleY: 1,
      rotation: 0
    });
  });
});

describe('alignment normalization helpers', () => {
  it('normalizes horizontal alignment', () => {
    expect(normalizeTextAlign('left')).toBe('left');
    expect(normalizeTextAlign('center')).toBe('center');
    expect(normalizeTextAlign('right')).toBe('right');
    expect(normalizeTextAlign('end')).toBe('end');
    expect(normalizeTextAlign('start')).toBe('start');
    expect(normalizeTextAlign(undefined)).toBe('start');
    expect(normalizeTextAlign('bogus')).toBe('start');
  });

  it('normalizes vertical alignment', () => {
    expect(normalizeVerticalAlign('top')).toBe('top');
    expect(normalizeVerticalAlign('middle')).toBe('middle');
    expect(normalizeVerticalAlign('center')).toBe('middle');
    expect(normalizeVerticalAlign('bottom')).toBe('bottom');
    expect(normalizeVerticalAlign(undefined)).toBe('top');
  });
});

describe('computeObjectFitRect', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 };

  it('fills the whole box by default', () => {
    expect(computeObjectFitRect('fill', 200, 10, box)).toEqual(box);
  });

  it('contains by scaling down to fit and centering', () => {
    const rect = computeObjectFitRect('contain', 200, 100, box);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
  });

  it('covers by scaling up and cropping with centered offset', () => {
    const rect = computeObjectFitRect('cover', 50, 50, box);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(100);
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20 - 25);
  });

  it('draws at natural size for none', () => {
    expect(computeObjectFitRect('none', 30, 40, box)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('returns an empty rect for a degenerate image', () => {
    expect(computeObjectFitRect('fill', 0, 0, box)).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });
});
