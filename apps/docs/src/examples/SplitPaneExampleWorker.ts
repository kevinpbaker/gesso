import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { Panes } from './SplitPaneExample';

/** The render worker behind `<LiveExample id="splitpane" />`. */
renderRoot(exampleRoot(createComponent(Panes, {})));
