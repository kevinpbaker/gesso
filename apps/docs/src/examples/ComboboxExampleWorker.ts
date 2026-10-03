import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { AssignIssue } from './ComboboxExample';

/** The render worker behind `<LiveExample id="combobox" />`. */
renderRoot(exampleRoot(createComponent(AssignIssue, {})));
