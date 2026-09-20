import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, type ComponentProps } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Column, percent, type UiChild, type UiNode, UiNodeType, defineModifier } from 'gesso-core';

import { Meter } from './Meter';

/**
 * A meter in a window of its own, at a width it did not choose.
 *
 * The bar fills what it is given, so every assertion about the fill is
 * an assertion about a percentage rather than about pixels.
 */
function mount(props: ComponentProps<typeof Meter>) {
  let host: UiNode | null = null;
  const meter: UiChild = createComponent(Meter, props);
  const ui = renderTest(Column({ ref: (node: UiNode | null) => (host = node), width: 240, padding: 8 }, meter), {
    width: 240,
    height: 120
  });
  ui.frame();
  return { ui, root: () => firstElement(host!) };
}

/** The first real node under a component's fragment anchor. */
function firstElement(node: UiNode): UiNode {
  let child = node.firstChild;
  while (child !== null && child.type === UiNodeType.Fragment) {
    child = child.firstChild;
  }
  if (child === null) {
    throw new Error(`No element under '${node.id}'.`);
  }
  return child;
}

/** The track is the meter's first child; the fill is the track's. */
function fill(root: UiNode): UiNode {
  const track = root.firstChild;
  if (track === null || track.firstChild === null) {
    throw new Error('No fill under the meter.');
  }
  return track.firstChild;
}

function paint(props: ComponentProps<typeof Meter>): unknown {
  const { root } = mount(props);
  return fill(root()).properties.get('backgroundColor');
}

/** Every text drawn anywhere in the tree. */
function texts(ui: ReturnType<typeof renderTest>): unknown[] {
  return ui
    .allNodes()
    .map(node => node.properties.get('text'))
    .filter(text => text !== undefined);
}

/**
 * A modifier that does nothing but say where it landed. `rootModifiers`
 * is a promise about *which element* a caller's modifier reaches, so
 * the assertion has to be about the node rather than about a property.
 */
const attachedTo: UiNode[] = [];
const mark = defineModifier<void>({
  name: 'mark',
  attach(host) {
    attachedTo.push(host.node);
  }
});

