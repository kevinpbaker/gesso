import { afterEach, describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent } from 'gesso-framework';
import { renderTest, type Rendered } from 'gesso-testing';
import 'gesso-testing/matchers';
import { Box, Text, type UiNode } from 'gesso-core';
import { PanelGroup, type PanelGroupPanel } from './PanelGroup';

const region = (name: string) => Box({ role: 'group', label: name, width: 10000, height: 10000 }, Text({ text: name }));

const PANELS: readonly PanelGroupPanel[] = [
  { key: 'explorer', label: 'Explorer', content: region('explorer'), defaultSize: 200, collapsible: true },
  { key: 'editor', content: region('editor'), minSize: 100 },
  { key: 'outline', label: 'Outline', content: region('outline'), defaultSize: 160, minSize: 100, maxSize: 300 }
];

let ui: Rendered;
afterEach(() => ui?.unmount());

function mount(props: Record<string, unknown> = {}, size = { width: 800, height: 400 }) {
  const changes: Array<Readonly<Record<string, number>>> = [];
  const folds: Array<readonly string[]> = [];
  /** The group's width, which a spec changes as a window would. */
  const width = new BehaviorSubject(size.width);
  ui = renderTest(
    createComponent(
      () =>
        Box(
          { width, height: size.height },
          createComponent(PanelGroup, {
            panels: PANELS,
            onSizesChange: (next: Readonly<Record<string, number>>) => changes.push(next),
            onCollapsedChange: (next: readonly string[]) => folds.push(next),
            ...props
          })
        ),
      {}
    ),
    { width: 1200, height: size.height }
  );
  ui.frame();
  return { changes, folds, width };
}

/** A panel's box, found by the region inside it, whose parent is the panel. */
function panel(name: string) {
  const inner = ui.getByRole('group', { name });
  return ui.getLayout(inner.parent!);
}
const divider = (name: string): UiNode => ui.getByRole('separator', { name: `Resize ${name}` });
const valueOf = (name: string): number | undefined => ui.getSemantics(divider(name)).valueNow;

async function key(name: string, modifiers: { shift?: boolean } = {}): Promise<void> {
  ui.fireEvent.press(name, modifiers);
  await ui.settle();
}

async function focusDivider(name: string): Promise<void> {
  ui.fireEvent.focus(divider(name));
  await ui.settle();
}

/** A drag of a divider by `by` pixels along the group, through real pointer events. */
async function dragDivider(name: string, by: number, horizontal = true): Promise<void> {
  const box = ui.getLayout(divider(name));
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  ui.fireEvent.pointerDown(x, y);
  for (let step = 1; step <= 10; step++) {
    const moved = (by * step) / 10;
    ui.fireEvent.pointerMove(horizontal ? x + moved : x, horizontal ? y : y + moved);
    ui.frame();
  }
  ui.fireEvent.pointerUp(horizontal ? x + by : x, horizontal ? y : y + by);
  await ui.settle();
}

