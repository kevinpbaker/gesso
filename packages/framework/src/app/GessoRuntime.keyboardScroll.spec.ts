import { describe, expect, it } from 'vitest';

import {
  Box,
  Button,
  Column,
  ScrollView,
  noKeyModifiers,
  scrollPosition,
  type ScrollOffset,
  type UiKeyModifiers,
  type UiNode
} from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * Scrolling from the keyboard.
 *
 * A browser moves any scrolling box with the arrows, Page Up and Down,
 * Space and Home and End. A canvas gets none of that for free, and
 * before this a keyboard-only reader could not get past the first
 * screen of a pane unless the pane was a component with keys of its
 * own.
 */
function drain(mounted: MountedRuntime, limit = 400): void {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
}

/** A 100-tall pane over 600 of content, reporting where it settles. */
function pane(children: Parameters<typeof Column>[1][] = []) {
  const seen: ScrollOffset[] = [];
  const mounted = mountRuntime(
    ScrollView(
      { width: 200, height: 100, modifiers: [scrollPosition({ onChange: at => seen.push(at) })] },
      Column({ width: 200 }, ...children, Box({ width: 200, height: 600 }))
    )
  );
  drain(mounted);
  const press = (key: string, modifiers: Partial<UiKeyModifiers> = {}): void => {
    mounted.runtime.input.keyboard.keyDown(key, { ...noKeyModifiers(), ...modifiers });
    drain(mounted);
  };
  return { mounted, press, y: () => seen.at(-1)?.y ?? 0 };
}

describe('keyboard scrolling', () => {
  it('moves the pane a step, a page less a strip, and to either end', () => {
    const { press, y } = pane();

    press('ArrowDown');
    expect(y()).toBe(40);
    press('PageDown');
    expect(y()).toBe(127.5);
    press(' ', { shift: true });
    expect(y()).toBe(40);
    press('End');
    expect(y()).toBe(500);
    press('Home');
    expect(y()).toBe(0);
  });

  it('leaves a key with Ctrl, Alt or Meta to whatever shortcut it is', () => {
    const { press, y } = pane();
    press('ArrowDown', { meta: true });
    press('PageDown', { ctrl: true });
    expect(y()).toBe(0);
  });

  it('scrolls the pane around the focused control, and Space still presses a focused button', () => {
    let pressed = 0;
    let button: UiNode | null = null;
    const { mounted, press, y } = pane([
      Button({ label: 'Go', onClick: () => pressed++, ref: (node: UiNode | null) => (button = node) })
    ]);
    mounted.runtime.input.focus.focus(button!);

    press('PageDown');
    expect(y()).toBe(87.5);

    press(' ');
    expect(pressed).toBe(1);
    expect(y()).toBe(87.5);
  });

  it('hands the key on to the pane outside once the inner one is at its end', () => {
    const outer: ScrollOffset[] = [];
    const inner: ScrollOffset[] = [];
    let button: UiNode | null = null;
    const mounted = mountRuntime(
      ScrollView(
        { width: 200, height: 100, modifiers: [scrollPosition({ onChange: at => outer.push(at) })] },
        Column(
          { width: 200 },
          ScrollView(
            { width: 200, height: 50, modifiers: [scrollPosition({ onChange: at => inner.push(at) })] },
            Column(
              { width: 200 },
              Button({ label: 'Go', ref: (node: UiNode | null) => (button = node) }),
              Box({ width: 200, height: 60 })
            )
          ),
          Box({ width: 200, height: 600 })
        )
      )
    );
    drain(mounted);
    mounted.runtime.input.focus.focus(button!);

    mounted.runtime.input.keyboard.keyDown('End', noKeyModifiers());
    drain(mounted);
    expect(inner.at(-1)?.y).toBeGreaterThan(0);
    expect(outer.at(-1)?.y ?? 0).toBe(0);

    mounted.runtime.input.keyboard.keyDown('End', noKeyModifiers());
    drain(mounted);
    expect(outer.at(-1)?.y).toBeGreaterThan(0);
  });
});