describe('Meter', () => {
  it('reports the measurement, not a fraction of it', () => {
    const { ui, root } = mount({ value: 34, min: 0, max: 120, label: 'Disk used' });

    // The units survive. A meter that reported 0.283 would have thrown
    // away what the number means on the way to the reader.
    expect(ui.getSemantics(root())).toMatchObject({
      role: 'progressbar',
      label: 'Disk used',
      valueNow: 34,
      valueMin: 0,
      valueMax: 120
    });
  });

  it('clamps the fill and does not clamp the number', () => {
    const over = mount({ value: 1.4, label: 'Quota' });
    const under = mount({ value: -0.5, label: 'Quota' });

    // A fill wider than its track would be a lie about the picture.
    expect(fill(over.root()).properties.get('width')).toEqual(percent(100));
    expect(fill(under.root()).properties.get('width')).toEqual(percent(0));

    // Clamping the reported value would be a lie about the number.
    expect(over.ui.getSemantics(over.root()).valueNow).toBe(1.4);
    expect(under.ui.getSemantics(under.root()).valueNow).toBe(-0.5);
  });

  it('draws the fill as a percentage of the track, so it follows a resize', () => {
    const { root } = mount({ value: 0.25 });

    const bar = fill(root());
    expect(bar.properties.get('width')).toEqual(percent(25));
    expect(bar.properties.get('position')).toBe('absolute');
    expect(bar.properties.get('left')).toBe(0);
  });

  it('paints one band in the accent when no edge was named', () => {
    // A caller who named no edges has said nothing about what a good
    // reading is, so the component guesses nothing.
    expect(paint({ value: 0.1 })).toBe('controlAccent');
    expect(paint({ value: 0.9 })).toBe('controlAccent');
  });

  it("reads the bands upwards when the good end is 'high'", () => {
    const strength = (value: number) => paint({ value, min: 0, max: 4, low: 1, high: 3, optimum: 'high' });

    expect(strength(0)).toBe('danger');
    expect(strength(1)).toBe('danger');
    expect(strength(2)).toBe('textMuted');
    expect(strength(3)).toBe('controlAccent');
    expect(strength(4)).toBe('controlAccent');
  });

  it("reads them downwards when the good end is 'low', which is the disk case", () => {
    const disk = (value: number) => paint({ value, min: 0, max: 100, low: 60, high: 85, optimum: 'low' });

    // 5% full is good and 95% full is not, which is the whole reason
    // `optimum` is a prop rather than an assumption.
    expect(disk(5)).toBe('controlAccent');
    expect(disk(60)).toBe('controlAccent');
    expect(disk(70)).toBe('textMuted');
    expect(disk(85)).toBe('danger');
    expect(disk(95)).toBe('danger');
  });

  it('reads the band from the raw value, so passing the top is worse and not better', () => {
    // Clamping here would wrap round into the good band at 101%.
    expect(paint({ value: 140, min: 0, max: 100, low: 60, high: 85, optimum: 'low' })).toBe('danger');
  });

  it('puts a missing edge at the end of the range it bounds', () => {
    // `high` alone: everything below it is the bottom of the scale, so
    // only `min` itself is poor.
    expect(paint({ value: 0, min: 0, max: 1, high: 0.8 })).toBe('danger');
    expect(paint({ value: 0.5, min: 0, max: 1, high: 0.8 })).toBe('textMuted');
    expect(paint({ value: 0.9, min: 0, max: 1, high: 0.8 })).toBe('controlAccent');
  });

  it('follows the value as it changes, band and all', () => {
    const value = new BehaviorSubject(10);
    const { ui, root } = mount({ value, min: 0, max: 100, low: 60, high: 85, optimum: 'low', label: 'Disk' });

    expect(fill(root()).properties.get('backgroundColor')).toBe('controlAccent');

    value.next(92);
    ui.frame();

    expect(fill(root()).properties.get('backgroundColor')).toBe('danger');
    expect(fill(root()).properties.get('width')).toEqual(percent(92));
    expect(ui.getSemantics(root()).valueNow).toBe(92);
  });

  it('draws an empty bar for a range that is not one, rather than throwing', () => {
    const { ui, root } = mount({ value: 5, min: 10, max: 10, label: 'Seats used' });

    expect(fill(root()).properties.get('width')).toEqual(percent(0));
    // The range it was handed is still what it reports, so the reader
    // can see that the range is the thing that is wrong.
    expect(ui.getSemantics(root())).toMatchObject({ valueNow: 5, valueMin: 10, valueMax: 10 });
  });

  it('speaks the reading through valueText, whether or not it is drawn', () => {
    const shown = mount({ value: 0.82, label: 'Disk used', showValue: true });
    const hidden = mount({ value: 0.82, label: 'Disk used' });

    expect(shown.ui.getSemantics(shown.root()).valueText).toBe('82%');
    expect(hidden.ui.getSemantics(hidden.root()).valueText).toBe('82%');

    // `showValue` decides only what is painted.
    expect(texts(shown.ui)).toContain('82%');
    expect(texts(hidden.ui)).not.toContain('82%');
  });

  it('is the only record in its subtree, because a progressbar claims its children', () => {
    const { ui } = mount({ value: 0.82, label: 'Disk used', showValue: true });

    // The reading is drawn, and it has no record of its own: a
    // `progressbar`'s children are presentational, so the text beside
    // the bar is never announced. That is why the reading cannot live
    // there.
    expect(ui.querySemantics(ui.getByText('82%'))).toBeNull();
    expect(ui.getByRole('progressbar')).toBeTruthy();
  });

  it('writes the default reading as a percentage of the range, in the range units given', () => {
    const { ui, root } = mount({ value: 34, min: 0, max: 120, label: 'Disk used' });
    expect(ui.getSemantics(root()).valueText).toBe('28%');

    // A range with no span has no percentage in it to report.
    const degenerate = mount({ value: 5, min: 10, max: 10 });
    expect(degenerate.ui.getSemantics(degenerate.root()).valueText).toBe('5');
  });

  it("lets `format` say what the number means, and follows the caller's", () => {
    const { ui, root } = mount({
      value: 34,
      min: 0,
      max: 120,
      label: 'Disk used',
      showValue: true,
      format: (value: number) => `${value} of 120 GB`
    });

    expect(ui.getSemantics(root()).valueText).toBe('34 of 120 GB');
    expect(texts(ui)).toContain('34 of 120 GB');
  });

  it("attaches a caller's rootModifiers to the element the meter is", () => {
    attachedTo.length = 0;
    const { root } = mount({ value: 0.5, rootModifiers: [mark()] });

    // A component's own node is its anchor fragment, which takes no
    // modifier, so this is the only way a `motion` reaches the bar.
    expect(attachedTo).toContain(root());
  });
});
