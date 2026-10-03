import type { UiContrast } from 'gesso-core';

import { observeMediaQuery } from './mediaQuery';

/**
 * Watches the platform's contrast preference.
 *
 * `high` when the person has asked for more contrast
 * (`prefers-contrast: more`, macOS's Increase contrast and its
 * counterparts) or forced colours are on (Windows' contrast themes). A
 * canvas gets no forced colours from the browser, which only repaints
 * the DOM, so the application has to hear about it and draw its own:
 * `withContrast(theme, contrast)` is the theme that does.
 *
 * Shell-side, reported once at once and again on change, for the reason
 * `observeColorScheme` gives.
 */
export function observeContrast(onChange: (contrast: UiContrast) => void): () => void {
  let more = false;
  let forced = false;
  let last: UiContrast | null = null;
  // Both queries are read before the first report, so a person whose
  // contrast comes from the second hears 'high' once, not 'standard' first.
  let ready = false;
  const report = (): void => {
    if (!ready) return;
    const contrast: UiContrast = more || forced ? 'high' : 'standard';
    if (contrast !== last) {
      last = contrast;
      onChange(contrast);
    }
  };
  const stopMore = observeMediaQuery('(prefers-contrast: more)', matches => {
    more = matches;
    report();
  });
  const stopForced = observeMediaQuery('(forced-colors: active)', matches => {
    forced = matches;
    report();
  });
  ready = true;
  report();
  return () => {
    stopMore();
    stopForced();
  };
}
