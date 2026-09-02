import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { Searchable } from './FindBarExample';

/** The render worker behind `<LiveExample id="findbar" />`. */
renderRoot(exampleRoot(createComponent(Searchable, {})));
