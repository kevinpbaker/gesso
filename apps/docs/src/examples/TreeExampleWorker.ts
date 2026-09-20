import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Files } from './TreeExample';

/** The render worker behind `<LiveExample id="tree" />`. */
renderRoot(exampleRoot(createComponent(Files, {})));
