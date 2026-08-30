import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import {
  Box,
  Button,
  Column,
  Text,
  type UiChild,
  UiEnvironmentKeys,
  darkTheme,
  lightTheme,
  type UiTheme,
  type UiNode,
  defineModifier
} from '@gesso/core';
import { mountRuntime } from './RuntimeTestUtils';
import { FocusService } from './FocusService';

/**
 * The rest of `MODIFIERS_ROADMAP.md` B2: what a modifier may read out
 * of the environment and out of the focus manager. The layout half
 * landed with C5; these two waited for a consumer, and B3 is it.
 *
 * Both are driven through a real runtime, because both are supplied
 * by it: the builder holds only the interfaces, so a spec that stubbed
 * them would assert its own stubs.
 */

interface Seen {
  themes: (UiTheme | undefined)[];
  focus: boolean[];
  host: { focus(): void } | null;
}

function observer(seen: Seen) {
  return defineModifier<null>({
    name: 'observer',
    attach(host) {
      seen.host = host;
      const read = (): void => {
        seen.themes.push(host.environment(UiEnvironmentKeys.theme));
      };
      read();
      host.onEnvironment(read);
      seen.focus.push(host.isFocused());
      host.onFocusChange(focused => seen.focus.push(focused));
    }
  });
}

function fresh(): Seen {
  return { themes: [], focus: [], host: null };
}

describe("a modifier's environment access", () => {
  it('reads the value its node inherits, not the default', () => {
    const seen = fresh();
    const watch = observer(seen);
    mountRuntime(Column({ theme: darkTheme }, Box({ modifiers: [watch(null)] })));

    expect(seen.themes).toEqual([darkTheme]);
  });

  it('re-fires when a provider above it swaps the value', () => {
    const seen = fresh();
    const watch = observer(seen);
    const theme = new BehaviorSubject<UiTheme>(lightTheme);
    const mounted = mountRuntime(Column({ theme }, Box({ modifiers: [watch(null)] })));
    mounted.frame();
    expect(seen.themes).toEqual([lightTheme]);

    theme.next(darkTheme);
    mounted.frame();

    expect(seen.themes).toEqual([lightTheme, darkTheme]);
  });

  it('re-fires for a node mounted into a tree that already provides one', () => {
    // The bug `decisions/0026` fixed in its general form: a node built
    // after the first frame inherits at attach, and a modifier that
    // read a value out of the environment has to hear about it.
    const seen = fresh();
    const watch = observer(seen);
    const children = new BehaviorSubject<UiChild>(Text({ text: 'empty' }));
    const mounted = mountRuntime(Column({ theme: darkTheme }, children));
    mounted.frame();
    expect(seen.themes).toEqual([]);

    children.next(Box({ modifiers: [watch(null)] }));
    mounted.frame();

    expect(seen.themes).toEqual([darkTheme]);
  });
});

describe("a modifier's focus access", () => {
  it('reports its own node gaining and losing focus, and nobody else moving', () => {
    const seen = fresh();
    const watch = observer(seen);
    let target: UiNode | null = null;
    let other: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        {},
        Button({ ref: (node: UiNode | null) => (target = node), modifiers: [watch(null)] }, Text({ text: 'Watched' })),
        Button({ ref: (node: UiNode | null) => (other = node) }, Text({ text: 'Other' }))
      )
    );
    mounted.frame();
    const store = mounted.runtime.services.get(FocusService);
    expect(seen.focus).toEqual([false]);

    store.focus(target!);
    expect(seen.focus).toEqual([false, true]);

    // Focus moving between two nodes that are not this one says
    // nothing: a focus change touches exactly the two nodes it moved
    // between, which is what keeps a ring on every control cheap.
    store.focus(other!);
    expect(seen.focus).toEqual([false, true, false]);
    store.blur();
    expect(seen.focus).toEqual([false, true, false]);
  });

  it('can take focus for its node', () => {
    const seen = fresh();
    const watch = observer(seen);
    let target: UiNode | null = null;
    const mounted = mountRuntime(
      Column(
        {},
        Button({ ref: (node: UiNode | null) => (target = node), modifiers: [watch(null)] }, Text({ text: 'Save' }))
      )
    );
    mounted.frame();

    seen.host!.focus();

    expect(mounted.runtime.input.focus.focusedNode).toBe(target);
  });
});
