import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Notes } from './DialogExample';

/** The render worker behind `<LiveExample id="dialog" />`. */
renderRoot(exampleRoot(createComponent(Notes, {})));
