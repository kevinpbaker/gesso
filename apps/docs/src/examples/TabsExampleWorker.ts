import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Views } from './TabsExample';

/** The render worker behind `<LiveExample id="tabs" />`. */
renderRoot(exampleRoot(createComponent(Views, {})));
