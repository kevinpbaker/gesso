import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { Box, Button, Column, ScrollView, Text, type UiChild, type UiNode, autoFocus } from 'gesso-core';
import { mountRuntime } from './RuntimeTestUtils';
import { FocusService } from './FocusService';

/**
 * the `autoFocus()`. It runs against a real
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

  describe('and the scroll position', () => {
    /**
     * A page whose content region takes focus when it opens: a scroll
     * view 200 px tall, the region 1000 px tall and 32 px into it, as
     * an issue page's column is under its padding.
     */
    function page(options?: { preventScroll?: boolean }) {
      const mounted = mountRuntime(
        Column(
          {},
          Button({ label: 'Elsewhere' }),
          ScrollView(
            { label: 'page', width: 400, height: 200 },
            Column(
              { padding: 32 },
              Box({ label: 'region', height: 1000, focusable: true, modifiers: [autoFocus(options)] })
            )
          )
        )
      );
      const scroller = mounted.runtime.debugRoot().lastChild as UiNode;
      const scrollY = (): number => mounted.runtime.explain(scroller).scroll!.scrollY;
      return { mounted, scrollY, region: scroller.firstChild!.firstChild! };
    }

    it('reveals the node it focuses, as focus from code does', () => {
      const { mounted, scrollY } = page();
      mounted.frame();

      expect(focusedLabel(mounted.runtime)).toBe('region');
      // A tall node is revealed from its top, 8 px in.
      expect(scrollY()).toBe(24);
    });

    it('leaves the page at its top with preventScroll', () => {
      const { mounted, scrollY } = page({ preventScroll: true });
      mounted.frame();
      mounted.frame();

      expect(focusedLabel(mounted.runtime)).toBe('region');
      expect(scrollY()).toBe(0);
    });

    it('does not reveal it later when a key makes the focus visible', () => {
      const { mounted, scrollY } = page({ preventScroll: true });
      mounted.frame();
      // A press puts the person on the pointer; the next key brings the
      // keyboard back and shows the focus, where it is.
      mounted.runtime.input.focus.noteInput('pointer');
      mounted.runtime.input.keyboard.keyDown('a');
      mounted.frame();

      expect(mounted.runtime.services.get(FocusService).focusVisible.value).toBe(true);
      expect(scrollY()).toBe(0);
    });

    it('is the same for FocusService.focus: revealed by default, left in place with preventScroll', () => {
      const { mounted, scrollY, region } = page({ preventScroll: true });
      mounted.frame();
      const focus = mounted.runtime.services.get(FocusService);
      const elsewhere = mounted.runtime.debugRoot().firstChild!;

      focus.focus(elsewhere);
      focus.focus(region, { preventScroll: true });
      mounted.frame();
      expect(focusedLabel(mounted.runtime)).toBe('region');
      expect(scrollY()).toBe(0);

      focus.focus(elsewhere);
      focus.focus(region);
      mounted.frame();
      expect(scrollY()).toBe(24);
    });
  });
});
