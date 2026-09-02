import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Commands } from './MenuExample';

/** The render worker behind `<LiveExample id="menu" />`. */
renderRoot(exampleRoot(createComponent(Commands, {})));
