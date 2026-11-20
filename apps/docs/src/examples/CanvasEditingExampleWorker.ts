import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { ShapeEditor } from './CanvasEditingExample';

/** The render worker behind `<LiveExample id="canvasediting" />`. */
renderRoot(exampleRoot(createComponent(ShapeEditor, {})));
