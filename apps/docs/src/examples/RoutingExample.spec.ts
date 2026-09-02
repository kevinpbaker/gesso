import { describe, expect, it } from 'vitest';

import { createComponent, createShellHistory, RouterService } from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { EXAMPLE_ROUTES, RoutingExample } from './RoutingExample';

function mount(): Rendered {
  const ui = renderTest(createComponent(RoutingExample, {}), { width: 640, height: 360, routes: EXAMPLE_ROUTES });

  // The shell's half of routing, which the test plays itself: there is
  // no window here, so the history the Back button walks is a memory
  // one. It is the same history the documentation site hands the
  // running example, and the example writes neither.
  const router = ui.runtime.services.get(RouterService);
  const history = createShellHistory({ mode: 'memory' });
  router.setHistory(history);
  history.onChange(url => router.applyUrl(url));

  return ui;
}

/** The url the router settled on, which is what the example draws. */
function url(ui: Rendered): string {
  return ui.runtime.services.get(RouterService).url.value;
}

function press(ui: Rendered, name: string): void {
  ui.fireEvent.click(ui.getByRole('button', { name }));
  ui.frame();
}

/**
 * The page claims three things about a route change, so the spec
 * measures three: the tree below the outlet is replaced, a layout
 * above the leaf is not, and a navigation that changes only params
 * rebuilds nothing at all.
 */
describe('the docs routing example', () => {
  it('replaces the tree below the outlet, and moves the url with it', () => {
    const ui = mount();
    expect(url(ui)).toBe('/');
    expect(ui.getByText(/Press Notes/)).toBeDefined();

    press(ui, 'Notes');

    expect(url(ui)).toBe('/notes/wrapping');
    // The home screen is gone rather than hidden, and both screens of
    // the matched chain are standing: the rail and the note.
    expect(ui.queryByText(/Press Notes/)).toBeNull();
    expect(ui.getByRole('button', { name: 'Summaries' })).toBeDefined();
    expect(ui.getByText(/re-wraps when its box changes width/)).toBeDefined();
  });

  it('keeps the layout and the leaf mounted when only a param changes', () => {
    const ui = mount();
    press(ui, 'Notes');
    press(ui, 'Summaries');
    press(ui, 'Reading width');
    expect(ui.getByText('Summaries on')).toBeDefined();
    expect(ui.getByText('Wide')).toBeDefined();

    press(ui, 'Baselines');

    // The leaf followed the param: same instance, new note.
    expect(url(ui)).toBe('/notes/baselines');
    expect(ui.getByText(/puts a large number and a small label/)).toBeDefined();
    // Neither screen was rebuilt, so neither lost what it was holding.
    // The chain of routes is the same objects, so the outlet emitted
    // nothing for this navigation.
    expect(ui.queryByText('Summaries on')).not.toBeNull();
    expect(ui.queryByText('Wide')).not.toBeNull();
  });

  it('rebuilds the layout when the route chain changes and comes back', () => {
    const ui = mount();
    press(ui, 'Notes');
    press(ui, 'Summaries');
    expect(ui.getByText('Summaries on')).toBeDefined();

    press(ui, 'Home');
    expect(url(ui)).toBe('/');
    expect(ui.queryByRole('button', { name: 'Summaries' })).toBeNull();

    press(ui, 'Notes');

    // A fresh mount, so the toggle is back at its default: leaving a
    // route releases its screens, and returning builds new ones.
    expect(ui.getByText('Summaries off')).toBeDefined();
  });

  it('walks back through the history the shell holds', () => {
    const ui = mount();
    press(ui, 'Notes');
    press(ui, 'Baselines');
    press(ui, 'Home');
    expect(url(ui)).toBe('/');

    press(ui, 'Back');

    // Back is the shell's half of routing: it reports a url, and the
    // router resolves it like any other.
    expect(url(ui)).toBe('/notes/baselines');
    expect(ui.getByText(/puts a large number and a small label/)).toBeDefined();
  });

  it('shows the home screen for an address it does not describe', () => {
    const ui = mount();
    const router = ui.runtime.services.get(RouterService);

    router.applyUrl('/nowhere');
    ui.frame();

    // `notFound` decides what is shown, not what the address becomes:
    // the url stands, so a reload lands in the same place.
    expect(url(ui)).toBe('/nowhere');
    expect(ui.getByText(/Press Notes/)).toBeDefined();
  });
});
