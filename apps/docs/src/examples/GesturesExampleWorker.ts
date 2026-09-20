import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { GestureSurface } from './GesturesExample';

/** The render worker behind `<LiveExample id="gestures" />`. */
renderRoot(exampleRoot(createComponent(GestureSurface, {})));
