import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Vanished } from './ExplainExample';

/** The render worker behind `<LiveExample id="explain" />`. */
renderRoot(exampleRoot(createComponent(Vanished, {})));
