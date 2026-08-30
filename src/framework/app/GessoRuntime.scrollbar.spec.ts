import { describe, expect, it } from 'vitest';

import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { Box, Column } from '../../ui/composition/UiComponents';
import { noKeyModifiers } from '../../ui/input/UiInputEvent';
import { scrollbarThumb, SCROLLBAR_THICKNESS } from '../../ui/layout/Scrollbars';
import { UiManualFrameClock } from '../../ui/scheduler';

/**
 * Scrollbars are grabbable: dragging the thumb scrolls the content in
 * proportion, pressing the track pages, hovering the edge reveals the
 * bar, and none of it reaches the content beneath.
 */
describe('GessoRuntime scrollbars', () => {
  function mount() {
    let clock!: UiManualFrameClock;
    const pressed: number[] = [];
    const rows = Array.from({ length: 50 }, (_, i) =>
      Box({ height: 20, flexShrink: 0, onPointerDown: () => pressed.push(i) })
    );
    const runtime = new GessoRuntime({
      // 200 wide, 100 tall, 1000 of content: maxScroll 900.
      root: Column({ width: 200, height: 100, overflow: 'scroll' }, ...rows),
      canvas: mockCanvas(300, 300),
      width: 300,
      height: 300,
      clock: callback => (clock = new UiManualFrameClock(callback))
    });
    runtime.start();
    const frame = () => {
      if (clock.isPending) {
        clock.tick(0);
      }
    };
    frame();
    const list = runtime.debugRoot();
    return { runtime, frame, list, pressed, record: () => runtime['engine'].recordFor(list)! };
  }

  it('drags the thumb and scrolls in proportion to the track', () => {
    const { runtime, frame, list, pressed, record } = mount();
    const bar = scrollbarThumb(record(), 'y')!;
    const x = bar.thumb.x + SCROLLBAR_THICKNESS / 2;
    const y = bar.thumb.y + bar.thumb.height / 2;
    runtime.input.pointer.pointerDown(x, y, 1, noKeyModifiers());
    expect(runtime.input.pointer.draggingScrollbarOf).toBe(list);
    expect(pressed).toEqual([]);

    // Moving the thumb half its travel scrolls half the range.
    runtime.input.pointer.pointerMove(x, y + bar.travel / 2, 1, noKeyModifiers());
    frame();
    expect(list.getProperty('scrollY')).toBeCloseTo(450, 5);

    runtime.input.pointer.pointerUp(x, y + bar.travel, 0, noKeyModifiers());
    frame();
    expect(list.getProperty('scrollY')).toBeCloseTo(900, 5);
    expect(runtime.input.pointer.draggingScrollbarOf).toBeNull();
    expect(pressed).toEqual([]);
    runtime.dispose();
  });

  it('pages one viewport when the visible track is pressed beside the thumb', () => {
    const { runtime, frame, list, record } = mount();
    // Reveal the bar (a wheel would too), then press below the thumb.
    runtime.input.wheel.wheel(50, 50, 0, 20, noKeyModifiers());
    frame();
    const bar = scrollbarThumb(record(), 'y')!;
    runtime.input.pointer.pointerDown(bar.thumb.x + 2, bar.thumb.y + bar.thumb.height + 20, 1, noKeyModifiers());
    runtime.input.pointer.pointerUp(bar.thumb.x + 2, bar.thumb.y + bar.thumb.height + 20, 0, noKeyModifiers());
    frame();
    // 20 from the wheel plus one viewport of 100.
    expect(list.getProperty('scrollY')).toBeCloseTo(120, 5);
    runtime.dispose();
  });

  it('lets a press through to content when the bar is hidden and the point is off the thumb', () => {
    const { runtime, pressed, record } = mount();
    const rec = record();
    // Bottom of the bar band, far below the (top) thumb, bar not shown.
    runtime.input.pointer.pointerDown(rec.x + rec.width - 3, rec.y + rec.height - 5, 1, noKeyModifiers());
    expect(pressed).toEqual([4]);
    runtime.dispose();
  });

  it('reveals the bar when the pointer nears the edge', () => {
    const { runtime, record } = mount();
    expect(record().scrollbarVisibleUntil).toBe(0);
    runtime.input.pointer.pointerMove(record().x + record().width - 4, 50, 0, noKeyModifiers());
    expect(record().scrollbarVisibleUntil).toBeGreaterThan(0);
    runtime.dispose();
  });
});
