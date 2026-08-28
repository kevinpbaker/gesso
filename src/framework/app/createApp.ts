import type { Component } from '../Component';
import type { FrameworkChild } from '../ComponentElement';
import { NodalAppBuilder } from './NodalAppBuilder';

/**
 * Creates a Nodal application builder.
 *
 * Example:
 *
 *   createApp(AppRoot)
 *     .useStore(AppStore)
 *     .mount(document.getElementById('app')!);
 */
export function createApp(root: FrameworkChild | (new () => Component)): NodalAppBuilder {
  return new NodalAppBuilder(root);
}
