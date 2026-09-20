import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Settings } from './AccordionExample';

/** The render worker behind `<LiveExample id="accordion" />`. */
renderRoot(exampleRoot(createComponent(Settings, {})));
