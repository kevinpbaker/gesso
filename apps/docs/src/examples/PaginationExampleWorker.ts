import { createComponent, renderRoot } from 'gesso-framework';
import { Observations } from './PaginationExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="pagination" />`. */
renderRoot(exampleRoot(createComponent(Observations, {})));
