import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { SortBar } from './KeyboardExample';

/** The render worker behind `<LiveExample id="keyboard" />`. */
renderRoot(exampleRoot(createComponent(SortBar, {})));
