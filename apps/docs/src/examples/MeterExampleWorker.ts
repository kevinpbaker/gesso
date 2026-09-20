import { createComponent, renderRoot } from 'gesso-framework';
import { Storage } from './MeterExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="meter" />`. */
renderRoot(exampleRoot(createComponent(Storage, {})));
