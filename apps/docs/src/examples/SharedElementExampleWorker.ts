import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { SharedElementStage } from './SharedElementExample';

/** The render worker behind `<LiveExample id="sharedelement" />`. */
renderRoot(exampleRoot(createComponent(SharedElementStage, {})));
