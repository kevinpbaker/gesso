import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { RangeSliders } from './RangeSliderExample';

/** The render worker behind `<LiveExample id="rangeslider" />`. */
renderRoot(exampleRoot(createComponent(RangeSliders, {})));
