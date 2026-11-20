import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { DrawingTools } from './ToolbarOverflowExample';

/** The render worker behind `<LiveExample id="toolbaroverflow" />`. */
renderRoot(exampleRoot(createComponent(DrawingTools, {})));
