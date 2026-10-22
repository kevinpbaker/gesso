import { BehaviorSubject, type Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, type LayoutBox, type UiNode } from 'gesso-core';

import { RangeSlider, type RangeSliderProps } from './RangeSlider';

type Pair = readonly [number, number];
/** The props as a caller may pass them: the pair may be a stream the caller owns. */
type Props = Partial<Omit<RangeSliderProps, 'value'>> & { value?: Pair | Observable<Pair> };

/** The track strip: the second child of the group that is the range slider. */
function stripOf(ui: Pick<Rendered, 'getByRole'>): UiNode {
  const strip = ui.getByRole('group').firstChild?.nextSibling;
  if (strip === null || strip === undefined) {
    throw new Error('the range slider has no track');
  }
  return strip;
}

/** A 0 to 100 price range across a 400px box, read in the given direction. */
function mount(direction: 'ltr' | 'rtl', props: Props = {}) {
  const changes: Pair[] = [];
  const ui = renderTest(
    Box(
      { width: 400, height: 200, textDirection: direction, x: 'stretch', y: 'start' },
      createComponent(RangeSlider, {
        label: 'Price',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: [20, 80] as Pair,
        onChange: (v: Pair) => changes.push(v),
        ...props
      })
    ),
    { width: 400, height: 200 }
  );
  ui.frame();
  const low = (): UiNode => ui.getByRole('slider', { name: 'Minimum price' });
  const high = (): UiNode => ui.getByRole('slider', { name: 'Maximum price' });
  const strip = (): LayoutBox => ui.getLayout(stripOf(ui))!;
  /** The x of a value along the strip, counted from where the track starts. */
  const xOf = (value: number): number => {
    const box = strip();
    const along = (value / 100) * box.width;
    return direction === 'ltr' ? box.x + along : box.x + box.width - along;
  };
  const yMid = (): number => strip().y + strip().height / 2;
  /** Both thumbs' values, after a frame so the semantics are current. */
  const values = (): Pair => {
    ui.frame();
    return [ui.getSemantics(low()).valueNow!, ui.getSemantics(high()).valueNow!];
  };
  return { ui, changes, low, high, strip, xOf, yMid, values };
}

/** Where a thumb's centre is, horizontally. */
function centreOf(ui: Rendered, node: UiNode): number {
  const box = ui.getLayout(node)!;
  return box.x + box.width / 2;
}

describe('RangeSlider, rendering and semantics', () => {
  it('is a named group of two sliders, each announcing how far it can go', () => {
    const { ui, low, high } = mount('ltr', { format: (v: number) => `$${v}` });

    expect(ui.getByRole('group')).toHaveSemantics({ role: 'group', name: 'Price' });
    expect(ui.getAllByRole('slider')).toHaveLength(2);
    // Each thumb's own range stops at the other thumb, so a screen
    // reader's maximum for the low thumb is the truth about it.
    expect(ui.getSemantics(low())).toMatchObject({ valueNow: 20, valueMin: 0, valueMax: 80, valueText: '$20' });
    expect(ui.getSemantics(high())).toMatchObject({ valueNow: 80, valueMin: 20, valueMax: 100, valueText: '$80' });
    // The span is drawn beside the label.
    expect(ui.getByText('$20 – $80')).toBeDefined();
  });

  it('keeps the minimum distance out of each thumb’s announced range', () => {
    const { ui, low, high } = mount('ltr', { minDistance: 10 });
    expect(ui.getSemantics(low()).valueMax).toBe(70);
    expect(ui.getSemantics(high()).valueMin).toBe(30);
  });

  it('takes thumb names given outright, and derives them otherwise', () => {
    const named = mount('ltr', { label: 'Stay', thumbLabels: ['Check in', 'Check out'] as const });
    expect(named.ui.getByRole('slider', { name: 'Check in' })).toBeDefined();
    expect(named.ui.getByRole('slider', { name: 'Check out' })).toBeDefined();

    // An abbreviation keeps its capitals; anything else reads as one phrase.
    const cpu = mount('ltr', { label: 'CPU load' });
    expect(cpu.ui.getByRole('slider', { name: 'Minimum CPU load' })).toBeDefined();

    const bare = mount('ltr', { label: '' });
    expect(bare.ui.getByRole('slider', { name: 'Minimum' })).toBeDefined();
    expect(bare.ui.getByRole('slider', { name: 'Maximum' })).toBeDefined();
  });

  it('centres each thumb on its end of the span, either way round, out to the ends', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      for (const pair of [
        [20, 80],
        [0, 100],
        [0, 0],
        [100, 100]
      ] as Pair[]) {
        const { ui, low, high, xOf } = mount(direction, { defaultValue: pair });
        expect(centreOf(ui, low())).toBeCloseTo(xOf(pair[0]));
        expect(centreOf(ui, high())).toBeCloseTo(xOf(pair[1]));
      }
    }
  });

  it('draws the span between the thumbs and nowhere else', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const { ui, xOf } = mount(direction);
      const span = ui.getLayout(stripOf(ui).firstChild!.firstChild!.lastChild!)!;
      const [left, right] = direction === 'ltr' ? [xOf(20), xOf(80)] : [xOf(80), xOf(20)];
      expect(span.x).toBeCloseTo(left);
      expect(span.x + span.width).toBeCloseTo(right);
    }
  });

  it('draws a pair given out of order or out of range sorted and clamped', () => {
    const { ui, low, high } = mount('ltr', { defaultValue: undefined, value: [130, -20] as Pair });
    ui.frame();
    expect(ui.getSemantics(low()).valueNow).toBe(0);
    expect(ui.getSemantics(high()).valueNow).toBe(100);
  });
});

