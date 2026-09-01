import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { RunsOnce } from './RunsOnceExample';

/** The render worker behind `<LiveExample id="runsonce" />`. */
renderRoot(exampleRoot(createComponent(RunsOnce, {})));
