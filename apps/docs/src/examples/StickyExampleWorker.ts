import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { StickyList } from './StickyExample';

/** The render worker behind `<LiveExample id="sticky" />`. */
renderRoot(exampleRoot(createComponent(StickyList, {})));
