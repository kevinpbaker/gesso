import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Events } from './LazyListExample';

/** The render worker behind `<LiveExample id="lazylist" />`. */
renderRoot(exampleRoot(createComponent(Events, {})));
