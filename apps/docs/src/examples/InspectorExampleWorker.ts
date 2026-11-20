import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { RectInspector } from './InspectorExample';

/** The render worker behind `<LiveExample id="inspector" />`. */
renderRoot(exampleRoot(createComponent(RectInspector, {})));
