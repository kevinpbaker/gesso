import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Shipping } from './RadioGroupExample';

/** The render worker behind `<LiveExample id="radiogroup" />`. */
renderRoot(exampleRoot(createComponent(Shipping, {})));
