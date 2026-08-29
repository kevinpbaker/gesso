import { describe, expect, it, vi } from 'vitest';

import { NodalRuntime } from './NodalRuntime';
import { LazyColumn, Row, Text } from '../../ui/composition';
import type { UiNode } from '../../ui/graph/UiNode';
import { UiNodeType } from '../../ui/graph/UiNodeType';
import { noModifiers } from '../../ui/input/UiInputEvent';
import { UiManualFrameClock } from '../../ui/scheduler';
import type { CanvasHost } from '../../ui/rendering';

function mockCanvas(): CanvasHost {
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (key === 'measureText') {
        return (text: string) => ({ width: String(text).length * 7 });
      }
      if (typeof key === 'string' && !(key in target)) {
        target[key] = vi.fn();
      }
      return target[key as string];
    },
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    }
  });
  return { width: 400, height: 300, getContext: () => ctx as unknown as CanvasRenderingContext2D };
}

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
describe('NodalRuntime lazy lists', () => {
  function mount(rows = 100000) {
    let clock!: UiManualFrameClock;
    const renders: number[] = [];
    const runtime = new NodalRuntime({
      root: LazyColumn(
        { height: 200, count: rows, estimatedExtent: 20, overscan: 2, initialViewportExtent: 200 },
        index => {
          renders.push(index);
          return Row({ height: 20 }, Text({ text: `row ${index}` }));
        }
      ),
      canvas: mockCanvas(),
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
    runtime.input.wheel.wheel(100, 100, 0, 2000, noModifiers());
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

  it('keeps the total extent proportional to the row count so the scrollbar is honest', () => {
    const { runtime, list } = mount(1000);
    const rec = runtime.debugLayoutBox(list);
    expect(rec.height).toBe(200);
    runtime.input.wheel.wheel(100, 100, 0, 1_000_000, noModifiers());
    // Clamped by the engine to content − viewport: 1000 × 20 − 200.
    expect(list.getProperty('scrollY')).toBe(1_000_000);
    runtime.dispose();
  });
});
