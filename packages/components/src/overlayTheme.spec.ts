import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { Box, darkTheme, lightTheme, UiEnvironmentKeys, type UiTheme } from 'gesso-core';
import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';

import { Dialog } from './Dialog';

describe('an open overlay', () => {
  it('follows the theme where it was declared when that theme changes', () => {
    // The theme was read once, as the overlay opened, so a dialog open
    // while the page went dark (the system's setting changed, or the
    // theme the person chose arrived a moment after the dialog opened)
    // stayed light over a dark page until it was closed.
    const theme = new BehaviorSubject<UiTheme>(darkTheme);
    const open = new BehaviorSubject(false);
    const ui = renderTest(
      Box(
        { theme, width: 400, height: 300 },
        createComponent(Dialog, { open, title: 'Settings', content: Box({ width: 10, height: 10 }) })
      ),
      { width: 400, height: 300 }
    );
    open.next(true);
    ui.frame();
    const dialog = () => ui.getByRole('dialog', { name: 'Settings' });
    expect(dialog().environment?.get(UiEnvironmentKeys.theme)).toBe(darkTheme);

    theme.next(lightTheme);
    ui.frame();
    expect(dialog().environment?.get(UiEnvironmentKeys.theme)).toBe(lightTheme);
  });
});
