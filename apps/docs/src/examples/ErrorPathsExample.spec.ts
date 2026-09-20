import { afterEach, describe, expect, it, vi } from 'vitest';

import { createComponent } from 'gesso-framework';
import { renderTest } from 'gesso-testing';
import 'gesso-testing/matchers';

import { BreakOnClick, BreakTheBinding } from './ErrorPathsExample';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * What the page asserts about a throwing application, asserted here so
 * the page cannot claim a route the runtime has stopped taking.
 *
 * There is no live canvas on that page and this is the reason it does
 * not need one: the error paths are checkable without a browser, and
 * an example that threw on a documentation page would take the page's
 * own embed down with it.
 */
describe('what an application error reaches', () => {
  // #region listener-spec
  it('reports a throwing listener and lets the event carry on', () => {
    const reported: { message: string; stack?: string }[] = [];
    const ui = renderTest(createComponent(BreakOnClick, {}), {
      width: 420,
      height: 260,
      onCreate: runtime => runtime.onListenerError((message, stack) => reported.push({ message, stack }))
    });

    ui.fireEvent.click(ui.getByRole('button'));
    ui.frame();

    // One report, naming the event type and the node it was on.
    expect(reported).toHaveLength(1);
    expect(reported[0]?.message).toContain('The click handler threw.');
    expect(reported[0]?.message).toContain('listener: click');
    expect(reported[0]?.stack).toBeDefined();

    // And the click still bubbled to the container above it, which is
    // why the dispatcher catches instead of letting the throw out.
    expect(ui.getByText('1 clicks reached the container')).toBeDefined();
  });
  // #endregion listener-spec

  // #region binding-spec
  it('sends a failed binding to the console, and leaves the last value on screen', () => {
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = renderTest(createComponent(BreakTheBinding, {}), { width: 420, height: 220 });

    // Not `onError`, and not the overlay: the graph logs it and
    // unbinds. This is the gap the page tells a reader about.
    expect(console_).toHaveBeenCalledTimes(1);
    expect(String(console_.mock.calls[0]?.[0])).toContain('UI binding');

    // The property keeps whatever arrived before the failure, so the
    // screen looks finished.
    expect(ui.getByText('Ready')).toBeDefined();
  });
  // #endregion binding-spec
});
