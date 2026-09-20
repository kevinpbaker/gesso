import { createComponent, renderRoot } from 'gesso-framework';
import { Reports } from './SegmentedControlExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="segmentedcontrol" />`. */
renderRoot(exampleRoot(createComponent(Reports, {})));
