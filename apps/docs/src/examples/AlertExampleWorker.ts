import { createComponent, renderRoot } from 'gesso-framework';
import { Billing } from './AlertExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="alert" />`. */
renderRoot(exampleRoot(createComponent(Billing, {})));
