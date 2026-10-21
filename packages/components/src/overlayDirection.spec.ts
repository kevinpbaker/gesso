import { describe, expect, it } from 'vitest';
import { BehaviorSubject } from 'rxjs';

import { createComponent, type ComponentContext } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import { Box, Column, percent, Row, Text, type UiNode } from 'gesso-core';
import { useOverlay, type OverlayHandle } from './overlay';

/**
 * The overlay layer's reading edges, through the handle every overlay
 * component opens its entry with: `start` and `end` resolved in the
 * direction of the tree the entry takes its environment from.
 */
function mount(direction: BehaviorSubject<'ltr' | 'rtl'>) {
  let handle!: OverlayHandle;
  let anchor: UiNode | null = null;
  let placeholder: UiNode | null = null;
  function Host(_inputs: unknown, ctx: ComponentContext) {
    handle = useOverlay(ctx, 'direction');
    return Row(
      { padding: 20, x: 'center', width: percent(100) },
      Box({ width: 120, height: 30, label: 'Anchor', ref: (node: UiNode | null) => (anchor = node) }),
      Row({ ref: (node: UiNode | null) => (placeholder = node), width: 0, height: 0 })
    );
  }
  const ui = renderTest(
    Column({ textDirection: direction, width: percent(100), height: percent(100) }, createComponent(Host, {})),
    { width: 400, height: 300 }
  );
  ui.frame();
  const content = () => Box({ role: 'listbox', label: 'Panel', width: 60, height: 20 }, Text({ text: 'x' }));
  return {
    ...ui,
    handle: () => handle,
    anchor: () => anchor!,
    placeholder: () => placeholder!,
    content,
    panel: () => ui.getLayout(ui.getByRole('listbox'))
  };
}

describe('an overlay entry in right-to-left text', () => {
  it('pins `start` to the right edge of the viewport and `end` to the left', () => {
    const ui = mount(new BehaviorSubject<'ltr' | 'rtl'>('rtl'));
    ui.handle().show(ui.content(), { bottom: 10, start: 16, environment: ui.placeholder() });
    ui.frame();
    expect(ui.panel().x + ui.panel().width).toBe(400 - 16);

    ui.handle().show(ui.content(), { bottom: 10, end: 16, environment: ui.placeholder() });
    ui.frame();
    expect(ui.panel().x).toBe(16);
  });

  it('lines `bottom-start` up with the anchor’s right edge', () => {
    const ui = mount(new BehaviorSubject<'ltr' | 'rtl'>('rtl'));
    ui.handle().show(ui.content(), { anchor: ui.anchor(), placement: 'bottom-start' });
    ui.frame();
    const anchor = ui.getLayout(ui.anchor());
    expect(ui.panel().x + ui.panel().width).toBeCloseTo(anchor.x + anchor.width, 5);
  });

  it('places itself again when the direction changes while it is open', () => {
    const direction = new BehaviorSubject<'ltr' | 'rtl'>('ltr');
    const ui = mount(direction);
    ui.handle().show(ui.content(), { anchor: ui.anchor(), placement: 'end' });
    ui.frame();
    let anchor = ui.getLayout(ui.anchor());
    expect(ui.panel().x).toBeCloseTo(anchor.x + anchor.width, 5);

    direction.next('rtl');
    ui.frame();
    anchor = ui.getLayout(ui.anchor());
    expect(ui.panel().x + ui.panel().width).toBeCloseTo(anchor.x, 5);
  });
});
