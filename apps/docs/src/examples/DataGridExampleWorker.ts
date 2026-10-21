import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Budget } from './DataGridExample';

/** The render worker behind `<LiveExample id="datagrid" />`. */
renderRoot(exampleRoot(createComponent(Budget, {})));
