import { createComponent, renderRoot } from 'gesso-framework';
import { NameField } from './EditingExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="editing" />`. */
renderRoot(exampleRoot(createComponent(NameField, {})));
