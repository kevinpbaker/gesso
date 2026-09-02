import { createComponent, renderRoot } from '@gesso/framework';
import { Gallery } from './ImageExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="image" />`. */
renderRoot(exampleRoot(createComponent(Gallery, {})));
