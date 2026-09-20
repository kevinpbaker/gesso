import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { MediaImages } from './MediaImagesExample';

/** The render worker behind `<LiveExample id="mediaimages" />`. */
renderRoot(exampleRoot(createComponent(MediaImages, {})));
