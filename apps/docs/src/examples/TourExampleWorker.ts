import { createComponent, renderRoot } from 'gesso-framework';
import { ToolbarTour } from './TourExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="tour" />`. */
renderRoot(exampleRoot(createComponent(ToolbarTour, {})));
