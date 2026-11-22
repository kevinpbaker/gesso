import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Board } from './ViewportExample';

/** The render worker behind `<LiveExample id="viewport" />`. */
renderRoot(exampleRoot(createComponent(Board, {})));
