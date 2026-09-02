import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { FocusTrapSurface } from './FocusTrapExample';

/** The render worker behind `<LiveExample id="focustrap" />`. */
renderRoot(exampleRoot(createComponent(FocusTrapSurface, {})));
