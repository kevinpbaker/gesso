import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Actions } from './TooltipExample';

/** The render worker behind `<LiveExample id="tooltip" />`. */
renderRoot(exampleRoot(createComponent(Actions, {})));
