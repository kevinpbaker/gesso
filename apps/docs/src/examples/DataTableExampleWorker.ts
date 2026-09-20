import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Runs } from './DataTableExample';

/** The render worker behind `<LiveExample id="datatable" />`. */
renderRoot(exampleRoot(createComponent(Runs, {})));
