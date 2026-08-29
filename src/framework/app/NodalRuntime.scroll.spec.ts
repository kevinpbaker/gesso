import { describe, expect, it } from 'vitest';

import { NodalRuntime } from './NodalRuntime';
import { mockCanvas } from './RuntimeTestUtils';
import { Button, Column } from '../../ui/composition/UiComponents';
import type { UiNode } from '../../ui/graph/UiNode';
import { noModifiers } from '../../ui/input/UiInputEvent';
import { UiManualFrameClock } from '../../ui/scheduler';

/**
 * Keyboard navigation keeps the focused control visible: focusing a
 * row below a scroll container's viewport scrolls it into view.
 */
describe('NodalRuntime scrollIntoView', () => {
  function mount() {
    let clock!: UiManualFrameClock;
    const rows = Array.from({ length: 10 }, (_, i) => Button({ height: 20, text: `row ${i}`, flexShrink: 0 }));
    const runtime = new NodalRuntime({
      root: Column({ height: 50, overflow: 'scroll' }, ...rows),
      canvas: mockCanvas(300, 200),
      width: 300,
      height: 200,
      clock: callback => (clock = new UiManualFrameClock(callback))
    });
    runtime.start();
    const frame = () => {
      if (clock.isPending) {
        clock.tick(0);
      }
    };
    frame();
    return { runtime, frame, list: runtime.debugRoot() };
  }

  function rowNode(list: UiNode, index: number): UiNode {
    let child = list.firstChild!;
    for (let i = 0; i < index; i++) {
      child = child.nextSibling!;
    }
    return child;
  }

  it('scrolls the list when Tab reaches a row below the viewport', () => {
    const { runtime, frame, list } = mount();
    runtime.input.focus.focus(rowNode(list, 0));
    frame();
    expect(runtime.debugLayoutBox(list)).toMatchObject({ height: 50 });

    // Tab to row 3 (60..80): the 50-tall viewport must scroll.
    runtime.input.keyboard.keyDown('Tab', noModifiers());
    runtime.input.keyboard.keyDown('Tab', noModifiers());
    runtime.input.keyboard.keyDown('Tab', noModifiers());
    frame();
    expect(runtime.input.focus.focusedNode).toBe(rowNode(list, 3));
    expect(list.getProperty('scrollY')).toBe(38);
    // The focused row is visible: its bottom, padded by 8, meets the viewport bottom.
    runtime.dispose();
  });

  it('is a no-op for a node already in view', () => {
    const { runtime, frame, list } = mount();
    runtime.scrollIntoView(rowNode(list, 1));
    frame();
    expect(list.getProperty('scrollY')).toBeUndefined();
    runtime.dispose();
  });
});
