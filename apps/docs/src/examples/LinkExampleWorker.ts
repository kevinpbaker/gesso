import { createComponent, renderRoot } from 'gesso-framework';
import { Documentation } from './LinkExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="link" />`. */
renderRoot(exampleRoot(createComponent(Documentation, {})));