describe('RangeSlider, keyboard', () => {
  it('gives each thumb its own tab stop and its own keys', () => {
    const { ui, changes, low, high, values } = mount('ltr');

    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('PageUp');
    expect(values()).toEqual([31, 80]);

    ui.fireEvent.focus(high());
    ui.fireEvent.keyDown('ArrowDown');
    ui.fireEvent.keyDown('PageDown');
    ui.fireEvent.keyDown('ArrowUp');
    expect(values()).toEqual([31, 70]);
    expect(changes).toEqual([
      [21, 80],
      [31, 80],
      [31, 79],
      [31, 69],
      [31, 70]
    ]);
  });

  it('stops a thumb against the other, so they never cross', () => {
    const { ui, low, high, values } = mount('ltr');

    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('End');
    // End for the low thumb is as far as it may go: the high thumb.
    expect(values()).toEqual([80, 80]);
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('PageUp');
    expect(values()).toEqual([80, 80]);
    ui.fireEvent.keyDown('Home');
    expect(values()).toEqual([0, 80]);

    ui.fireEvent.focus(high());
    ui.fireEvent.keyDown('Home');
    expect(values()).toEqual([0, 0]);
    ui.fireEvent.keyDown('ArrowLeft');
    expect(values()).toEqual([0, 0]);
    ui.fireEvent.keyDown('End');
    expect(values()).toEqual([0, 100]);
  });

  it('keeps the minimum distance', () => {
    const { ui, low, high, values } = mount('ltr', { minDistance: 15, defaultValue: [40, 60] as Pair });

    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    expect(values()).toEqual([45, 60]);

    ui.fireEvent.focus(high());
    ui.fireEvent.keyDown('Home');
    expect(values()).toEqual([45, 60]);
    ui.fireEvent.keyDown('End');
    expect(values()).toEqual([45, 100]);
  });

  it('reports nothing for a key that cannot move the thumb', () => {
    const { ui, changes, low } = mount('ltr', { defaultValue: [0, 100] as Pair });
    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowLeft');
    ui.fireEvent.keyDown('Home');
    expect(changes).toEqual([]);
  });

  it('snaps to the step counted from min, and to its precision', () => {
    const { ui, low, values } = mount('ltr', { min: 0, max: 1, step: 0.1, defaultValue: [0, 1] as Pair });
    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    expect(values()).toEqual([0.3, 1]);
  });
});

