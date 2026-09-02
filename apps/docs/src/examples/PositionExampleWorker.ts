import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Anchored } from './PositionExample';

/** The render worker behind `<LiveExample id="position" />`. */
renderRoot(exampleRoot(createComponent(Anchored, {})));
