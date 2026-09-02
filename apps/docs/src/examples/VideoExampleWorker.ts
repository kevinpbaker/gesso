import { createComponent, renderRoot } from '@gesso/framework';
import { Player } from './VideoExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="video" />`. */
renderRoot(exampleRoot(createComponent(Player, {})));
