import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Preferences } from './SemanticsExample';

/** The render worker behind `<LiveExample id="semantics" />`. */
renderRoot(exampleRoot(createComponent(Preferences, {})));
