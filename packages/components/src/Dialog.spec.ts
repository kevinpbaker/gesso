import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box } from 'gesso-core';
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
