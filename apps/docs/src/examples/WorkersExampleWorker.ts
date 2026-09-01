import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { ShellNeeds } from './WorkersExample';

/**
 * The render worker behind `<LiveExample id="workers" />`.
 *
 * Three lines, and they are the whole of what a worker entry is: name
 * the root, and hand it to `renderRoot`. The page around it is the
 * shell.
 */
renderRoot(exampleRoot(createComponent(ShellNeeds, {})));
