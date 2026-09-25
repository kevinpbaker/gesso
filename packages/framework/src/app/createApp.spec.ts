import { describe, expect, it } from 'vitest';

import { createApp } from './createApp';
import { createComponent } from '../createComponent';
import type { ComponentContext, Inputs } from '../Component';

/**
 * The two ways `createApp` is called wrongly, and what it says.
 *
 * Both messages matter more than they look. `createApp` used to take
 * either a component or the worker options, and the overload that took
 * a component is the reason every shell carried the layout engine —
 * one function meant one module graph, and a bundler cannot see which
 * half of it a call reaches. Splitting it into `createSyncApp` took
 * 157 kB off the main thread of every worker application
 * (`check-bundle-size.ts` holds the line), and the cost of the split
 * is that an old call now fails. It has to fail *by name*: the fix is
 * one identifier, and a message that does not say which one turns a
 * rename into an afternoon.
 */
function Probe(_inputs: Inputs<Record<string, never>>, _ctx: ComponentContext) {
  return null;
}

describe('createApp', () => {
  it('names createSyncApp when it is handed a component', () => {
    expect(() => createApp(Probe as never)).toThrowError(/createSyncApp\(Root\)/);
  });

  it('names createSyncApp when it is handed a built element', () => {
    expect(() => createApp(createComponent(Probe) as never)).toThrowError(/createSyncApp\(Root\)/);
  });

  it('names both ways to supply a render worker when there is none', () => {
    expect(() => createApp()).toThrowError(/gesso-vite-plugin/);
    expect(() => createApp({})).toThrowError(/renderWorker/);
  });
});
