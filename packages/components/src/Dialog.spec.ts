import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, Column, percent, ScrollView } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { Dialog } from './Dialog';

describe('Dialog on a narrow screen', () => {
  it('fits a dialog wider than the screen inside it, with a margin each side', () => {
    // `width` was the dialog's width whatever the screen: a 520 px
    // dialog on a 375 px phone ran off both sides, title and all.
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 375, height: 700 },
        createComponent(Dialog, { open, title: 'Keyboard shortcuts', width: 520, content: Box({ height: 10 }) })
      ),
      { width: 375, height: 700 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    expect(dialog.x).toBe(16);
    expect(dialog.width).toBe(375 - 2 * 16);

    // Where there's room, it's the width it asked for, centred.
    ui.runtime.resize(1000, 700);
    ui.frame();
    const wide = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    expect(wide.width).toBe(520);
    expect(wide.x).toBe((1000 - 520) / 2);
  });
});

describe('Dialog on a short screen', () => {
  /** Two blocks that keep their height, 600 pixels of body in all. */
  const tall = () =>
    Column(
      { width: percent(100) },
      Box({ height: 300, flexShrink: 0, label: 'First' }),
      Box({ height: 300, flexShrink: 0, label: 'Last' })
    );

  it('fits a dialog taller than the screen inside it, scrolling the body under the title', () => {
    // A dialog's height was its content's whatever the screen: centred,
    // the New issue form on a 500 px window ran off the top and the
    // bottom, title and buttons with it.
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { width: 375, height: 500 },
        createComponent(Dialog, { open, title: 'New issue', width: 600, content: tall() })
      ),
      { width: 375, height: 500 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'New issue' }));
    expect(dialog.y).toBe(16);
    expect(dialog.height).toBe(500 - 2 * 16);

    // The title stays put while the body scrolls under it.
    const title = () => ui.getVisibleBox(ui.getByText('New issue'));
    const last = () => ui.getVisibleBox(ui.getByLabel('Last'));
    const before = title();
    expect(before.y).toBeGreaterThanOrEqual(dialog.y);
    expect(last().y + last().height).toBeGreaterThan(dialog.y + dialog.height);
    // Once it has faded in: a dialog at opacity 0 takes no input.
    ui.frame(1000);
    ui.fireEvent.wheel({ x: 187, y: 300, deltaY: 1000 });
    ui.frame();
    expect(title()).toEqual(before);
    // Scrolled to the end, the last block's bottom is inside the dialog's padding.
    expect(last().y + last().height).toBe(dialog.y + dialog.height - 20);

    // The body clips, so it keeps 4 pixels of its own round the content:
    // room for the focus ring drawn outside a field at its edge. The
    // content still starts 20 pixels in from the dialog's side.
    const content = ui.getLayout(ui.getByLabel('First').parent!);
    const body = ui.getLayout(ui.getByLabel('First').parent!.parent!);
    expect(content.x - body.x).toBe(4);
    expect(content.x - dialog.x).toBe(20);

    // Where there's room, it's its content's height, centred.
    ui.runtime.resize(375, 1000);
    ui.frame();
    const roomy = ui.getLayout(ui.getByRole('dialog', { name: 'New issue' }));
    expect(roomy.height).toBeLessThan(1000 - 2 * 16);
    expect(roomy.y).toBeCloseTo((1000 - roomy.height) / 2, 5);
  });

  it('gives content that can shrink the room there is, instead of scrolling it', () => {
    // A list with a height of its own, which may shrink: it gets what's
    // left under the title and the field above it, and scrolls itself,
    // so the field stays in view.
    const open = new BehaviorSubject(false);
    const content = Column(
      { width: percent(100), gap: 12, minHeight: 0 },
      Box({ height: 40, label: 'Filter' }),
      ScrollView({ height: 420, minHeight: 0, label: 'List' }, Column(Box({ height: 1000 })))
    );
    const ui = renderTest(
      Box(
        { width: 375, height: 400 },
        createComponent(Dialog, { open, title: 'Keyboard shortcuts', width: 520, content })
      ),
      { width: 375, height: 400 }
    );
    open.next(true);
    ui.frame();
    const dialog = ui.getLayout(ui.getByRole('dialog', { name: 'Keyboard shortcuts' }));
    const list = ui.getLayout(ui.getByLabel('List'));
    expect(dialog.height).toBe(400 - 2 * 16);
    expect(list.y + list.height).toBe(dialog.y + dialog.height - 20);
    expect(list.height).toBeLessThan(420);

    // With room for all of it, the list is the height it asked for.
    ui.runtime.resize(375, 800);
    ui.frame();
    expect(ui.getLayout(ui.getByLabel('List')).height).toBe(420);
  });
});
