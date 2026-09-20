import { createComponent, renderRoot } from 'gesso-framework';
import { Counter } from './CounterExample';
import { exampleRoot } from './ExampleRoot';

/**
 * The render worker behind `<LiveExample id="counter" />`.
 *
 * A root component cannot cross `postMessage`, so every live example on
 * the docs site needs one of these: a module whose whole job is to name
 * the component that runs in the worker. The theme's glob registry
 * finds it by the `*Worker.ts` suffix, which is why the file exists at
 * all rather than the page naming a component directly.
 *
 * `exampleRoot` is what makes the example legible in both appearances
 * without the example itself knowing about either.
 */
renderRoot(exampleRoot(createComponent(Counter, { label: 'Clicks' })));
