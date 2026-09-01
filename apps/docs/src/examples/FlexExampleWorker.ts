import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { FlexBar } from './FlexExample';

/** The render worker behind `<LiveExample id="flex" />`. */
renderRoot(exampleRoot(createComponent(FlexBar, {})));
