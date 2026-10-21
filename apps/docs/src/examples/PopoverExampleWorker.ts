import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Filters } from './PopoverExample';

/** The render worker behind `<LiveExample id="popover" />`. */
renderRoot(exampleRoot(createComponent(Filters, {})));
