import { createComponent, renderRoot } from '@gesso/framework';
import { Glyphs } from './IconExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="icon" />`. */
renderRoot(exampleRoot(createComponent(Glyphs, {})));
