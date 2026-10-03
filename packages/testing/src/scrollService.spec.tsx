import { afterEach, describe, expect, it } from 'vitest';

import type { UiNode } from 'gesso-core';
import { createComponent, ScrollService, type ComponentContext } from 'gesso-framework';

import { renderTest, type Rendered } from './renderTest';

/**
 * A highlight that moves without focus, followed by its list: the
 * runtime scrolls the containers above a node when a component asks.
 */

let ui: Rendered;
let scroll: ScrollService;
afterEach(() => ui?.unmount());

function List(_inputs: object, ctx: ComponentContext) {
  scroll = ctx.inject(ScrollService);
  return (
    <scrollview label="list" width={200} height={100}>
      <column>
        {Array.from({ length: 40 }, (_, i) => (
          <text key={String(i)} text={`Row ${i}`} label={`row${i}`} height={20} />
        ))}
      </column>
    </scrollview>
  );
}

describe('ScrollService', () => {
  it('scrolls a node into view without focusing it, and leaves a visible one alone', async () => {
    ui = renderTest(createComponent(List, {}), { width: 300, height: 200 });
    await ui.settle();
    const list: UiNode = ui.getByLabel('list');
    scroll.scrollIntoView(ui.getByLabel('row2'));
    await ui.settle();
    expect(list.properties.get('scrollY') ?? 0).toBe(0);

    scroll.scrollIntoView(ui.getByLabel('row30'));
    await ui.settle();
    // Row 30 ends at 620; the viewport is 100 tall, with 8 to spare.
    expect(list.properties.get('scrollY')).toBe(620 - 100 + 8);
    expect(ui.runtime.input.focus.focusedNode).toBeNull();
  });
});
