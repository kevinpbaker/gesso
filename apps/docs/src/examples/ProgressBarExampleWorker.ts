import { createComponent, renderRoot } from '@gesso/framework';
import { Uploads } from './ProgressBarExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="progressbar" />`. */
renderRoot(exampleRoot(createComponent(Uploads, {})));
