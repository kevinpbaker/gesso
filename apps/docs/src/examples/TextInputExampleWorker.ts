import { createComponent, renderRoot } from '@gesso/framework';
import { exampleRoot } from './ExampleRoot';
import { TextFields } from './TextInputExample';

/** The render worker behind `<LiveExample id="textinput" />`. */
renderRoot(exampleRoot(createComponent(TextFields, {})));