describe('PanelGroup', () => {
  it('gives each sized panel its size and the one that fills the rest', () => {
    mount();
    expect(panel('explorer').width).toBe(200);
    expect(panel('outline').width).toBe(160);
    // 800, less two panels and two six-pixel dividers.
    expect(panel('editor').width).toBe(428);
  });

  it('names each divider after the panel it resizes, with that panel’s size as its value', () => {
    mount();
    expect(divider('Explorer')).toHaveSemantics({ role: 'separator', name: 'Resize Explorer' });
    expect(valueOf('Explorer')).toBe(200);
    expect(valueOf('Outline')).toBe(160);
    expect(ui.getSemantics(divider('Explorer')).states).toContain('expanded');
    expect(ui.getSemantics(divider('Outline')).valueMax).toBe(300);
  });

  it('keeps the sized panels’ sizes when the window changes, and gives the change to the one that fills', () => {
    const { width } = mount();
    width.next(1000);
    ui.frame();
    expect(panel('explorer').width).toBe(200);
    expect(panel('editor').width).toBe(628);
  });

  it('moves a divider with the arrows, ten pixels or fifty with Shift, toward the panel that fills', async () => {
    const { changes } = mount();
    await focusDivider('Explorer');
    await key('ArrowRight');
    expect(valueOf('Explorer')).toBe(210);
    await key('ArrowRight', { shift: true });
    expect(panel('explorer').width).toBe(260);
    // The outline is after its divider, so Left grows it.
    await focusDivider('Outline');
    await key('ArrowLeft');
    expect(valueOf('Outline')).toBe(170);
    expect(changes.at(-1)).toEqual({ explorer: 260, outline: 170 });
  });

  it('stops at a panel’s limits: End to its most, Home to its least', async () => {
    mount();
    await focusDivider('Outline');
    await key('End');
    expect(valueOf('Outline')).toBe(300);
    await key('Home');
    expect(valueOf('Outline')).toBe(100);
    await key('ArrowRight');
    expect(valueOf('Outline')).toBe(100);
  });

  it('collapses a collapsible panel with Home or Enter, and Enter brings it back as it was', async () => {
    const { folds } = mount();
    await focusDivider('Explorer');
    await key('Enter');
    expect(folds.at(-1)).toEqual(['explorer']);
    // Hidden, so out of the semantics tree; the editor has its room.
    expect(() => ui.getByRole('group', { name: 'explorer' })).toThrow();
    expect(panel('editor').width).toBe(628);
    expect(ui.getSemantics(divider('Explorer')).states).toContain('collapsed');
    expect(valueOf('Explorer')).toBe(0);
    await key('Enter');
    expect(panel('explorer').width).toBe(200);
    await key('Home');
    expect(folds.at(-1)).toEqual(['explorer']);
    // An arrow toward the fill opens it at its least size.
    await key('ArrowRight');
    expect(panel('explorer').width).toBe(80);
  });

  it('follows a dragged divider', async () => {
    mount();
    await dragDivider('Explorer', 60);
    expect(panel('explorer').width).toBe(260);
    await dragDivider('Outline', -40);
    expect(panel('outline').width).toBe(200);
  });

  it('collapses a panel dragged past half its least size, and opens it dragged back', async () => {
    const { folds } = mount();
    await dragDivider('Explorer', -170);
    expect(folds.at(-1)).toEqual(['explorer']);
    expect(panel('editor').width).toBe(628);
    // Folded by a drag, it keeps the size it had when the drag began.
    expect(valueOf('Explorer')).toBe(0);
    await focusDivider('Explorer');
    await key('Enter');
    expect(panel('explorer').width).toBe(200);
    await dragDivider('Explorer', -170);
    await dragDivider('Explorer', 150);
    expect(folds.at(-1)).toEqual([]);
    expect(panel('explorer').width).toBeGreaterThanOrEqual(80);
  });

  it('never squeezes the panel that fills below its least size', async () => {
    mount();
    await dragDivider('Explorer', 600);
    // 800 less the outline, two dividers and the editor's least 100.
    expect(panel('explorer').width).toBe(528);
    expect(panel('editor').width).toBe(100);
  });

  it('puts a panel back to its first size on a double click', async () => {
    mount();
    await focusDivider('Explorer');
    await key('ArrowRight', { shift: true });
    ui.fireEvent.doubleClick(divider('Explorer'));
    await ui.settle();
    expect(panel('explorer').width).toBe(200);
  });

  it('trades between two sized panels side by side', async () => {
    mount({
      panels: [
        { key: 'a', label: 'A', content: region('a'), defaultSize: 150 },
        { key: 'b', label: 'B', content: region('b'), defaultSize: 150 },
        { key: 'c', content: region('c') }
      ]
    });
    await focusDivider('A');
    await key('ArrowRight');
    expect(panel('a').width).toBe(160);
    expect(panel('b').width).toBe(140);
    expect(panel('c').width).toBe(800 - 300 - 12);
  });

  it('is controlled: a size the owner does not write back does not move', async () => {
    const sizes = new BehaviorSubject<Readonly<Record<string, number>>>({ explorer: 220 });
    const { changes } = mount({ sizes });
    expect(panel('explorer').width).toBe(220);
    await focusDivider('Explorer');
    await key('ArrowRight');
    expect(changes).toEqual([{ explorer: 230 }]);
    expect(panel('explorer').width).toBe(220);
    sizes.next({ explorer: 230 });
    await ui.settle();
    expect(panel('explorer').width).toBe(230);
  });

  it('starts collapsed from `defaultCollapsed`, and stacks panels in a column', async () => {
    mount(
      {
        direction: 'column',
        defaultCollapsed: ['terminal'],
        panels: [
          { key: 'editor', content: region('editor') },
          { key: 'terminal', label: 'Terminal', content: region('terminal'), defaultSize: 120, collapsible: true }
        ]
      },
      { width: 600, height: 500 }
    );
    expect(panel('editor').height).toBe(500 - 6);
    await focusDivider('Terminal');
    await key('Enter');
    expect(panel('terminal').height).toBe(120);
    expect(panel('editor').height).toBe(500 - 120 - 6);
    // Up grows a panel below its divider.
    await key('ArrowUp');
    expect(panel('terminal').height).toBe(130);
  });
});
