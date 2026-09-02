import { createComponent, renderRoot } from '@gesso/framework';
import { Waiting } from './SpinnerExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="spinner" />`. */
renderRoot(exampleRoot(createComponent(Waiting, {})));
