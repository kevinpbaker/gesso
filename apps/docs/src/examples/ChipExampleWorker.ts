import { createComponent, renderRoot } from 'gesso-framework';
import { Filters } from './ChipExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="chip" />`. */
renderRoot(exampleRoot(createComponent(Filters, {})));
