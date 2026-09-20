import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Connectivity } from './SwitchExample';

/** The render worker behind `<LiveExample id="switch" />`. */
renderRoot(exampleRoot(createComponent(Connectivity, {})));
