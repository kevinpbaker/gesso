import { describe, expect, it } from 'vitest';

import {
  Column,
  EditableText,
  ScrollView,
  Text,
  editorFor,
  scrollPosition,
  type ScrollOffset,
  type UiNode
} from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';

/**
 * Dragging a selection past the bottom of a scrolling pane and holding
 * the pointer there. A browser scrolls the page and the selection
 * grows with it; before this the canvas did neither, so text that ran
 * past the pane could not be selected in one drag.
 */
describe('selection auto-scroll', () => {
  it('scrolls the pane while the pointer is held past its edge, and the selection follows', () => {
    const seen: ScrollOffset[] = [];
    const lines = Array.from({ length: 40 }, (_, i) => Text({ text: `line ${i}`, height: 20 }));
    const mounted = mountRuntime(
      ScrollView(
        { width: 200, height: 100, modifiers: [scrollPosition({ onChange: at => seen.push(at) })] },
        Column({ width: 200 }, ...lines)
      ),
      { width: 300, height: 300 }
    );
    mounted.frame();
    const { pointer, selection } = mounted.runtime.input;

    pointer.pointerDown(5, 5, 1);
    pointer.pointerMove(5, 140, 1);
    const before = selection.selectedText().split('\n').length;

    // The pointer stays put: only frames happen.
    let time = 0;
    for (let i = 0; i < 20; i++) {
      time += 16;
      mounted.frame(time);
    }

    expect(seen.at(-1)?.y ?? 0).toBeGreaterThan(0);
    expect(selection.selectedText().split('\n').length).toBeGreaterThan(before);

    pointer.pointerUp(5, 140, 0);
    const settled = seen.at(-1)?.y;
    for (let i = 0; i < 5; i++) {
      time += 16;
      mounted.frame(time);
    }
    expect(seen.at(-1)?.y).toBe(settled);
  });

  it('does the same for a drag inside a text field taller than the pane it sits in', () => {
    const seen: ScrollOffset[] = [];
    let field: UiNode | null = null;
    const text = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
    const mounted = mountRuntime(
      ScrollView(
        { width: 200, height: 100, modifiers: [scrollPosition({ onChange: at => seen.push(at) })] },
        Column(
          { width: 200 },
          EditableText({
            value: text,
            multiline: true,
            focusable: true,
            width: 200,
            ref: (n: UiNode | null) => (field = n)
          })
        )
      ),
      { width: 300, height: 300 }
    );
    mounted.frame();
    const { pointer } = mounted.runtime.input;

    pointer.pointerDown(5, 5, 1);
    pointer.pointerMove(5, 140, 1);
    const before = editorFor(field!).end;
    let time = 0;
    for (let i = 0; i < 20; i++) {
      time += 16;
      mounted.frame(time);
    }

    expect(seen.at(-1)?.y ?? 0).toBeGreaterThan(0);
    expect(editorFor(field!).end).toBeGreaterThan(before);
    pointer.pointerUp(5, 140, 0);
  });
});
