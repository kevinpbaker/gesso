import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { SelectableArticle } from './SelectionExample';

/** The render worker behind `<LiveExample id="selection" />`. */
renderRoot(exampleRoot(createComponent(SelectableArticle, {})));
