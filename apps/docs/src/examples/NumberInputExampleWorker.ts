import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Numbers } from './NumberInputExample';

/** The render worker behind `<LiveExample id="numberinput" />`. */
renderRoot(exampleRoot(createComponent(Numbers, {})));