describe('RangeSlider, pointer', () => {
  it('moves the nearer thumb to a press and focuses it', () => {
    const { ui, low, high, xOf, yMid, values } = mount('ltr');

    ui.fireEvent.pointerDown(xOf(30), yMid());
    ui.fireEvent.pointerUp(xOf(30), yMid());
    expect(values()).toEqual([30, 80]);
    expect(low()).toHaveFocus();

    ui.fireEvent.pointerDown(xOf(70), yMid());
    ui.fireEvent.pointerUp(xOf(70), yMid());
    expect(values()).toEqual([30, 70]);
    expect(high()).toHaveFocus();
  });

  it('drags the thumb it took hold of, and stops it at the other', () => {
    const { ui, xOf, yMid, values } = mount('ltr');

    ui.fireEvent.pointerDown(xOf(20), yMid());
    ui.fireEvent.pointerMove(xOf(40), yMid());
    ui.frame();
    expect(values()).toEqual([40, 80]);
    // Dragged past the high thumb, the low one stops on it rather than
    // crossing, and the drag never hands over to the other thumb.
    ui.fireEvent.pointerMove(xOf(95), yMid());
    ui.frame();
    expect(values()).toEqual([80, 80]);
    ui.fireEvent.pointerUp(xOf(95), yMid());
  });

  it('drags a thumb pressed and held still before it moved', () => {
    vi.useFakeTimers();
    try {
      const { ui, xOf, yMid, values } = mount('ltr');
      ui.fireEvent.pointerDown(xOf(20), yMid());
      // Past the long-press delay the move is a Drag, not a Pan.
      vi.advanceTimersByTime(800);
      ui.fireEvent.pointerMove(xOf(40), yMid());
      ui.frame();
      expect(values()).toEqual([40, 80]);
      ui.fireEvent.pointerUp(xOf(40), yMid());
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the drag direction choose between two thumbs that sit together', () => {
    for (const [to, expected] of [
      [70, [50, 70]],
      [30, [30, 50]]
    ] as const) {
      const { ui, changes, xOf, yMid, values } = mount('ltr', { defaultValue: [50, 50] as Pair });
      ui.fireEvent.pointerDown(xOf(50), yMid());
      // The press alone moved neither.
      expect(changes).toEqual([]);
      ui.fireEvent.pointerMove(xOf(to), yMid());
      ui.frame();
      expect(values()).toEqual(expected);
      ui.fireEvent.pointerUp(xOf(to), yMid());
    }
  });

  it('frees two thumbs stuck at the top of the range by dragging down', () => {
    const { ui, high, xOf, yMid, values } = mount('ltr', { defaultValue: [100, 100] as Pair });
    ui.fireEvent.pointerDown(xOf(100) - 1, yMid());
    ui.fireEvent.pointerMove(xOf(60), yMid());
    ui.frame();
    expect(values()).toEqual([60, 100]);
    ui.fireEvent.pointerUp(xOf(60), yMid());
    expect(high()).not.toHaveFocus();
  });
});

describe('RangeSlider, right to left', () => {
  it('counts a press from the right, where the track starts', () => {
    const { ui, changes, strip, yMid } = mount('rtl');
    // A quarter of the way in from the left is three quarters of the way
    // along a track that starts at the right: nearer the high thumb.
    ui.fireEvent.pointerDown(strip().x + strip().width * 0.25, yMid());
    expect(changes).toEqual([[20, 75]]);
  });

  it('mirrors Left and Right, and leaves Up and Down alone', () => {
    const { ui, changes, low } = mount('rtl');
    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowLeft');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('ArrowUp');
    expect(changes.map(pair => pair[0])).toEqual([21, 20, 19, 20]);
  });

  it('reads the direction of a drag off two thumbs together in values, not pixels', () => {
    const { ui, xOf, yMid, values } = mount('rtl', { defaultValue: [50, 50] as Pair });
    ui.fireEvent.pointerDown(xOf(50), yMid());
    // Leftward, which is toward the top of a right to left track.
    ui.fireEvent.pointerMove(xOf(70), yMid());
    ui.frame();
    expect(values()).toEqual([50, 70]);
  });
});

describe('RangeSlider, controlled and uncontrolled', () => {
  it('owns its pair when given only a default', () => {
    const { ui, low, values } = mount('ltr', { onChange: undefined });
    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('End');
    expect(values()).toEqual([80, 80]);
  });

  it('starts at the whole range when given neither', () => {
    const { values } = mount('ltr', { defaultValue: undefined });
    expect(values()).toEqual([0, 100]);
  });

  it('draws only what the application writes back', () => {
    const price = new BehaviorSubject<Pair>([20, 80]);
    const asked: Pair[] = [];
    const { ui, high, values } = mount('ltr', {
      defaultValue: undefined,
      value: price,
      // The application refuses anything above 90.
      onChange: (next: Pair) => {
        asked.push(next);
        price.next([next[0], Math.min(90, next[1])]);
      }
    });

    ui.fireEvent.focus(high());
    ui.fireEvent.keyDown('End');
    expect(asked).toEqual([[20, 100]]);
    expect(values()).toEqual([20, 90]);

    price.next([10, 40]);
    expect(values()).toEqual([10, 40]);
  });

  it('does not move when the application never writes back', () => {
    const { ui, low, values } = mount('ltr', { defaultValue: undefined, value: [20, 80] as Pair, onChange: undefined });
    ui.fireEvent.focus(low());
    ui.fireEvent.keyDown('ArrowRight');
    ui.fireEvent.keyDown('End');
    expect(values()).toEqual([20, 80]);
  });

  it('throws when given both forms', () => {
    expect(() => mount('ltr', { value: [1, 2] as Pair })).toThrow(/RangeSlider/);
  });
});

describe('RangeSlider, disabled', () => {
  it('takes neither focus nor a value from a press or a key', () => {
    const { ui, changes, low, high, xOf, yMid } = mount('ltr', { disabled: true });

    ui.fireEvent.pointerDown(xOf(40), yMid());
    ui.fireEvent.pointerMove(xOf(60), yMid());
    ui.fireEvent.pointerUp(xOf(60), yMid());
    ui.frame();

    expect(changes).toEqual([]);
    expect(low()).not.toHaveFocus();
    expect(high()).not.toHaveFocus();
    expect(ui.getSemantics(low()).disabled).toBe(true);
    expect(ui.getSemantics(high()).disabled).toBe(true);
  });
});
