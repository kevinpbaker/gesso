import { describe, expect, it } from 'vitest';

import { Box, Button, claimKeys, Column, noKeyModifiers, ScrollView, type UiNode } from 'gesso-core';
import { mountRuntime, type MountedRuntime } from './RuntimeTestUtils';

/**
 * The keys that scroll a page, claimed ahead of the key.
 *
 * In a worker the shell cannot wait to hear whether Down was used, and
 * the browser scrolls the page around the canvas as its default: with a
 * menu open in an embedded application, Down moved the highlight and
 * the page under it. The runtime says which of those keys it will use
 * at its focus, and the shell cancels those and no others.
 */
function drain(mounted: MountedRuntime, limit = 400): void {
  let frames = 0;
  while (mounted.clock.isPending && frames < limit) {
    frames++;
    mounted.frame();
  }
}

function listen(mounted: MountedRuntime): (readonly string[])[] {
  const sent: (readonly string[])[] = [];
  mounted.runtime.onClaimedKeys(keys => sent.push(keys));
  return sent;
}

describe('claimed keys', () => {
  it('claims the keys that would move a pane, and only the way it has room to move', () => {
    const mounted = mountRuntime(ScrollView({ width: 200, height: 100 }, Box({ width: 200, height: 600 })));
    drain(mounted);
    const sent = listen(mounted);

    // At the top: down, a page down, the end and Space move it; up and
    // Home have nowhere to go, so they are the page's.
    expect(sent.at(-1)).toEqual(['ArrowDown', 'PageDown', 'End', ' ']);

    mounted.runtime.input.keyboard.keyDown('End', noKeyModifiers());
    drain(mounted);
    // At the bottom, the other way round; Space still moves it, back up
    // with Shift.
    expect(sent.at(-1)).toEqual(['ArrowUp', 'PageUp', 'Home', ' ']);
    mounted.runtime.dispose();
  });

  it('claims nothing for a focused button in an application with nothing to scroll', () => {
    let button: UiNode | null = null;
    const mounted = mountRuntime(
      Column({ width: 200, height: 100 }, Button({ width: 80, height: 30, ref: (n: UiNode | null) => (button = n) }))
    );
    drain(mounted);
    const sent = listen(mounted);
    mounted.runtime.input.focus.focus(button!);
    drain(mounted);

    expect(sent).toEqual([[]]);
    expect(mounted.runtime.claimedKeys()).toEqual([]);
    mounted.runtime.dispose();
  });

  it('claims every scrolling key under a list, and the keys a handler is marked with', () => {
    let list: UiNode | null = null;
    let stepper: UiNode | null = null;
    let rule: UiNode | null = null;
    let divider: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 200 },
        Box(
          { role: 'listbox', width: 200, height: 40 },
          Box({ focusable: true, width: 40, height: 20, ref: (n: UiNode | null) => (list = n) })
        ),
        Box({
          focusable: true,
          width: 40,
          height: 20,
          onKeyDown: claimKeys(() => {}, ['ArrowLeft', 'ArrowRight', 'Enter']),
          ref: (n: UiNode | null) => (stepper = n)
        }),
        Box({ role: 'separator', width: 200, height: 1, ref: (n: UiNode | null) => (rule = n) }),
        Box({ role: 'separator', focusable: true, width: 4, height: 40, ref: (n: UiNode | null) => (divider = n) })
      )
    );
    drain(mounted);
    const claimedAt = (node: UiNode): string[] => {
      mounted.runtime.input.focus.focus(node);
      drain(mounted);
      return mounted.runtime.claimedKeys();
    };

    // A key bubbles, so a list's keys are its focused child's too.
    expect(claimedAt(list!)).toEqual([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'PageUp',
      'PageDown',
      'Home',
      'End',
      ' '
    ]);
    // Enter scrolls nothing, so it is not a claim the shell needs.
    expect(claimedAt(stepper!)).toEqual(['ArrowLeft', 'ArrowRight']);
    // A divider that takes focus moves with the arrows; a rule does not.
    expect(claimedAt(divider!)).toEqual(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);
    expect(rule!.properties.get('focusable')).not.toBe(true);
    mounted.runtime.dispose();
  });

  it('sends the set only when it changes', () => {
    let a: UiNode | null = null;
    let b: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        { width: 200, height: 100 },
        Button({ width: 80, height: 30, ref: (n: UiNode | null) => (a = n) }),
        Button({ width: 80, height: 30, ref: (n: UiNode | null) => (b = n) })
      )
    );
    drain(mounted);
    const sent = listen(mounted);
    mounted.runtime.input.focus.focus(a!);
    drain(mounted);
    mounted.runtime.input.focus.focus(b!);
    drain(mounted);

    expect(sent).toEqual([[]]);
    mounted.runtime.dispose();
  });
});
