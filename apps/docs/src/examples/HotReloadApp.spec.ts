import { map } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Column, Text, type UiChild } from '@gesso/core';
import {
  createComponent,
  internalState,
  ServiceRegistry,
  type ComponentContext,
  type InternalState
} from '@gesso/framework';
import { renderTest, type Rendered } from '@gesso/testing';
import '@gesso/testing/matchers';

import { CounterApp, CounterFeed } from './HotReloadApp';

const SIZE = { width: 360, height: 220 };

/** The example mounted the way its entry mounts it: the root, and its service. */
function mount(): Rendered {
  const services = new ServiceRegistry();
  services.register(CounterFeed);
  return renderTest(createComponent(CounterApp, {}), { ...SIZE, services });
}

/**
 * What a bundler hands the entry after an edit to the module: the same
 * source evaluated again, so the class and the root are new objects
 * carrying the same names.
 *
 * The class body is empty on purpose. Adoption re-keys the registry to
 * the new class object and keeps the instance the old one built, so
 * this class is never constructed. That is the page's "state survives,
 * behaviour does not", written as a type.
 */
const ReplacedFeed = class CounterFeed {
  readonly samples!: InternalState<number>;
};

/** The replaced module's root: a new function object, injecting the new class. */
function ReplacedApp(_props: Record<string, never>, ctx: ComponentContext): UiChild {
  const feed = ctx.inject(ReplacedFeed);
  const clicks = internalState(0);
  return Column(
    { gap: 8, padding: 16 },
    Text({ text: feed.samples.pipe(map(value => `Samples taken: ${value}`)) }),
    Text({ text: clicks.pipe(map(value => `Clicks: ${value}`)) })
  );
}

/**
 * The page's claims about this module, which is a root and a service
 * in one file so that a replacement moves both.
 *
 * Fake timers throughout, because the service takes a sample a second
 * and a real interval would leave the suite waiting on a clock it does
 * not own. The counter it drives is the thing a reload has to keep, so
 * time has to pass before there is anything to keep.
 */
describe('the docs hot reload example', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('draws the service’s samples beside the component’s own clicks', () => {
    const ui = mount();

    expect(ui.getByText('Samples taken: 0')).toBeDefined();
    expect(ui.getByText('Clicks: 0')).toBeDefined();

    ui.fireEvent.click(ui.getByRole('button', { name: 'Add one' }));
    vi.advanceTimersByTime(3000);
    ui.frame();

    // One counter belongs to the component and one to the service,
    // which is what makes the difference between them visible when the
    // module is replaced.
    expect(ui.getByText('Clicks: 1')).toBeDefined();
    expect(ui.getByText('Samples taken: 3')).toBeDefined();
  });

  it('keeps both counters when the reload hands back the same objects', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Add one' }));
    vi.advanceTimersByTime(2000);
    ui.frame();

    ui.runtime.reload(createComponent(CounterApp, {}), [CounterFeed]);
    ui.frame();

    // The same class object in the same slot, so the host is reused
    // and nothing was remounted. This is the "editing one module
    // leaves the rest of the screen alone" row of the page's table.
    expect(ui.getByText('Clicks: 1')).toBeDefined();
    expect(ui.getByText('Samples taken: 2')).toBeDefined();
  });

  it('loses the replaced component’s state and keeps the service’s', () => {
    const ui = mount();
    ui.fireEvent.click(ui.getByRole('button', { name: 'Add one' }));
    vi.advanceTimersByTime(4000);
    ui.frame();
    expect(ui.getByText('Clicks: 1')).toBeDefined();

    ui.runtime.reload(createComponent(ReplacedApp, {}), [ReplacedFeed]);
    ui.frame();

    // The component came from the replaced module, so it was disposed
    // and mounted again and its `internalState` went with it. The
    // service was handed over, so the registry adopted the new class
    // and kept the instance, samples and all.
    expect(ui.getByText('Clicks: 0')).toBeDefined();
    expect(ui.getByText('Samples taken: 4')).toBeDefined();
  });

  it('says which service to hand over when the reload forgot one', () => {
    const ui = mount();

    // The error the page quotes, and the reason it reads like a
    // contradiction: the name it cannot find is in the list it prints,
    // because the class object under it is the old one.
    expect(() => ui.runtime.reload(createComponent(ReplacedApp, {}))).toThrow(
      /Service 'CounterFeed' is not registered\..*Pass the replacement to reload\(\)/s
    );
  });
});
