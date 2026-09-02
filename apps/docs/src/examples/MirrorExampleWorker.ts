import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Note } from './MirrorExample';

/** The render worker behind `<LiveExample id="mirror" />`. */
renderRoot(exampleRoot(createComponent(Note, {})));
