import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, Text, type UiChild, autoFocus } from '@gesso/core';
import { mountRuntime } from './RuntimeTestUtils';
import { FocusService } from './FocusService';

/**
 * `MODIFIERS_ROADMAP.md` B4's `autoFocus()`. It runs against a real
 * runtime because both halves of it are the runtime's: a modifier
 * cannot be laid out or focused by the builder alone.
 */
function focusedLabel(runtime: { services: { get(service: typeof FocusService): FocusService } }): string | undefined {
  const node = runtime.services.get(FocusService).focused.value;
  return node?.properties.get('label') as string | undefined;
}

describe('autoFocus', () => {
  it('takes focus on the first frame', () => {
    const mounted = mountRuntime(
      Column({}, Button({ label: 'First' }), Button({ label: 'Second', modifiers: [autoFocus()] }))
    );
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('Second');
  });

  it('does not take focus back after the person moves it', () => {
    const mounted = mountRuntime(
      Column({}, Button({ label: 'First' }), Button({ label: 'Second', modifiers: [autoFocus()] }))
    );
    mounted.frame();
    const focus = mounted.runtime.services.get(FocusService);
    const first = mounted.runtime.debugRoot().firstChild!;
    focus.focus(first);

    // A later frame lays the node out again; an autofocus that fired
    // on every layout would be a focus trap rather than an autofocus.
    mounted.frame();
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('First');
  });

  it('focuses a node that mounts into a tree that is already running', () => {
    const show = new BehaviorSubject<UiChild[]>([]);
    const mounted = mountRuntime(Column({}, Button({ label: 'First' }), Box({}, show)));
    mounted.frame();
    expect(focusedLabel(mounted.runtime)).toBeUndefined();

    show.next([Button({ label: 'Later', modifiers: [autoFocus()] })]);
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('Later');
  });

  it('leaves a node that cannot take focus alone', () => {
    const mounted = mountRuntime(
      Column({}, Button({ label: 'First' }), Text({ text: 'a label', modifiers: [autoFocus()] }))
    );
    mounted.frame();

    expect(mounted.runtime.services.get(FocusService).focused.value).toBeNull();
  });

  it('respects a focus scope: a node outside the trap is refused', () => {
    const mounted = mountRuntime(
      Column({}, Button({ label: 'Inside' }), Button({ label: 'Outside', modifiers: [autoFocus()] }))
    );
    const focus = mounted.runtime.services.get(FocusService);
    const inside = mounted.runtime.debugRoot().firstChild!;
    focus.trap(inside);
    mounted.frame();

    expect(focusedLabel(mounted.runtime)).toBe('Inside');
  });
});
