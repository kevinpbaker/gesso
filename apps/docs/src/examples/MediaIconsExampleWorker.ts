import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { MediaIcons } from './MediaIconsExample';

/** The render worker behind `<LiveExample id="mediaicons" />`. */
renderRoot(exampleRoot(createComponent(MediaIcons, {})));
