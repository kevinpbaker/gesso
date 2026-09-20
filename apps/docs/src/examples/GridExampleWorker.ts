import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { GridTable } from './GridExample';

/** The render worker behind `<LiveExample id="grid" />`. */
renderRoot(exampleRoot(createComponent(GridTable, {})));
