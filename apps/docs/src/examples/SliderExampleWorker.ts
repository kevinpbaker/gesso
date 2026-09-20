import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Sliders } from './SliderExample';

/** The render worker behind `<LiveExample id="slider" />`. */
renderRoot(exampleRoot(createComponent(Sliders, {})));
