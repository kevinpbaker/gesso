import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Checkout } from './SelectExample';

/** The render worker behind `<LiveExample id="select" />`. */
renderRoot(exampleRoot(createComponent(Checkout, {})));
