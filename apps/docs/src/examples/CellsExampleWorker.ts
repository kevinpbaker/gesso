import { createComponent, renderRoot } from '@gesso/framework';
import { Cells } from './CellsExample';
import { exampleRoot } from './ExampleRoot';

/** The render worker behind `<LiveExample id="cells" />`. */
renderRoot(exampleRoot(createComponent(Cells, {})));
