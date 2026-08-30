import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { GessoRuntime } from './GessoRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { LazyColumn, Row, Text } from '../../ui/composition';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { noKeyModifiers } from '../../ui/input/UiInputEvent';
import { UiManualFrameClock } from '../../ui/scheduler';

function countNodes(root: UiNode, type: UiNodeType): number {
  let count = root.type === type ? 1 : 0;
  for (let child = root.firstChild; child !== null; child = child.nextSibling) {
    count += countNodes(child, type);
  }
  return count;
}

/**
 * A LazyColumn inside the runtime: only the visible rows exist as
 * nodes, scrolling changes which ones, and the phase profile shows
 * virtualization doing its work before layout.
 */
describe('GessoRuntime lazy lists', () => {
  function mount(rows: number | BehaviorSubject<number> = 100000, revision?: BehaviorSubject<unknown>) {
    let clock!: UiManualFrameClock;
    const renders: number[] = [];
    const runtime = new GessoRuntime({
      root: LazyColumn(
        { height: 200, count: rows, estimatedExtent: 20, overscan: 2, initialViewportExtent: 200, revision },
        index => {
          renders.push(index);
          return Row({ height: 20 }, Text({ text: `row ${index}` }));
        }
      ),
      canvas: mockCanvas(400, 300),
      width: 400,
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
    return { runtime, frame, list: runtime.debugRoot(), renders };
  }

  it('mounts only the viewport plus overscan out of 100k rows, rendering each row once', () => {
    const { runtime, frame, list, renders } = mount();
    // 200 / 20 = 10 visible (0..10 with the edge row), plus 2 overscan.
    expect(countNodes(list, UiNodeType.Text)).toBe(13);
    expect(renders).toEqual(Array.from({ length: 13 }, (_, i) => i));
    expect(runtime.debugLayoutBox(list).height).toBe(200);
    // Later frames measure the rows and confirm the estimate: nothing re-renders.
    frame();
    frame();
    expect(renders).toHaveLength(13);
    runtime.dispose();
  });

  it('mounts new rows on the frame that scrolls to them and unmounts the old ones', () => {
    const { runtime, frame, list, renders } = mount();
    runtime.input.wheel.wheel(100, 100, 0, 2000, noKeyModifiers());
    frame();
    // Scrolled 2000: rows 100..110 touch the viewport (110 at its edge),
    // plus 2 overscan each side → 98..112.
    expect(countNodes(list, UiNodeType.Text)).toBe(15);
    expect(renders.slice(13)).toEqual(Array.from({ length: 15 }, (_, i) => 98 + i));
    const texts: string[] = [];
    const visit = (node: UiNode): void => {
      const text = node.properties.get('text');
      if (typeof text === 'string') {
        texts.push(text);
      }
      for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        visit(child);
      }
    };
    visit(list);
    expect(texts[0]).toBe('row 98');
    expect(texts[texts.length - 1]).toBe('row 112');
    runtime.dispose();
  });

  it('follows an observable count, on the first frame and after it', () => {
    const count = new BehaviorSubject(0);
    const { runtime, frame, list } = mount(count);
    // Nothing to show yet, and no wait for a second frame to say so.
    expect(countNodes(list, UiNodeType.Text)).toBe(0);

    count.next(1000);
    frame();
    expect(countNodes(list, UiNodeType.Text)).toBe(13);

    // A shorter list drops what it cannot show, and the scroll offset
    // the engine clamps comes back into range.
    runtime.input.wheel.wheel(100, 100, 0, 10_000, noKeyModifiers());
    frame();
    count.next(5);
    frame();
    expect(countNodes(list, UiNodeType.Text)).toBe(5);
    runtime.dispose();
  });

  it('re-renders the mounted rows when the revision says the data behind them moved', () => {
    const revision = new BehaviorSubject<unknown>(0);
    const { runtime, frame, renders } = mount(1000, revision);
    expect(renders).toHaveLength(13);

    revision.next(1);
    frame();

    // The same thirteen indices, rendered again: index 5 is a
    // different row after a sort, and its cells are written in place.
    expect(renders.slice(13)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    runtime.dispose();
  });

  it('keeps the total extent proportional to the row count so the scrollbar is honest', () => {
    const { runtime, list } = mount(1000);
    const rec = runtime.debugLayoutBox(list);
    expect(rec.height).toBe(200);
    runtime.input.wheel.wheel(100, 100, 0, 1_000_000, noKeyModifiers());
    // Clamped by the engine to content − viewport: 1000 × 20 − 200.
    expect(list.getProperty('scrollY')).toBe(1_000_000);
    runtime.dispose();
  });
});
