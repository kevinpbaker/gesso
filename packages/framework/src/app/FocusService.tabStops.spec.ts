import { describe, expect, it } from 'vitest';

import { Button, Column, type UiNode } from 'gesso-core';

import { FocusService } from './FocusService';
import { mountRuntime } from './RuntimeTestUtils';

/** A screen's keyboard order, as a design tool numbers it. */
describe('FocusService.tabStops', () => {
  it('lists the stops under a node in the order Tab visits them, leaving out what is hidden or disabled', () => {
    const mounted = mountRuntime(
      Column(
        {},
        Button({ text: 'Outside' }),
        Column(
          { label: 'screen' },
          Button({ text: 'Email' }),
          Button({ text: 'Hidden', visible: false }),
          Button({ text: 'Off', disabled: true }),
          Button({ text: 'Send' })
        )
      )
    );
    mounted.frame();
    const focus = mounted.runtime.services.get(FocusService);
    const screen = mounted.runtime.debugRoot().firstChild!.nextSibling!;
    const words = (nodes: UiNode[]) => nodes.map(node => node.properties.get('text'));

    expect(words(focus.tabStops(screen))).toEqual(['Email', 'Send']);
    expect(words(focus.tabStops())).toEqual(['Outside', 'Email', 'Send']);
  });
});
