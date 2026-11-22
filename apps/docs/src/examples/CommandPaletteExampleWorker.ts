import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Writer } from './CommandPaletteExample';

/** The render worker behind `<LiveExample id="commandpalette" />`. */
renderRoot(exampleRoot(createComponent(Writer, {})));
