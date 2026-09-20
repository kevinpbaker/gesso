import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { PointerSurface } from './PointerExample';

/** The render worker behind `<LiveExample id="pointer" />`. */
renderRoot(exampleRoot(createComponent(PointerSurface, {})));
