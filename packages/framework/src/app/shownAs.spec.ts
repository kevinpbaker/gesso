import { describe, expect, it } from 'vitest';

import { Box, Column, focusRing, interactive, provided, ShownAsKey, UiVisualState, type UiShownAs } from 'gesso-core';

import { mountRuntime } from './RuntimeTestUtils';

/**
 * A toggle's track as a design tool draws its pointer states beside its
 * others: under `ShownAsKey`, hovered, pressed or focused with no
 * pointer or keyboard near it.
 */
describe('drawing an element as hovered, pressed or focused', () => {
  const PRESS = interactive({ hover: true, press: true, hovered: { opacity: 0.9 }, pressed: { opacity: 0.75 } });
  function track(shown: UiShownAs | null) {
    const mounted = mountRuntime(
      Column(
        { provide: shown === null ? undefined : [provided(ShownAsKey, shown)] },
        Box({ width: 40, height: 24, modifiers: [PRESS, focusRing()] })
      )
    );
    mounted.frame();
    return { node: mounted.runtime.debugRoot().firstChild! };
  }

  it('shows the hover and press looks, pressed being hovered too', () => {
    const hovered = track('hovered').node;
    expect(hovered.properties.get('opacity')).toBe(0.9);
    expect([...(hovered.properties.get('visualState') as Set<UiVisualState>)]).toEqual([UiVisualState.Hovered]);

    const pressed = track('pressed').node;
    expect(pressed.properties.get('opacity')).toBe(0.75);
    expect(pressed.properties.get('visualState')).toEqual(new Set([UiVisualState.Hovered, UiVisualState.Pressed]));
  });

  it('draws the focus ring, and nothing outside one', () => {
    expect(track('focused').node.decorations?.length).toBe(1);
    const plain = track(null).node;
    expect(plain.decorations).toBeNull();
    expect(plain.properties.get('opacity')).toBeUndefined();
  });
});
