import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { FindablePage } from './FindExample';

/** The render worker behind `<LiveExample id="find" />`. */
renderRoot(exampleRoot(createComponent(FindablePage, {})));
