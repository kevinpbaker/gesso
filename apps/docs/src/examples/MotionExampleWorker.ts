import { createComponent, renderRoot } from 'gesso-framework';
import { exampleRoot } from './ExampleRoot';
import { MotionBoard } from './MotionExample';

/** The render worker behind `<LiveExample id="motion" />`. */
renderRoot(exampleRoot(createComponent(MotionBoard, {})));
