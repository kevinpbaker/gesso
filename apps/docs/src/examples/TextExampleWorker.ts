import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { TextLayout } from './TextExample';

/** The render worker behind `<LiveExample id="text" />`. */
renderRoot(exampleRoot(createComponent(TextLayout, {})));
