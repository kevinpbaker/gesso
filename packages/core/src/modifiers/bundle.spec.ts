import { describe, expect, it } from 'vitest';

import { bundle, noModifiers } from './bundle';
import { focusRing } from './decoration';
import { BUTTON_INTERACTION, hoverable } from './interaction';

describe('bundle', () => {
  it('names a set of modifiers as one list', () => {
    const ring = focusRing();
    const set = bundle(BUTTON_INTERACTION, ring);
    expect(set).toEqual([BUTTON_INTERACTION, ring]);
  });

  it('flattens a bundle inside a bundle, keeping the order', () => {
    const inner = bundle(focusRing({ width: 2 }), focusRing({ width: 4 }));
    const outer = bundle(BUTTON_INTERACTION, inner);
    expect(outer.length).toBe(3);
    expect(outer[0]).toBe(BUTTON_INTERACTION);
    expect(outer[1]).toBe(inner[0]);
    expect(outer[2]).toBe(inner[1]);
  });

  it('is frozen, so a caller cannot change what every element carrying it does', () => {
    const set = bundle(hoverable());
    expect(Object.isFrozen(set)).toBe(true);
  });

  it('keeps its identity, which is what a render is compared on', () => {
    const set = bundle(BUTTON_INTERACTION);
    const render = (): readonly unknown[] => set;
    expect(render()).toBe(render());
  });

  it('has an empty value for the branch that adds nothing', () => {
    expect(noModifiers.length).toBe(0);
    expect(bundle(noModifiers, BUTTON_INTERACTION)).toEqual([BUTTON_INTERACTION]);
  });
});
