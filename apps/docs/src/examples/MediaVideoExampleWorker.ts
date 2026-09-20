import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { MediaVideo } from './MediaVideoExample';

/** The render worker behind `<LiveExample id="mediavideo" />`. */
renderRoot(exampleRoot(createComponent(MediaVideo, {})));
